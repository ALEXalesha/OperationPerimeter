// Матч: режимы (соревновательный, бой насмерть, командный, разминка), раунды, экономика,
// бомба, урон и убийства, гранаты, возрождение. Логика идёт фиксированным шагом 1/64 с.
(function () {
  'use strict';
  const TAC = window.TAC;
  const DT = 1 / 64;
  TAC.DT = DT;
  const E = TAC.ECON;
  const W = TAC.WEAPONS;
  const GRAV = 20, JUMP_V = 6.9;
  const TEAM_COLORS = ['#f2c94c', '#b388ff', '#6fcf97', '#56ccf2', '#f2994a'];
  const EMPTY_INPUT = { mx: 0, mz: 0, jump: false, crouch: false, walk: false, fire: false, fire2: false, use: false, reload: false };

  function Match(opts, env) {
    env = env || {};
    TAC.resetAgentIds();
    this.opts = opts;
    this.env = env;
    this.mode = opts.mode || 'comp';
    this.mapId = opts.map || 'quarry';
    this.diff = opts.diff || 'medium';
    this.seed = (opts.seed >>> 0) || 1;
    this.rng = TAC.makeRng(this.seed);
    this.world = opts.world || new TAC.World(TAC.MAPS[this.mapId]);
    this.scene = env.scene || null;
    this.effects = env.effects || null;
    this.time = 0; this.tickN = 0;
    this.agents = []; this.brains = [];
    this.grenades = []; this.smokes = []; this.fires = []; this.drops = []; this.noises = []; this.events = []; this.killfeed = [];
    this.targets = null;
    this.friendlyFire = false;
    this.ai = opts.ai !== false;
    this.short = opts.short != null ? !!opts.short : true;
    this.maxRounds = this.short ? 15 : 24; this.winRounds = this.short ? 8 : 13; this.half = this.short ? 7 : 12;
    this.freezeTime = opts.freeze != null ? opts.freeze : E.freezeTime;
    this.score = [0, 0]; this.lossStreak = [E.lossStart, E.lossStart]; this.round = 0;
    this.phase = 'init'; this.phaseEnd = 0; this.roundStart = 0; this.liveStart = 0;
    this.bomb = null;
    this.spotted = [new Map(), new Map()];
    this.pc = { plants: 0, defuses: 0, clutches: 0, sniperKills: 0, kills: 0, deaths: 0, assists: 0, shots: 0, hits: 0, headHits: 0, hsKills: 0, rangeHits: 0, weaponKills: {}, damage: 0, mvps: 0, roundsWon: 0, roundsPlayed: 0 };
    this.history = [];
    this.missionId = opts.mission || null;
    this.over = false;
    this.buildZones();
    const setup = { comp: this.setupComp, dm: this.setupDM, tdm: this.setupTDM, train: this.setupTrain }[this.mode];
    setup.call(this);
    if (this.player) this.player.inv.knife = TAC.makeWeapon('knife', this.skinFor(this.player, 'knife'));
  }
  TAC.Match = Match;
  const P = Match.prototype;

  // Зона покупки: клетки не дальше трёх от своей базы
  P.buildZones = function () {
    const w = this.world;
    this.buyMask = { T: new Uint8Array(w.W * w.H), CT: new Uint8Array(w.W * w.H) };
    for (const [side, key] of [['T', 't'], ['CT', 'u']]) {
      for (const [cx, cy] of w.zones[key]) {
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (w.inside(cx + i, cy + j)) this.buyMask[side][(cy + j) * w.W + cx + i] = 1;
      }
    }
  };
  P.inBuyZone = function (a) {
    if (this.mode !== 'comp') return true;
    const [cx, cy] = this.world.cellOf(a.pos.x, a.pos.z);
    return !!(this.world.inside(cx, cy) && this.buyMask[a.team] && this.buyMask[a.team][cy * this.world.W + cx]);
  };
  P.buyTimeLeft = function () {
    if (this.mode !== 'comp') return Infinity;
    if (this.phase === 'freeze') return E.buyTime + (this.phaseEnd - this.time);
    if (this.phase === 'live') return Math.max(0, E.buyTime - (this.time - this.liveStart));
    return 0;
  };
  P.canBuyNow = function (a) { return this.buyTimeLeft() > 0 && this.inBuyZone(a); };

  P.addAgent = function (a) {
    this.agents.push(a);
    if (this.scene) a.buildMesh(this.scene, a.team || (a.id % 2 ? 'T' : 'CT'));
    if (a.isBot && !a.dummy && TAC.Brain) this.brains.push(new TAC.Brain(a, this));
    a.input = Object.assign({}, EMPTY_INPUT);
    return a;
  };
  P.sideOf = function (squad) { return this.squadSide[squad]; };

  // ---------- Соревновательный ----------
  P.setupComp = function () {
    const side = this.opts.side === 'T' || this.opts.side === 'CT' ? this.opts.side : (this.rng() < 0.5 ? 'T' : 'CT');
    const other = side === 'T' ? 'CT' : 'T';
    this.squadSide = [side, other];
    this.initialSide = side;
    const nAllies = this.opts.allies != null ? this.opts.allies : 4, nEnemies = this.opts.enemies != null ? this.opts.enemies : 5;
    this.player = this.addAgent(new TAC.Agent({ name: this.opts.playerName || 'Вы', team: side }));
    this.player.squad = 0; this.player.color = TEAM_COLORS[0];
    for (let i = 0; i < nAllies; i++) { const b = new TAC.Agent({ name: TAC.BOT_NAMES[side][i], team: side, isBot: true }); b.squad = 0; b.color = TEAM_COLORS[i + 1]; this.addAgent(b); }
    for (let i = 0; i < nEnemies; i++) { const b = new TAC.Agent({ name: TAC.BOT_NAMES[other][i], team: other, isBot: true }); b.squad = 1; this.addAgent(b); }
    for (const a of this.agents) { a.money = E.start; a.inv.secondary = TAC.makeWeapon('p9'); a.slot = 'secondary'; }
    this.startRound();
  };

  P.spawnCells = function (side) {
    const cells = this.world.zones[side === 'T' ? 't' : 'u'].slice();
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return cells;
  };
  P.faceObjective = function (a) {
    const w = this.world, c = w.siteCenter.A && w.siteCenter.B ? { x: (w.center(...w.siteCenter.A).x + w.center(...w.siteCenter.B).x) / 2, z: (w.center(...w.siteCenter.A).z + w.center(...w.siteCenter.B).z) / 2 } : { x: w.W, z: w.H };
    const mid = { x: w.W * w.CELL / 2, z: w.H * w.CELL / 2 };
    const t = a.team === 'CT' ? mid : c;
    a.yaw = Math.atan2(-(t.x - a.pos.x), -(t.z - a.pos.z)); a.pitch = 0;
  };
  P.placeAgent = function (a, p) {
    a.pos.x = p.x; a.pos.y = 0; a.pos.z = p.z;
    a.prev.x = p.x; a.prev.y = 0; a.prev.z = p.z;
    a.vel.x = a.vel.y = a.vel.z = 0;
  };
  P.resetAgentForRound = function (a, keepGear) {
    if (!a.alive || !keepGear) {
      a.inv.primary = null; a.inv.secondary = TAC.makeWeapon('p9', this.skinFor(a, 'p9')); a.inv.grenades = []; a.armor = 0; a.helmet = false; a.kit = false;
    } else {
      // выжившие сохраняют оружие, патроны пополняются
      for (const s of ['primary', 'secondary']) { const w = a.inv[s]; if (w) { w.mag = w.def.mag; w.reserve = w.def.reserve; } }
    }
    a.inv.bomb = false;
    a.alive = true; a.hp = 100; a.flash = 0; a.planting = 0; a.tag = 0;
    a.fire.reload = 0; a.fire.spray = 0; a.fire.scope = 0; a.fire.inacc = 0; a.fire.draw = 0; a.fire.next = 0;
    a.crouch = 0; a.stats.roundKills = 0; a.stats.roundDmg = 0;
    a.slot = a.inv.primary ? 'primary' : 'secondary'; a.lastSlot = 'knife';
    a.input = Object.assign({}, EMPTY_INPUT);
  };
  P.skinFor = function (a, id) { return a === this.player && TAC.inventory ? TAC.inventory.skinFor(id) : null; };

  P.startRound = function () {
    this.round++;
    const keep = this.round !== 1 && this.round !== this.half + 1;
    for (const a of this.agents) this.resetAgentForRound(a, keep && a.survived);
    for (const a of this.agents) { a.survived = false; if (a.mesh && a.mesh.team !== a.team) { a.removeMesh(); if (this.scene) a.buildMesh(this.scene, a.team); } }
    this.grenades.length = 0; this.smokes.length = 0; this.fires.length = 0; this.drops.length = 0; this.noises.length = 0;
    if (this.effects) this.effects.clearRound();
    const cells = { T: this.spawnCells('T'), CT: this.spawnCells('CT') }, used = { T: 0, CT: 0 };
    for (const a of this.agents) {
      const list = cells[a.team];
      const c = list[used[a.team]++ % list.length];
      const p = this.world.center(c[0], c[1]);
      this.placeAgent(a, { x: p.x + (this.rng() - 0.5) * 0.6, z: p.z + (this.rng() - 0.5) * 0.6 });
      this.faceObjective(a);
    }
    // бомба: игроку, если он в атаке, иначе случайному боту атаки
    const ts = this.agents.filter((a) => a.team === 'T');
    const carrier = ts.includes(this.player) ? this.player : ts[Math.floor(this.rng() * ts.length)];
    if (carrier) carrier.inv.bomb = true;
    this.bomb = { state: 'carried', carrier, pos: null, timer: 0, defuse: 0, defuser: null, planter: null, site: null, nextBeep: 0 };
    this.phase = 'freeze'; this.roundStart = this.time; this.phaseEnd = this.time + this.freezeTime;
    this.roundInfo = { clutch: false, firstKill: null };
    this.spotted[0].clear(); this.spotted[1].clear();
    for (const b of this.brains) b.onRoundStart && b.onRoundStart();
    this.event({ type: 'roundStart', round: this.round });
    this.sound('roundStart', null);
  };

  // Победа в раунде: деньги по таблице, счёт, лучший игрок, конец половины или матча.
  P.endRound = function (winSquad, reason) {
    if (this.phase === 'roundEnd' || this.phase === 'over') return;
    const loseSquad = 1 - winSquad;
    const loseSide = this.sideOf(loseSquad);
    const planted = this.bomb && (this.bomb.state === 'planted' || this.bomb.state === 'exploded' || this.bomb.state === 'defused');
    this.score[winSquad]++;
    this.lossStreak[loseSquad] = Math.min(5, this.lossStreak[loseSquad] + 1);
    this.lossStreak[winSquad] = Math.max(0, this.lossStreak[winSquad] - 1);
    const winMoney = E.win[reason] || E.win.elimination;
    const lossMoney = TAC.lossBonus(this.lossStreak[loseSquad]);
    for (const a of this.agents) {
      if (a.squad === winSquad) this.addMoney(a, winMoney, 'win');
      else {
        let m = lossMoney;
        if (loseSide === 'T' && reason === 'time' && a.alive) m = 0;        // выжившие атакующие не получают ничего, если время вышло
        else if (loseSide === 'T' && planted) m += E.plantTeamBonus;
        if (m) this.addMoney(a, m, 'loss');
      }
      a.survived = a.alive;
    }
    // Лучший игрок раунда
    let mvp = null;
    if (reason === 'bomb' && this.bomb.planter && this.bomb.planter.squad === winSquad) mvp = this.bomb.planter;
    else if (reason === 'defuse' && this.bomb.defuser) mvp = this.bomb.defuser;
    else {
      for (const a of this.agents) if (a.squad === winSquad && (!mvp || a.stats.roundKills > mvp.stats.roundKills || (a.stats.roundKills === mvp.stats.roundKills && (a.stats.roundDmg || 0) > (mvp.stats.roundDmg || 0)))) mvp = a;
    }
    if (mvp) { mvp.stats.mvp++; if (mvp === this.player) this.pc.mvps++; }
    if (this.player) {
      this.pc.roundsPlayed++;
      if (winSquad === 0) this.pc.roundsWon++;
      if (winSquad === 0 && this.roundInfo.clutch && this.player.alive) this.pc.clutches++;
    }
    this.history.push({ round: this.round, win: winSquad, reason, side: this.sideOf(winSquad) });
    this.phase = 'roundEnd'; this.phaseEnd = this.time + E.roundEndDelay;
    this.lastRound = { winSquad, winSide: this.sideOf(winSquad), reason, mvp: mvp ? mvp.name : null, mvpIsPlayer: mvp === this.player };
    this.event({ type: 'roundEnd', winSquad, winSide: this.sideOf(winSquad), reason, mvp: this.lastRound.mvp, score: this.score.slice() });
    this.sound(winSquad === 0 ? 'win' : 'lose', null);
  };
  P.addMoney = function (a, amount, why) {
    const before = a.money;
    a.money = TAC.clamp(a.money + amount, 0, E.max);
    if (a === this.player && a.money !== before) this.event({ type: 'money', amount: a.money - before, why });
  };
  P.afterRoundEnd = function () {
    const [s0, s1] = this.score;
    const played = this.round;
    if (s0 >= this.winRounds || s1 >= this.winRounds || played >= this.maxRounds) { this.finish(); return; }
    if (played === this.half) this.swapSides();
    this.startRound();
  };
  P.swapSides = function () {
    this.squadSide = [this.squadSide[1], this.squadSide[0]];
    for (const a of this.agents) {
      a.team = this.squadSide[a.squad];
      a.money = E.start; a.survived = false;
      a.inv.primary = null; a.inv.grenades = []; a.armor = 0; a.helmet = false; a.kit = false;
    }
    this.lossStreak = [E.lossStart, E.lossStart];
    this.event({ type: 'halftime' });
  };

  // ---------- Бой насмерть ----------
  P.setupDM = function () {
    this.squadSide = [null, null];
    this.timeLimit = this.opts.timeLimit || 600;
    this.killLimit = this.opts.killLimit || 30;
    this.player = this.addAgent(new TAC.Agent({ name: this.opts.playerName || 'Вы', team: null }));
    this.player.squad = 0;
    this.playerLoadout = { primary: this.opts.loadout || 'burya', secondary: 'p9' };
    const n = this.opts.bots != null ? this.opts.bots : 10;
    const names = TAC.BOT_NAMES.T.concat(TAC.BOT_NAMES.CT);
    for (let i = 0; i < n; i++) {
      const b = new TAC.Agent({ name: names[i % names.length], team: null, isBot: true });
      b.squad = i + 1; b.model = i % 2 ? 'CT' : 'T';
      this.agents.push(b); b.input = Object.assign({}, EMPTY_INPUT);
      if (this.scene) b.buildMesh(this.scene, b.model);
      if (TAC.Brain) this.brains.push(new TAC.Brain(b, this));
    }
    for (const a of this.agents) this.respawn(a);
    this.phase = 'live'; this.liveStart = 0; this.phaseEnd = this.timeLimit;
  };
  P.setupTDM = function () {
    const side = this.opts.side === 'T' || this.opts.side === 'CT' ? this.opts.side : (this.rng() < 0.5 ? 'T' : 'CT');
    const other = side === 'T' ? 'CT' : 'T';
    this.squadSide = [side, other]; this.initialSide = side;
    this.timeLimit = this.opts.timeLimit || 600;
    this.killLimit = this.opts.killLimit || 50;
    this.teamKills = [0, 0];
    this.player = this.addAgent(new TAC.Agent({ name: this.opts.playerName || 'Вы', team: side }));
    this.player.squad = 0; this.player.color = TEAM_COLORS[0];
    this.playerLoadout = { primary: this.opts.loadout || (side === 'T' ? 'burya' : 'strazh'), secondary: 'p9' };
    for (let i = 0; i < 4; i++) { const b = new TAC.Agent({ name: TAC.BOT_NAMES[side][i], team: side, isBot: true }); b.squad = 0; b.color = TEAM_COLORS[i + 1]; this.addAgent(b); }
    for (let i = 0; i < 5; i++) { const b = new TAC.Agent({ name: TAC.BOT_NAMES[other][i], team: other, isBot: true }); b.squad = 1; this.addAgent(b); }
    for (const a of this.agents) this.respawn(a);
    this.phase = 'live'; this.liveStart = 0; this.phaseEnd = this.timeLimit;
  };
  P.randomLoadout = function (a) {
    const r = this.rng();
    const side = a.team;
    const prim = r < 0.12 ? 'dalnoboy' : r < 0.22 ? 'shchegol' : r < 0.36 ? 'osa' : r < 0.46 ? 'shmel' : r < 0.54 ? 'lis' : r < 0.6 ? 'vepr' : (side === 'CT' ? 'strazh' : side === 'T' ? 'burya' : (this.rng() < 0.5 ? 'burya' : 'strazh'));
    return { primary: prim, secondary: this.rng() < 0.3 ? 'grom' : 'p9' };
  };
  // Возрождение: точка подальше от врагов
  P.respawn = function (a) {
    const w = this.world;
    let list;
    if (this.mode === 'tdm') list = w.zones[a.team === 'T' ? 't' : 'u'];
    else list = w.zones.open.length ? w.zones.open : w.zones.walk;
    let best = null, bestD = -1;
    for (let k = 0; k < 10; k++) {
      const c = list[Math.floor(this.rng() * list.length)];
      const p = w.center(c[0], c[1]);
      let md = 1e9;
      for (const b of this.agents) if (b !== a && b.alive && (!a.team || b.team !== a.team)) md = Math.min(md, TAC.dist2d(p, b.pos));
      if (md > bestD) { bestD = md; best = p; }
    }
    this.placeAgent(a, best);
    a.alive = true; a.hp = 100; a.armor = 100; a.helmet = true; a.flash = 0; a.tag = 0;
    a.spawnProtect = 1.5; a.respawnAt = 0;
    const lo = a === this.player ? this.playerLoadout : this.randomLoadout(a);
    a.inv.primary = lo.primary ? TAC.makeWeapon(lo.primary, this.skinFor(a, lo.primary)) : null;
    a.inv.secondary = TAC.makeWeapon(lo.secondary, this.skinFor(a, lo.secondary));
    a.inv.grenades = []; a.inv.bomb = false;
    a.slot = a.inv.primary ? 'primary' : 'secondary';
    a.fire.reload = 0; a.fire.spray = 0; a.fire.scope = 0; a.fire.draw = 0.3; a.fire.inacc = 0;
    a.yaw = this.rng() * Math.PI * 2; a.pitch = 0;
    // смотреть в сторону центра
    const cx = w.W * w.CELL / 2, cz = w.H * w.CELL / 2;
    a.yaw = Math.atan2(-(cx - a.pos.x), -(cz - a.pos.z));
    a.input = Object.assign({}, EMPTY_INPUT);
    if (this.brains) for (const b of this.brains) if (b.bot === a && b.onRespawn) b.onRespawn();
  };

  // ---------- Разминка ----------
  P.setupTrain = function () {
    this.squadSide = [null, null];
    this.timeLimit = this.opts.timeLimit || 60;
    const w = this.world, def = TAC.MAPS[this.mapId];
    this.player = this.addAgent(new TAC.Agent({ name: this.opts.playerName || 'Вы', team: null }));
    this.player.squad = 0;
    this.playerLoadout = { primary: this.opts.loadout || 'burya', secondary: 'p9' };
    this.infiniteAmmo = true;
    const tz = w.zones.t.length ? w.zones.t : w.zones.walk;
    const c = tz[Math.floor(tz.length / 2)];
    this.spawnPoint = w.center(c[0], c[1]);
    // мишени и неподвижные боты
    this.targets = [];
    const homes = def.targets || this.randomSpots(10).map((p) => [p[0], p[1], 1.5 + this.rng() * 2]);
    for (const h of homes) {
      const home = { x: (h[0] + 0.5) * w.CELL, y: h[2], z: (h[1] + 0.5) * w.CELL };
      this.targets.push({ home, origin: Object.assign({}, home), pos: Object.assign({}, home), alive: true, respawn: 0, phase: this.rng() * 6.28, amp: 0.8 + this.rng() * 0.8, speed: 0.8 + this.rng() * 0.6, r: 0.5 });
    }
    const dummies = def.dummies || this.randomSpots(8);
    dummies.forEach((d, i) => {
      const b = new TAC.Agent({ name: 'Манекен ' + (i + 1), team: null, isBot: true });
      b.dummy = true; b.squad = i + 1; b.home = w.center(d[0], d[1]);
      this.agents.push(b); b.input = Object.assign({}, EMPTY_INPUT);
      if (this.scene) b.buildMesh(this.scene, i % 2 ? 'CT' : 'T');
      this.placeDummy(b);
    });
    this.resetTraining();
  };
  P.randomSpots = function (n) {
    const out = [], open = this.world.zones.open;
    for (let i = 0; i < n; i++) out.push(open[Math.floor(this.rng() * open.length)]);
    return out;
  };
  P.placeDummy = function (b) {
    this.placeAgent(b, b.home);
    b.alive = true; b.hp = 100; b.armor = 0; b.helmet = false;
    b.inv.primary = TAC.makeWeapon('burya'); b.slot = 'primary';
    b.yaw = Math.atan2(-(this.spawnPoint.x - b.pos.x), -(this.spawnPoint.z - b.pos.z));
  };
  P.resetTraining = function () {
    const p = this.player;
    this.placeAgent(p, this.spawnPoint);
    p.alive = true; p.hp = 100; p.armor = 100; p.helmet = true;
    p.inv.primary = TAC.makeWeapon(this.playerLoadout.primary, this.skinFor(p, this.playerLoadout.primary));
    p.inv.secondary = TAC.makeWeapon(this.playerLoadout.secondary, this.skinFor(p, this.playerLoadout.secondary));
    p.inv.grenades = ['frag', 'smoke', 'flash', 'fire'];
    p.slot = 'primary';
    p.yaw = 0; p.pitch = 0;
    this.faceTargets(p);
    this.trainHits = 0; this.trainShots = 0;
    for (const t of this.targets) { t.alive = true; t.respawn = 0; this.placeTarget(t); }
    for (const a of this.agents) if (a.dummy) this.placeDummy(a);
    this.phase = 'live'; this.liveStart = this.time; this.phaseEnd = this.time + this.timeLimit;
    this.best = TAC.store.get('rangeBest', 0);
  };
  P.faceTargets = function (p) {
    const w = this.world;
    p.yaw = Math.atan2(-(w.W * w.CELL / 2 - p.pos.x), -(w.H * w.CELL * 0.3 - p.pos.z));
  };
  P.placeTarget = function (t) {
    for (let i = 0; i < 20; i++) {
      const p = { x: t.home.x + (this.rng() - 0.5) * 6, y: Math.max(1.2, t.home.y + (this.rng() - 0.5) * 2), z: t.home.z + (this.rng() - 0.5) * 4 };
      if (this.world.pointWalkable(p.x - 0.9, p.z - 0.9) && this.world.pointWalkable(p.x + 0.9, p.z + 0.9) && this.world.pointWalkable(p.x - 0.9, p.z + 0.9) && this.world.pointWalkable(p.x + 0.9, p.z - 0.9)) { t.origin = p; break; }
    }
    t.pos.x = t.origin.x; t.pos.y = t.origin.y; t.pos.z = t.origin.z;
  };
  P.hitTarget = function (t) {
    t.alive = false; t.respawn = 0.8;
    this.trainHits++; this.pc.rangeHits = Math.max(this.pc.rangeHits, this.trainHits);
    this.event({ type: 'hitmarker', head: false });
    this.sound('hit', null);
  };

  // ---------- Шаг логики ----------
  P.step = function () {
    const dt = DT;
    if (this.over) return;
    this.time += dt; this.tickN++;
    for (const a of this.agents) { a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prev.z = a.pos.z; }
    this.phaseTick();
    if (this.over) return;
    if (this.ai) for (const b of this.brains) b.update(dt);
    for (const a of this.agents) if (a.alive) this.stepAgent(a, dt);
    this.stepGrenades(dt);
    this.stepFires(dt);
    for (let i = this.smokes.length - 1; i >= 0; i--) if (this.smokes[i].end <= this.time) this.smokes.splice(i, 1);
    this.stepDrops(dt);
    this.stepBomb(dt);
    this.stepTargets(dt);
    if (this.noises.length && this.noises[0].time < this.time - 1.5) this.noises = this.noises.filter((n) => n.time > this.time - 1.5);
    if (this.tickN % 8 === 0) this.playerSpotting();
    this.checkRoundEnd();
  };

  P.phaseTick = function () {
    if (this.mode === 'comp') {
      if (this.phase === 'freeze' && this.time >= this.phaseEnd) {
        this.phase = 'live'; this.liveStart = this.time; this.phaseEnd = this.time + (this.opts.roundTime || E.roundTime);
        this.event({ type: 'live' });
      } else if (this.phase === 'live' && this.time >= this.phaseEnd) {
        this.endRound(this.squadOfSide('CT'), 'time');
      } else if (this.phase === 'roundEnd' && this.time >= this.phaseEnd) {
        this.afterRoundEnd();
      }
    } else if (this.mode === 'dm' || this.mode === 'tdm') {
      if (this.phase === 'live') {
        for (const a of this.agents) if (!a.alive && a.respawnAt && this.time >= a.respawnAt) this.respawn(a);
        if (this.time >= this.phaseEnd) this.finish();
      }
    } else if (this.mode === 'train') {
      if (this.phase === 'live') {
        for (const a of this.agents) if (!a.alive && a.dummy && this.time >= a.respawnAt) this.placeDummy(a);
        if (!this.player.alive) { this.player.alive = true; this.player.hp = 100; }
        if (this.time >= this.phaseEnd) this.finishTraining();
      }
    }
  };
  P.squadOfSide = function (side) { return this.squadSide[0] === side ? 0 : 1; };

  P.checkRoundEnd = function () {
    if (this.mode !== 'comp' || (this.phase !== 'live' && this.phase !== 'planted')) return;
    const aliveT = this.agents.some((a) => a.alive && a.team === 'T');
    const aliveCT = this.agents.some((a) => a.alive && a.team === 'CT');
    if (!aliveCT) { this.endRound(this.squadOfSide('T'), 'elimination'); return; }
    if (!aliveT && this.phase === 'live') this.endRound(this.squadOfSide('CT'), 'elimination');
  };

  // Ход бойца: присед, движение, шаги, оружие, выстрел, закладка и обезвреживание
  P.stepAgent = function (a, dt) {
    const inp = a.input || EMPTY_INPUT;
    const frozen = (this.mode === 'comp' && this.phase === 'freeze') || a.dummy || this.phase === 'over' || this.phase === 'results';
    // присед: встать нельзя, если над головой препятствие
    let want = inp.crouch ? 1 : 0;
    if (!want && a.crouch > 0 && !this.world.freeAt({ x: a.pos.x, y: a.pos.y + 0.05, z: a.pos.z }, TAC.RADIUS - 0.02, TAC.STAND_H - 0.05)) want = a.crouch;
    a.crouch += TAC.clamp(want - a.crouch, -dt * 7, dt * 7);
    a.walking = !!inp.walk;
    // движение
    const busy = a.planting > 0 || (this.bomb && this.bomb.defuser === a);
    let mx = frozen || busy ? 0 : inp.mx || 0, mz = frozen || busy ? 0 : inp.mz || 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw), rx = Math.cos(a.yaw), rz = -Math.sin(a.yaw);
    let max = a.maxSpeed();
    if (a.tag > 0) { max *= 0.55; a.tag -= dt; }
    const tx = (fx * mz + rx * mx) * max, tz = (fz * mz + rz * mx) * max;
    const k = a.onGround ? Math.min(1, 14 * dt) : Math.min(1, 1.2 * dt);
    a.vel.x += (tx - a.vel.x) * k; a.vel.z += (tz - a.vel.z) * k;
    if (inp.jump && a.onGround && !a.jumpHeld && !frozen && !busy) { a.vel.y = JUMP_V; a.onGround = false; }
    a.jumpHeld = !!inp.jump;
    a.vel.y -= GRAV * dt;
    const wasAir = !a.onGround, vy = a.vel.y;
    a.onGround = this.world.move(a.pos, a.vel, dt, TAC.RADIUS, a.height(), true);
    if (a.onGround && wasAir && vy < -6) { this.sound('land', a); this.noise(a.pos, 14, a); }
    // шаги слышно, если бежишь (не шагом и не присев)
    const speed = Math.hypot(a.vel.x, a.vel.z);
    if (a.onGround && speed > 0.5) {
      a.stepDist += speed * dt;
      const loud = speed > 3.2 && !a.walking && a.crouch < 0.5;
      if (a.stepDist - (a.lastStep || 0) > 1.9) {
        a.lastStep = a.stepDist;
        if (loud) { this.sound('step', a, { surface: this.world.surfaceAt(a.pos.x, a.pos.z, a.pos.y) }); this.noise(a.pos, 18, a, 'step'); }
      }
    }
    // оружие
    TAC.weaponTick(a, dt, this.time);
    if (a.flash > 0) a.flash = Math.max(0, a.flash - dt);
    if (a.spawnProtect > 0) a.spawnProtect = Math.max(0, a.spawnProtect - dt);
    if (frozen && this.mode === 'comp' && this.phase === 'freeze') { this.clearEdges(inp); if (inp.reload) TAC.startReload(a); return; }
    if (a.dummy) return;
    const def = a.weaponDef();
    if (inp.reload) { if (TAC.startReload(a)) this.sound('reload', a, { len: a.weapon().def.reload }); }
    // закладка бомбы
    if (def.cat === 'bomb' && a.inv.bomb) {
      const zone = this.world.zoneAt(a.pos.x, a.pos.z);
      if (inp.fire && a.onGround && this.phase === 'live' && (zone === 'A' || zone === 'B')) {
        a.planting = (a.planting || 0) + dt;
        const i = Math.floor(a.planting / 0.4);
        if (i !== a.plantBeepI) { a.plantBeepI = i; this.sound('plantBeep', a, { i }); }
        if (a.planting >= E.plantTime - 1e-9) this.plantBomb(a, zone);
      } else a.planting = 0;
    } else {
      a.planting = 0;
      if (inp.fire && (def.auto || inp.firePressed || def.cat === 'knife')) {
        const shot = TAC.fire(this, a, {});
        if (shot && a.spawnProtect) a.spawnProtect = 0;
      }
      if (inp.fire2Pressed) this.altFire(a, def);
    }
    // обезвреживание
    const bomb = this.bomb;
    if (bomb && bomb.state === 'planted' && bomb.pos) {
      const near = a.team === 'CT' && TAC.dist2d(a.pos, bomb.pos) < 1.5 && Math.abs(a.pos.y - bomb.pos.y) < 1.6;
      if (inp.use && near && (!bomb.defuser || bomb.defuser === a) && a.onGround) {
        if (!bomb.defuser) { bomb.defuser = a; bomb.defuse = 0; bomb.kit = a.kit; this.noise(a.pos, 16, a, 'defuse'); this.event({ type: 'defuseStart', agent: a.name }); }
        bomb.defuse += dt;
        if (bomb.defuse >= (bomb.kit ? E.defuseKitTime : E.defuseTime) - 1e-9) this.defuseBomb(a);
      } else if (bomb.defuser === a) { bomb.defuser = null; bomb.defuse = 0; }
    }
    if (inp.usePressed) this.tryPickup(a, true);
    this.clearEdges(inp);
  };
  P.clearEdges = function (inp) { inp.firePressed = false; inp.fire2Pressed = false; inp.usePressed = false; inp.reload = false; };

  P.altFire = function (a, def) {
    if (def.scope) {
      const levels = def.scope.length;
      a.fire.scope = a.fire.reload > 0 ? 0 : (a.fire.scope + 1) % (levels + 1);
      this.sound('click', a);
    } else if (def.cat === 'knife') {
      if (this.time >= a.fire.next) TAC.fire(this, a, { heavy: true });
    } else if (def.cat === 'grenade') {
      if (this.time >= a.fire.next) TAC.fire(this, a, { heavy: true });
    }
  };

  // ---------- Оружие: смена, выброс, подбор, покупка ----------
  P.hasSlot = function (a, slot) {
    if (slot === 'primary') return !!a.inv.primary;
    if (slot === 'secondary') return !!a.inv.secondary;
    if (slot === 'grenade') return a.inv.grenades.length > 0;
    if (slot === 'bomb') return !!a.inv.bomb;
    return slot === 'knife';
  };
  P.switchSlot = function (a, slot) {
    if (!this.hasSlot(a, slot)) return false;
    if (slot === a.slot) {
      if (slot === 'grenade' && a.inv.grenades.length > 1) { a.inv.grenades.push(a.inv.grenades.shift()); a.fire.draw = 0.3; }
      return true;
    }
    a.lastSlot = a.slot; a.slot = slot;
    const def = a.weaponDef();
    a.fire.draw = def.cat === 'knife' ? 0.25 : def.cat === 'sniper' ? 0.6 : 0.4;
    a.fire.reload = 0; a.fire.scope = 0; a.fire.inspect = 0; a.planting = 0;
    a.fire.spray = 0; a.fire.inacc = 0; a.fire.punchX = 0; a.fire.punchY = 0;   // отдача прошлого оружия не переносится
    return true;
  };
  // Лучшее оружие с патронами: основное, пистолет, нож
  P.bestSlot = function (a) {
    const has = (w) => w && (w.mag > 0 || w.reserve > 0);
    return has(a.inv.primary) ? 'primary' : has(a.inv.secondary) ? 'secondary' : 'knife';
  };
  P.lastWeapon = function (a) { if (!this.switchSlot(a, a.lastSlot)) this.switchSlot(a, this.bestSlot(a)); };
  P.dropCurrent = function (a) {
    const s = a.slot;
    if (s === 'knife' || s === 'grenade') return false;
    if (s === 'bomb') { if (!a.inv.bomb) return false; this.dropBomb(a, true); }
    else {
      const w = a.inv[s];
      if (!w || this.mode === 'dm' || this.mode === 'train') return false;
      a.inv[s] = null;
      this.spawnDrop(w, a, true);
    }
    this.switchSlot(a, this.bestSlot(a));
    return true;
  };
  P.spawnDrop = function (weapon, a, thrown) {
    const dir = TAC.dirFromAngles(a.yaw, 0);
    const it = { weapon, def: weapon.def, bomb: false, pos: { x: a.pos.x + dir.x * 0.4, y: a.pos.y + 1.0, z: a.pos.z + dir.z * 0.4 }, vel: { x: dir.x * (thrown ? 4 : 1) + a.vel.x * 0.5, y: 1.5, z: dir.z * (thrown ? 4 : 1) + a.vel.z * 0.5 }, rot: this.rng() * 6.28, t: this.time, owner: a };
    this.drops.push(it);
    // не копить лежащее оружие без конца: старое (не бомба) убирается
    while (this.drops.length > 24) { const k = this.drops.findIndex((d) => !d.bomb); if (k < 0) break; this.removeDrop(k); }
    return it;
  };
  P.dropBomb = function (a, thrown) {
    a.inv.bomb = false;
    const it = this.spawnDrop({ id: 'bomb', def: W.bomb, mag: 0, reserve: 0 }, a, thrown);
    it.bomb = true;
    this.bomb.state = 'dropped'; this.bomb.carrier = null; this.bomb.item = it;
    this.event({ type: 'message', text: 'Бомба выброшена', team: 'T' });
  };
  P.stepDrops = function (dt) {
    for (const it of this.drops) {
      if (it.vel) {
        it.vel.y -= GRAV * dt;
        const r = 0.15;
        const ground = this.world.move(it.pos, it.vel, dt, r, 0.1, false);
        if (ground) { it.vel.x *= 0.8; it.vel.z *= 0.8; if (Math.hypot(it.vel.x, it.vel.z) < 0.05) it.vel = null; }
      }
      if (this.effects) this.effects.dropMesh(it, true);
    }
    // подбор на ходу: пустой слот или бомба
    for (const a of this.agents) if (a.alive && !a.dummy) this.tryPickup(a, false);
  };
  P.tryPickup = function (a, forced) {
    for (let i = 0; i < this.drops.length; i++) {
      const it = this.drops[i];
      if (this.time - it.t < 0.6 && it.owner === a) continue;
      const d = TAC.dist2d(a.pos, it.pos);
      if (d > (forced ? 1.6 : 0.9) || Math.abs(a.pos.y + 0.5 - it.pos.y) > 1.6) continue;
      if (it.bomb) {
        if (a.team !== 'T') continue;
        a.inv.bomb = true; this.bomb.state = 'carried'; this.bomb.carrier = a; this.bomb.item = null;
        this.removeDrop(i);
        if (a === this.player) { this.event({ type: 'message', text: 'Вы подобрали бомбу' }); this.sound('pickup', null); }
        return true;
      }
      const slot = it.def.slot;
      if (slot !== 'primary' && slot !== 'secondary') continue;
      if (a.inv[slot] && !forced) continue;
      if (a.inv[slot]) { const old = a.inv[slot]; a.inv[slot] = null; this.spawnDrop(old, a, false); }
      a.inv[slot] = it.weapon;
      this.removeDrop(this.drops.indexOf(it));
      if (a === this.player) { this.sound('pickup', null); this.event({ type: 'message', text: 'Подобрано: ' + it.def.name }); }
      if (a.slot === 'knife' || forced || (slot === 'primary' && a.slot === 'secondary')) this.switchSlot(a, slot);
      return true;
    }
    return false;
  };
  P.removeDrop = function (i) {
    const it = this.drops[i];
    if (!it) return;
    this.drops.splice(i, 1);
    if (this.effects) this.effects.dropMesh(it, false);
  };

  // Покупка. Возвращает { ok, reason }: money - нет денег, zone - не в зоне, time - время вышло,
  // side - чужое оружие, limit - уже есть или предел гранат, dead - мёртв.
  P.buy = function (a, id) {
    const free = this.mode !== 'comp';
    if (!a.alive) return { ok: false, reason: 'dead' };
    if (!free) {
      if (this.buyTimeLeft() <= 0) return { ok: false, reason: 'time' };
      if (!this.inBuyZone(a)) return { ok: false, reason: 'zone' };
    }
    const eq = TAC.EQUIPMENT[id];
    if (eq) {
      if (eq.team && eq.team !== a.team && !free) return { ok: false, reason: 'side' };
      let price = eq.price;
      if (id === 'vest') { if (a.armor >= 100) return { ok: false, reason: 'limit' }; }
      if (id === 'vesthelm') { if (a.armor >= 100 && a.helmet) return { ok: false, reason: 'limit' }; if (a.armor >= 100) price = eq.helmOnly; }
      if (id === 'kit') { if (a.kit || a.team !== 'CT') return { ok: false, reason: a.team !== 'CT' ? 'side' : 'limit' }; }
      if (!free && a.money < price) return { ok: false, reason: 'money' };
      if (!free) a.money -= price;
      if (id === 'vest') a.armor = 100;
      if (id === 'vesthelm') { a.armor = 100; a.helmet = true; }
      if (id === 'kit') a.kit = true;
      this.bought(a, id, price, free);
      return { ok: true, price: free ? 0 : price };
    }
    const def = W[id];
    if (!def || !def.price && def.slot !== 'secondary') return { ok: false, reason: 'limit' };
    if (def.team !== 'both' && def.team !== a.team && !free) return { ok: false, reason: 'side' };
    if (def.slot === 'grenade') {
      const same = a.inv.grenades.filter((g) => g === id).length;
      if (same >= def.max || a.inv.grenades.length >= 4) return { ok: false, reason: 'limit' };
    } else if (a.inv[def.slot] && a.inv[def.slot].id === id && !free) return { ok: false, reason: 'limit' };
    if (!free && a.money < def.price) return { ok: false, reason: 'money' };
    if (!free) a.money -= def.price;
    if (def.slot === 'grenade') a.inv.grenades.push(id);
    else {
      const old = a.inv[def.slot];
      if (old && !free) this.spawnDrop(old, a, false);
      a.inv[def.slot] = TAC.makeWeapon(id, this.skinFor(a, id));
      if (a.slot !== def.slot) this.switchSlot(a, def.slot); else { a.fire.draw = 0.3; a.fire.spray = 0; a.fire.inacc = 0; a.fire.scope = 0; }
      if (free && a === this.player && this.playerLoadout) this.playerLoadout[def.slot] = id;
    }
    this.bought(a, id, def.price, free);
    return { ok: true, price: free ? 0 : def.price };
  };
  P.bought = function (a, id) { if (a === this.player) this.sound('buy', null); void id; };

  // ---------- Урон и убийства ----------
  P.applyDamage = function (attacker, victim, hp, ar, def, zone, point) {
    if (!victim.alive || victim.spawnProtect > 0) return;
    const before = victim.hp;
    victim.hp -= hp;
    victim.armor = Math.max(0, victim.armor - ar);
    const dealt = Math.min(before, Math.max(0, hp));
    if (attacker && attacker !== victim) {
      attacker.stats.dmgTo[victim.id] = (attacker.stats.dmgTo[victim.id] || 0) + dealt;
      attacker.stats.roundDmg = (attacker.stats.roundDmg || 0) + dealt;
      if (attacker === this.player) {
        this.pc.damage += dealt;
        if (def.cat !== 'grenade') { this.pc.hits++; if (zone === 'head') this.pc.headHits++; }
        this.event({ type: 'hitmarker', head: zone === 'head', kill: victim.hp <= 0 });
        this.sound(zone === 'head' ? 'headshot' : 'hit', null);
      }
    }
    victim.tag = 0.35;
    if (victim === this.player) {
      const from = attacker && attacker !== victim ? attacker.pos : null;
      this.event({ type: 'hurt', from, amount: dealt });
      this.sound('hurt', null);
      victim.fire.punchY += 1.2;
    }
    if (this.effects && point) {
      const dir = attacker ? TAC.dirFromAngles(attacker.yaw, 0) : { x: 0, z: 0 };
      this.effects.blood(point, dir, zone === 'head');
    }
    if (victim.isBot) for (const b of this.brains) if (b.bot === victim) { b.onDamaged(attacker); break; }
    if (victim.hp <= 0) this.kill(attacker, victim, def, zone === 'head');
  };

  P.kill = function (killer, victim, def, head) {
    victim.hp = 0; victim.alive = false; victim.deathTime = this.time;
    victim.stats.d++;
    victim.fire.scope = 0; victim.planting = 0;
    const self = !killer || killer === victim;
    const teamkill = !self && killer.team && killer.team === victim.team;
    if (!self && !teamkill) {
      killer.stats.k++; killer.stats.roundKills++; killer.stats.score += 2;
      if (head) killer.stats.hs++;
      if (this.mode === 'comp') this.addMoney(killer, def.kill != null ? def.kill : (E.killByCat[def.cat] || 300), 'kill');
      if (this.mode === 'tdm') this.teamKills[killer.squad]++;
    } else if (teamkill && this.mode === 'comp') this.addMoney(killer, -300, 'teamkill');
    // помощь: 41+ урона по жертве
    let assist = null;
    for (const a of this.agents) {
      if (a === killer || a === victim) continue;
      if ((a.stats.dmgTo[victim.id] || 0) >= 41 && (!a.team || a.team !== victim.team)) { a.stats.a++; a.stats.score += 1; assist = assist || a; if (a === this.player) this.pc.assists++; }
    }
    for (const a of this.agents) a.stats.dmgTo[victim.id] = 0;
    if (killer === this.player && !self && !teamkill) {
      this.pc.kills++;
      if (head) this.pc.hsKills++;
      this.pc.weaponKills[def.id] = (this.pc.weaponKills[def.id] || 0) + 1;
      if (def.cat === 'sniper') this.pc.sniperKills++;
    }
    if (victim === this.player) this.pc.deaths++;
    const entry = { killer: self ? null : killer.name, kTeam: killer && killer.team, kSquad: killer && killer.squad, victim: victim.name, vTeam: victim.team, weapon: def.id, head, assist: assist ? assist.name : null, mine: killer === this.player || victim === this.player, killerIsPlayer: killer === this.player, time: this.time };
    this.killfeed.push(entry);
    if (this.killfeed.length > 30) this.killfeed.shift();
    this.event({ type: 'kill', entry });
    this.sound('death', victim);
    // выпадает оружие и бомба
    if (this.mode === 'comp' || this.mode === 'tdm') {
      const w = victim.inv.primary || victim.inv.secondary;
      if (w) this.spawnDrop(w, victim, false);
      victim.inv.primary = null; victim.inv.secondary = null;
    }
    if (victim.inv.bomb && this.mode === 'comp') this.dropBomb(victim, false);
    victim.inv.grenades = [];
    victim.armor = 0; victim.helmet = false; victim.kit = false;
    if (this.bomb && this.bomb.defuser === victim) { this.bomb.defuser = null; this.bomb.defuse = 0; }
    if (this.mode === 'dm' || this.mode === 'tdm') {
      victim.respawnAt = this.time + 2;
      if (!self && killer && killer.stats.k >= this.killLimit && this.mode === 'dm') this.finish();
      if (this.mode === 'tdm' && this.teamKills[0] >= this.killLimit || this.mode === 'tdm' && this.teamKills[1] >= this.killLimit) this.finish();
    }
    if (this.mode === 'train' && victim.dummy) {
      victim.respawnAt = this.time + 1.5;
      if (killer === this.player) { this.trainHits++; this.pc.rangeHits = Math.max(this.pc.rangeHits, this.trainHits); }
    }
    // последний живой в команде игрока
    if (this.mode === 'comp' && this.player && this.player.alive) {
      const mates = this.agents.filter((a) => a.squad === 0 && a !== this.player && a.alive).length;
      const foes = this.agents.filter((a) => a.squad === 1 && a.alive).length;
      if (mates === 0 && foes > 0) this.roundInfo.clutch = true;
    }
  };

  // ---------- Бомба ----------
  P.plantBomb = function (a, zone) {
    a.inv.bomb = false; a.planting = 0;
    this.bomb = { state: 'planted', carrier: null, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, timer: E.bombTime, defuse: 0, defuser: null, planter: a, site: zone, nextBeep: 0 };
    this.phase = 'planted';
    this.addMoney(a, E.plantPlayer, 'plant');
    a.stats.score += 2;
    if (a === this.player) this.pc.plants++;
    this.switchSlot(a, this.bestSlot(a));
    this.noise(a.pos, 60, a, 'plant');
    this.event({ type: 'planted', site: zone, agent: a.name });
    this.sound('planted', null);
  };
  P.defuseBomb = function (a) {
    this.bomb.state = 'defused'; this.bomb.defuser = a;
    this.addMoney(a, E.defusePlayer, 'defuse');
    a.stats.score += 2;
    if (a === this.player) this.pc.defuses++;
    this.event({ type: 'defused', agent: a.name });
    this.sound('defused', null);
    this.endRound(this.squadOfSide('CT'), 'defuse');
  };
  P.stepBomb = function (dt) {
    const b = this.bomb;
    if (!b) return;
    if (b.state === 'planted' && this.phase === 'planted') {
      b.timer -= dt;
      const left = b.timer;
      b.led = (this.time % Math.max(0.12, b.interval || 1)) < 0.07;
      if (this.time >= b.nextBeep) {
        b.interval = 0.12 + 0.88 * Math.pow(Math.max(0, left) / E.bombTime, 1.4);
        b.nextBeep = this.time + b.interval;
        this.sound('beep', { pos: b.pos });
      }
      if (left <= 0) this.explodeBomb();
    }
    if (this.effects) {
      if (b.state === 'planted' || b.state === 'defused') this.effects.setBomb({ pos: b.pos, led: b.state === 'planted' && b.led });
      else this.effects.setBomb(null);
    }
  };
  P.explodeBomb = function () {
    const b = this.bomb;
    b.state = 'exploded';
    if (this.effects) { this.effects.explosion(b.pos); this.effects.explosion({ x: b.pos.x + 1, y: b.pos.y, z: b.pos.z }); }
    this.sound('bombExplode', null);
    for (const a of this.agents) {
      if (!a.alive) continue;
      const d = TAC.dist3(a.pos, b.pos);
      const dmg = d < 12 ? 500 : Math.max(0, 500 * (1 - (d - 12) / 14));
      if (dmg > 0) this.applyDamage(null, a, Math.floor(a.armor > 0 ? dmg * 0.8 : dmg), 0, { id: 'bomb', cat: 'bomb', kill: 0 }, 'chest', null);
    }
    this.endRound(this.squadOfSide('T'), 'bomb');
  };

  // ---------- Гранаты ----------
  P.throwGrenade = function (a, def, under) {
    const idx = a.inv.grenades.indexOf(def.id);
    if (idx < 0) return null;
    a.inv.grenades.splice(idx, 1);
    const eye = a.eye(), dir = TAC.dirFromAngles(a.yaw, a.pitch + (under ? -0.1 : 0.12));
    const sp = under ? 7 : 16;
    const g = { def, owner: a, pos: { x: eye.x + dir.x * 0.4, y: eye.y + dir.y * 0.4 - 0.1, z: eye.z + dir.z * 0.4 }, vel: { x: dir.x * sp + a.vel.x * 0.7, y: dir.y * sp + (under ? 1 : 2), z: dir.z * sp + a.vel.z * 0.7 }, t: 0, settled: false };
    this.grenades.push(g);
    a.fire.next = this.time + 0.9;
    this.sound('throw', a);
    this.noise(a.pos, 12, a, 'throw');
    if (a.inv.grenades.length) a.fire.draw = 0.5; else this.switchSlot(a, a.lastSlot !== 'grenade' && this.hasSlot(a, a.lastSlot) ? a.lastSlot : this.bestSlot(a));
    return { agent: a, weapon: def.id, hits: [], ends: [], grenade: g };
  };
  P.stepGrenades = function (dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.t += dt;
      if (!g.settled) {
        g.vel.y -= 16 * dt;
        const sp = Math.hypot(g.vel.x, g.vel.y, g.vel.z);
        const step = sp * dt;
        if (step > 1e-5) {
          const d = { x: g.vel.x / sp, y: g.vel.y / sp, z: g.vel.z / sp };
          const hit = this.world.raycast(g.pos, d, step + 0.06);
          if (hit) {
            const n = hit.normal;
            g.pos.x = hit.point.x + n.x * 0.06; g.pos.y = hit.point.y + n.y * 0.06; g.pos.z = hit.point.z + n.z * 0.06;
            const vn = g.vel.x * n.x + g.vel.y * n.y + g.vel.z * n.z;
            g.vel.x -= 2 * vn * n.x; g.vel.y -= 2 * vn * n.y; g.vel.z -= 2 * vn * n.z;
            g.vel.x *= 0.45; g.vel.y *= 0.45; g.vel.z *= 0.45;
            if (sp > 3) this.sound('bounce', { pos: g.pos });
            if (n.y > 0.7) {
              if (g.def.id === 'fire') { this.detonate(g); this.grenades.splice(i, 1); continue; }
              if (Math.hypot(g.vel.x, g.vel.y, g.vel.z) < 1.2) { g.settled = true; g.vel.x = g.vel.y = g.vel.z = 0; }
            }
          } else { g.pos.x += g.vel.x * dt; g.pos.y += g.vel.y * dt; g.pos.z += g.vel.z * dt; }
        }
      }
      const fuse = g.def.fuse;
      const ready = g.def.id === 'smoke' ? (g.t >= fuse && (g.settled || g.t > fuse * 2.5)) : g.t >= fuse;
      if (ready) { this.detonate(g); this.grenades.splice(i, 1); continue; }
      if (this.effects) this.effects.grenadeMesh(g, true);
    }
  };
  P.detonate = function (g) {
    if (this.effects) this.effects.grenadeMesh(g, false);
    const p = { x: g.pos.x, y: Math.max(0, g.pos.y - 0.05), z: g.pos.z };
    const def = g.def;
    if (def.id === 'frag') {
      if (this.effects) this.effects.explosion(p);
      this.sound('explode', { pos: p });
      this.noise(p, 50, g.owner, 'explode');
      TAC.explosionDamage(this, g.owner, p, def);
    } else if (def.id === 'flash') {
      if (this.effects) this.effects.flashBurst(p);
      this.sound('flash', { pos: p });
      this.noise(p, 40, g.owner, 'flash');
      for (const a of this.agents) {
        if (!a.alive) continue;
        const eye = a.eye(), d = TAC.dist3(eye, p);
        if (d > 38 || !this.world.clear(p, eye)) continue;
        const view = TAC.dirFromAngles(a.yaw, a.pitch), to = { x: (p.x - eye.x) / d, y: (p.y - eye.y) / d, z: (p.z - eye.z) / d };
        const dot = view.x * to.x + view.y * to.y + view.z * to.z;
        const amount = dot > 0.5 ? 1 : dot > -0.1 ? 0.5 : 0.12;
        const dur = 4.6 * amount * TAC.clamp(1.15 - d / 38, 0.25, 1);
        if (dur > a.flash) { a.flash = dur; a.flashMax = dur; }
        if (a === this.player && dur > 1) this.sound('ringing', null, { len: dur });
      }
    } else if (def.id === 'smoke') {
      const sm = { pos: p, r: def.radius, start: this.time, end: this.time + def.duration, owner: g.owner };
      this.smokes.push(sm);
      if (this.effects) this.effects.addSmoke(sm);
      this.sound('smoke', { pos: p });
      for (const f of this.fires) if (TAC.dist2d(f.pos, p) < f.r + sm.r) { f.out = true; f.end = this.time; }
    } else if (def.id === 'fire') {
      if (this.smokes.some((s) => TAC.dist2d(s.pos, p) < s.r + def.radius * 0.5)) { this.sound('smoke', { pos: p }); return; }
      const fi = { pos: p, r: def.radius, start: this.time, end: this.time + def.duration, owner: g.owner, def, acc: new Map() };
      this.fires.push(fi);
      if (this.effects) this.effects.addFire(fi);
      this.sound('fire', { pos: p });
      this.noise(p, 25, g.owner, 'fire');
    }
  };
  P.stepFires = function (dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (f.end <= this.time || f.out) { this.fires.splice(i, 1); continue; }
      for (const a of this.agents) {
        if (!a.alive || TAC.dist2d(a.pos, f.pos) > f.r || Math.abs(a.pos.y - f.pos.y) > 1.2) continue;
        const acc = (f.acc.get(a) || 0) + f.def.dps * dt;
        if (acc >= 8) { f.acc.set(a, acc - 8); this.applyDamage(f.owner, a, 8, 0, f.def, 'legs', null); } else f.acc.set(a, acc);
      }
    }
  };
  // Закрывает ли дым отрезок a-b
  P.smokeBlocks = function (a, b) {
    for (const s of this.smokes) {
      const grow = Math.min(1, (this.time - s.start) / 1.2), left = s.end - this.time;
      if (grow < 0.4 || left < 1) continue;
      const r = s.r * grow;
      const cx = s.pos.x, cy = s.pos.y + 1.4, cz = s.pos.z;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1;
      const t = TAC.clamp(((cx - a.x) * dx + (cy - a.y) * dy + (cz - a.z) * dz) / L2, 0, 1);
      const px = a.x + dx * t - cx, py = a.y + dy * t - cy, pz = a.z + dz * t - cz;
      if (px * px + py * py * 0.6 + pz * pz < r * r) return true;
    }
    return false;
  };
  // Видит ли боец a бойца b: поле зрения, дым, ослепление, прямая без стен до головы или груди
  P.canSee = function (a, b, fovDeg) {
    if (!b.alive || !a.alive) return false;
    if (a.flash > 1.0) return false;
    const eye = a.eye();
    const dx = b.pos.x - eye.x, dz = b.pos.z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 95) return false;
    if (fovDeg) {
      const ang = Math.atan2(-dx, -dz);
      if (Math.abs(TAC.wrapAngle(ang - a.yaw)) > fovDeg * Math.PI / 360 && dist > 2.5) return false;
    }
    for (const z of ['head', 'chest', 'legs']) {
      const p = TAC.zonePoint(b, z);
      if (this.world.clear(eye, p) && !this.smokeBlocks(eye, p)) return true;
    }
    return false;
  };
  // Кого видит игрок - для радара команды
  P.playerSpotting = function () {
    const p = this.player;
    for (const a of this.agents) {
      if (a === p || !a.alive) continue;
      if (p.team && a.team === p.team) continue;
      if (p.alive && this.canSee(p, a, 100)) this.spotted[0].set(a.id, this.time);
    }
  };

  // ---------- Мишени разминки ----------
  P.stepTargets = function (dt) {
    if (!this.targets) return;
    for (const t of this.targets) {
      if (!t.alive) { t.respawn -= dt; if (t.respawn <= 0) { this.placeTarget(t); t.alive = true; } continue; }
      t.pos.y = t.origin.y + Math.sin(this.time * t.speed + t.phase) * t.amp * 0.4;
      t.pos.x = t.origin.x + Math.cos(this.time * t.speed * 0.7 + t.phase) * t.amp * 0.3;
      t.pos.z = t.origin.z;
    }
  };
  P.finishTraining = function () {
    this.phase = 'results';
    const best = TAC.store.get('rangeBest', 0);
    this.newRecord = this.trainHits > best;
    if (this.newRecord) TAC.store.set('rangeBest', this.trainHits);
    this.best = Math.max(best, this.trainHits);
    this.event({ type: 'trainResults', hits: this.trainHits, shots: this.trainShots, best: this.best, record: this.newRecord });
    this.finish(true);
  };

  // ---------- Звук и слух ----------
  P.noise = function (pos, radius, source, kind) { this.noises.push({ pos: { x: pos.x, y: pos.y, z: pos.z }, radius, source, kind: kind || 'shot', time: this.time }); };
  P.sound = function (kind, who, extra) {
    if (!TAC.audio || !TAC.audio.ctx) return;
    const opts = Object.assign({}, extra || {});
    if (who && who.pos && who instanceof TAC.Agent) { opts.pos = { x: who.pos.x, y: who.pos.y + 1.4, z: who.pos.z }; opts.near = who === this.env.viewAgent; }
    else if (who && who.pos) opts.pos = who.pos;
    TAC.audio.play(kind, opts);
  };
  P.onShot = function (a, def, shot, eye) {
    if (a === this.player) { this.pc.shots++; if (this.mode === 'train') this.trainShots++; }
    if (def.cat !== 'knife') {
      this.noise(a.pos, 45, a, 'shot');
      this.sound('shot', a, { model: def.model });
      if (this.infiniteAmmo && a === this.player) { const w = a.weapon(); if (w) w.reserve = w.def.reserve; }
    }
    if (this.effects) {
      const muzzle = { x: eye.x + Math.cos(a.yaw) * 0.12 - Math.sin(a.yaw) * 0.6, y: eye.y - 0.12, z: eye.z - Math.sin(a.yaw) * 0.12 - Math.cos(a.yaw) * 0.6 };
      if (def.cat !== 'knife') this.effects.muzzle(muzzle);
      for (const e of shot.ends) {
        if (def.cat !== 'knife' && (a !== this.env.viewAgent || this.tickN % 3 === 0)) this.effects.tracer(muzzle, e.point, a === this.player);
        if (!e.agent && !e.target && e.wall) this.effects.impact(e.point, e.wall.normal, e.wall.mat);
      }
    }
    for (const b of this.brains) if (b.bot === a) b.onFired && b.onFired();
  };

  P.event = function (e) { e.t = this.time; e.id = (this.eventId = (this.eventId || 0) + 1); this.events.push(e); if (this.events.length > 200) this.events.shift(); };

  // ---------- Конец матча ----------
  P.finish = function (training) {
    if (this.over) return;
    this.over = true;
    if (this.phase !== 'results') this.phase = 'over';
    const s = this.summary(training);
    this.result = s;
    this.event({ type: 'matchOver', summary: s });
    if (this.env.onMatchOver) this.env.onMatchOver(s, this);
  };
  P.summary = function () {
    const pc = this.pc, p = this.player;
    const s = {
      mode: this.mode, map: this.mapId, diff: this.diff, side: this.initialSide || null, short: this.short, missionId: this.missionId,
      kills: pc.kills, deaths: pc.deaths, assists: pc.assists, plants: pc.plants, defuses: pc.defuses, clutches: pc.clutches, sniperKills: pc.sniperKills,
      rangeHits: pc.rangeHits, shots: pc.shots, hits: pc.hits, headHits: pc.headHits, hsKills: pc.hsKills, weaponKills: pc.weaponKills, mvps: pc.mvps, damage: pc.damage,
      roundsWon: pc.roundsWon, roundsPlayed: pc.roundsPlayed, score: this.score.slice(), won: false, draw: false, margin: 0,
    };
    if (this.mode === 'comp') {
      s.won = this.score[0] > this.score[1]; s.draw = this.score[0] === this.score[1]; s.margin = this.score[0] - this.score[1];
    } else if (this.mode === 'tdm') {
      s.score = this.teamKills.slice(); s.won = this.teamKills[0] > this.teamKills[1]; s.draw = this.teamKills[0] === this.teamKills[1]; s.margin = this.teamKills[0] - this.teamKills[1];
      s.teamWon = s.won;
    } else if (this.mode === 'dm') {
      const order = this.agents.slice().sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d);
      s.place = order.indexOf(p) + 1; s.won = s.place === 1;
    } else if (this.mode === 'train') { s.won = true; s.rangeHits = this.trainHits; }
    return s;
  };
})();

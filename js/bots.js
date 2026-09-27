// Боты: покупают по деньгам, идут по ролям (атака - к точке и закладка, защита - держат позиции
// и переходят на звук и сведения), видят только по прямой линии, реагируют с задержкой и
// промахом по сложности, слышат шаги и выстрелы, отходят в укрытие, перезаряжаются,
// подбирают оружие, обезвреживают бомбу. Случайности - из генератора матча (повторяемо).
(function () {
  'use strict';
  const TAC = window.TAC;
  const DEG = Math.PI / 180;
  const PRICE = (id) => (TAC.WEAPONS[id] ? TAC.WEAPONS[id].price : 0);

  function Brain(bot, match) {
    this.bot = bot; this.m = match;
    this.d = TAC.DIFFICULTY[match.diff] || TAC.DIFFICULTY.medium;
    this.path = null; this.pi = 0; this.goal = null; this.goalKind = null; this.repathAt = 0;
    this.target = null; this.reactAt = 0; this.err = { x: 0, y: 0 }; this.lastSeen = null;
    this.heard = null; this.noiseSeen = 0;
    this.state = 'idle'; this.stateUntil = 0;
    this.look = null; this.holdLook = null;
    this.visIdx = (bot.id * 3) % 4;
    this.stuckT = 0; this.lastPos = { x: 0, z: 0 }; this.nudge = 1;
    this.bought = false; this.buyAt = 0;
    this.burst = 0; this.pauseFire = 0;
    this.visible = [];
    this.retreatUntil = 0;
    this.throwPlan = null;
    this.aimZone = 'chest';
  }
  TAC.Brain = Brain;
  const P = Brain.prototype;

  P.onRoundStart = function () {
    const m = this.m, b = this.bot;
    this.resetNav();
    this.target = null; this.lastSeen = null; this.heard = null;
    this.state = 'idle'; this.bought = false; this.buyAt = m.time + 0.3 + m.rng() * 2.5;
    this.retreatUntil = 0; this.throwPlan = null; this.executed = false; this.noiseSeen = m.time;
    // план команды выбирает первый живой бот стороны
    const team = m.agents.filter((a) => a.team === b.team && a.isBot);
    if (team[0] === b) {
      const plan = TAC.MAPS[m.mapId].plan;
      if (b.team === 'T') {
        const site = m.rng() < 0.5 ? 'A' : 'B';
        m.tPlan = { site, split: m.rng() < 0.3, go: false, t0: m.time };
      } else {
        const order = ['A', 'A', 'B', 'B', 'mid'];
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(m.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        m.ctPlan = { roles: new Map(), rotate: null };
        const cts = m.agents.filter((a) => a.team === 'CT');
        cts.forEach((a, i) => m.ctPlan.roles.set(a.id, order[i % order.length]));
        void plan;
      }
    }
  };
  // Новый раунд или возрождение: забыть прошлую цель целиком, иначе «hold»/«stage» прошлого раунда
  // считались достигнутыми и бот стоял на базе
  P.resetNav = function () {
    this.path = null; this.pi = 0; this.goal = null; this.goalKind = null; this.repathAt = 0;
    this.role = null; this.holdSpot = null; this.coverGoal = null; this.stuckT = 0;
  };
  P.onRespawn = function () { this.resetNav(); this.target = null; this.lastSeen = null; this.state = 'idle'; };
  P.onDamaged = function (attacker) {
    if (!attacker || attacker === this.bot) return;
    if (!this.lastSeen || this.m.time - this.lastSeen.time > 1) this.lastSeen = { pos: { x: attacker.pos.x, y: attacker.pos.y, z: attacker.pos.z }, time: this.m.time, agent: attacker };
    this.heard = { pos: { x: attacker.pos.x, y: 0, z: attacker.pos.z }, time: this.m.time };
  };
  P.onFired = function () {};

  P.enemy = function (a) { return a !== this.bot && a.alive && (!this.bot.team || a.team !== this.bot.team); };

  // ---------- Покупка ----------
  P.buy = function () {
    const m = this.m, b = this.bot, side = b.team;
    if (m.mode !== 'comp') return;
    const team = m.agents.filter((a) => a.team === side);
    const avg = team.reduce((s, a) => s + a.money, 0) / team.length;
    const pistolRound = m.round === 1 || m.round === m.half + 1;
    const rifle = side === 'T' ? 'burya' : 'strazh';
    const tryBuy = (id) => m.buy(b, id).ok;
    if (pistolRound) {
      if (m.rng() < 0.5) tryBuy('vest'); else { tryBuy('grom') || tryBuy('hornet'); tryBuy('flash'); }
      if (side === 'CT' && b.money >= 400 && m.rng() < 0.4) tryBuy('kit');
      return;
    }
    const full = avg >= 3900 || b.money >= 4200;
    const force = !full && (m.lossStreak[b.squad] >= 3 || avg >= 2600) && b.money >= 2000;
    if (b.inv.primary) {
      // уже с оружием: броня и гранаты
    } else if (full) {
      const awper = team.filter((a) => a.isBot)[1] === b;
      if (awper && b.money >= 4750 + 1000) tryBuy('dalnoboy');
      else if (b.money >= PRICE(rifle) + 650) tryBuy(rifle);
      else tryBuy('lis');
    } else if (force) {
      const pick = m.rng();
      if (pick < 0.4) tryBuy('osa'); else if (pick < 0.65) tryBuy('lis'); else if (pick < 0.85) tryBuy('shchegol'); else tryBuy('vepr');
    } else if (b.money >= 700 && m.rng() < 0.5) tryBuy(m.rng() < 0.5 ? 'grom' : 'hornet');
    if (b.money >= 1000 && (b.armor < 100 || !b.helmet)) tryBuy('vesthelm'); else if (b.money >= 650 && b.armor < 100) tryBuy('vest');
    if (side === 'CT' && b.money >= 400 && (full || m.rng() < 0.5)) tryBuy('kit');
    if (full || force) {
      const nades = side === 'T' ? ['smoke', 'flash', 'frag', 'fire'] : ['smoke', 'fire', 'flash', 'frag'];
      for (const n of nades) if (b.money >= PRICE(n) + 200 && m.rng() < 0.6) tryBuy(n);
    }
    m.switchSlot(b, m.bestSlot(b));
  };

  // ---------- Восприятие ----------
  P.perceive = function () {
    const m = this.m, b = this.bot;
    this.visible.length = 0;
    if (b.flash > 1.0) return;
    for (const a of m.agents) {
      if (!this.enemy(a) || a.dummy) continue;
      if (m.canSee(b, a, this.d.fov)) this.visible.push(a);
    }
    for (const a of this.visible) {
      if (b.squad != null && m.spotted[b.squad]) m.spotted[b.squad].set(a.id, m.time);
      if (m.mode === 'comp' && b.team === 'CT' && m.ctPlan) {
        const site = this.siteNear(a.pos);
        if (site && !m.ctPlan.rotate) m.ctPlan.rotate = { site, time: m.time };
      }
    }
    // слух: шаги, выстрелы, закладка
    for (const n of m.noises) {
      if (n.time <= this.noiseSeen) continue;
      if (!n.source || n.source === b || !this.enemy(n.source)) continue;
      const d = TAC.dist2d(n.pos, b.pos);
      if (d < n.radius * this.d.hear) {
        this.heard = { pos: { x: n.pos.x, y: n.pos.y, z: n.pos.z }, time: n.time, kind: n.kind };
        if (m.mode === 'comp' && b.team === 'CT' && m.ctPlan && (n.kind === 'step' || n.kind === 'shot')) {
          const site = this.siteNear(n.pos);
          if (site && !m.ctPlan.rotate && n.kind === 'shot') m.ctPlan.rotate = { site, time: m.time };
        }
      }
    }
    this.noiseSeen = m.time;
  };
  P.siteNear = function (pos) {
    const w = this.m.world;
    for (const s of ['A', 'B']) {
      const c = w.siteCenter[s];
      if (c && TAC.dist2d(pos, w.center(c[0], c[1])) < 16) return s;
    }
    return null;
  };

  // ---------- Главный шаг ----------
  P.update = function (dt) {
    const m = this.m, b = this.bot;
    const inp = b.input;
    inp.mx = 0; inp.mz = 0; inp.fire = false; inp.firePressed = false; inp.fire2Pressed = false; inp.use = false; inp.jump = false; inp.crouch = false; inp.walk = false; inp.reload = false;
    if (!b.alive || b.dummy) return;
    if (m.mode === 'comp' && m.phase === 'freeze') { if (!this.bought && m.time >= this.buyAt) { this.bought = true; this.buy(); } this.lookAround(dt); return; }
    if (m.phase === 'roundEnd' || m.phase === 'over') { this.followPath(inp, false); return; }
    if ((m.tickN + this.visIdx) % 4 === 0) this.perceive();
    // цель
    let tgt = null, bestD = 1e9;
    for (const a of this.visible) { if (!a.alive) continue; const d = TAC.dist2d(a.pos, b.pos); if (d < bestD) { bestD = d; tgt = a; } }
    if (tgt !== this.target) {
      if (tgt) {
        const known = this.lastSeen && this.lastSeen.agent === tgt && m.time - this.lastSeen.time < 1.5;
        // держит угол (стоит на позиции и смотрит в проход) - реагирует быстрее и точнее того, кто выходит
        const holding = Math.hypot(b.vel.x, b.vel.z) < 0.6 && (this.goalKind === 'hold' || this.goalKind === 'post' || this.goalKind === 'stage') && this.arrived();
        const edge = holding ? 0.6 : 1;
        this.reactAt = m.time + this.d.reaction * edge * (known ? 0.4 : 0.8 + m.rng() * 0.5);
        const e = this.d.aimErr * DEG * edge * (0.6 + m.rng() * 0.8), ang = m.rng() * Math.PI * 2;
        this.err.x = Math.cos(ang) * e; this.err.y = Math.sin(ang) * e * 0.7;
        this.aimZone = m.rng() < this.d.head ? 'head' : 'chest';
      }
      this.target = tgt;
    }
    if (tgt) this.lastSeen = { pos: { x: tgt.pos.x, y: tgt.pos.y, z: tgt.pos.z }, time: m.time, agent: tgt };
    this.manageWeapon(inp);
    if (tgt) this.engage(dt, inp, tgt);
    else this.objective(dt, inp);
    this.avoidFire(inp);
  };

  P.manageWeapon = function (inp) {
    const m = this.m, b = this.bot;
    const w = b.weapon();
    if (b.slot === 'bomb' && this.state !== 'plant') m.switchSlot(b, m.bestSlot(b));
    if (b.slot === 'grenade' && !this.throwPlan) m.switchSlot(b, m.bestSlot(b));
    if (b.slot === 'knife' && m.bestSlot(b) !== 'knife') m.switchSlot(b, m.bestSlot(b));
    if (!w || !w.def.mag) return;
    if (w.mag === 0 && w.reserve === 0) { m.switchSlot(b, m.bestSlot(b)); return; }
    if (b.slot === 'secondary' && b.inv.primary && (b.inv.primary.mag + b.inv.primary.reserve) > 0 && !this.target) m.switchSlot(b, 'primary');
    if (w.mag === 0) inp.reload = true;
    else if (!this.target && w.mag < w.def.mag * 0.4 && w.reserve > 0 && (!this.lastSeen || m.time - this.lastSeen.time > 1.5)) inp.reload = true;
  };

  // Бой: повернуться к цели с ошибкой, дождаться реакции, стрелять очередью или одиночными
  P.engage = function (dt, inp, tgt) {
    const m = this.m, b = this.bot, d = this.d;
    const w = b.weapon(), def = b.weaponDef();
    const dist = TAC.dist2d(tgt.pos, b.pos);
    const aim = TAC.zonePoint(tgt, this.aimZone);
    const want = TAC.anglesTo(b.eye(), aim);
    // ошибка прицела уменьшается, пока цель видна
    const settle = Math.exp(-dt * (1.2 + d.turn * 0.18));
    this.err.x *= settle; this.err.y *= settle;
    const floor = d.aimErr * DEG * 0.12;
    const ex = Math.abs(this.err.x) < floor ? Math.sign(this.err.x || 1) * floor : this.err.x;
    // компенсация отдачи
    const pat = TAC.patternAt(def, b.fire.spray);
    b.aimOffYaw = d.comp * pat[0] * DEG; b.aimOffPitch = -d.comp * pat[1] * DEG;
    this.turnTo(want.yaw + ex, want.pitch + this.err.y, dt);
    // прицел снайперки
    if (def.scope && dist > 7 && b.fire.scope === 0 && b.fire.draw <= 0) inp.fire2Pressed = true;
    // перезарядка на виду - отойти
    const reloading = b.fire.reload > 0;
    const lowHp = b.hp < 30 && dist > 8;
    if ((reloading || lowHp) && m.time > this.retreatUntil - 3) {
      if (!this.coverGoal || m.time > this.retreatUntil) { this.coverGoal = this.findCover(tgt); this.retreatUntil = m.time + 2.5; }
      if (this.coverGoal) { this.goTo(this.coverGoal, 'cover'); this.followPath(inp, true); return; }
    }
    const angErr = Math.hypot(TAC.wrapAngle(want.yaw - b.yaw), want.pitch - b.pitch);
    const tol = Math.atan2(this.aimZone === 'head' ? 0.18 : 0.3, Math.max(1, dist)) + 0.012;
    const ready = m.time >= this.reactAt && b.fire.draw <= 0 && !reloading;
    let shoot = ready && angErr < tol * 2.2;
    if (def.cat === 'knife') {
      // с ножом - бежать к цели
      this.goTo(tgt.pos, 'chase'); this.followPath(inp, true);
      shoot = ready && dist < 1.6;
      inp.fire = shoot;
      return;
    }
    if (def.cat === 'grenade' || def.cat === 'bomb') { m.switchSlot(b, m.bestSlot(b)); return; }
    if (def.scope && b.fire.scope === 0 && dist > 7) shoot = false;
    // очереди на дальней дистанции
    if (shoot && def.auto && dist > 14) {
      const maxBurst = dist > 30 ? 1 + Math.round(2 * (1 - d.tap)) : 3 + Math.round(3 * (1 - d.tap));
      if (m.time < this.pauseFire) shoot = false;
      else if (b.fire.spray >= maxBurst) { this.pauseFire = m.time + 0.25 + 0.2 * d.tap; shoot = false; }
    }
    if (shoot) {
      inp.fire = true;
      inp.firePressed = !def.auto ? (m.time >= b.fire.next) : true;
    }
    // движение: сильные останавливаются для точного выстрела, слабые продолжают идти
    if (d.stopToShoot && (shoot || angErr < tol * 4)) {
      if (!def.auto || dist > 6) { inp.mx = 0; inp.mz = 0; }
      else inp.mx = Math.sin(m.time * 2.7 + b.id) > 0 ? 0.5 : -0.5;
      if (dist > 18 && d.stopToShoot && m.rng() < 0.002) inp.crouch = true;
    } else {
      const strafe = Math.sin(m.time * 1.9 + b.id * 1.7);
      inp.mx = strafe > 0.2 ? 1 : strafe < -0.2 ? -1 : 0;
      if (dist > 12) inp.mz = 0.5;
    }
    this.state = 'engage';
  };

  P.turnTo = function (yaw, pitch, dt) {
    const b = this.bot;
    const maxStep = this.d.turn * dt;
    const dy = TAC.wrapAngle(yaw - b.yaw), dp = pitch - b.pitch;
    const k = Math.min(1, maxStep / Math.max(1e-6, Math.hypot(dy, dp)));
    // плавное приближение: быстро издалека, медленно у цели
    const ease = Math.min(1, 12 * dt);
    b.yaw = TAC.wrapAngle(b.yaw + dy * Math.max(k * 0.5, Math.min(k, ease)));
    b.pitch = TAC.clamp(b.pitch + dp * Math.max(k * 0.5, Math.min(k, ease)), -1.4, 1.4);
  };

  // Укрытие: клетка рядом, откуда цели не видно
  P.findCover = function (tgt) {
    const m = this.m, w = m.world, b = this.bot;
    const [cx, cy] = w.cellOf(b.pos.x, b.pos.z);
    const teye = tgt.eye();
    let best = null, bd = 1e9;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      if (!w.walkable(cx + i, cy + j)) continue;
      const p = w.center(cx + i, cy + j, 1.2);
      if (w.clear(teye, p)) continue;
      const d = Math.hypot(i, j) + TAC.dist2d(p, tgt.pos) * -0.05;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  // ---------- Цели по режиму ----------
  P.objective = function (dt, inp) {
    const m = this.m, b = this.bot;
    b.aimOffYaw = 0; b.aimOffPitch = 0;
    if (b.fire.scope && m.rng() < 0.02) b.fire.scope = 0;
    // недавно видел или слышал врага - повернуться туда
    const recent = this.lastSeen && m.time - this.lastSeen.time < 2.5 ? this.lastSeen.pos : (this.heard && m.time - this.heard.time < 3 ? this.heard.pos : null);
    if (m.mode === 'comp') this.compObjective(dt, inp, recent);
    else if (m.mode === 'dm' || m.mode === 'tdm') this.roam(dt, inp, recent);
  };

  P.roam = function (dt, inp, recent) {
    const m = this.m, b = this.bot, w = m.world;
    if (recent && (!this.goal || this.goalKind !== 'hunt' || m.time > this.repathAt)) { this.moveTo(recent, 'hunt'); this.repathAt = m.time + 1.5; }
    if (!this.goal || this.arrived()) {
      let p;
      if (m.mode === 'tdm') {
        const enemySide = b.team === 'T' ? 'u' : 't';
        p = m.rng() < 0.5 && w.zones[enemySide].length ? w.randomCell(m.rng, w.zones[enemySide]) : w.randomCell(m.rng, w.zones.open);
      } else p = w.randomCell(m.rng, w.zones.open);
      this.moveTo(p, 'roam');
    }
    this.followPath(inp, true);
    this.lookWhileMoving(dt, recent);
    this.pickupNearby();
  };

  P.compObjective = function (dt, inp, recent) {
    const m = this.m, b = this.bot, w = m.world, plan = TAC.MAPS[m.mapId].plan;
    const bomb = m.bomb;
    if (b.team === 'T') {
      const tp = m.tPlan || { site: 'A', split: false, go: false, t0: m.liveStart };
      // бомба лежит - поднять
      if (bomb.state === 'dropped' && bomb.item && this.closestTo(bomb.item.pos, 'T') === b) {
        this.goTo(bomb.item.pos, 'bomb'); this.followPath(inp, true); this.lookWhileMoving(dt, recent); return;
      }
      if (bomb.state === 'planted') {
        // охрана заложенной бомбы
        if (!this.goal || this.goalKind !== 'post') {
          const site = w.zones[bomb.site];
          const c = site[Math.floor(m.rng() * site.length)];
          this.moveTo(w.center(c[0], c[1]), 'post');
        }
        this.followPath(inp, false);
        if (this.arrived()) { inp.crouch = this.d.stopToShoot && m.rng() < 0.5; this.watch(dt, recent || this.ctEntry(bomb.site)); }
        else this.lookWhileMoving(dt, recent);
        return;
      }
      const site = tp.site;
      const myIdx = m.agents.filter((a) => a.team === 'T' && a.alive).indexOf(b);
      const stages = plan.stage[site] || [];
      const stage = stages[tp.split && myIdx % 2 ? 1 : 0] || stages[0];
      const timeLeft = m.phaseEnd - m.time;
      // сбор у точки захода, потом заход
      if (!tp.go) {
        const ts = m.agents.filter((a) => a.team === 'T' && a.alive && a.isBot);
        const gathered = ts.filter((a) => { const br = m.brains.find((x) => x.bot === a); return br && br.goalKind === 'stage' && br.arrived(); }).length;
        if (gathered >= Math.max(1, Math.ceil(ts.length * 0.7)) || m.time - m.liveStart > 45 || timeLeft < 50) { tp.go = true; tp.goTime = m.time; }
      }
      if (!tp.go && stage) {
        if (this.goalKind !== 'stage') this.moveTo(w.center(stage[0], stage[1]), 'stage');
        this.followPath(inp, false);
        if (this.arrived()) this.watch(dt, recent || w.center(...w.siteCenter[site])); else this.lookWhileMoving(dt, recent);
        // перед заходом - дым на точку
        if (this.arrived() && !this.executed && b.inv.grenades.includes('smoke') && m.rng() < 0.05) this.planThrow('smoke', this.ctEntry(site));
        this.doThrow(dt, inp);
        return;
      }
      // заход на точку
      if (b.inv.bomb) {
        const zone = w.zoneAt(b.pos.x, b.pos.z);
        if (zone === site || zone === 'A' || zone === 'B') {
          if (this.visible.length === 0) {
            if (b.slot !== 'bomb') m.switchSlot(b, 'bomb');
            this.state = 'plant';
            if (b.fire.draw <= 0) inp.fire = true;
            this.watch(dt, recent || this.ctEntry(zone));
            return;
          }
        }
        if (this.goalKind !== 'plant') { const c = w.siteCenter[site]; this.moveTo(w.center(c[0], c[1]), 'plant'); }
      } else if (this.goalKind !== 'site') {
        const cells = w.zones[site];
        const c = cells[Math.floor(m.rng() * cells.length)];
        this.moveTo(w.center(c[0], c[1]), 'site');
      }
      this.state = 'move';
      this.followPath(inp, false);
      if (this.arrived() && this.goalKind === 'site') this.watch(dt, recent || this.ctEntry(site));
      else this.lookWhileMoving(dt, recent);
      this.doThrow(dt, inp);
      this.pickupNearby();
      return;
    }
    // Защита
    if (bomb.state === 'planted') {
      const left = bomb.timer;
      const kitT = b.kit ? TAC.ECON.defuseKitTime : TAC.ECON.defuseTime;
      const dist = TAC.dist2d(b.pos, bomb.pos);
      if (left < kitT + dist / 5.5 - 1 && dist > 3) {                          // не успеть - сохранить оружие
        if (this.goalKind !== 'save') { const c = w.zones.u[0]; this.moveTo(w.center(c[0], c[1]), 'save'); }
        this.followPath(inp, false); this.lookWhileMoving(dt, recent); return;
      }
      if (dist < 1.2) {
        if (!recent || m.time - (this.lastSeen ? this.lastSeen.time : -9) > 1.2) { inp.use = true; inp.crouch = false; this.state = 'defuse'; this.watch(dt, bomb.pos); return; }
      }
      if (this.goalKind !== 'defuse' || m.time > this.repathAt) { this.moveTo(bomb.pos, 'defuse'); this.repathAt = m.time + 2; }
      this.followPath(inp, false); this.lookWhileMoving(dt, recent); return;
    }
    const cp = m.ctPlan || { roles: new Map(), rotate: null };
    let role = cp.roles.get(b.id) || 'mid';
    // переход на точку: идут все, кроме одного «якоря» на другой точке
    if (cp.rotate && role !== cp.rotate.site && m.time - cp.rotate.time < 30) {
      const anchor = m.agents.find((a) => a.alive && a.team === 'CT' && a.isBot && cp.roles.get(a.id) === role && role !== 'mid');
      if (anchor !== b) role = cp.rotate.site;
    }
    const holds = plan.hold[role] || plan.hold.mid || [];
    if (this.role !== role || !this.holdSpot) {
      this.role = role;
      const idx = (b.id + m.round) % Math.max(1, holds.length);
      this.holdSpot = holds[idx];
    }
    if (this.holdSpot && this.goalKind !== 'hold') this.moveTo(w.center(this.holdSpot[0], this.holdSpot[1]), 'hold');
    if (recent && this.heard && m.time - this.heard.time < 1 && this.heard.kind === 'step' && TAC.dist2d(this.heard.pos, b.pos) < 12) {
      // слышит шаги рядом - присесть и смотреть туда
      this.watch(dt, this.heard.pos); inp.crouch = this.d.stopToShoot; return;
    }
    this.followPath(inp, false);
    if (this.arrived() && this.holdSpot) {
      this.watch(dt, recent || w.center(this.holdSpot[2], this.holdSpot[3], 1.2));
      if (b.inv.grenades.includes('fire') && recent && m.rng() < 0.01) this.planThrow('fire', recent);
      this.doThrow(dt, inp);
    } else this.lookWhileMoving(dt, recent);
    this.pickupNearby();
  };
  P.ctEntry = function (site) {
    const w = this.m.world, plan = TAC.MAPS[this.m.mapId].plan;
    const h = (plan.hold[site] || [])[0];
    if (h) return w.center(h[2], h[3], 1.4);
    const c = w.siteCenter[site];
    return c ? w.center(c[0], c[1], 1.4) : this.bot.pos;
  };
  P.closestTo = function (pos, team) {
    let best = null, bd = 1e9;
    for (const a of this.m.agents) if (a.alive && a.isBot && a.team === team) { const d = TAC.dist2d(a.pos, pos); if (d < bd) { bd = d; best = a; } }
    return best;
  };

  // Гранаты: повернуться, бросить по дуге
  P.planThrow = function (id, pos) { if (!this.throwPlan && pos) this.throwPlan = { id, pos, t: this.m.time }; };
  P.doThrow = function (dt, inp) {
    const m = this.m, b = this.bot, tp = this.throwPlan;
    if (!tp) return;
    if (!b.inv.grenades.includes(tp.id) || m.time - tp.t > 4) { this.throwPlan = null; this.executed = true; return; }
    if (b.slot !== 'grenade' || b.inv.grenades[0] !== tp.id) {
      while (b.inv.grenades[0] !== tp.id) b.inv.grenades.push(b.inv.grenades.shift());
      m.switchSlot(b, 'grenade');
    }
    const dist = TAC.dist2d(tp.pos, b.pos);
    const s = Math.min(1, dist * 16 / (16 * 16));
    const pitch = 0.5 * Math.asin(s) - 0.12 + 0.05;
    const yaw = Math.atan2(-(tp.pos.x - b.pos.x), -(tp.pos.z - b.pos.z));
    this.turnTo(yaw, pitch, dt);
    inp.mx = 0; inp.mz = 0;
    if (Math.abs(TAC.wrapAngle(yaw - b.yaw)) < 0.05 && b.fire.draw <= 0 && m.time >= b.fire.next) {
      inp.fire = true; inp.firePressed = true;
      this.throwPlan = null; this.executed = true;
    }
  };

  // Подобрать оружие получше, если врагов не видно
  P.pickupNearby = function () {
    const m = this.m, b = this.bot;
    if (this.target || !m.drops.length) return;
    const cur = b.inv.primary ? b.inv.primary.def.price : 0;
    for (const it of m.drops) {
      if (it.bomb || it.def.slot !== 'primary' || it.def.price <= cur + 300) continue;
      if (it.weapon.mag + it.weapon.reserve <= 0 || it.pos.y > 0.5 || !m.world.pointWalkable(it.pos.x, it.pos.z)) continue;   // на ящике не достать
      const d = TAC.dist2d(it.pos, b.pos);
      if (d < 12) {
        if (d < 1.4) { m.tryPickup(b, true); return; }
        this.goTo(it.pos, 'pickup');
        return;
      }
    }
  };

  P.avoidFire = function (inp) {
    const m = this.m, b = this.bot;
    for (const f of m.fires) {
      const d = TAC.dist2d(f.pos, b.pos);
      if (d < f.r + 0.5) {
        const away = Math.atan2(-(b.pos.x - f.pos.x), -(b.pos.z - f.pos.z));
        const rel = TAC.wrapAngle(away - b.yaw);
        inp.mz = Math.cos(rel); inp.mx = -Math.sin(rel);
        return;
      }
    }
  };

  // ---------- Движение по пути ----------
  P.moveTo = function (pos, kind) {
    const m = this.m, b = this.bot;
    this.goal = { x: pos.x, z: pos.z }; this.goalKind = kind;
    this.path = m.world.findPath(b.pos, this.goal) || [];
    this.pi = 0;
  };
  // Идти к цели, но путь пересчитывать только при смене цели или раз в секунду
  P.goTo = function (pos, kind) {
    const g = this.goal;
    if (!g || this.goalKind !== kind || Math.hypot(g.x - pos.x, g.z - pos.z) > 1.5 || this.m.time > (this.repathAt || 0)) {
      this.moveTo(pos, kind); this.repathAt = this.m.time + 1;
    }
  };
  P.arrived = function () { return !this.goal || TAC.dist2d(this.bot.pos, this.goal) < 0.8; };
  P.followPath = function (inp, run) {
    const m = this.m, b = this.bot;
    if (!this.path || this.pi >= this.path.length) return;
    let wp = this.path[this.pi];
    if (TAC.dist2d(b.pos, wp) < 0.55) { this.pi++; if (this.pi >= this.path.length) return; wp = this.path[this.pi]; }
    let dx = wp.x - b.pos.x, dz = wp.z - b.pos.z;
    // расходиться с соседями: вбок, не назад, и не когда застрял
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    if (this.stuckT < 2) {
      for (const a of m.agents) {
        if (a === b || !a.alive) continue;
        const ox = b.pos.x - a.pos.x, oz = b.pos.z - a.pos.z, d = Math.hypot(ox, oz);
        if (d < 0.9 && d > 1e-3) { const side = (ox * -dz + oz * dx) >= 0 ? 1 : -1; const px = -dz, pz = dx; dx += px * side * 0.35; dz += pz * side * 0.35; }
      }
    } else { const px = -dz, pz = dx; dx += px * this.nudge * 0.5; dz += pz * this.nudge * 0.5; }
    const want = Math.atan2(-dx, -dz);
    const rel = TAC.wrapAngle(want - b.yaw);
    inp.mz = Math.cos(rel); inp.mx = -Math.sin(rel);
    inp.walk = !run && this.goalKind === 'hold' && TAC.dist2d(b.pos, this.goal) < 6;
    // застрял - новый путь
    if (m.tickN % 32 === 0) {
      const moved = Math.hypot(b.pos.x - this.lastPos.x, b.pos.z - this.lastPos.z);
      this.lastPos.x = b.pos.x; this.lastPos.z = b.pos.z;
      if (moved < 0.25 && inp.mx * inp.mx + inp.mz * inp.mz > 0.1) {
        this.stuckT++;
        if (this.stuckT > 1) { this.path = m.world.findPath(b.pos, this.goal, true) || []; this.pi = 0; this.nudge = m.rng() < 0.5 ? -1 : 1; }
        inp.jump = this.stuckT === 4;
      } else if (moved > 0.6) this.stuckT = 0;
    }
  };
  P.lookWhileMoving = function (dt, recent) {
    const b = this.bot;
    if (recent) { this.watch(dt, recent); return; }
    if (this.path && this.pi < this.path.length) {
      const wp = this.path[Math.min(this.path.length - 1, this.pi + 1)];
      const yaw = Math.atan2(-(wp.x - b.pos.x), -(wp.z - b.pos.z));
      this.turnTo(yaw, 0, dt * 0.6);
    }
  };
  P.watch = function (dt, pos) {
    if (!pos) return;
    const b = this.bot;
    const a = TAC.anglesTo(b.eye(), { x: pos.x, y: pos.y != null && pos.y > 0.5 ? pos.y : 1.5, z: pos.z });
    this.turnTo(a.yaw, TAC.clamp(a.pitch, -0.3, 0.3), dt * 0.7);
  };
  P.lookAround = function (dt) {
    const b = this.bot;
    this.turnTo(b.yaw + Math.sin(this.m.time * 0.5 + b.id) * 0.01, 0, dt);
  };
})();

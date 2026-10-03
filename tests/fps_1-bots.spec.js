// Законы ботов: видят только по прямой (стена и дым закрывают, за спиной не видят), повторяемы
// с тем же семенем, покупают по деньгам, атака закладывает бомбу, защита обезвреживает, реакция
// зависит от сложности, слышат выстрел и поворачиваются, стреляют и перезаряжаются.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch, placeFn } = require('./_tactical-helpers');

test.describe('fps_1: боты', () => {
  test('бот видит только по прямой: стена, дым и спина закрывают', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'comp', map: 'quarry', ai: false, freeze: 0, side: 'CT' });
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, b = m.agents.find((a) => a.squad === 1);
      __tactical.step(1);
      const face = (a, t) => { const x = TAC.anglesTo(a.eye(), t.eye()); a.yaw = x.yaw; a.pitch = x.pitch; };
      place(b, 21, 17); place(p, 21, 23); face(b, p);
      const open = m.canSee(b, p, 100);
      place(p, 4, 17); face(b, p);                                    // «длинный» проход, между ними скала
      const wall = m.canSee(b, p, 100);
      place(p, 21, 23); face(b, p); b.yaw += Math.PI;                  // отвернулся
      const back = m.canSee(b, p, 100);
      b.yaw -= Math.PI;
      m.smokes.push({ pos: m.world.center(21, 20), r: 3.6, start: m.time - 5, end: m.time + 10 });
      const smoke = m.canSee(b, p, 100);
      m.smokes.length = 0;
      b.flash = 3;
      const flashed = m.canSee(b, p, 100);
      return { open, wall, back, smoke, flashed };
    }, placeFn);
    expect(r).toEqual({ open: true, wall: false, back: false, smoke: false, flashed: false });
  });

  test('с тем же семенем матч с ботами повторяется точь-в-точь, с другим - нет', async ({ page }) => {
    await openTactical(page);
    const run = (seed) => page.evaluate((s) => {
      __tactical.start({ mode: 'comp', map: 'port', seed: s, side: 'T', diff: 'hard' });
      const m = __tactical.match;
      for (let i = 0; i < 64 * 40; i++) m.step();
      return m.agents.map((a) => [a.pos.x.toFixed(3), a.pos.z.toFixed(3), a.hp, a.money].join(',')).join(';') + '|' + m.killfeed.map((k) => k.killer + '>' + k.victim).join(',');
    }, seed);
    const a = await run(11), b = await run(11), c = await run(12);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  test('боты покупают по деньгам: пистолетный раунд дёшево, при 5000 - винтовка и броня', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'comp', map: 'quarry', seed: 4, side: 'CT', diff: 'medium' });
    const r = await page.evaluate(() => {
      const m = __tactical.match;
      __tactical.step(64 * 4);
      const first = m.agents.filter((a) => a.isBot).map((a) => ({ money: a.money, spent: 800 - a.money, primary: a.inv.primary && a.inv.primary.id }));
      m.endRound(0, 'elimination'); __tactical.step(64 * 5 + 2);
      for (const a of m.agents) a.money = 5000;
      __tactical.step(64 * 4);
      const rich = m.agents.filter((a) => a.isBot).map((a) => ({ team: a.team, primary: a.inv.primary && a.inv.primary.id, armor: a.armor, money: a.money }));
      return { first, rich };
    });
    for (const b of r.first) { expect(b.primary).toBe(null); expect(b.money).toBeGreaterThanOrEqual(0); }
    expect(r.first.some((b) => b.spent > 0)).toBe(true);
    for (const b of r.rich) {
      expect(b.primary).not.toBe(null);
      expect(['burya', 'strazh', 'lis', 'dalnoboy']).toContain(b.primary);
      expect(b.armor).toBe(100);
      if (b.primary === 'burya') expect(b.team).toBe('T');
      if (b.primary === 'strazh') expect(b.team).toBe('CT');
    }
  });

  test('атака ботов доходит до точки и закладывает бомбу, защита обезвреживает', async ({ page }) => {
    test.setTimeout(90000);
    await openTactical(page);
    await startMatch(page, { mode: 'comp', map: 'quarry', seed: 2, side: 'CT', diff: 'medium', allies: 0, enemies: 5 });
    const plant = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      p.dummy = true;                                               // защита - неподвижный игрок, боты его не замечают
      p.pos.x = m.world.center(21, 3).x; p.pos.z = m.world.center(21, 3).z;
      for (let i = 0; i < 64 * 125 && m.bomb.state !== 'planted'; i++) m.step();
      return { state: m.bomb.state, site: m.bomb.site, t: m.time - m.liveStart, planter: m.bomb.planter && m.bomb.planter.team };
    });
    expect(plant.state).toBe('planted');
    expect(['A', 'B']).toContain(plant.site);
    expect(plant.planter).toBe('T');
    // защита: бомба заложена, атакующих нет - боты идут и обезвреживают
    await startMatch(page, { mode: 'comp', map: 'quarry', seed: 2, side: 'T', diff: 'medium', freeze: 0 });
    const defuse = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      const w = m.world, c = w.siteCenter.A, pos = w.center(c[0], c[1]);
      m.plantBomb(p, 'A'); m.bomb.pos = { x: pos.x, y: 0, z: pos.z };
      for (const a of m.agents) if (a.team === 'T' && a !== p) m.applyDamage(null, a, 500, 0, TAC.WEAPONS.frag, 'chest', null);
      p.alive = false;
      for (let i = 0; i < 64 * 39 && m.bomb.state === 'planted'; i++) m.step();
      return { state: m.bomb.state, by: m.bomb.defuser && m.bomb.defuser.team, left: m.bomb.timer };
    });
    expect(defuse.state).toBe('defused');
    expect(defuse.by).toBe('CT');
    expect(defuse.left).toBeGreaterThan(0);
  });

  test('реакция зависит от сложности: эксперт стреляет раньше лёгкого', async ({ page }) => {
    await openTactical(page);
    const react = (diff) => page.evaluate(([d, place]) => {
      place = eval(place);
      __tactical.start({ mode: 'comp', map: 'quarry', seed: 5, side: 'CT', diff: d, freeze: 0, allies: 0, enemies: 1 });
      const m = __tactical.match, p = m.player, b = m.agents.find((a) => a.squad === 1);
      __tactical.step(1);
      place(b, 21, 14); place(p, 21, 22);
      const a = TAC.anglesTo(b.eye(), p.eye()); b.yaw = a.yaw; b.pitch = a.pitch;
      p.spawnProtect = 1e9;
      const t0 = m.time;
      for (let i = 0; i < 64 * 3 && b.fire.lastShot < t0; i++) { m.step(); p.pos.x = m.world.center(21, 22).x; p.pos.z = m.world.center(21, 22).z; }
      return b.fire.lastShot - t0;
    }, [diff, placeFn]);
    const easy = await react('easy'), expert = await react('expert');
    expect(expert).toBeGreaterThan(0);
    expect(expert).toBeLessThan(easy);
    expect(easy).toBeGreaterThan(0.35);
  });

  test('бот слышит выстрел за спиной и поворачивается на звук', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'comp', map: 'quarry', seed: 6, side: 'CT', diff: 'hard', freeze: 0, allies: 0, enemies: 1 });
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, b = m.agents.find((a) => a.squad === 1);
      __tactical.step(1);
      place(b, 21, 17); place(p, 21, 25);
      b.yaw = 0;                                                     // смотрит на север, игрок за спиной (юг)
      const toP = TAC.anglesTo(b.eye(), p.eye()).yaw;
      const before = Math.abs(TAC.wrapAngle(b.yaw - toP));
      m.noise(p.pos, 45, p, 'shot');
      for (let i = 0; i < 64 * 1.5; i++) { m.step(); place(p, 21, 25); }
      return { before, after: Math.abs(TAC.wrapAngle(b.yaw - toP)) };
    }, placeFn);
    expect(r.before).toBeGreaterThan(2.5);
    expect(r.after).toBeLessThan(0.6);
  });

  test('во 2-6-м раундах (2-м и 3-м тоже) через 25 с боевого времени каждый живой бот идёт к цели и ушёл с базы', async ({ page }) => {
    test.setTimeout(120000);
    await openTactical(page);
    const r = await page.evaluate(() => {
      const out = [];
      for (const [map, seed] of [['quarry', 21], ['port', 9]]) {
      __tactical.start({ mode: 'comp', map, seed, side: 'CT', diff: 'medium' });
      const m = __tactical.match, p = m.player;
      for (const round of [2, 3, 4, 5, 6]) {
        while (!(m.round === round && m.phase !== 'freeze' && m.time - m.liveStart >= 25) && m.time < 2000) { p.dummy = true; m.step(); if (m.round > round) break; }
        if (m.round !== round || m.phase === 'roundEnd') { out.push({ round, skipped: m.phase }); continue; }
        for (const b of m.brains) {
          if (!b.bot.alive) continue;
          const zone = m.world.zoneAt(b.bot.pos.x, b.bot.pos.z);
          const fighting = !!b.target || b.goalKind === 'cover' || b.goalKind === 'hunt' || (b.lastSeen && m.time - b.lastSeen.time < 3);
          out.push({ round, name: b.bot.name, team: b.bot.team, goal: !!b.goal, inSpawn: !fighting && (zone === 't' || zone === 'u') });
        }
      }
      }
      return out;
    });
    const bots = r.filter((x) => x.name);
    expect(bots.length).toBeGreaterThan(8);
    for (const b of bots) { expect(b.goal, b.name + ' без цели в раунде ' + b.round).toBe(true); expect(b.inSpawn, b.name + ' стоит на базе в раунде ' + b.round).toBe(false); }
  });

  test('равные боты: защита выигрывает 35-65% раундов серии, отбивает точку и обезвреживает', async ({ page }) => {
    test.setTimeout(240000);
    await openTactical(page);
    const r = await page.evaluate(() => {
      const res = { T: 0, CT: 0, defuse: 0, bomb: 0 };
      for (const [map, seed] of [['quarry', 21], ['quarry', 5], ['port', 9], ['port', 3]]) {
        __tactical.start({ mode: 'comp', map, seed, side: 'CT', diff: 'medium', allies: 5, enemies: 5, short: false });
        const m = __tactical.match, p = m.player;
        while (!m.over && m.round <= 12 && m.time < 3000) { p.alive = false; m.step(); }
        for (const h of m.history) { res[h.side]++; if (h.reason === 'defuse') res.defuse++; if (h.reason === 'bomb') res.bomb++; }
      }
      return res;
    });
    const share = r.CT / (r.CT + r.T);
    expect(r.CT + r.T).toBeGreaterThan(30);
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
    expect(r.defuse).toBeGreaterThan(0);
    expect(r.bomb).toBeGreaterThan(0);
  });
});

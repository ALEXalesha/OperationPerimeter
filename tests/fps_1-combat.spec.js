// Законы боя: урон по зонам и броне по таблице, пуля не проходит сквозь стену, узор отдачи
// повторяется и гасится мышью, прицел сужает разброс, бег его расширяет, магазин и перезарядка,
// взрыв гранаты не проходит сквозь стену.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch, placeFn } = require('./_tactical-helpers');

const COMP = { mode: 'comp', map: 'quarry', ai: false, freeze: 0, side: 'CT', seed: 1 };

test.describe('fps_1: бой', () => {
  test('урон по зонам и броне совпадает с таблицей правил', async ({ page }) => {
    await openTactical(page);
    // [оружие, зона, расстояние, броня, шлем] -> [урон здоровью, урон броне]
    const table = [
      ['burya', 'head', 0, 0, false, 144, 0],
      ['burya', 'head', 0, 100, false, 144, 0],
      ['burya', 'head', 0, 100, true, 111, 16],
      ['burya', 'chest', 0, 0, false, 36, 0],
      ['burya', 'chest', 0, 100, false, 27, 4],
      ['burya', 'stomach', 0, 100, false, 34, 5],
      ['burya', 'legs', 0, 100, true, 27, 0],
      ['burya', 'chest', 12.7, 0, false, 35, 0],
      ['burya', 'chest', 0, 1, false, 34, 1],
      ['strazh', 'head', 0, 100, true, 92, 19],
      ['dalnoboy', 'chest', 0, 100, true, 112, 1],
      ['dalnoboy', 'legs', 0, 0, false, 86, 0],
      ['p9', 'head', 0, 100, true, 56, 31],
      ['grom', 'head', 0, 100, true, 234, 8],
    ];
    const got = await page.evaluate((t) => t.map(([w, z, d, a, h]) => { const r = TAC.calcDamage(TAC.WEAPONS[w], z, d, a, h); return [r.hp, r.armor]; }), table);
    expect(got).toEqual(table.map((r) => [r[5], r[6]]));
  });

  test('настоящий выстрел: урон бойцу по зоне; сквозь скалу пуля не проходит', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, b = m.agents.find((a) => a.squad === 1);
      __tactical.step(1);
      p.inv.primary = TAC.makeWeapon('burya'); m.switchSlot(p, 'primary'); p.fire.draw = 0;
      b.armor = 0; b.helmet = false;
      // открытая середина: попадание в грудь
      place(p, 21, 23); place(b, 21, 17);
      let c = TAC.zonePoint(b, 'chest'); __tactical.aimAt(c.x, c.y, c.z);
      const shot = TAC.fire(m, p, {});
      const hit = shot.hits[0];
      const open = { zone: hit && hit.zone, lost: 100 - b.hp, expect: hit ? TAC.calcDamage(TAC.WEAPONS.burya, hit.zone, hit.t, 0, false).hp : -1 };
      // из «длинного» прохода к A в середину - между ними скала
      b.hp = 100; p.fire.next = 0; p.fire.spray = 0;
      place(p, 4, 16); place(b, 21, 16);
      c = TAC.zonePoint(b, 'chest'); __tactical.aimAt(c.x, c.y, c.z);
      const shot2 = TAC.fire(m, p, {});
      return { open, blocked: { hits: shot2.hits.length, hp: b.hp, wall: shot2.ends[0].wall ? shot2.ends[0].wall.mat : null, t: shot2.ends[0].t } };
    }, placeFn);
    expect(r.open.zone).toBe('chest');
    expect(r.open.lost).toBe(r.open.expect);
    expect(r.open.lost).toBeGreaterThan(30);
    expect(r.blocked.hits).toBe(0);
    expect(r.blocked.hp).toBe(100);
    expect(r.blocked.wall).toBe('sandstone');
    expect(r.blocked.t).toBeLessThan(34);
  });

  test('узор отдачи одинаков в каждой очереди и гасится, если вести прицел против него', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, DEG = Math.PI / 180;
      __tactical.step(1);
      p.inv.primary = TAC.makeWeapon('burya'); p.inv.primary.reserve = 900; m.switchSlot(p, 'primary'); p.fire.draw = 0;
      place(p, 21, 24);
      const aim = { yaw: 0, pitch: 0.05 };
      const shots = [];
      const orig = m.onShot.bind(m);
      m.onShot = (a, def, shot, eye) => { if (a === p) shots.push([shot.yaw - aim.yaw, shot.pitch - aim.pitch]); orig(a, def, shot, eye); };
      const spray = (comp) => {
        shots.length = 0;
        p.inv.primary.mag = 30;
        for (let i = 0; i < 64 * 2 && shots.length < 12; i++) {
          const pat = TAC.patternAt(p.weaponDef(), p.fire.spray);
          p.yaw = aim.yaw + (comp ? pat[0] * DEG : 0); p.pitch = aim.pitch - (comp ? pat[1] * DEG : 0);
          p.input.fire = true; m.step();
        }
        p.input.fire = false; __tactical.step(64 * 2);                   // отдача остывает
        return shots.slice(0, 12).map((s) => [+(s[0] / DEG).toFixed(4), +(s[1] / DEG).toFixed(4)]);
      };
      const a = spray(false), b = spray(false), c = spray(true);
      return { a, b, c, spray0: p.fire.spray };
    }, placeFn);
    expect(r.a.length).toBe(12);
    expect(r.b).toEqual(r.a);                                   // узор повторяется
    expect(r.a[0]).toEqual([0, 0]);                             // первая пуля - точно в прицел
    expect(r.a[11][1]).toBeGreaterThan(4);                      // к 12-й пуле очередь ушла вверх больше чем на 4°
    for (const s of r.c) { expect(Math.abs(s[0])).toBeLessThan(1e-3); expect(Math.abs(s[1])).toBeLessThan(1e-3); }
    expect(r.spray0).toBe(0);                                   // после паузы отдача остыла
  });

  test('прицел снайперской винтовки сужает разброс, бег и прыжок расширяют', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      p.inv.primary = TAC.makeWeapon('dalnoboy'); p.inv.primary.reserve = 900; m.switchSlot(p, 'primary'); p.fire.draw = 0;
      place(p, 21, 24);
      __tactical.aimAt(43, 1.6, 17);                            // вглубь середины, до скалы
      const dev = (scoped) => {
        let s = 0;
        for (let i = 0; i < 25; i++) {
          p.inv.primary.mag = 5; p.fire.next = 0; p.fire.scope = scoped ? 1 : 0; p.fire.spray = 0; p.fire.inacc = 0;
          const shot = TAC.fire(m, p, {});
          const e = p.eye(), q = shot.ends[0].point, d = Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z);
          const base = TAC.dirFromAngles(shot.yaw, shot.pitch);
          const cos = ((q.x - e.x) * base.x + (q.y - e.y) * base.y + (q.z - e.z) * base.z) / d;
          s += Math.acos(Math.min(1, cos));
        }
        return s / 25;
      };
      const unscoped = dev(false), scoped = dev(true);
      p.fire.scope = 0;
      const stand = TAC.inaccuracy(p, p.weaponDef());
      p.vel.x = 5; const run = TAC.inaccuracy(p, p.weaponDef());
      p.vel.x = 0; p.onGround = false; const jump = TAC.inaccuracy(p, p.weaponDef()); p.onGround = true;
      p.fire.scope = 1; const scopedStand = TAC.inaccuracy(p, p.weaponDef());
      return { unscoped, scoped, stand, run, jump, scopedStand };
    }, placeFn);
    expect(r.scoped).toBeLessThan(r.unscoped / 10);
    expect(r.scopedStand).toBeLessThan(r.stand / 10);
    expect(r.run).toBeGreaterThan(r.stand * 1.5);
    expect(r.jump).toBeGreaterThan(r.run);
  });

  test('магазин 30: пустой не стреляет и сам начинает перезарядку, через 2.5 с патроны из запаса', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      p.inv.primary = TAC.makeWeapon('burya'); m.switchSlot(p, 'primary'); p.fire.draw = 0;
      __tactical.aimAt(p.pos.x, 30, p.pos.z - 50);
      let shots = 0;
      const orig = m.onShot.bind(m);
      m.onShot = (a, def, shot, eye) => { if (a === p) shots++; orig(a, def, shot, eye); };
      p.input.fire = true;
      for (let i = 0; i < 64 * 4 && p.inv.primary.mag > 0; i++) m.step();
      const empty = p.inv.primary.mag, fired = shots;
      for (let i = 0; i < 8; i++) m.step();                       // спуск на пустом - перезарядка
      p.input.fire = false;
      const reloading = p.fire.reload > 0;
      __tactical.step(147);                                      // меньше 2.5 с от начала перезарядки
      const mid = p.inv.primary.mag;
      __tactical.step(20);                                       // уже больше 2.5 с
      return { empty, fired, reloading, mid, full: p.inv.primary.mag, reserve: p.inv.primary.reserve, shotsAfter: shots };
    });
    expect(r).toEqual({ empty: 0, fired: 30, reloading: true, mid: 0, full: 30, reserve: 60, shotsAfter: 30 });
  });

  test('осколочная граната ранит через проём, но не сквозь стену', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, b = m.agents.find((a) => a.squad === 1);
      __tactical.step(1);
      place(p, 4, 30);
      place(b, 19, 12);                                           // над стеной дверей середины (19,13)
      const w = m.world, def = TAC.WEAPONS.frag;
      const behind = w.center(19, 14), open = w.center(21, 12);
      const d1 = Math.hypot(behind.x - b.pos.x, behind.z - b.pos.z), d2 = Math.hypot(open.x - b.pos.x, open.z - b.pos.z);
      TAC.explosionDamage(m, p, behind, def);
      const afterWall = b.hp;
      TAC.explosionDamage(m, p, open, def);
      return { d1, d2, afterWall, afterOpen: b.hp, wallChar: w.charAt(19, 13) };
    }, placeFn);
    expect(r.wallChar).toBe('=');
    expect(r.d1).toBeCloseTo(r.d2, 3);
    expect(r.afterWall).toBe(100);
    expect(r.afterOpen).toBeLessThan(100);
  });

  test('звук: у выстрела голос своего оружия, писк бомбы ускоряется к взрыву', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, Object.assign({}, COMP, { side: 'T' }));
    const r = await page.evaluate(() => {
      TAC.audio.init();
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      const models = [];
      const orig = TAC.audio.play;
      TAC.audio.play = (kind, o) => { if (kind === 'shot') models.push(o.model); return orig(kind, o); };
      for (const id of ['p9', 'dalnoboy']) { const slot = TAC.WEAPONS[id].slot; p.inv[slot] = TAC.makeWeapon(id); m.switchSlot(p, slot); p.fire.draw = 0; p.fire.next = 0; TAC.fire(m, p, {}); }
      TAC.audio.play = orig;
      const c = m.world.siteCenter.B, w = m.world.center(c[0], c[1]);
      p.pos.x = w.x; p.pos.z = w.z;
      m.plantBomb(p, 'B');
      __tactical.step(64 * 2); const early = m.bomb.interval;
      __tactical.step(64 * 35); const late = m.bomb.interval;
      return { models, early, late, graph: !!TAC.audio.ctx };
    });
    expect(r.graph).toBe(true);
    expect(r.models).toEqual(['pistol', 'awp']);
    expect(r.early).toBeGreaterThan(0.8);
    expect(r.late).toBeLessThan(0.25);
  });
});

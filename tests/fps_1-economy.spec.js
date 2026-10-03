// Законы экономики и раундов: покупка списывает деньги, без денег / вне зоны / после времени /
// чужое оружие купить нельзя; награда за убийство и за раунд по таблице; бомба закладывается
// только в зоне, взрывается через 40 с, обезвреживается за 10 с (с набором за 5 с);
// раунды до победы, смена сторон в перерыве.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch, placeFn } = require('./_tactical-helpers');

const COMP = { mode: 'comp', map: 'quarry', ai: false, freeze: 0, side: 'CT', seed: 1 };

test.describe('fps_1: экономика', () => {
  test('покупка списывает деньги; без денег, вне зоны, после времени и чужое - нельзя', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, Object.assign({}, COMP, { freeze: 2 }));
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player, out = {};
      out.start = p.money;
      out.vest = __tactical.buy('vest'); out.afterVest = p.money;            // 800 - 650
      out.noMoney = __tactical.buy('osa'); out.afterNo = p.money;
      out.side = (p.money = 5000, __tactical.buy('burya'));                   // винтовка атаки
      out.rifle = __tactical.buy('strazh'); out.afterRifle = p.money;
      out.again = __tactical.buy('strazh');
      out.flash1 = __tactical.buy('flash'); out.flash2 = __tactical.buy('flash'); out.flash3 = __tactical.buy('flash');
      const home = { x: p.pos.x, z: p.pos.z };
      place(p, 21, 24);                                                       // середина - не зона защиты
      out.zone = __tactical.buy('vesthelm');
      p.pos.x = home.x; p.pos.z = home.z;
      __tactical.step(64 * 2 + 64 * 21);                                       // 2 с заморозки + 21 с боя
      out.time = __tactical.buy('vesthelm');
      out.moneyEnd = p.money;
      out.primary = p.inv.primary && p.inv.primary.id;
      return out;
    }, placeFn);
    expect(r.start).toBe(800);
    expect(r.vest).toEqual({ ok: true, price: 650 });
    expect(r.afterVest).toBe(150);
    expect(r.noMoney.reason).toBe('money');
    expect(r.afterNo).toBe(150);
    expect(r.side.reason).toBe('side');
    expect(r.rifle.ok).toBe(true);
    expect(r.afterRifle).toBe(2100);
    expect(r.again.reason).toBe('limit');
    expect([r.flash1.ok, r.flash2.ok, r.flash3.reason]).toEqual([true, true, 'limit']);
    expect(r.zone.reason).toBe('zone');
    expect(r.time.reason).toBe('time');
    expect(r.moneyEnd).toBe(2100 - 400);
    expect(r.primary).toBe('strazh');
  });

  test('награда за убийство зависит от оружия по таблице', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, COMP);
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      const enemies = m.agents.filter((a) => a.squad === 1);
      const out = {};
      ['p9', 'osa', 'vepr', 'dalnoboy', 'knife'].forEach((id, i) => {
        const b = enemies[i];
        const slot = TAC.WEAPONS[id].slot;
        if (slot !== 'knife') { p.inv[slot] = TAC.makeWeapon(id); m.switchSlot(p, slot); } else m.switchSlot(p, 'knife');
        p.fire.draw = 0; p.fire.next = 0; p.fire.scope = 1; p.fire.spray = 0;
        place(p, 21, 23); place(b, 21, 20);
        if (id === 'knife') b.pos.z = p.pos.z - 1.1;
        b.hp = 1; b.armor = 0;
        const c = TAC.zonePoint(b, 'chest'); __tactical.aimAt(c.x, c.y, c.z);
        const before = p.money;
        TAC.fire(m, p, {});
        out[id] = { dead: !b.alive, got: p.money - before };
        b.pos.x = 5; b.pos.z = 5;                                              // тело в сторону
      });
      return out;
    }, placeFn);
    expect(r).toEqual({ p9: { dead: true, got: 300 }, osa: { dead: true, got: 600 }, vepr: { dead: true, got: 900 }, dalnoboy: { dead: true, got: 100 }, knife: { dead: true, got: 1500 } });
  });

  test('деньги за раунд: победа, растущий бонус за поражения, +800 атаке за закладку, 0 выжившим при истёкшем времени', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, Object.assign({}, COMP, { side: 'T' }));
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player, foe = m.agents.find((a) => a.squad === 1);
      const snap = () => ({ me: p.money, foe: foe.money });
      const out = [];
      const round = (fn) => { for (const a of m.agents) a.money = 1000; fn(); out.push(snap()); __tactical.step(64 * 6); __tactical.step(2); };
      round(() => m.endRound(1, 'elimination'));                // мы проиграли 1 раз
      round(() => m.endRound(1, 'elimination'));                // 2 раза подряд
      round(() => { m.bomb.state = 'defused'; m.bomb.pos = { x: p.pos.x, y: 0, z: p.pos.z }; m.endRound(1, 'defuse'); });   // заложили, но проиграли
      round(() => { for (const a of m.agents) a.alive = true; m.endRound(1, 'time'); });   // время вышло, мы живы
      round(() => m.endRound(0, 'bomb'));                        // мы выиграли взрывом
      return { out, streak: m.lossStreak.slice() };
    });
    // 1000 + ... ; атака - мы (squad 0), защита - squad 1
    // как в соревновательных тактических шутерах: в начале половины счётчик поражений уже 1, поэтому проигрыш пистолетного раунда - $1900
    expect(r.out[0]).toEqual({ me: 1000 + 1900, foe: 1000 + 3250 });
    expect(r.out[1]).toEqual({ me: 1000 + 2400, foe: 1000 + 3250 });
    expect(r.out[2]).toEqual({ me: 1000 + 2900 + 800, foe: 1000 + 3500 });
    expect(r.out[3]).toEqual({ me: 1000, foe: 1000 + 3250 });
    expect(r.out[4]).toEqual({ me: 1000 + 3500, foe: 1000 + 1400 });
  });
});

test.describe('fps_1: бомба и раунды', () => {
  test('закладка только в зоне A/B и только за 3.2 с; через 40 с взрыв - победа атаки', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, Object.assign({}, COMP, { side: 'T' }));
    const r = await page.evaluate((place) => {
      place = eval(place);
      const m = __tactical.match, p = m.player;
      __tactical.step(1);
      for (const a of m.agents) if (a.squad === 1) { place(a, 3, 30); a.spawnProtect = 1e9; }   // защита далеко
      const hasBomb = p.inv.bomb;
      m.switchSlot(p, 'bomb'); p.fire.draw = 0;
      place(p, 21, 20);                                           // середина - не зона
      p.input.fire = true; __tactical.step(64 * 4);
      const outside = { planted: m.bomb.state, progress: p.planting };
      const c = m.world.siteCenter.A; place(p, c[0], c[1]);
      __tactical.step(Math.floor(3.1 * 64));
      const at31 = m.bomb.state;
      __tactical.step(8);
      const at33 = m.bomb.state, phase = m.phase, site = m.bomb.site, money = p.money;
      p.input.fire = false;
      __tactical.step(Math.floor(39.5 * 64));
      const before = m.phase;
      __tactical.step(64);
      return { hasBomb, outside, at31, at33, phase, site, money, before, after: m.phase, winner: m.lastRound && m.lastRound.winSide, reason: m.lastRound && m.lastRound.reason };
    }, placeFn);
    expect(r.hasBomb).toBe(true);
    expect(r.outside).toEqual({ planted: 'carried', progress: 0 });
    expect(r.at31).toBe('carried');
    expect(r.at33).toBe('planted');
    expect(r.phase).toBe('planted');
    expect(r.site).toBe('A');
    expect(r.money).toBe(800 + 300);
    expect(r.before).toBe('planted');
    expect(r.after).toBe('roundEnd');
    expect(r.winner).toBe('T');
    expect(r.reason).toBe('bomb');
  });

  for (const kit of [false, true]) {
    test(`обезвреживание ${kit ? 'с набором - 5 с' : 'без набора - 10 с'}, отпустил E - начинай заново`, async ({ page }) => {
      await openTactical(page);
      await startMatch(page, COMP);
      const r = await page.evaluate(([place, kit]) => {
        place = eval(place);
        const m = __tactical.match, p = m.player, T = m.agents.filter((a) => a.team === 'T');
        __tactical.step(1);
        const c = m.world.siteCenter.B, w = m.world.center(c[0], c[1]);
        m.plantBomb(T[0], 'B'); m.bomb.pos = { x: w.x, y: 0, z: w.z };
        for (const a of T) { place(a, 3, 30); a.spawnProtect = 1e9; }
        place(p, c[0], c[1]); p.pos.x += 0.5;
        p.kit = kit;
        const need = kit ? 5 : 10;
        p.input.use = true; __tactical.step(64 * 2); p.input.use = false; __tactical.step(2);
        const reset = m.bomb.defuse;
        p.input.use = true;
        __tactical.step(Math.floor((need - 0.1) * 64));
        const early = m.bomb.state;
        __tactical.step(10);
        return { reset, early, late: m.bomb.state, winner: m.lastRound && m.lastRound.winSide, reason: m.lastRound && m.lastRound.reason };
      }, [placeFn, kit]);
      expect(r.reset).toBe(0);
      expect(r.early).toBe('planted');
      expect(r.late).toBe('defused');
      expect(r.winner).toBe('CT');
      expect(r.reason).toBe('defuse');
    });
  }

  for (const short of [true, false]) {
    test(`${short ? 'короткий: до 8 из 15, смена после 7' : 'длинный: до 13 из 24, смена после 12'} раунда`, async ({ page }) => {
      await openTactical(page);
      await startMatch(page, Object.assign({}, COMP, { short, side: 'CT' }));
      const r = await page.evaluate((short) => {
        const m = __tactical.match, p = m.player;
        const half = short ? 7 : 12, win = short ? 8 : 13;
        const sides = [];
        for (let i = 0; i < 30 && !m.over; i++) {
          p.money = 9000;
          sides.push(p.team);
          m.endRound(i % 2 === 0 || i >= half ? 0 : 1, 'elimination');
          __tactical.step(64 * 5 + 2);
        }
        return { sides, score: m.score, over: m.over, phase: m.phase, rounds: m.round, half, win, won: m.result && m.result.won, money: p.money };
      }, short);
      expect(r.over).toBe(true);
      expect(r.score[0]).toBe(r.win);
      expect(r.sides.slice(0, r.half).every((s) => s === 'CT')).toBe(true);
      expect(r.sides[r.half]).toBe('T');
      expect(r.won).toBe(true);
      expect(r.rounds).toBeLessThanOrEqual(short ? 15 : 24);
    });
  }

  test('после смены сторон деньги 800 и оружие сброшено; убийство всех врагов заканчивает раунд', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, Object.assign({}, COMP, { short: true }));
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      for (let i = 0; i < 7; i++) { p.money = 9000; p.inv.primary = TAC.makeWeapon('strazh'); m.endRound(0, 'elimination'); __tactical.step(64 * 5 + 2); }
      const afterHalf = { team: p.team, money: p.money, primary: p.inv.primary, round: m.round, streak: m.lossStreak.slice() };
      __tactical.step(64 * 11);
      for (const a of m.agents) if (a.squad === 1) m.applyDamage(p, a, 200, 0, TAC.WEAPONS.burya, 'chest', null);
      __tactical.step(1);
      return { afterHalf, phase: m.phase, last: m.lastRound, score: m.score.slice() };
    });
    expect(r.afterHalf).toEqual({ team: 'T', money: 800, primary: null, round: 8, streak: [1, 1] });
    expect(r.phase).toBe('roundEnd');
    expect(r.last.reason).toBe('elimination');
    expect(r.score).toEqual([8, 0]);
  });
});

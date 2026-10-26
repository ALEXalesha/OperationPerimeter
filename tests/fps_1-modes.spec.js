// Законы режимов: в бою насмерть все возрождаются через 2 с с защитой, матч кончается по пределу
// убийств или времени; командный - до 50 убийств команды; матч проходится до экрана итогов.
const { test, expect } = require('@playwright/test');
const { openTactical, startMatch } = require('./_tactical-helpers');

test.describe('fps_1: режимы', () => {
  test('бой насмерть: убитый возрождается через 2 с с полным здоровьем и защитой, оружие бесплатно', async ({ page }) => {
    await openTactical(page);
    await startMatch(page, { mode: 'dm', map: 'port', ai: false, seed: 3 });
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player, b = m.agents[1];
      const buy = __tactical.buy('dalnoboy');
      __tactical.step(100);                                        // защита после появления - 1.5 с
      m.applyDamage(b, p, 500, 0, TAC.WEAPONS.burya, 'chest', null);
      const dead = !p.alive, bk = b.stats.k;
      __tactical.step(Math.floor(1.9 * 64));
      const still = !p.alive;
      __tactical.step(10);
      const back = { alive: p.alive, hp: p.hp, prot: p.spawnProtect > 1, primary: p.inv.primary && p.inv.primary.id };
      m.applyDamage(b, p, 50, 0, TAC.WEAPONS.burya, 'chest', null);
      const protectedHp = p.hp;
      m.applyDamage(p, b, 500, 0, TAC.WEAPONS.burya, 'chest', null);
      __tactical.step(64 * 2 + 5);
      return { buy, money: p.money, dead, bk, still, back, protectedHp, botBack: b.alive && b.hp === 100 };
    });
    expect(r.buy.ok).toBe(true);
    expect(r.buy.price).toBe(0);
    expect(r.dead).toBe(true);
    expect(r.bk).toBe(1);
    expect(r.still).toBe(true);
    expect(r.back).toEqual({ alive: true, hp: 100, prot: true, primary: 'dalnoboy' });
    expect(r.protectedHp).toBe(100);
    expect(r.botBack).toBe(true);
  });

  test('бой насмерть кончается на пределе убийств, командный - на 50 убийствах команды', async ({ page }) => {
    test.setTimeout(90000);
    await openTactical(page);
    await startMatch(page, { mode: 'dm', map: 'quarry', ai: false, seed: 3, killLimit: 5 });
    const dm = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      __tactical.step(100);
      for (let i = 0; i < 5; i++) { const v = m.agents[1 + i]; m.applyDamage(p, v, 500, 0, TAC.WEAPONS.burya, 'head', null); }
      return { over: m.over, place: m.result && m.result.place, kills: m.result && m.result.kills };
    });
    expect(dm).toEqual({ over: true, place: 1, kills: 5 });
    await startMatch(page, { mode: 'tdm', map: 'quarry', ai: false, seed: 3 });
    const tdm = await page.evaluate(() => {
      const m = __tactical.match, p = m.player, foe = m.agents.find((a) => a.squad === 1);
      let n = 0;
      __tactical.step(100);
      while (!m.over && n < 60) { m.applyDamage(p, foe, 500, 0, TAC.WEAPONS.burya, 'chest', null); n++; if (!m.over) __tactical.step(64 * 3 + 40); }
      return { over: m.over, n, score: m.result.score, won: m.result.won };
    });
    expect(tdm).toEqual({ over: true, n: 50, score: [50, 0], won: true });
  });

  test('матч с ботами проходится до конца: итог, жетоны, статистика, кнопка «В меню»', async ({ page }) => {
    test.setTimeout(90000);
    const errors = await openTactical(page);
    await startMatch(page, { mode: 'dm', map: 'port', seed: 9, diff: 'hard', killLimit: 8 });
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      const tokens0 = TAC.inventory.data.tokens;
      while (!m.over && m.time < 600) { p.dummy = true; m.step(); }
      TAC.menu.showMatchOver(m.result, m, __tactical.app.lastRewards);
      return { over: m.over, best: Math.max(...m.agents.map((a) => a.stats.k)), tokens: TAC.inventory.data.tokens - tokens0, matches: TAC.stats.data.matches };
    });
    expect(r.over).toBe(true);
    expect(r.best).toBe(8);
    expect(r.tokens).toBe(30);
    expect(r.matches).toBe(1);
    await expect(page.locator('#matchover')).toBeVisible();
    await expect(page.locator('#moRes')).not.toBeEmpty();
    await page.click('#btnToMenu');
    await expect(page.locator('#menu')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('после разминки мишени не переезжают в следующий матч', async ({ page }) => {
    await openTactical(page);
    const r = await page.evaluate(() => {
      const count = () => { let n = 0; __tactical.app.scene.traverse((o) => { if (o.geometry && o.geometry.type === 'TorusGeometry') n++; }); return n; };
      __tactical.start({ mode: 'train', map: 'range' });
      const inTrain = count();
      __tactical.start({ mode: 'dm', map: 'port', ai: false });
      return { inTrain, after: count() };
    });
    expect(r.inTrain).toBeGreaterThan(5);
    expect(r.after).toBe(0);
  });

  test('видеопамять не растёт от матча к матчу: после разогрева пять матчей подряд не добавляют геометрий и текстур', async ({ page }) => {
    test.setTimeout(180000);
    await openTactical(page);
    const r = await page.evaluate(() => {
      const mem = () => { const i = __tactical.app.renderer.info.memory; return { g: i.geometries, t: i.textures }; };
      const play = (opts) => {
        __tactical.start(Object.assign({ ai: false, seed: 1 }, opts));
        const m = __tactical.match, p = m.player;
        __tactical.step(110);
        p.inv.primary = TAC.makeWeapon('burya'); m.switchSlot(p, 'primary'); p.fire.draw = 0;
        p.input.fire = true; __tactical.step(40); p.input.fire = false;
        if (m.mode === 'comp') { const c = m.world.siteCenter.A, w = m.world.center(c[0], c[1]); p.pos.x = w.x; p.pos.z = w.z; m.plantBomb(p, 'A'); }
        __tactical.step(10);
        __tactical.render(); __tactical.render();
        return mem();
      };
      const set = [{ mode: 'comp', map: 'quarry', freeze: 0, side: 'T' }, { mode: 'train', map: 'range' }, { mode: 'dm', map: 'port' }];
      const warm = [];
      for (let k = 0; k < 2; k++) for (const o of set) warm.push(play(o));
      const after = [];
      for (let k = 0; k < 5; k++) after.push(play(set[k % 3]));
      // дальше - снова первая карта, как в начале проверки
      return { warm, after, first: warm[3], last: play(set[0]) };
    });
    expect(r.last.g).toBeLessThanOrEqual(r.first.g);
    expect(r.last.t).toBeLessThanOrEqual(r.first.t);
    for (const x of r.after) { expect(x.g).toBeLessThanOrEqual(Math.max(...r.warm.slice(3).map((w) => w.g))); expect(x.t).toBeLessThanOrEqual(Math.max(...r.warm.slice(3).map((w) => w.t))); }
  });

  test('соревновательный матч с ботами доходит до конца: итог, звание, статистика, жетоны', async ({ page }) => {
    test.setTimeout(180000);
    const errors = await openTactical(page);
    await startMatch(page, { mode: 'comp', map: 'port', seed: 5, side: 'CT', diff: 'medium', allies: 5, enemies: 5, short: true });
    const r = await page.evaluate(() => {
      const m = __tactical.match, p = m.player;
      const t0 = TAC.inventory.data.tokens;
      while (!m.over && m.time < 4000) { p.alive = false; m.step(); }
      TAC.menu.showMatchOver(m.result, m, __tactical.app.lastRewards);
      return { over: m.over, score: m.score, rounds: m.round, win: Math.max(...m.score), halfSwapped: m.history.length > 7 ? m.history[7].side !== undefined : null,
        matches: TAC.stats.data.matches, ranked: TAC.profile.data.rankedMatches, tokens: TAC.inventory.data.tokens - t0 };
    });
    expect(r.over).toBe(true);
    expect(r.win).toBe(8);
    expect(r.rounds).toBeGreaterThanOrEqual(8);
    expect(r.rounds).toBeLessThanOrEqual(15);
    expect(r.matches).toBe(1);
    expect(r.ranked).toBe(1);
    expect(r.tokens).toBeGreaterThanOrEqual(40);
    await expect(page.locator('#matchover')).toBeVisible();
    await expect(page.locator('#moTable')).toContainText('Спецотряд');
    expect(errors).toEqual([]);
  });
});

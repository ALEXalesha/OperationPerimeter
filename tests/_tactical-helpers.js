// Помощники проверок «Операции: Периметр» (web/fps_1): открыть страницу без сети с семенем,
// дождаться крючка window.__tactical, запустить матч с ручным шагом логики.
const { pageUrl } = require('./helpers');

async function openTactical(page, query = 'seed=1&fast=1') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await require('./helpers').lockFirst(page); await page.goto(pageUrl('fps_1') + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__tactical && window.__tactical.ready === true);
  return errors;
}

// Матч без экрана загрузки; логика идёт только по __tactical.step(n)
async function startMatch(page, opts) {
  return page.evaluate((o) => __tactical.start(o), opts || {});
}

// Поставить бойца в клетку карты (cx, cy) и повернуть лицом к точке
const placeFn = `(function place(a, cx, cy) {
  const w = __tactical.match.world, p = w.center(cx, cy);
  a.pos.x = p.x; a.pos.y = 0; a.pos.z = p.z; a.prev.x = p.x; a.prev.y = 0; a.prev.z = p.z;
  a.vel.x = a.vel.y = a.vel.z = 0;
  return p;
})`;

module.exports = { openTactical, startMatch, placeFn };

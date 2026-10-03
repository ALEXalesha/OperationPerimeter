// Помощники для проверок игр (web/<игра>): открыть страницу с параметрами адреса
// (?seed=... для повторяемости), собрать ошибки, проверить, что страница влезает в окно.
const { pageUrl } = require('./helpers');

// Открыть игру без сети. query - строка вроде 'seed=7'. Возвращает массив ошибок страницы.
async function openGame(page, name, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await require('./helpers').lockFirst(page); await page.goto(pageUrl(name) + (query ? '?' + query : ''));
  await page.waitForFunction(() => window.__game && window.__game.ready === true);
  return errors;
}

// Влезает ли страница в окно: нет прокрутки, а элемент sel целиком внутри окна.
async function fitReport(page, sel) {
  return page.evaluate((s) => {
    const de = document.documentElement;
    const r = s ? document.querySelector(s).getBoundingClientRect() : null;
    return {
      scrollW: de.scrollWidth, scrollH: de.scrollHeight,
      w: innerWidth, h: innerHeight,
      box: r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  }, sel);
}

function expectFits(expect, rep) {
  expect(rep.scrollW, 'ширина страницы').toBeLessThanOrEqual(rep.w);
  expect(rep.scrollH, 'высота страницы').toBeLessThanOrEqual(rep.h);
  if (rep.box) {
    expect(rep.box.left).toBeGreaterThanOrEqual(0);
    expect(rep.box.top).toBeGreaterThanOrEqual(0);
    expect(rep.box.right).toBeLessThanOrEqual(rep.w + 0.5);
    expect(rep.box.bottom).toBeLessThanOrEqual(rep.h + 0.5);
    expect(rep.box.width).toBeGreaterThan(100);
  }
}

const SIZES = [{ width: 1280, height: 800 }, { width: 1024, height: 700 }];

module.exports = { openGame, fitReport, expectFits, SIZES };

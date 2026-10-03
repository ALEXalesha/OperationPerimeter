// Общие помощники проверок: адрес страницы и сбор ошибок консоли.
// Страницы открываются по файловому адресу: сервер им не нужен.
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
// Где лежит страница в этом репозитории (имя папки в исходном сборнике -> папка здесь)
const DIRS = require('./pages.json');
const WEB = ROOT;

function dirOf(name) {
  return name in DIRS ? path.join(ROOT, DIRS[name]) : path.join(ROOT, name);
}

function pages() {
  return Object.keys(DIRS).filter((d) => fs.existsSync(path.join(dirOf(d), 'index.html'))).sort();
}

function pageUrl(name) {
  return pathToFileURL(path.join(dirOf(name), 'index.html')).href;
}

// Захват мыши в проверках только поддельный: настоящий requestPointerLock в безголовом
// Chromium на Windows зажимает курсор пользователя в скрытом окне. Ставится до скриптов
// страницы и во всех её рамках. Если помощник игры уже поставил свою, более полную подмену
// (Кубический мир, Horizon Drift), эта ничего не делает.
function fakePointerLock() {
  try {
    if (window.__lockStubbed || window.__fakeLockBase || window.__nativePointerLock) return;
    const d = Object.getOwnPropertyDescriptor(Element.prototype, 'requestPointerLock');
    if (d && d.writable === false) return;
    window.__fakeLockBase = true;
    let el = null;
    const fire = () => document.dispatchEvent(new Event('pointerlockchange'));
    Element.prototype.requestPointerLock = function () { el = this; setTimeout(fire); return Promise.resolve(); };
    Document.prototype.exitPointerLock = function () { if (!el) return; el = null; setTimeout(fire); };
    Object.defineProperty(Document.prototype, 'pointerLockElement', { configurable: true, get() { return el; } });
  } catch (e) { /* подмена уже стоит */ }
}

// Поставить подмену один раз на вкладку: зовётся перед каждым page.goto (sync_tests.sh
// вставляет вызов во все помощники и проверки, которые открывают страницы сами).
const stubbed = new WeakSet();
async function lockFirst(page) {
  if (stubbed.has(page)) return;
  stubbed.add(page);
  await page.addInitScript(fakePointerLock);
}

// Открыть страницу и собирать всё, что она роняет: исключения и console.error.
// Внешние запросы (шрифты, CDN) отсекаются: страница обязана работать без сети.
async function open(page, name) {
  const errors = [];
  await lockFirst(page);
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(/^https?:\/\//, (route) => route.abort());
  await page.goto(pageUrl(name));
  return errors;
}

module.exports = { ROOT, WEB, dirOf, pages, pageUrl, open, fakePointerLock, lockFirst };

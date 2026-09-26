// Общие мелочи: повторяемый генератор случайных чисел, хранилище с приставкой mix.tactical.,
// математика углов и векторов. Всё кладётся в один объект TAC, скрипты обычные (не модули),
// чтобы страница работала по адресу file:// без сервера.
(function () {
  'use strict';
  const TAC = window.TAC = window.TAC || {};

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const r = mulberry32((seed >>> 0) || 1);
    r.range = (a, b) => a + (b - a) * r();
    r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }
  TAC.mulberry32 = mulberry32;
  TAC.makeRng = makeRng;

  // Хранилище: все страницы на file:// делят одно, поэтому у каждого ключа приставка.
  const PREFIX = 'mix.tactical.';
  TAC.PREFIX = PREFIX;
  TAC.store = {
    get(key, def) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* нет хранилища */ }
    },
    remove(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* нет хранилища */ } },
  };

  TAC.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  TAC.lerp = (a, b, t) => a + (b - a) * t;
  TAC.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  TAC.deg = (d) => d * Math.PI / 180;
  // Направление взгляда по рысканью и тангажу: yaw = 0 смотрит на -Z, как камера three.js.
  TAC.dirFromAngles = (yaw, pitch, out) => {
    const cp = Math.cos(pitch);
    out = out || { x: 0, y: 0, z: 0 };
    out.x = -Math.sin(yaw) * cp; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * cp;
    return out;
  };
  TAC.anglesTo = (from, to) => {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  };
  TAC.dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  TAC.dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // Слияние настроек: сохранённое поверх умолчаний, лишние ключи отбрасываются.
  TAC.mergeDefaults = function merge(def, saved) {
    if (saved == null || typeof saved !== typeof def || Array.isArray(def) !== Array.isArray(saved)) return JSON.parse(JSON.stringify(def));
    if (typeof def !== 'object' || def === null || Array.isArray(def)) return saved;
    if (!Object.keys(def).length) return saved;         // словарь без заданных ключей (убийства по оружию, звёзды) - берётся как есть
    const out = {};
    for (const k of Object.keys(def)) out[k] = merge(def[k], saved[k]);
    return out;
  };

  TAC.fmtTime = (s) => {
    s = Math.max(0, Math.ceil(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  TAC.fmtMoney = (m) => '$' + Math.round(m).toLocaleString('ru-RU');
  TAC.el = (id) => document.getElementById(id);
  TAC.h = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  TAC.params = new URLSearchParams(location.search);
})();

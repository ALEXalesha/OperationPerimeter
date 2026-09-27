// Таблицы игры: оружие, экономика, сложность ботов, карты, облики (скины), кейсы, звания,
// миссии кампании, настройки по умолчанию. Всё своё: названия выдуманные, карты нарисованы здесь.
(function () {
  'use strict';
  const TAC = window.TAC;

  // Узор отдачи: накопленные смещения в градусах [вправо, вверх] для каждого выстрела очереди.
  // Считается формулой из параметров оружия, без случайности, поэтому одинаков в каждой очереди.
  function makePattern(n, p) {
    const out = [[0, 0]];
    let x = 0, y = 0;
    for (let i = 1; i < n; i++) {
      y += p.rise * Math.max(p.floor || 0.15, 1 - i / p.riseShots);
      if (i >= p.swayStart) x += p.sway * Math.sin((i - p.swayStart) * p.swayFreq + (p.phase || 0));
      else x += p.drift || 0;
      out.push([+x.toFixed(4), +y.toFixed(4)]);
    }
    return out;
  }
  TAC.makePattern = makePattern;

  // Оружие. dmg - урон в тело вблизи, pen - доля урона, проходящая сквозь броню,
  // rangeMod - во сколько раз падает урон на каждые 12.7 м, spread - разброс в радианах.
  const W = {};
  function weapon(def) {
    def.pattern = def.recoil ? makePattern(def.mag + 1, def.recoil) : [[0, 0]];
    def.interval = def.rpm ? 60 / def.rpm : 0.5;
    W[def.id] = def;
  }
  weapon({ id: 'knife', name: 'Нож', short: 'Нож', slot: 'knife', cat: 'knife', price: 0, dmg: 40, dmgHeavy: 65, pen: 0.85, rpm: 150, rpmHeavy: 60, range: 1.7, speed: 6.4, kill: 1500, team: 'both', model: 'knife' });
  weapon({ id: 'p9', name: 'Пистолет П-9', short: 'П-9', slot: 'secondary', cat: 'pistol', price: 200, dmg: 30, pen: 0.47, rpm: 400, mag: 15, reserve: 60, reload: 2.2, speed: 6.1, kill: 300, team: 'both', auto: false, rangeMod: 0.85,
    spread: { stand: 0.0055, move: 0.035, jump: 0.14, crouch: 0.8, shot: 0.012, max: 0.05, recover: 6 }, recoil: { rise: 0.9, riseShots: 6, floor: 0.4, sway: 0.25, swayFreq: 1.1, swayStart: 3, drift: 0.05 }, punch: 0.5, model: 'pistol' });
  weapon({ id: 'hornet', name: 'Пистолет «Шершень»', short: 'Шершень', slot: 'secondary', cat: 'pistol', price: 500, dmg: 33, pen: 0.9, rpm: 500, mag: 18, reserve: 90, reload: 2.4, speed: 6.0, kill: 300, team: 'both', auto: false, rangeMod: 0.83,
    spread: { stand: 0.007, move: 0.03, jump: 0.14, crouch: 0.8, shot: 0.014, max: 0.06, recover: 5 }, recoil: { rise: 1.0, riseShots: 6, floor: 0.4, sway: 0.35, swayFreq: 1.3, swayStart: 2, drift: -0.05 }, punch: 0.5, model: 'pistol' });
  weapon({ id: 'grom', name: 'Тяжёлый пистолет «Гром»', short: 'Гром', slot: 'secondary', cat: 'pistol', price: 700, dmg: 63, pen: 0.93, rpm: 267, mag: 7, reserve: 35, reload: 2.2, speed: 5.9, kill: 300, team: 'both', auto: false, rangeMod: 0.81,
    spread: { stand: 0.0045, move: 0.09, jump: 0.2, crouch: 0.8, shot: 0.03, max: 0.09, recover: 3 }, recoil: { rise: 2.4, riseShots: 4, floor: 0.5, sway: 0.4, swayFreq: 1.4, swayStart: 1 }, punch: 0.6, model: 'heavypistol' });
  weapon({ id: 'osa', name: 'ПП «Оса»', short: 'Оса', slot: 'primary', cat: 'smg', price: 1250, dmg: 27, pen: 0.65, rpm: 800, mag: 30, reserve: 120, reload: 2.1, speed: 6.1, kill: 600, team: 'both', auto: true, rangeMod: 0.8,
    spread: { stand: 0.008, move: 0.032, jump: 0.15, crouch: 0.8, shot: 0.004, max: 0.035, recover: 6 }, recoil: { rise: 0.55, riseShots: 12, floor: 0.2, sway: 0.35, swayFreq: 0.5, swayStart: 8, drift: 0.04 }, punch: 0.5, model: 'smg' });
  weapon({ id: 'shmel', name: 'ПП «Шмель»', short: 'Шмель', slot: 'primary', cat: 'smg', price: 1500, dmg: 34, pen: 0.6, rpm: 650, mag: 25, reserve: 100, reload: 2.3, speed: 6.0, kill: 600, team: 'both', auto: true, rangeMod: 0.82,
    spread: { stand: 0.007, move: 0.034, jump: 0.15, crouch: 0.8, shot: 0.005, max: 0.04, recover: 5.5 }, recoil: { rise: 0.7, riseShots: 11, floor: 0.2, sway: 0.4, swayFreq: 0.45, swayStart: 7, drift: -0.04, phase: 1 }, punch: 0.5, model: 'smg' });
  weapon({ id: 'lis', name: 'Винтовка «Лис»', short: 'Лис', slot: 'primary', cat: 'rifle', price: 2000, dmg: 30, pen: 0.77, rpm: 666, mag: 35, reserve: 90, reload: 2.4, speed: 5.6, kill: 300, team: 'both', auto: true, rangeMod: 0.96,
    spread: { stand: 0.0045, move: 0.08, jump: 0.24, crouch: 0.75, shot: 0.005, max: 0.04, recover: 5 }, recoil: { rise: 0.8, riseShots: 12, floor: 0.15, sway: 0.45, swayFreq: 0.5, swayStart: 9, drift: 0.05 }, punch: 0.5, model: 'rifle' });
  weapon({ id: 'burya', name: 'Штурмовая винтовка «Буря»', short: 'Буря', slot: 'primary', cat: 'rifle', price: 2700, dmg: 36, pen: 0.775, rpm: 600, mag: 30, reserve: 90, reload: 2.5, speed: 5.5, kill: 300, team: 'T', auto: true, rangeMod: 0.98,
    spread: { stand: 0.0038, move: 0.09, jump: 0.26, crouch: 0.75, shot: 0.006, max: 0.045, recover: 5 }, recoil: { rise: 0.95, riseShots: 12, floor: 0.15, sway: 0.55, swayFreq: 0.45, swayStart: 9, drift: -0.05 }, punch: 0.5, model: 'rifle' });
  weapon({ id: 'strazh', name: 'Штурмовая винтовка «Страж»', short: 'Страж', slot: 'primary', cat: 'rifle', price: 2900, dmg: 33, pen: 0.7, rpm: 666, mag: 30, reserve: 90, reload: 3.1, speed: 5.6, kill: 300, team: 'CT', auto: true, rangeMod: 0.97,
    spread: { stand: 0.0032, move: 0.085, jump: 0.25, crouch: 0.75, shot: 0.005, max: 0.04, recover: 5.5 }, recoil: { rise: 0.8, riseShots: 12, floor: 0.15, sway: 0.45, swayFreq: 0.5, swayStart: 10, drift: 0.04, phase: 2 }, punch: 0.5, model: 'rifle2' });
  weapon({ id: 'shchegol', name: 'Снайперская винтовка «Щегол»', short: 'Щегол', slot: 'primary', cat: 'sniper', price: 1700, dmg: 88, pen: 0.85, rpm: 48, mag: 10, reserve: 90, reload: 2.9, speed: 5.9, kill: 300, team: 'both', auto: false, rangeMod: 0.98,
    spread: { stand: 0.035, move: 0.12, jump: 0.3, crouch: 0.85, shot: 0, max: 0, recover: 5, scoped: 0.0018, scopedMove: 0.06 }, recoil: { rise: 2.2, riseShots: 2, floor: 1, sway: 0, swayFreq: 0, swayStart: 99 }, punch: 0.5, scope: [40], model: 'sniper' });
  weapon({ id: 'dalnoboy', name: 'Снайперская винтовка «Дальнобой»', short: 'Дальнобой', slot: 'primary', cat: 'sniper', price: 4750, dmg: 115, pen: 0.975, rpm: 41, mag: 5, reserve: 30, reload: 3.7, speed: 5.0, kill: 100, team: 'both', auto: false, rangeMod: 0.99,
    spread: { stand: 0.07, move: 0.16, jump: 0.35, crouch: 0.85, shot: 0, max: 0, recover: 5, scoped: 0.0012, scopedMove: 0.1 }, recoil: { rise: 3.5, riseShots: 2, floor: 1, sway: 0, swayFreq: 0, swayStart: 99 }, punch: 0.5, scope: [40, 15], model: 'awp' });
  weapon({ id: 'vepr', name: 'Дробовик «Вепрь»', short: 'Вепрь', slot: 'primary', cat: 'heavy', price: 1050, dmg: 26, pellets: 9, pen: 0.5, rpm: 70, mag: 7, reserve: 32, reload: 2.8, speed: 5.7, kill: 900, team: 'both', auto: false, rangeMod: 0.7,
    spread: { stand: 0.045, move: 0.06, jump: 0.12, crouch: 0.9, shot: 0, max: 0, recover: 5 }, recoil: { rise: 3, riseShots: 2, floor: 1, sway: 0, swayFreq: 0, swayStart: 99 }, punch: 0.5, model: 'shotgun' });
  weapon({ id: 'shkval', name: 'Пулемёт «Шквал»', short: 'Шквал', slot: 'primary', cat: 'heavy', price: 5200, dmg: 32, pen: 0.75, rpm: 750, mag: 100, reserve: 200, reload: 5.0, speed: 5.0, kill: 300, team: 'both', auto: true, rangeMod: 0.97,
    spread: { stand: 0.009, move: 0.1, jump: 0.3, crouch: 0.7, shot: 0.004, max: 0.05, recover: 4 }, recoil: { rise: 0.6, riseShots: 14, floor: 0.12, sway: 0.5, swayFreq: 0.35, swayStart: 10, drift: 0.03 }, punch: 0.5, model: 'mg' });
  // Гранаты и снаряжение
  weapon({ id: 'frag', name: 'Осколочная граната', short: 'Осколочная', slot: 'grenade', cat: 'grenade', price: 300, dmg: 98, radius: 7.5, fuse: 1.6, speed: 6.2, kill: 300, team: 'both', max: 1, model: 'frag' });
  weapon({ id: 'smoke', name: 'Дымовая граната', short: 'Дым', slot: 'grenade', cat: 'grenade', price: 300, radius: 3.6, fuse: 1.4, duration: 18, speed: 6.2, kill: 300, team: 'both', max: 1, model: 'smoke' });
  weapon({ id: 'flash', name: 'Светошумовая граната', short: 'Светошумовая', slot: 'grenade', cat: 'grenade', price: 200, fuse: 1.5, speed: 6.2, kill: 300, team: 'both', max: 2, model: 'flash' });
  weapon({ id: 'fire', name: 'Зажигательная смесь', short: 'Зажигалка', slot: 'grenade', cat: 'grenade', price: 400, radius: 3.2, fuse: 2.0, duration: 7, dps: 40, speed: 6.2, kill: 300, team: 'both', max: 1, model: 'fire' });
  weapon({ id: 'bomb', name: 'Бомба', short: 'Бомба', slot: 'bomb', cat: 'bomb', price: 0, speed: 6.1, team: 'T', model: 'bomb' });
  TAC.WEAPONS = W;

  TAC.EQUIPMENT = {
    vest: { id: 'vest', name: 'Бронежилет', price: 650 },
    vesthelm: { id: 'vesthelm', name: 'Бронежилет и шлем', price: 1000, helmOnly: 350 },
    kit: { id: 'kit', name: 'Набор сапёра', price: 400, team: 'CT' },
  };

  // Меню покупки: категории как в оригинале, горячие клавиши 1-6, потом номер предмета.
  TAC.BUY_MENU = [
    { id: 'pistols', name: 'Пистолеты', items: ['p9', 'hornet', 'grom'] },
    { id: 'smg', name: 'Пистолеты-пулемёты', items: ['osa', 'shmel'] },
    { id: 'rifles', name: 'Винтовки', items: ['lis', 'burya', 'strazh', 'shchegol', 'dalnoboy'] },
    { id: 'heavy', name: 'Тяжёлое', items: ['vepr', 'shkval'] },
    { id: 'grenades', name: 'Гранаты', items: ['frag', 'smoke', 'flash', 'fire'] },
    { id: 'gear', name: 'Снаряжение', items: ['vest', 'vesthelm', 'kit'] },
  ];

  // Урон по зонам и деньги: таблицы правил, по ним же пишутся проверки.
  TAC.ZONES = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };
  TAC.ECON = {
    start: 800, max: 16000,
    win: { elimination: 3250, bomb: 3500, defuse: 3500, time: 3250 },
    lossBase: 1400, lossStep: 500, lossMax: 3400, lossStart: 1,   // как в соревновательных тактических шутерах: в начале каждой половины счётчик поражений = 1
    plantTeamBonus: 800, plantPlayer: 300, defusePlayer: 300,
    killByCat: { knife: 1500, pistol: 300, smg: 600, rifle: 300, sniper: 300, heavy: 300, grenade: 300 },
    buyTime: 20, freezeTime: 10, roundTime: 115, roundEndDelay: 5,
    bombTime: 40, plantTime: 3.2, defuseTime: 10, defuseKitTime: 5,
  };
  TAC.lossBonus = (streak) => Math.min(TAC.ECON.lossMax, TAC.ECON.lossBase + TAC.ECON.lossStep * Math.max(0, streak - 1));

  TAC.DIFFICULTY = {
    easy: { name: 'Лёгкие', reaction: 0.62, aimErr: 5.5, turn: 4, comp: 0.15, head: 0.08, fov: 90, hear: 0.6, stopToShoot: false, tap: 0.3 },
    medium: { name: 'Средние', reaction: 0.4, aimErr: 3.2, turn: 7, comp: 0.4, head: 0.22, fov: 100, hear: 0.8, stopToShoot: true, tap: 0.55 },
    hard: { name: 'Сильные', reaction: 0.26, aimErr: 1.9, turn: 11, comp: 0.7, head: 0.38, fov: 110, hear: 1, stopToShoot: true, tap: 0.8 },
    expert: { name: 'Эксперты', reaction: 0.17, aimErr: 1.1, turn: 16, comp: 0.9, head: 0.55, fov: 120, hear: 1.2, stopToShoot: true, tap: 1 },
  };

  TAC.BOT_NAMES = {
    T: ['Ворон', 'Шакал', 'Гюрза', 'Сыч', 'Бирюк', 'Кочевник', 'Барс', 'Хмурый', 'Молот', 'Грач'],
    CT: ['Сокол', 'Кедр', 'Штиль', 'Гранит', 'Беркут', 'Вектор', 'Рубеж', 'Кварц', 'Пилот', 'Тайга'],
  };
  TAC.TEAM_NAMES = { T: 'Налётчики', CT: 'Спецотряд' };
  TAC.SIDE_NAMES = { T: 'Атака', CT: 'Защита' };

  // ---------- Карты ----------
  // Клетка - 2 метра. Карта сперва вся из скалы '#', потом по списку вырезаются площадки.
  // '.' и ',' - пол двух видов, 'r' - пол под крышей (туннель), 'A'/'B' - зоны закладки,
  // 't'/'u' - базы атаки и защиты, '=' - стена 3.6 м, 'x'/'X' - ящик 1.1 / 2.2 м,
  // 'm'/'M' - контейнер в один / два яруса, 'c' - бетонный блок 1 м (запрыгнуть можно).
  TAC.MAPS = {
    quarry: {
      id: 'quarry', name: 'Карьер', theme: 'sand', w: 44, h: 36,
      desc: 'Песчаный карьер: длинный проход к A, туннели к B, узкая середина.',
      ops: [
        ['.', 17, 2, 10, 5], ['u', 18, 2, 8, 3],
        [',', 12, 3, 6, 4], [',', 2, 2, 11, 10], ['A', 4, 3, 7, 6],
        [',', 27, 3, 5, 4], [',', 31, 2, 11, 10], ['B', 33, 3, 7, 6],
        ['.', 19, 7, 6, 19], ['.', 13, 9, 6, 3],
        ['.', 25, 15, 6, 3], ['.', 31, 13, 5, 6], ['.', 32, 12, 3, 1],
        ['.', 15, 28, 14, 6], ['t', 17, 29, 10, 4], ['.', 20, 26, 4, 2],
        ['.', 3, 28, 12, 4], ['.', 2, 12, 5, 16], ['=', 2, 20, 1, 1], ['=', 5, 20, 2, 1],
        ['.', 29, 29, 11, 3], ['.', 37, 12, 3, 2], ['r', 37, 14, 3, 15], ['r', 36, 16, 1, 2],
        ['=', 19, 13, 2, 1], ['=', 23, 13, 2, 1],
        // укрытия
        ['X', 6, 5, 1, 1], ['x', 7, 5, 1, 1], ['x', 6, 6, 1, 1], ['x', 9, 8, 1, 1], ['X', 3, 9, 1, 1], ['c', 10, 10, 2, 1],
        ['X', 36, 5, 1, 1], ['x', 35, 5, 1, 1], ['x', 36, 6, 1, 1], ['x', 34, 8, 1, 1], ['X', 40, 9, 1, 1], ['c', 32, 10, 2, 1],
        ['x', 20, 18, 1, 1], ['X', 24, 21, 1, 1], ['x', 23, 9, 1, 1], ['x', 5, 15, 1, 1], ['X', 2, 25, 1, 1],
        ['x', 16, 32, 1, 1], ['X', 28, 28, 1, 1], ['x', 17, 10, 1, 1], ['x', 39, 22, 1, 1], ['x', 29, 16, 1, 1],
        ['c', 12, 5, 1, 1], ['c', 30, 5, 1, 1],
      ],
      // Точки для ботов (клетки): куда стягиваются атакующие перед заходом, где стоит защита и куда смотрит.
      plan: {
        stage: { A: [[4, 23], [16, 10]], B: [[38, 18], [27, 16]] },
        hold: {
          A: [[7, 7, 4, 14], [11, 8, 16, 10], [5, 3, 4, 12]],
          B: [[36, 7, 38, 13], [34, 9, 32, 14], [40, 4, 38, 12]],
          mid: [[21, 8, 21, 22], [24, 8, 21, 20]],
        },
      },
    },
    port: {
      id: 'port', name: 'Порт', theme: 'port', w: 46, h: 34,
      desc: 'Контейнерный порт: причал A у воды, склад B под крышей, двор посередине.',
      ops: [
        ['.', 2, 2, 42, 30],
        ['t', 3, 13, 4, 8], ['u', 40, 13, 3, 7],
        [',', 28, 2, 12, 9], ['A', 30, 3, 7, 6],
        ['=', 26, 21, 13, 1], ['=', 26, 21, 1, 11], ['=', 38, 21, 1, 11],
        ['.', 26, 25, 1, 2], ['.', 31, 21, 3, 1], ['.', 38, 22, 1, 2],
        [',', 27, 22, 11, 10], ['B', 29, 24, 7, 6], ['r', 27, 22, 4, 3], ['r', 35, 28, 3, 4],
        ['=', 27, 11, 8, 1],
        ['#', 8, 2, 14, 3], ['#', 8, 29, 14, 3],
        ['M', 8, 10, 4, 1], ['m', 12, 10, 3, 1], ['M', 17, 10, 3, 1], ['M', 20, 10, 3, 1],
        ['M', 8, 22, 4, 1], ['m', 12, 22, 3, 1], ['M', 17, 22, 3, 1], ['M', 20, 22, 3, 1],
        ['m', 16, 14, 1, 3], ['x', 21, 15, 1, 1], ['X', 12, 17, 1, 1], ['M', 24, 13, 2, 5], ['x', 10, 14, 1, 1],
        ['x', 14, 6, 1, 1], ['X', 20, 8, 1, 1], ['m', 24, 3, 1, 3],
        ['X', 32, 5, 1, 1], ['x', 33, 5, 1, 1], ['m', 36, 8, 3, 1], ['x', 30, 8, 1, 1],
        ['x', 12, 26, 1, 1], ['m', 18, 25, 1, 3], ['X', 23, 27, 1, 1],
        ['x', 30, 26, 1, 1], ['X', 34, 27, 1, 1], ['x', 34, 26, 1, 1], ['c', 29, 29, 2, 1],
        ['x', 41, 11, 1, 1], ['c', 38, 16, 1, 2], ['x', 30, 15, 1, 1], ['X', 34, 18, 1, 1],
        ['m', 5, 6, 2, 1], ['m', 5, 26, 2, 1],
      ],
      plan: {
        stage: { A: [[22, 7], [23, 12]], B: [[22, 25], [23, 20]] },
        hold: {
          A: [[33, 4, 20, 5], [37, 6, 30, 13], [29, 9, 22, 8]],
          B: [[33, 25, 26, 25], [36, 23, 32, 19], [30, 30, 26, 26]],
          mid: [[33, 16, 22, 16], [37, 18, 26, 18]],
        },
      },
    },
    range: {
      id: 'range', name: 'Полигон', theme: 'range', w: 30, h: 34, training: true,
      desc: 'Стрельбище для разминки: мишени и неподвижные боты.',
      ops: [
        ['.', 2, 2, 26, 30], [',', 2, 24, 26, 8], ['t', 12, 27, 6, 3],
        ['c', 6, 18, 3, 1], ['c', 21, 18, 3, 1], ['=', 13, 14, 4, 1],
        ['x', 5, 10, 1, 1], ['X', 24, 10, 1, 1], ['=', 8, 5, 1, 4], ['=', 21, 5, 1, 4],
        ['x', 14, 7, 1, 1], ['c', 3, 24, 4, 1], ['c', 23, 24, 4, 1],
      ],
      targets: [[5, 4, 2], [10, 3, 3], [15, 2, 2.5], [20, 3, 3], [25, 4, 2], [9, 12, 2], [20, 12, 2], [15, 10, 4], [4, 16, 1.6], [26, 16, 1.6], [15, 17, 2]],
      dummies: [[7, 8], [12, 5], [18, 5], [23, 8], [15, 12], [10, 16], [20, 16]],
      plan: { stage: {}, hold: {} },
    },
  };
  TAC.MAP_ORDER = ['quarry', 'port'];

  TAC.MODES = {
    comp: { id: 'comp', name: 'Соревновательный', desc: '5 на 5 с ботами, закладка и обезвреживание бомбы, экономика, смена сторон в перерыве.', maps: ['quarry', 'port'] },
    dm: { id: 'dm', name: 'Бой насмерть', desc: 'Каждый сам за себя, мгновенное возрождение, любое оружие бесплатно.', maps: ['quarry', 'port'] },
    tdm: { id: 'tdm', name: 'Командный бой насмерть', desc: 'Команда на команду с возрождением, до 50 убийств или 10 минут.', maps: ['quarry', 'port'] },
    train: { id: 'train', name: 'Разминка', desc: 'Тир: 60 секунд на мишени и неподвижных ботов, любое оружие, рекорд.', maps: ['range', 'quarry', 'port'] },
  };

  TAC.TIPS = [
    'Стреляйте стоя: на бегу пули разлетаются, а короткая остановка возвращает точность.',
    'Узор отдачи каждый раз один и тот же. Ведите мышь вниз и чуть в сторону, чтобы очередь ложилась в точку.',
    'Шлем спасает от выстрела в голову из многих винтовок. Покупайте его вместе с бронежилетом.',
    'Проигрыш раунда тоже приносит деньги, и с каждым поражением подряд их больше.',
    'Набор сапёра сокращает обезвреживание с 10 до 5 секунд.',
    'Шаги слышно за полтора десятка метров. Идите шагом (Shift), чтобы подкрасться.',
    'Присядьте (Ctrl): разброс меньше, а голову труднее поймать. Встать можно, только если над головой есть место.',
    'Дым закрывает обзор ботам так же, как вам. Зажигательная смесь гаснет в дыму.',
    'Светошумовая граната ослепляет того, кто смотрит в её сторону. Отвернитесь!',
    'Боты слышат выстрелы и идут на звук. Смените позицию после убийства.',
    'Q - вернуться к прошлому оружию, G - выбросить текущее.',
    'Экономьте в плохом раунде: полная закупка в следующем важнее одного пистолета.',
    'Снайперская винтовка точна только в прицеле (правая кнопка мыши) и только когда вы стоите.',
  ];

  // ---------- Облики оружия, кейсы ----------
  TAC.RARITY = {
    base: { name: 'Заводское', color: '#9aa4b1', weight: 0 },
    common: { name: 'Обычное', color: '#4b69ff', weight: 0.62 },
    uncommon: { name: 'Необычное', color: '#8847ff', weight: 0.22 },
    rare: { name: 'Редкое', color: '#d32ce6', weight: 0.1 },
    mythic: { name: 'Мифическое', color: '#eb4b4b', weight: 0.04 },
    legendary: { name: 'Легендарное', color: '#e4ae39', weight: 0.02 },
  };
  TAC.RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic', 'legendary'];
  TAC.PATTERNS = {
    factory: { name: 'Заводской', rarity: 'base' },
    sand_camo: { name: 'Песчаный камуфляж', rarity: 'common' },
    forest_camo: { name: 'Лесной камуфляж', rarity: 'common' },
    urban_pixel: { name: 'Городская цифра', rarity: 'common' },
    arctic: { name: 'Арктика', rarity: 'common' },
    carbon: { name: 'Карбон', rarity: 'uncommon' },
    ocean: { name: 'Прибой', rarity: 'uncommon' },
    zebra: { name: 'Зебра', rarity: 'uncommon' },
    circuit: { name: 'Схема', rarity: 'rare' },
    tiger: { name: 'Тигровый', rarity: 'rare' },
    marble: { name: 'Мрамор', rarity: 'rare' },
    hex: { name: 'Соты', rarity: 'mythic' },
    lava: { name: 'Лава', rarity: 'mythic' },
    fade: { name: 'Закат', rarity: 'legendary' },
    emerald: { name: 'Изумруд', rarity: 'legendary' },
    gold: { name: 'Гравировка', rarity: 'legendary' },
  };
  TAC.CASES = {
    perimeter: {
      id: 'perimeter', name: 'Кейс «Периметр»', price: 150, color: '#c8912f',
      items: [['p9', 'sand_camo'], ['osa', 'forest_camo'], ['lis', 'urban_pixel'], ['shmel', 'arctic'], ['vepr', 'sand_camo'],
        ['grom', 'carbon'], ['strazh', 'ocean'], ['shchegol', 'zebra'],
        ['burya', 'tiger'], ['osa', 'circuit'], ['dalnoboy', 'marble'],
        ['strazh', 'hex'], ['burya', 'lava'],
        ['dalnoboy', 'fade'], ['knife', 'gold']],
    },
    surf: {
      id: 'surf', name: 'Кейс «Прибой»', price: 150, color: '#3f8fd0',
      items: [['hornet', 'forest_camo'], ['burya', 'sand_camo'], ['strazh', 'arctic'], ['shkval', 'urban_pixel'], ['p9', 'urban_pixel'],
        ['lis', 'carbon'], ['osa', 'ocean'], ['vepr', 'zebra'],
        ['grom', 'tiger'], ['shchegol', 'circuit'], ['shmel', 'marble'],
        ['dalnoboy', 'hex'], ['grom', 'lava'],
        ['burya', 'emerald'], ['knife', 'fade']],
    },
  };
  TAC.CASE_ORDER = ['perimeter', 'surf'];
  TAC.TOKENS = { start: 300, win: 100, draw: 60, loss: 40, perKill: 5, dmBase: 30, dmPerKill: 3, trainBase: 10 };

  // ---------- Звания: очки за победы над ботами, потолок зависит от сложности ----------
  TAC.RANKS = [
    { name: 'Новобранец', color: '#8a939e' }, { name: 'Рядовой', color: '#9aa9b8' }, { name: 'Ефрейтор', color: '#a9c1d6' },
    { name: 'Младший сержант', color: '#6fb3e0' }, { name: 'Сержант', color: '#4f9bd9' }, { name: 'Старшина', color: '#4379d6' },
    { name: 'Прапорщик', color: '#7a62d9' }, { name: 'Лейтенант', color: '#a255d6' }, { name: 'Капитан', color: '#d04fa8' },
    { name: 'Майор', color: '#e0624f' }, { name: 'Полковник', color: '#e89a3c' }, { name: 'Легенда периметра', color: '#f2c94c' },
  ];
  TAC.RANK_RULES = {
    step: 100,                                 // очков на одно звание
    win: { easy: 25, medium: 35, hard: 45, expert: 60 },
    loss: { easy: -30, medium: -25, hard: -20, expert: -15 },
    cap: { easy: 3, medium: 6, hard: 9, expert: 11 },   // выше этого звания победы на этой сложности не поднимают
  };

  // ---------- Кампания ----------
  TAC.MISSIONS = [
    { id: 'm1', name: 'Пристрелка', mode: 'train', map: 'range', diff: 'medium', text: 'Наберите 15 попаданий за 60 секунд на полигоне.', stars: ['15 попаданий', '25 попаданий', '35 попаданий'] },
    { id: 'm2', name: 'Разведка боем', mode: 'dm', map: 'quarry', diff: 'medium', text: 'Бой насмерть на «Карьере»: 10 убийств.', stars: ['10 убийств', '15 убийств', '20 убийств'] },
    { id: 'm3', name: 'Сапёр', mode: 'comp', map: 'quarry', diff: 'medium', side: 'T', text: 'Короткий матч за атаку: заложите бомбу 3 раза.', stars: ['3 закладки', '3 закладки и победа', '5 закладок и победа'] },
    { id: 'm4', name: 'Оборона порта', mode: 'comp', map: 'port', diff: 'medium', side: 'CT', text: 'Короткий матч за защиту на «Порту»: победите.', stars: ['Победа', 'С разницей 3 раунда', 'С разницей 5 раундов'] },
    { id: 'm5', name: 'Последний рубеж', mode: 'comp', map: 'quarry', diff: 'hard', text: 'Сильные боты: выиграйте раунд, оставшись последним живым в команде.', stars: ['Один такой раунд', 'И победа в матче', 'Два таких раунда и победа'] },
    { id: 'm6', name: 'Дальний выстрел', mode: 'dm', map: 'port', diff: 'hard', text: 'Бой насмерть против сильных: 8 убийств из снайперских винтовок.', stars: ['8 убийств', '12 убийств', '16 убийств'] },
    { id: 'm7', name: 'Стена к стене', mode: 'tdm', map: 'quarry', diff: 'hard', text: 'Командный бой насмерть против сильных: ваша команда должна победить.', stars: ['Победа команды', 'И 15 ваших убийств', 'И 25 ваших убийств'] },
    { id: 'm8', name: 'Периметр', mode: 'comp', map: 'port', diff: 'expert', final: true, text: 'Финал. Эксперты, короткий матч. Победите и закройте операцию.', stars: ['Победа', 'С разницей 3 раунда', 'С разницей 5 раундов'] },
  ];

  // ---------- Настройки по умолчанию ----------
  TAC.ACTIONS = [
    ['forward', 'Вперёд', 'KeyW'], ['back', 'Назад', 'KeyS'], ['left', 'Влево', 'KeyA'], ['right', 'Вправо', 'KeyD'],
    ['jump', 'Прыжок', 'Space'], ['crouch', 'Присесть', 'ControlLeft'], ['walk', 'Идти шагом', 'ShiftLeft'],
    ['reload', 'Перезарядка', 'KeyR'], ['use', 'Действие (обезвредить, поднять)', 'KeyE'], ['buy', 'Меню покупки', 'KeyB'],
    ['drop', 'Выбросить оружие', 'KeyG'], ['lastWeapon', 'Прошлое оружие', 'KeyQ'], ['inspect', 'Осмотреть оружие', 'KeyF'],
    ['scoreboard', 'Таблица счёта', 'Tab'],
    ['slot1', 'Основное оружие', 'Digit1'], ['slot2', 'Пистолет', 'Digit2'], ['slot3', 'Нож', 'Digit3'], ['slot4', 'Гранаты', 'Digit4'], ['slot5', 'Бомба', 'Digit5'],
  ];
  const keys = {};
  for (const a of TAC.ACTIONS) keys[a[0]] = a[2];
  TAC.DEFAULT_SETTINGS = {
    game: { difficulty: 'medium', side: 'auto', matchLength: 'short', dmLimit: 30, fov: 90, hudScale: 1, hudColor: 'white', radarZoom: 1, radarRotate: true, radarCenter: true, teamColors: true, vmFov: 68, vmX: 0, vmY: 0, vmZ: 0 },
    crosshair: { style: 'static', size: 3, thickness: 1, gap: 1, dot: false, outline: true, outlineThickness: 1, color: 'green', r: 80, g: 250, b: 80, alpha: 230, tStyle: false, followRecoil: false },
    video: { preset: 'high', renderScale: 1, brightness: 1, shadows: 'off', textures: 'high', aa: 'on', particles: 'high', distance: 160, showFps: false },
    audio: { master: 0.7, effects: 0.8, steps: 0.8, music: 0.35, eq: 'natural' },
    input: { sens: 1.6, zoomSens: 1, rawInput: true, accel: false, invertY: false, keys, keysV: 2 },
  };
  // Пределы и допустимые значения настроек (как у ползунков и переключателей в меню)
  TAC.SETTING_RANGES = {
    game: { fov: [75, 100], hudScale: [0.8, 1.3], radarZoom: [0.5, 2], vmFov: [54, 90], vmX: [-0.06, 0.06], vmY: [-0.06, 0.06], vmZ: [-0.06, 0.06], dmLimit: [5, 100] },
    crosshair: { size: [0, 10], thickness: [0, 5], gap: [-5, 5], outlineThickness: [0.5, 3], r: [0, 255], g: [0, 255], b: [0, 255], alpha: [0, 255] },
    video: { renderScale: [0.5, 1], brightness: [0.7, 1.4], distance: [60, 200] },
    audio: { master: [0, 1], effects: [0, 1], steps: [0, 1], music: [0, 1] },
    input: { sens: [0.1, 8], zoomSens: [0.2, 2] },
  };
  TAC.SETTING_ENUMS = {
    game: { difficulty: ['easy', 'medium', 'hard', 'expert'], side: ['auto', 'T', 'CT'], matchLength: ['short', 'long'], hudColor: ['white', 'blue', 'green', 'yellow', 'red', 'purple'] },
    crosshair: { style: ['static', 'dynamic'], color: ['green', 'yellow', 'blue', 'cyan', 'red', 'white', 'custom'] },
    video: { preset: ['low', 'medium', 'high', 'ultra', 'custom'], shadows: ['off', 'low', 'high'], textures: ['low', 'high'], aa: ['off', 'on'], particles: ['low', 'high'] },
    audio: { eq: ['natural', 'crisp'] },
  };
  TAC.HUD_COLORS = { white: '#f2f2f2', blue: '#7fb2ff', green: '#78e08f', yellow: '#f5d76e', red: '#ff7a7a', purple: '#c9a0ff' };
  TAC.XHAIR_COLORS = { green: [80, 250, 80], yellow: [250, 240, 70], blue: [70, 160, 255], cyan: [60, 240, 240], red: [255, 60, 60], white: [255, 255, 255] };
  TAC.VIDEO_PRESETS = {
    low: { renderScale: 0.75, shadows: 'off', textures: 'low', aa: 'off', particles: 'low', distance: 90 },
    medium: { renderScale: 1, shadows: 'off', textures: 'high', aa: 'off', particles: 'low', distance: 130 },
    high: { renderScale: 1, shadows: 'off', textures: 'high', aa: 'on', particles: 'high', distance: 160 },
    ultra: { renderScale: 1, shadows: 'high', textures: 'high', aa: 'on', particles: 'high', distance: 200 },
  };
  TAC.VM_PRESETS = { classic: [0, 0, 0], desktop: [0.02, 0.01, -0.02], couch: [-0.02, -0.02, 0.03] };
})();

// Интерфейс боя: радар, деньги, здоровье и броня, патроны, таймер и счёт, лента убийств,
// прицел, отметки попаданий, указатель урона, меню покупки, таблица счёта, итоги раунда.
(function () {
  'use strict';
  const TAC = window.TAC;
  const $ = (id) => document.getElementById(id);

  // Силуэты оружия для ленты убийств и магазина (viewBox 0 0 64 20)
  const ICONS = {
    knife: 'M4 11 L30 8 L44 9 L46 11 L44 12 L30 12 Z M46 9 h12 v4 h-12 z',
    pistol: 'M14 5 h30 v6 h-18 l-3 10 h-7 l3 -10 h-5 z',
    heavypistol: 'M10 4 h38 v7 h-20 l-3 10 h-8 l3 -10 h-10 z',
    smg: 'M6 6 h40 v5 h6 v3 h-6 v1 h-16 l-2 5 h-5 l1 -5 h-4 v6 h-5 v-6 h-6 z',
    rifle: 'M2 7 h6 l4 -2 h34 v3 h14 v2 h-14 v3 h-16 l-3 6 h-5 l2 -6 h-3 l2 5 h-6 l-2 -5 h-7 l-4 3 h-2 z',
    rifle2: 'M2 7 h8 l2 -3 h10 v3 h24 v3 h14 v2 h-14 v2 h-14 l-3 6 h-5 l2 -6 h-4 v6 h-5 v-6 h-11 l-4 3 h-2 z',
    sniper: 'M2 8 h10 l4 -1 h14 v-3 h12 v3 h20 v2 h-20 v3 h-16 l-3 5 h-5 l2 -5 h-8 l-6 3 h-4 z',
    awp: 'M1 8 h11 l4 -1 h12 v-4 h14 v4 h22 v3 h-22 v2 h-16 l-3 6 h-5 l2 -6 h-8 l-7 3 h-4 z',
    shotgun: 'M2 8 h12 l3 -2 h44 v3 h-44 v3 h-12 l-2 5 h-5 l2 -5 h-2 l-5 2 h-2 z',
    mg: 'M2 7 h10 l3 -2 h36 v3 h12 v2 h-12 v4 h-10 v6 h-12 v-6 h-6 l-3 6 h-5 l2 -6 h-6 l-6 3 h-3 z',
    grenade: 'M28 4 h8 v3 h3 a8 8 0 1 1 -14 0 h3 z',
    bomb: 'M14 5 h36 v12 h-36 z M18 8 h10 v3 h-10 z',
    head: 'M32 2 a7 7 0 1 1 0.1 0 z M27 16 h10 v3 h-10 z',
  };
  TAC.ICON_PATHS = ICONS;
  TAC.weaponIcon = function (id, cls) {
    const def = TAC.WEAPONS[id];
    const key = !def ? 'bomb' : def.cat === 'grenade' ? 'grenade' : def.model;
    return `<svg viewBox="0 0 64 20" class="${cls || ''}"><path d="${ICONS[key] || ICONS.rifle}"/></svg>`;
  };

  const hud = TAC.hud = {
    lastEvent: 0, cache: {}, msgUntil: 0, radarImg: null, radarWorld: null, buyOpen: false, buyCat: 0, sbOpen: false,
  };
  function setText(key, el, v) { if (hud.cache[key] !== v) { hud.cache[key] = v; el.textContent = v; } }
  function setHTML(key, el, v) { if (hud.cache[key] !== v) { hud.cache[key] = v; el.innerHTML = v; } }
  function toggle(key, el, cls, on) { if (hud.cache[key] !== on) { hud.cache[key] = on; el.classList.toggle(cls, on); } }

  hud.reset = function (match) {
    hud.cache = {}; hud.lastEvent = match.eventId || 0; hud.msgUntil = 0;
    $('killfeed').innerHTML = ''; $('centermsg').innerHTML = ''; $('dmgind').innerHTML = '';
    $('roundbanner').className = '';
    hud.radarImg = TAC.drawMapPreview(match.world, 8, { radar: true });
    hud.radarWorld = match.world;
    hud.showBuy(false); hud.showScoreboard(false);
    hud.applySettings();
  };

  // ---------- Прицел ----------
  hud.buildCrosshair = function (el, c, extraGap) {
    const col = TAC.crosshairColor(c);
    const len = Math.max(0, c.size * 2.2), th = Math.max(0.5, c.thickness * 1.6), gap = Math.max(0, 3 + c.gap * 1.2 + (extraGap || 0));
    const ol = c.outline ? `box-shadow: 0 0 0 ${c.outlineThickness}px rgba(0,0,0,${(c.alpha / 255 * 0.85).toFixed(2)});` : '';
    let html = '';
    const line = (x, y, w, h) => `<i style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${col};${ol}"></i>`;
    if (len > 0) {
      html += line(gap, -th / 2, len, th);                 // право
      html += line(-gap - len, -th / 2, len, th);          // лево
      html += line(-th / 2, gap, th, len);                 // низ
      if (!c.tStyle) html += line(-th / 2, -gap - len, th, len);   // верх
    }
    if (c.dot) html += line(-th / 2, -th / 2, th, th);
    el.innerHTML = html;
    el.dataset.len = len; el.dataset.gap = gap; el.dataset.th = th;
  };
  hud.applySettings = function () {
    const s = TAC.settings, root = document.documentElement.style;
    root.setProperty('--hud-scale', s.game.hudScale);
    root.setProperty('--hud', TAC.HUD_COLORS[s.game.hudColor] || '#f2f2f2');
    hud.buildCrosshair($('crosshair'), s.crosshair, 0);
    hud.xhDynamic = s.crosshair.style === 'dynamic';
    hud.cache.xhGap = null;
    $('fps').classList.toggle('on', !!s.video.showFps);
  };

  // ---------- Радар ----------
  hud.radarState = { angle: 0, scale: 1, cx: 0, cz: 0 };
  hud.drawRadar = function (match, me) {
    const cv = $('radar'), g = cv.getContext('2d'), s = TAC.settings.game, w = match.world;
    const size = 200, half = size / 2;
    g.clearRect(0, 0, size, size);
    const mapW = w.W * w.CELL, mapH = w.H * w.CELL;
    let scale, cx, cz, ang;
    if (s.radarCenter) {
      scale = (half / 38) * s.radarZoom;                 // пикселей на метр
      cx = me.pos.x; cz = me.pos.z; ang = s.radarRotate ? me.yaw : 0;
    } else {
      scale = size / Math.max(mapW, mapH) * 0.95; cx = mapW / 2; cz = mapH / 2; ang = 0;
    }
    hud.radarState = { angle: ang, scale, cx, cz };
    g.save();
    g.beginPath(); g.rect(0, 0, size, size); g.clip();
    g.translate(half, half);
    g.rotate(ang);
    g.translate(-cx * scale, -cz * scale);
    g.imageSmoothingEnabled = false;
    g.globalAlpha = 0.9;
    g.drawImage(hud.radarImg, 0, 0, mapW * scale, mapH * scale);
    g.globalAlpha = 1;
    const now = match.time;
    const dot = (p, color, r, label) => {
      g.save(); g.translate(p.x * scale, p.z * scale); g.rotate(-ang);
      g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (label) { g.fillStyle = '#000'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 0.5); }
      g.restore();
    };
    for (const a of match.agents) {
      if (a === me) continue;
      if (!a.alive) {
        if (me.team && a.team === me.team) { g.save(); g.translate(a.pos.x * scale, a.pos.z * scale); g.rotate(-ang); g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-3, -3); g.lineTo(3, 3); g.moveTo(3, -3); g.lineTo(-3, 3); g.stroke(); g.restore(); }
        continue;
      }
      if (me.team && a.team === me.team) {
        dot(a.pos, s.teamColors && a.color ? a.color : (a.team === 'CT' ? '#6ea8ff' : '#e2b457'), 4);
      } else if (a.dummy || (match.spotted[me.squad || 0] && now - (match.spotted[me.squad || 0].get(a.id) || -9) < 0.8)) {
        dot(a.pos, '#ff4a3a', 4);
      }
    }
    const b = match.bomb;
    if (b && (b.state === 'planted' || (b.state === 'dropped' && me.team === 'T'))) {
      const p = b.state === 'planted' ? b.pos : b.item && b.item.pos;
      if (p) { g.save(); g.translate(p.x * scale, p.z * scale); g.rotate(-ang); g.fillStyle = b.state === 'planted' && (now % 1 < 0.5) ? '#ff3b30' : '#f0c24a'; g.fillRect(-4, -3, 8, 6); g.restore(); }
    }
    g.restore();
    // игрок - стрелка
    g.save();
    if (s.radarCenter) g.translate(half, half); else { g.translate((me.pos.x - cx) * scale + half, (me.pos.z - cz) * scale + half); }
    g.rotate(s.radarCenter && s.radarRotate ? 0 : -me.yaw);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
    g.restore();
  };

  // ---------- Главное обновление ----------
  hud.update = function (app, dt) {
    const m = app.match, me = app.viewAgent || m.player, p = m.player;
    if (!m || !me) return;
    // события
    for (const e of m.events) {
      if (e.id <= hud.lastEvent) continue;
      hud.lastEvent = e.id;
      hud.onEvent(e, app);
    }
    const s = TAC.settings;
    // здоровье, броня
    setText('hp', $('hpVal'), String(Math.max(0, Math.ceil(me.hp))));
    $('hpBar').style.width = Math.max(0, me.hp) + '%';
    toggle('hplow', $('hpVal').parentElement, 'low', me.hp <= 25);
    setText('ar', $('arVal'), String(me.armor));
    toggle('helm', $('helm'), 'on', !!me.helmet);
    toggle('kitv', $('kit'), 'on', !!me.kit);
    $('kit').style.display = m.mode === 'comp' && me.team === 'CT' ? '' : 'none';
    // деньги и зона покупки
    const moneyTxt = m.mode === 'comp' ? TAC.fmtMoney(me.money) : m.mode === 'train' ? 'Разминка' : 'Оружие бесплатно';
    if (hud.cache.money !== moneyTxt) { hud.cache.money = moneyTxt; $('money').firstChild ? ($('money').firstChild.nodeValue = moneyTxt) : ($('money').textContent = moneyTxt); }
    toggle('bz', $('buyzone'), 'on', m.mode === 'comp' && me === p && p.alive && m.canBuyNow(p));
    // патроны
    const w = me.weapon(), def = me.weaponDef();
    setText('wname', $('wname'), def ? def.name : '');
    if (w && def && def.mag) {
      setText('mag', $('mag'), me.fire.reload > 0 ? '…' : String(w.mag));
      setText('res', $('reserve'), '/ ' + w.reserve);
      toggle('maglow', $('mag'), 'low', w.mag <= Math.ceil(def.mag * 0.2));
    } else if (def && def.cat === 'grenade') { setText('mag', $('mag'), String(me.inv.grenades.length)); setText('res', $('reserve'), ''); }
    else { setText('mag', $('mag'), ''); setText('res', $('reserve'), ''); }
    // ячейки оружия
    const slots = [];
    const add = (slot, n, name) => slots.push(`<div class="slot${me.slot === slot ? ' on' : ''}"><span>${name}</span><b>${n}</b></div>`);
    if (me.inv.primary) add('primary', 1, me.inv.primary.def.short);
    if (me.inv.secondary) add('secondary', 2, me.inv.secondary.def.short);
    add('knife', 3, 'Нож');
    if (me.inv.grenades.length) add('grenade', 4, me.inv.grenades.map((g) => TAC.WEAPONS[g].short).join(' · '));
    if (me.inv.bomb) add('bomb', 5, 'Бомба');
    setHTML('slots', $('slots'), slots.join(''));
    // таймер и счёт
    hud.updateTop(m);
    // лента убийств: старые исчезают
    const kf = $('killfeed');
    for (const el of Array.from(kf.children)) if (m.time - Number(el.dataset.t) > 7 || m.time < Number(el.dataset.t) - 1) el.remove();
    // прицел: динамический раздвигается от разброса, «следовать отдаче» смещает
    const xh = $('crosshair');
    let gapExtra = 0;
    if (hud.xhDynamic && def && def.spread) gapExtra = Math.min(30, TAC.inaccuracy(me, def) * 500);
    const gk = Math.round(gapExtra);
    if (hud.cache.xhGap !== gk) { hud.cache.xhGap = gk; hud.buildCrosshair(xh, s.crosshair, gk); }
    let dx = 0, dy = 0;
    if (s.crosshair.followRecoil && app.camera) {
      const k = innerHeight / 2 / Math.tan(app.camera.fov * Math.PI / 360);
      dx = Math.tan(me.fire.punchX * Math.PI / 180) * k; dy = -Math.tan(me.fire.punchY * Math.PI / 180) * k;
    }
    xh.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const scoped = me.fire.scope > 0;
    toggle('scope', $('scope'), 'on', scoped);
    xh.style.display = scoped || me !== p || !p.alive ? 'none' : '';
    // ослепление
    const fl = me.flash > 0 ? Math.min(1, me.flash / 1.6) : 0;
    const fk = fl.toFixed(2);
    if (hud.cache.flash !== fk) { hud.cache.flash = fk; $('flash').style.opacity = fk; }
    // закладка и обезвреживание
    let prog = null;
    if (me.planting > 0) prog = ['Закладка бомбы', me.planting / TAC.ECON.plantTime];
    else if (m.bomb && m.bomb.defuser && m.bomb.state === 'planted' && (m.bomb.defuser === me || (me.team === 'CT'))) prog = [m.bomb.defuser === me ? (m.bomb.kit ? 'Обезвреживание (с набором)' : 'Обезвреживание') : m.bomb.defuser.name + ' обезвреживает', m.bomb.defuse / (m.bomb.kit ? TAC.ECON.defuseKitTime : TAC.ECON.defuseTime)];
    toggle('prog', $('progress'), 'on', !!prog);
    if (prog) { setText('plabel', $('plabel'), prog[0]); $('pbar').style.width = Math.min(100, prog[1] * 100) + '%'; }
    // центр: сообщения
    if (hud.msgUntil && performance.now() > hud.msgUntil) { hud.msgUntil = 0; $('centermsg').innerHTML = ''; }
    hud.phaseMessage(m, p);
    // наблюдение после смерти
    const spect = m.mode === 'comp' && !p.alive && me !== p;
    toggle('spec', $('spectate'), 'on', spect || (!p.alive && m.mode !== 'comp'));
    if (spect) setHTML('spectxt', $('spectate'), `Наблюдение: <b>${me.name}</b> · ЛКМ - следующий`);
    else if (!p.alive && m.mode !== 'comp') setHTML('spectxt', $('spectate'), 'Возрождение через ' + Math.max(0, Math.ceil((p.respawnAt || 0) - m.time)) + ' с');
    // радар
    hud.radarN = (hud.radarN || 0) + 1;
    if (hud.radarN % 2 === 0 || hud.forceRadar) hud.drawRadar(m, me);
    // имена союзников
    hud.teamTags(app);
    if (hud.buyOpen) hud.refreshBuy(m);
    if (hud.sbOpen) hud.renderScoreboard(m);
  };

  hud.updateTop = function (m) {
    let timer = '', cls = '';
    if (m.mode === 'comp') {
      if (m.phase === 'freeze') { timer = TAC.fmtTime(m.phaseEnd - m.time); cls = 'freeze'; }
      else if (m.phase === 'live') timer = TAC.fmtTime(m.phaseEnd - m.time);
      else if (m.phase === 'planted') { timer = 'БОМБА'; cls = 'bomb'; }
      else timer = '0:00';
    } else timer = TAC.fmtTime(Math.max(0, m.phaseEnd - m.time));
    setText('timer', $('timer'), timer);
    if (hud.cache.tcls !== cls) { hud.cache.tcls = cls; $('timer').className = 'timer ' + cls; }
    let l = '', r = '', al = '', ar = '';
    if (m.mode === 'comp' || m.mode === 'tdm') {
      const ctSq = m.squadOfSide('CT'), tSq = 1 - ctSq;
      const src = m.mode === 'comp' ? m.score : m.teamKills;
      l = String(src[ctSq]); r = String(src[tSq]);
      for (const a of m.agents) {
        const i = `<i class="${a.alive ? '' : 'dead'}"></i>`;
        if (a.team === 'CT') al += i; else if (a.team === 'T') ar += i;
      }
      $('scL').className = 'sc ct'; $('scR').className = 'sc t';
    } else if (m.mode === 'dm') {
      const order = m.agents.slice().sort((a, b) => b.stats.k - a.stats.k);
      l = String(m.player.stats.k); r = String(order[0] === m.player ? (order[1] ? order[1].stats.k : 0) : order[0].stats.k);
    } else if (m.mode === 'train') {
      l = String(m.trainHits); r = String(m.best || 0);
    }
    setText('scL', $('scL'), l); setText('scR', $('scR'), r);
    setHTML('aliveL', $('aliveL'), al); setHTML('aliveR', $('aliveR'), ar);
  };

  hud.phaseMessage = function (m, p) {
    if (hud.msgUntil) return;
    let msg = '';
    if (m.mode === 'comp' && m.phase === 'freeze') msg = `Раунд ${m.round} начнётся через ${Math.ceil(m.phaseEnd - m.time)}<small>B - купить оружие · ${m.round === 1 || m.round === m.half + 1 ? 'пистолетный раунд' : TAC.SIDE_NAMES[p.team] + ': ' + (p.team === 'T' ? 'заложите бомбу на A или B' : 'не дайте заложить бомбу')}</small>`;
    else if (m.mode === 'comp' && p.alive && p.inv.bomb && m.phase === 'live' && m.time - m.liveStart < 6) msg = '<small>У вас бомба: 5 - взять, в зоне A или B держите ЛКМ</small>';
    else if (m.mode === 'train' && m.phase === 'live' && m.time - m.liveStart < 4) msg = 'Разминка: 60 секунд<small>Сбивайте мишени и неподвижных ботов. B - любое оружие бесплатно</small>';
    setHTML('cmsg', $('centermsg'), msg);
  };
  hud.message = function (html, ms) {
    $('centermsg').innerHTML = html;
    hud.cache.cmsg = html;
    hud.msgUntil = performance.now() + (ms || 2500);
  };

  hud.onEvent = function (e, app) {
    const m = app.match;
    if (e.type === 'kill') hud.addKill(e.entry);
    else if (e.type === 'hitmarker') {
      const el = $('hitmark');
      el.className = 'hitmark' + (e.head ? ' head' : '') + (e.kill ? ' kill' : '');
      void el.offsetWidth; el.classList.add('show');
    } else if (e.type === 'hurt') {
      const h = $('hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 60);
      if (e.from) {
        const me = m.player;
        const ang = Math.atan2(-(e.from.x - me.pos.x), -(e.from.z - me.pos.z)) - me.yaw;
        const i = document.createElement('i');
        i.style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
        $('dmgind').appendChild(i);
        setTimeout(() => i.remove(), 1200);
      }
    } else if (e.type === 'money') {
      const sm = document.createElement('small');
      sm.textContent = (e.amount > 0 ? '+' : '') + TAC.fmtMoney(e.amount).replace('$-', '-$');
      $('money').appendChild(sm);
      setTimeout(() => sm.remove(), 1800);
    } else if (e.type === 'roundEnd') {
      const rb = $('roundbanner');
      const reasons = { elimination: 'Все противники уничтожены', bomb: 'Бомба взорвана', defuse: 'Бомба обезврежена', time: 'Время вышло' };
      rb.className = 'show ' + e.winSide;
      $('rbTitle').textContent = (e.winSide === 'CT' ? TAC.TEAM_NAMES.CT + ' побеждает' : TAC.TEAM_NAMES.T + ' побеждают');
      $('rbSub').textContent = reasons[e.reason] + (e.mvp ? ' · Лучший игрок раунда: ' + e.mvp : '');
      setTimeout(() => { if (rb.className.startsWith('show')) rb.className = ''; }, 4500);
    } else if (e.type === 'planted') hud.message(`<span style="color:#ff6b5a">Бомба заложена на точке ${e.site}</span>`, 3000);
    else if (e.type === 'defused') hud.message('<span style="color:#6ea8ff">Бомба обезврежена</span>', 2500);
    else if (e.type === 'halftime') hud.message('Смена сторон<small>Деньги и снаряжение сброшены</small>', 4000);
    else if (e.type === 'live') hud.message(m.player.team === 'T' ? 'Вперёд!<small>Время покупки - ещё 20 секунд</small>' : 'Занимайте позиции<small>Время покупки - ещё 20 секунд</small>', 1800);
    else if (e.type === 'message') { if (!e.team || e.team === m.player.team) hud.message(e.text, 2000); }
    else if (e.type === 'roundStart') { $('roundbanner').className = ''; }
  };

  hud.addKill = function (k) {
    const el = document.createElement('div');
    el.className = 'kf' + (k.mine ? ' mine' : '');
    el.dataset.t = k.time;
    const cls = (t) => (t === 'T' ? 'T' : t === 'CT' ? 'CT' : 'N');
    let html = '';
    if (k.killer) html += `<span class="${cls(k.kTeam)}">${esc(k.killer)}</span>`;
    if (k.assist) html += `<span class="dim">+ ${esc(k.assist)}</span>`;
    html += TAC.weaponIcon(k.weapon === 'bomb' ? null : k.weapon);
    if (k.head) html += `<svg viewBox="0 0 64 20" class="hs" style="width:18px"><path d="${ICONS.head}"/></svg>`;
    html += `<span class="${cls(k.vTeam)}">${esc(k.victim)}</span>`;
    el.innerHTML = html;
    const kf = $('killfeed');
    kf.appendChild(el);
    while (kf.children.length > 6) kf.firstChild.remove();
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  TAC.esc = esc;

  // Имена союзников над головами
  hud.teamTags = function (app) {
    const m = app.match, me = app.viewAgent, cam = app.camera, box = $('teamtags');
    if (!cam || !me || !me.team) { setHTML('tags', box, ''); return; }
    const v = hud._v || (hud._v = new THREE.Vector3());
    let html = '';
    for (const a of m.agents) {
      if (a === me || !a.alive || a.team !== me.team) continue;
      v.set(a.pos.x, a.pos.y + a.height() + 0.25, a.pos.z).project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      html += `<span style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;color:${TAC.settings.game.teamColors && a.color ? a.color : '#9fc3ff'}">${esc(a.name)}</span>`;
    }
    setHTML('tags', box, html);
  };

  // ---------- Меню покупки ----------
  hud.showBuy = function (on) {
    hud.buyOpen = !!on;
    $('buymenu').classList.toggle('show', hud.buyOpen);
    if (on) { hud.cache.buyKey = null; hud.renderBuyCats(); }
  };
  hud.buyItemsFor = function (m, cat) {
    const p = m.player;
    return TAC.BUY_MENU[cat].items.filter((id) => {
      const def = TAC.WEAPONS[id] || TAC.EQUIPMENT[id];
      if (m.mode !== 'comp') return id !== 'kit';
      return !def.team || def.team === 'both' || def.team === p.team;
    });
  };
  hud.renderBuyCats = function () {
    const box = $('buyCats');
    box.innerHTML = TAC.BUY_MENU.map((c, i) => `<button data-cat="${i}" class="${i === hud.buyCat ? 'on' : ''}"><b>${i + 1}</b>${c.name}</button>`).join('');
    for (const b of box.querySelectorAll('button')) b.onclick = () => { hud.buyCat = Number(b.dataset.cat); hud.cache.buyKey = null; hud.renderBuyCats(); };
  };
  hud.refreshBuy = function (m) {
    const p = m.player, free = m.mode !== 'comp';
    const tl = m.buyTimeLeft();
    const key = [hud.buyCat, p.money, p.team, p.armor, p.helmet, p.kit, p.inv.grenades.join(), p.inv.primary && p.inv.primary.id, p.inv.secondary && p.inv.secondary.id, Math.ceil(tl), m.inBuyZone(p)].join('|');
    if (hud.cache.buyKey === key) return;
    hud.cache.buyKey = key;
    $('buyMoney').textContent = free ? 'Бесплатно' : TAC.fmtMoney(p.money);
    $('buyTime').textContent = free ? 'Любое оружие в любой момент' : tl > 0 ? (m.inBuyZone(p) ? 'Время покупки: ' + Math.ceil(tl) + ' с' : 'Вы вне зоны покупки') : 'Время покупки вышло';
    const items = hud.buyItemsFor(m, hud.buyCat);
    $('buyItems').innerHTML = items.map((id, i) => {
      const def = TAC.WEAPONS[id], eq = TAC.EQUIPMENT[id];
      let price = def ? def.price : eq.price;
      if (id === 'vesthelm' && p.armor >= 100 && !p.helmet) price = eq.helmOnly;
      const owned = def ? (def.slot === 'grenade' ? p.inv.grenades.includes(id) : p.inv[def.slot] && p.inv[def.slot].id === id) : (id === 'vest' && p.armor >= 100) || (id === 'vesthelm' && p.armor >= 100 && p.helmet) || (id === 'kit' && p.kit);
      const no = !free && price > p.money;
      let stats = '';
      if (def && def.dmg && def.mag) stats = `Урон ${def.dmg}${def.pellets ? '×' + def.pellets : ''} · броня ${Math.round(def.pen * 100)}% · ${def.mag}/${def.reserve}`;
      else if (def && def.cat === 'grenade') stats = { frag: 'Урон до 98 в радиусе 7 м', smoke: 'Дым на 18 с', flash: 'Ослепляет до 4 с', fire: 'Огонь 7 с, 40 урона/с' }[id];
      else if (eq) stats = { vest: 'Броня 100', vesthelm: 'Броня 100 и защита головы', kit: 'Обезвреживание за 5 с' }[id];
      return `<button class="bitem${no ? ' no' : ''}${owned ? ' owned' : ''}" data-id="${id}"><span class="bk">${i + 1}</span><div class="bn">${def ? def.name : eq.name}</div>${def ? TAC.weaponIcon(id) : ''}<div class="bp">${free ? 'Бесплатно' : TAC.fmtMoney(price)}</div><div class="bs">${stats}</div></button>`;
    }).join('');
    for (const b of $('buyItems').querySelectorAll('.bitem')) b.onclick = () => hud.buy(m, b.dataset.id);
  };
  hud.buy = function (m, id) {
    const r = m.buy(m.player, id);
    if (!r.ok) {
      const txt = { money: 'Недостаточно денег', zone: 'Вы вне зоны покупки', time: 'Время покупки вышло', side: 'Недоступно вашей стороне', limit: 'Больше нельзя', dead: 'Вы мертвы' }[r.reason] || 'Нельзя';
      hud.message(`<span style="color:#ff7b6b">${txt}</span>`, 1400);
      if (TAC.audio) TAC.audio.play('deny');
    }
    hud.cache.buyKey = null;
    return r;
  };
  hud.buyKey = function (m, n) {
    const items = hud.buyItemsFor(m, hud.buyCat);
    if (hud.buyStage !== 'item') { if (n >= 1 && n <= TAC.BUY_MENU.length) { hud.buyCat = n - 1; hud.buyStage = 'item'; hud.renderBuyCats(); hud.cache.buyKey = null; } return; }
    if (n >= 1 && n <= items.length) hud.buy(m, items[n - 1]);
    hud.buyStage = 'cat';
  };

  // ---------- Таблица счёта ----------
  hud.showScoreboard = function (on) { hud.sbOpen = !!on; $('scoreboard').classList.toggle('show', hud.sbOpen); hud.cache.sb = null; };
  hud.renderScoreboard = function (m, target) {
    const rows = (list, showMoney) => list.map((a) => `<tr class="${a === m.player ? 'me' : ''}${a.alive ? '' : ' dead'}"><td>${a.color && TAC.settings.game.teamColors ? `<span class="dot" style="background:${a.color}"></span>` : ''}${esc(a.name)}</td><td>${showMoney ? TAC.fmtMoney(a.money) : ''}</td><td>${a.stats.k}</td><td>${a.stats.a}</td><td>${a.stats.d}</td><td>${a.stats.mvp ? '★' + a.stats.mvp : ''}</td><td>${a.stats.score}</td><td>${a.isBot ? 'БОТ' : '5'}</td></tr>`).join('');
    const head = '<tr><th>Игрок</th><th>Деньги</th><th>У</th><th>П</th><th>С</th><th>MVP</th><th>Очки</th><th>Пинг</th></tr>';
    const sort = (l) => l.slice().sort((a, b) => b.stats.score - a.stats.score || b.stats.k - a.stats.k);
    let html = '';
    if (m.mode === 'comp' || m.mode === 'tdm') {
      for (const side of ['CT', 'T']) {
        const sq = m.squadOfSide(side);
        const sc = m.mode === 'comp' ? m.score[sq] : m.teamKills[sq];
        html += `<div class="sbteam ${side}"><h3><span>${TAC.TEAM_NAMES[side]} · ${TAC.SIDE_NAMES[side]}</span><span>${sc}</span></h3><table>${head}${rows(sort(m.agents.filter((a) => a.team === side)), side === m.player.team && m.mode === 'comp')}</table></div>`;
      }
    } else {
      html = `<div class="sbteam N"><h3><span>${m.mode === 'dm' ? 'Бой насмерть' : 'Разминка'}</span><span>до ${m.killLimit || '-'}</span></h3><table>${head}${rows(m.agents.slice().sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d), false)}</table></div>`;
    }
    const mapName = TAC.MAPS[m.mapId].name, modeName = TAC.MODES[m.mode].name;
    const headTxt = `<span><b>${modeName}</b> · ${mapName}</span><span>${m.mode === 'comp' ? 'Раунд ' + m.round + ' из ' + m.maxRounds + ' · до ' + m.winRounds + ' побед' : ''}</span>`;
    const key = html + headTxt;
    if (!target && hud.cache.sb === key) return;
    hud.cache.sb = key;
    if (target) { target.innerHTML = html; return; }
    $('sbHead').innerHTML = headTxt;
    $('sbBody').innerHTML = html;
  };
})();

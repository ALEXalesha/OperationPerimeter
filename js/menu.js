// Меню: вкладки, выбор режима, карты и ботов, кампания, инвентарь и кейсы, статистика,
// настройки (пять разделов), экран загрузки, итоги матча, победа в операции.
(function () {
  'use strict';
  const TAC = window.TAC;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => TAC.esc(s);
  const FAST = TAC.params.get('fast') === '1';
  const M = TAC.menu = { sel: { mode: null, map: null, diff: null, side: 'auto', short: true, limit: 30, mission: null }, tab: 'home', invWeapon: 'burya', setTab: 'game' };

  function click(el, fn) { el.addEventListener('click', (e) => { if (TAC.audio) TAC.audio.play('click'); fn(e); }); }
  function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(M.toastT); M.toastT = setTimeout(() => el.classList.remove('show'), 2200); }
  M.toast = toast;

  // ---------- Вкладки ----------
  M.openTab = function (name) {
    M.tab = name;
    for (const s of document.querySelectorAll('#menu .tab')) s.classList.toggle('show', s.id === 'tab-' + name);
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
    if (name === 'settings') { $('settingsHost').appendChild($('settings')); M.renderSettings(); }
    if (name === 'play') M.playStep(1);
    if (name === 'inventory') M.renderInventory();
    if (name === 'stats') M.renderStats();
    if (name === 'campaign') M.renderCampaign();
    if (name === 'home') M.renderHome();
  };
  M.init = function () {
    for (const b of document.querySelectorAll('[data-tab]')) click(b, () => M.openTab(b.dataset.tab));
    for (const b of document.querySelectorAll('[data-back]')) click(b, () => M.playStep(Number(b.dataset.back)));
    click($('btnStart'), () => M.launch());
    click($('btnExit'), () => M.confirm('Выйти из игры?', 'Прогресс, инвентарь и настройки сохранены.', () => {
      window.close();
      setTimeout(() => toast('Браузер не даёт закрыть вкладку сам - закройте её, прогресс сохранён'), 200);
    }));
    click($('btnResume'), () => TAC.app.resume());
    click($('btnQuit'), () => M.confirm('Выйти в меню?', 'Текущий матч будет прерван.', () => TAC.app.quitToMenu(true)));
    click($('btnPauseSettings'), () => { $('pauseSettingsHost').appendChild($('settings')); $('pauseSettingsHost').classList.add('show'); M.renderSettings(); });
    click($('btnPauseBack'), () => $('pauseSettingsHost').classList.remove('show'));
    click($('btnAgain'), () => { $('matchover').classList.remove('show'); const o = Object.assign({}, TAC.app.opts, { seed: (Math.random() * 1e9) >>> 0 }); TAC.app.startMatch(o); });
    click($('btnToMenu'), () => { $('matchover').classList.remove('show'); TAC.app.quitToMenu(false); if (M.pendingVictory) { M.pendingVictory = false; M.showVictory(); } });
    click($('btnVictoryClose'), () => { $('victory').classList.remove('show'); M.openTab('campaign'); });
    click($('confirmNo'), () => $('confirm').classList.remove('show'));
    click($('confirmYes'), () => { $('confirm').classList.remove('show'); if (M.confirmFn) M.confirmFn(); });
    click($('caseClose'), () => { $('caseopen').classList.remove('show'); M.renderInventory(); });
    click($('caseEquip'), () => { if (M.lastCaseItem) { TAC.inventory.equip(M.lastCaseItem.weapon, M.lastCaseItem.uid); M.invWeapon = M.lastCaseItem.weapon; } $('caseopen').classList.remove('show'); M.invSub('loadout'); });
    for (const b of document.querySelectorAll('.invsub .sub')) click(b, () => M.invSub(b.dataset.inv));
    for (const b of document.querySelectorAll('.settabs button')) click(b, () => { M.setTab = b.dataset.set; M.renderSettings(); });
    for (const b of document.querySelectorAll('button')) b.addEventListener('mouseenter', () => TAC.audio && TAC.audio.ctx && TAC.audio.play('hover'));
    M.buildModeCards();
    M.refresh();
    M.openTab('home');
    if (TAC.campaign.data.finished) { /* уже пройдено */ }
  };
  M.refresh = function () {
    $('topTokens').textContent = TAC.inventory.data.tokens;
    const r = TAC.profile.rank();
    $('topRank').innerHTML = TAC.rankIcon(r, 26) + '<span>' + TAC.RANKS[r].name + '</span>';
    if (M.tab === 'home') M.renderHome();
  };
  M.escape = function () {
    if ($('bindwait').classList.contains('show')) return;
    for (const id of ['confirm', 'caseopen']) if ($(id).classList.contains('show')) { $(id).classList.remove('show'); return; }
    if (M.tab === 'play' && M.step > 1) { M.playStep(M.step - 1); return; }
    if (M.tab !== 'home') M.openTab('home');
  };
  M.confirm = function (title, text, fn) { $('confirmTitle').textContent = title; $('confirmText').textContent = text; M.confirmFn = fn; $('confirm').classList.add('show'); };

  // ---------- Главная ----------
  M.renderHome = function () {
    const pts = TAC.profile.data.rankPoints, r = TAC.rankOf(pts), step = TAC.RANK_RULES.step;
    const next = r < TAC.RANKS.length - 1 ? (pts % step) / step : 1;
    $('homeRank').innerHTML = `${TAC.rankIcon(r, 46)}<div><div class="rn">${TAC.RANKS[r].name}</div><div class="rp">${pts} очков · соревновательных матчей: ${TAC.profile.data.rankedMatches}</div><div class="rankbar"><i style="width:${(next * 100).toFixed(0)}%"></i></div></div>`;
    const st = TAC.stats.view();
    $('homeLast').innerHTML = `<div class="lt">Ваш счёт</div><div class="lv">Матчей: ${st.matches} · побед: ${st.wins}</div><div class="rp dim">У/С ${st.kd.toFixed(2)} · в голову ${(st.hsPercent * 100).toFixed(0)}%</div>`;
  };

  // ---------- Играть ----------
  const MODE_ICONS = {
    comp: '<svg width="46" height="46" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="10" rx="1.5" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M7 11h4M7 14h6" stroke="#fff" stroke-width="1.6"/><circle cx="16" cy="12" r="1.5" fill="#ff5a4a"/><path d="M9 8V5h6v3" stroke="#fff" stroke-width="1.6" fill="none"/></svg>',
    dm: '<svg width="46" height="46" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="1.4" fill="#ff5a4a"/></svg>',
    tdm: '<svg width="46" height="46" viewBox="0 0 24 24"><path d="M8 3l5 2v5c0 4-2.5 7-5 8-2.5-1-5-4-5-8V5z" fill="#6ea8ff"/><path d="M16 6l5 2v5c0 4-2.5 7-5 8-2.5-1-5-4-5-8V8z" fill="#e2b457" opacity=".9"/></svg>',
    train: '<svg width="46" height="46" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#ff5a4a" stroke-width="1.6"/><circle cx="12" cy="12" r="1.3" fill="#fff"/></svg>',
  };
  const MODE_BG = { comp: 'linear-gradient(135deg,#3b2a12,#1b2433)', dm: 'linear-gradient(135deg,#3a1414,#1e1e28)', tdm: 'linear-gradient(135deg,#16263f,#3a2c12)', train: 'linear-gradient(135deg,#17301f,#1c2230)' };
  M.buildModeCards = function () {
    const box = $('modeCards');
    box.innerHTML = '';
    for (const id of ['comp', 'dm', 'tdm', 'train']) {
      const md = TAC.MODES[id];
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.mode = id;
      b.innerHTML = `<div class="art" style="background:${MODE_BG[id]}">${MODE_ICONS[id]}<span class="tag">${id === 'comp' ? '5 на 5' : id === 'dm' ? 'все против всех' : id === 'tdm' ? '5 на 5' : 'одиночная'}</span></div><div class="cb"><h3>${md.name}</h3><p>${md.desc}</p></div>`;
      click(b, () => { M.sel.mode = id; M.sel.mission = null; M.playStep(2); });
      box.appendChild(b);
    }
  };
  const previews = {};
  M.mapPreview = function (id, px) {
    const key = id + px;
    if (!previews[key]) previews[key] = TAC.drawMapPreview(new TAC.World(TAC.MAPS[id]), px);
    return previews[key];
  };
  M.playStep = function (n) {
    M.step = n;
    for (const s of document.querySelectorAll('.step')) { const k = Number(s.dataset.step); s.classList.toggle('on', k === n); s.classList.toggle('done', k < n); }
    $('paneMode').classList.toggle('show', n === 1);
    $('paneMap').classList.toggle('show', n === 2);
    $('paneStart').classList.toggle('show', n === 3);
    if (n === 2) M.buildMapCards();
    if (n === 3) M.buildStart();
  };
  M.buildMapCards = function () {
    const box = $('mapCards');
    box.innerHTML = '';
    for (const id of TAC.MODES[M.sel.mode].maps) {
      const md = TAC.MAPS[id];
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.map = id;
      const art = document.createElement('div'); art.className = 'art';
      const cv = M.mapPreview(id, 6);
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0);
      art.appendChild(c2);
      b.appendChild(art);
      const cb = document.createElement('div'); cb.className = 'cb';
      cb.innerHTML = `<h3>${md.name}</h3><p>${md.desc}</p>`;
      b.appendChild(cb);
      click(b, () => { M.sel.map = id; M.playStep(3); });
      box.appendChild(b);
    }
  };
  function seg(box, opts, cur, onPick) {
    box.innerHTML = '';
    for (const [val, label, small] of opts) {
      const b = document.createElement('button');
      b.innerHTML = label + (small ? `<small>${small}</small>` : '');
      b.dataset.val = String(val);
      if (String(val) === String(cur)) b.classList.add('on');
      click(b, () => { for (const x of box.children) x.classList.remove('on'); b.classList.add('on'); onPick(val); });
      box.appendChild(b);
    }
  }
  M.buildStart = function () {
    const s = TAC.settings.game, sel = M.sel;
    if (!sel.diff) sel.diff = s.difficulty;
    sel.side = sel.side || s.side; sel.short = s.matchLength !== 'long'; sel.limit = s.dmLimit;
    const cv = M.mapPreview(sel.map, 6);
    $('startSummary').innerHTML = '';
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0);
    $('startSummary').appendChild(c2);
    const ss = document.createElement('div'); ss.className = 'ss';
    ss.innerHTML = `<b>${TAC.MAPS[sel.map].name}</b><span>${TAC.MODES[sel.mode].name}</span>`;
    $('startSummary').appendChild(ss);
    seg($('diffSeg'), Object.entries(TAC.DIFFICULTY).map(([k, d]) => [k, d.name, 'реакция ' + Math.round(d.reaction * 1000) + ' мс']), sel.diff, (v) => { sel.diff = v; });
    $('optSide').style.display = sel.mode === 'comp' || sel.mode === 'tdm' ? '' : 'none';
    seg($('sideSeg'), [['auto', 'Любая'], ['T', 'Атака', TAC.TEAM_NAMES.T], ['CT', 'Защита', TAC.TEAM_NAMES.CT]], sel.side, (v) => { sel.side = v; });
    $('optLength').style.display = sel.mode === 'comp' ? '' : 'none';
    seg($('lengthSeg'), [['short', 'Короткий', 'до 8 побед из 15'], ['long', 'Длинный', 'до 13 побед из 24']], sel.short ? 'short' : 'long', (v) => { sel.short = v === 'short'; });
    $('optLimit').style.display = sel.mode === 'dm' ? '' : 'none';
    seg($('limitSeg'), [[20, '20'], [30, '30'], [50, '50']], sel.limit, (v) => { sel.limit = v; });
    $('diffSeg').parentElement.querySelector('h3').style.display = sel.mode === 'train' ? 'none' : '';
    $('diffSeg').style.display = sel.mode === 'train' ? 'none' : '';
  };
  M.launch = function () {
    const sel = M.sel;
    const opts = { mode: sel.mode, map: sel.map, diff: sel.diff, side: sel.side, short: sel.short, killLimit: sel.mode === 'dm' ? sel.limit : undefined, seed: (Math.random() * 1e9) >>> 0 };
    TAC.app.startMatch(opts);
  };

  // ---------- Загрузка ----------
  M.showLoading = function (opts) {
    $('loadMode').textContent = TAC.MODES[opts.mode].name + (opts.mission ? ' · операция «Периметр»' : '') + (opts.mode !== 'train' ? ' · боты: ' + TAC.DIFFICULTY[opts.diff || 'medium'].name.toLowerCase() : '');
    $('loadMap').textContent = TAC.MAPS[opts.map].name;
    const cv = M.mapPreview(opts.map, 5), lp = $('loadPreview'), g = lp.getContext('2d');
    g.fillStyle = '#111'; g.fillRect(0, 0, lp.width, lp.height);
    const k = Math.min(lp.width / cv.width, lp.height / cv.height);
    g.drawImage(cv, (lp.width - cv.width * k) / 2, (lp.height - cv.height * k) / 2, cv.width * k, cv.height * k);
    $('loadTip').textContent = TAC.TIPS[Math.floor(Math.random() * TAC.TIPS.length)];
    $('loadBar').style.width = '0%';
    $('loading').classList.add('show');
  };
  M.loadingProgress = function (p, label) { $('loadBar').style.width = (p * 100).toFixed(0) + '%'; $('loadStatus').textContent = label + '...'; };
  M.hideLoading = function () { $('loading').classList.remove('show'); };

  // ---------- Кампания ----------
  M.renderCampaign = function () {
    const c = TAC.campaign;
    $('campStars').textContent = '★ ' + c.totalStars() + ' / ' + TAC.MISSIONS.length * 3;
    const box = $('missionList');
    box.innerHTML = '';
    TAC.MISSIONS.forEach((m, i) => {
      const st = c.data.stars[m.id] || 0, open = c.unlocked(m.id);
      const el = document.createElement('div');
      el.className = 'mission' + (open ? '' : ' locked') + (m.final ? ' final' : '');
      el.dataset.mission = m.id;
      el.innerHTML = `<div class="mn">${m.final ? 'Финал' : 'Миссия ' + (i + 1)} · ${TAC.MODES[m.mode].name} · ${TAC.MAPS[m.map].name} · ${TAC.DIFFICULTY[m.diff].name.toLowerCase()}</div><h3>${m.name}</h3><p>${m.text}</p><div class="stars"><b>${'★'.repeat(st)}</b>${'★'.repeat(3 - st)}</div><div class="starlist">${m.stars.map((s, k) => (k < st ? '✓ ' : '· ') + s).join('<br>')}</div>`;
      const b = document.createElement('button');
      b.className = 'btn' + (open ? ' primary' : '');
      b.textContent = open ? (st ? 'Переиграть' : 'Начать') : 'Закрыто';
      b.disabled = !open;
      click(b, () => M.startMission(m));
      el.appendChild(b);
      box.appendChild(el);
    });
  };
  M.missionOpts = function (m) {
    return { mode: m.mode, map: m.map, diff: m.diff, side: m.side || 'auto', short: true, mission: m.id, killLimit: m.mode === 'dm' ? 30 : undefined, seed: (Math.random() * 1e9) >>> 0 };
  };
  M.startMission = function (m) { TAC.app.startMatch(M.missionOpts(m)); };

  // ---------- Итоги матча: жетоны, статистика, звание, звёзды ----------
  M.recordMatch = function (s) {
    const T = TAC.TOKENS;
    let tokens = 0;
    if (s.mode === 'comp' || s.mode === 'tdm') tokens = (s.draw ? T.draw : s.won ? T.win : T.loss) + T.perKill * s.kills;
    else if (s.mode === 'dm') tokens = T.dmBase + T.dmPerKill * s.kills;
    else tokens = T.trainBase;
    TAC.inventory.addTokens(tokens);
    TAC.stats.record(s, false);
    const rank = TAC.profile.applyMatch(s);
    const mission = TAC.campaign.record(s);
    if (mission && mission.finale) M.pendingVictory = true;
    M.refresh();
    return { tokens, rank, mission };
  };
  M.showMatchOver = function (s, m, rw) {
    if (document.pointerLockElement) { TAC.app.expectUnlock = true; document.exitPointerLock(); }
    TAC.app.paused = true;
    TAC.hud.showBuy(false); TAC.hud.showScoreboard(false);
    const res = $('moRes');
    let title, cls;
    if (s.mode === 'train') { title = 'Разминка окончена'; cls = 'draw'; }
    else if (s.mode === 'dm') { title = s.place === 1 ? 'Первое место!' : s.place + '-е место'; cls = s.place === 1 ? 'win' : 'loss'; }
    else if (s.draw) { title = 'Ничья'; cls = 'draw'; }
    else { title = s.won ? 'Победа' : 'Поражение'; cls = s.won ? 'win' : 'loss'; }
    res.textContent = title; res.className = 'mores ' + cls;
    if (s.mode === 'train') $('moScore').innerHTML = `Попаданий: <b>${s.rangeHits}</b> из ${m.trainShots} выстрелов · точность ${m.trainShots ? Math.round(100 * Math.min(s.rangeHits, m.trainShots) / m.trainShots) : 0}% · ${m.newRecord ? '<b style="color:#6fcf97">Новый рекорд!</b>' : 'Рекорд: ' + m.best}`;
    else if (s.mode === 'dm') $('moScore').textContent = `Убийств: ${s.kills} · смертей: ${s.deaths}`;
    else $('moScore').textContent = `${s.score[0]} : ${s.score[1]}` + (s.mode === 'comp' ? ' по раундам' : ' по убийствам');
    // лучший игрок матча
    let mvp = null;
    for (const a of m.agents) if (!mvp || a.stats.mvp > mvp.stats.mvp || (a.stats.mvp === mvp.stats.mvp && a.stats.score > mvp.stats.score)) mvp = a;
    $('moMvp').style.display = s.mode === 'train' ? 'none' : '';
    $('moMvp').innerHTML = mvp ? `★ Лучший игрок матча: <b>${esc(mvp.name)}</b> · ${mvp.stats.k} убийств${mvp.stats.mvp ? ' · ' + mvp.stats.mvp + ' раз лучший в раунде' : ''}` : '';
    let rwHtml = `<div>◆ <b>+${rw ? rw.tokens : 0}</b> жетонов</div>`;
    if (rw && rw.rank) {
      const d = rw.rank.after - rw.rank.before;
      rwHtml += `<div>${TAC.rankIcon(rw.rank.rankAfter, 28)} ${TAC.RANKS[rw.rank.rankAfter].name} <span style="color:${d > 0 ? '#6fcf97' : d < 0 ? '#ff6b6b' : '#8e99a6'}">${d > 0 ? '+' : ''}${d} очков</span>${rw.rank.rankAfter > rw.rank.rankBefore ? ' · <b style="color:#6fcf97">новое звание!</b>' : rw.rank.rankAfter < rw.rank.rankBefore ? ' · звание понижено' : ''}</div>`;
    }
    if (rw && rw.mission) rwHtml += `<div>Миссия: <b style="color:#f6cf7a">${'★'.repeat(rw.mission.stars)}${'☆'.repeat(3 - rw.mission.stars)}</b>${rw.mission.stars ? '' : ' условие не выполнено'}</div>`;
    $('moRewards').innerHTML = rwHtml;
    if (s.mode !== 'train') TAC.hud.renderScoreboard(m, $('moTable')); else $('moTable').innerHTML = '';
    $('btnAgain').textContent = s.mode === 'train' ? 'Ещё раз' : 'Сыграть ещё';
    $('matchover').classList.add('show');
    if (M.pendingVictory) $('btnToMenu').textContent = 'Дальше'; else $('btnToMenu').textContent = 'В меню';
  };
  M.showVictory = function () {
    $('victoryText').textContent = 'Все восемь миссий пройдены: звёзд ' + TAC.campaign.totalStars() + ' из ' + TAC.MISSIONS.length * 3 + '. Можно переигрывать миссии ради трёх звёзд и поднимать звание в соревновательном режиме.';
    const lines = [['Операция: Периметр', ['Фан-концепт тактического шутера']], ['Карты', ['Карьер', 'Порт', 'Полигон']], ['Бойцы', ['Налётчики', 'Спецотряд']], ['Графика', ['Текстуры и облики нарисованы кодом']], ['Звук', ['Синтез WebAudio, без записей']], ['Движок', ['three.js r149 (лицензия MIT)']], ['', ['Спасибо, что играли!']]];
    $('creditsRoll').innerHTML = lines.map(([h, l]) => (h ? `<h4>${h}</h4>` : '<h4>&nbsp;</h4>') + l.map((x) => `<div>${x}</div>`).join('')).join('');
    $('victory').classList.add('show');
    if (TAC.audio) TAC.audio.play('win');
  };

  // ---------- Инвентарь ----------
  M.invSub = function (name) {
    for (const b of document.querySelectorAll('.invsub .sub')) b.classList.toggle('on', b.dataset.inv === name);
    $('invLoadout').classList.toggle('show', name === 'loadout');
    $('invCases').classList.toggle('show', name === 'cases');
    M.renderInventory();
  };
  const SKIN_WEAPONS = () => Object.values(TAC.WEAPONS).filter((w) => ['primary', 'secondary', 'knife'].includes(w.slot));
  // Силуэт оружия, залитый узором облика
  M.drawWeapon = function (cv, weaponId, pattern) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const def = TAC.WEAPONS[weaponId];
    const path = new Path2D(TAC.ICON_PATHS[def.model] || TAC.ICON_PATHS.rifle);
    const k = Math.min(W / 66, H / 22);
    g.save();
    g.translate((W - 64 * k) / 2, (H - 20 * k) / 2);
    g.scale(k, k);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.save(); g.translate(0.8, 1); g.fill(path); g.restore();
    const pc = TAC.skinCanvas(pattern || 'factory');
    const pat = g.createPattern(pc, 'repeat');
    const mtx = new DOMMatrix().scale(0.5 / Math.max(1, k / 6), 0.5 / Math.max(1, k / 6));
    if (pat.setTransform) pat.setTransform(mtx);
    g.fillStyle = pat; g.fill(path);
    const gr = g.createLinearGradient(0, 0, 0, 20);
    gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = gr; g.fill(path);
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 0.4; g.stroke(path);
    g.restore();
  };
  M.renderInventory = function () {
    M.refresh();
    const inv = TAC.inventory;
    // список оружия
    const wl = $('weaponList');
    wl.innerHTML = '';
    for (const def of SKIN_WEAPONS()) {
      const pat = inv.skinFor(def.id);
      const r = pat ? TAC.RARITY[TAC.PATTERNS[pat].rarity] : TAC.RARITY.base;
      const row = document.createElement('div');
      row.className = 'wrow' + (def.id === M.invWeapon ? ' on' : '');
      row.style.setProperty('--rc', r.color);
      row.dataset.weapon = def.id;
      const cv = document.createElement('canvas'); cv.width = 152; cv.height = 60;
      M.drawWeapon(cv, def.id, pat);
      row.appendChild(cv);
      const t = document.createElement('div');
      t.innerHTML = `<div class="wn">${def.name}</div><div class="ws">${pat ? TAC.PATTERNS[pat].name : 'Заводской'} · облик: ${inv.itemsFor(def.id).length + 1}</div>`;
      row.appendChild(t);
      click(row, () => { M.invWeapon = def.id; M.renderInventory(); });
      wl.appendChild(row);
    }
    // превью и облики выбранного оружия
    const wid = M.invWeapon, cur = inv.skinFor(wid);
    M.drawWeapon($('skinCanvas'), wid, cur);
    const rr = cur ? TAC.RARITY[TAC.PATTERNS[cur].rarity] : TAC.RARITY.base;
    $('skinName').innerHTML = `${TAC.WEAPONS[wid].name} | ${cur ? TAC.PATTERNS[cur].name : 'Заводской'}<small style="color:${rr.color}">${rr.name}</small>`;
    const sl = $('skinList');
    sl.innerHTML = '';
    const opts = [{ uid: null, pattern: 'factory', rarity: 'base' }].concat(inv.itemsFor(wid));
    const equippedUid = inv.data.equipped[wid] || null;
    for (const it of opts) {
      const b = document.createElement('button');
      const rar = TAC.RARITY[it.rarity];
      b.className = 'skin' + ((it.uid || null) === equippedUid ? ' on' : '');
      b.style.setProperty('--rc', rar.color);
      b.dataset.uid = it.uid == null ? '' : it.uid;
      b.dataset.pattern = it.pattern;
      const cv = document.createElement('canvas'); cv.width = 150; cv.height = 50;
      M.drawWeapon(cv, wid, it.pattern);
      b.appendChild(cv);
      const t = document.createElement('div');
      t.innerHTML = `<div class="sn">${TAC.PATTERNS[it.pattern].name}</div><div class="sr">${rar.name}${(it.uid || null) === equippedUid ? ' · надето' : ''}</div>`;
      b.appendChild(t);
      click(b, () => { inv.equip(wid, it.uid); M.renderInventory(); });
      sl.appendChild(b);
    }
    if (opts.length === 1) { const p = document.createElement('div'); p.className = 'dim'; p.style.cssText = 'grid-column:1/-1;padding:6px'; p.textContent = 'Других обликов для этого оружия пока нет. Откройте кейс во вкладке «Кейсы»: жетоны дают за матчи.'; sl.appendChild(p); }
    // кейсы
    const cl = $('caseList');
    cl.innerHTML = '';
    for (const id of TAC.CASE_ORDER) {
      const c = TAC.CASES[id];
      const card = document.createElement('div');
      card.className = 'casecard';
      card.innerHTML = `<h3><span class="casebox3" style="--cc:${c.color}"></span>${c.name}</h3><div class="dim">Внутри ${c.items.length} обликов. Шансы: обычное 62%, необычное 22%, редкое 10%, мифическое 4%, легендарное 2%.</div>`;
      const grid = document.createElement('div'); grid.className = 'caseitems';
      for (const [w, p] of c.items) {
        const d = document.createElement('div'); d.style.setProperty('--rc', TAC.RARITY[TAC.PATTERNS[p].rarity].color); d.title = TAC.itemName(w, p);
        const cv = document.createElement('canvas'); cv.width = 90; cv.height = 34; M.drawWeapon(cv, w, p); d.appendChild(cv);
        grid.appendChild(d);
      }
      card.appendChild(grid);
      const b = document.createElement('button');
      b.className = 'btn primary'; b.dataset.case = id;
      b.textContent = 'Открыть за ' + c.price + ' ◆';
      b.disabled = inv.data.tokens < c.price;
      click(b, () => M.openCase(id));
      card.appendChild(b);
      if (inv.data.tokens < c.price) { const n = document.createElement('span'); n.className = 'dim'; n.style.marginLeft = '10px'; n.textContent = 'Не хватает жетонов'; card.appendChild(n); }
      cl.appendChild(card);
    }
  };
  // Открытие кейса: лента прокручивается и замедляется на выпавшем предмете
  M.openCase = function (caseId, rng) {
    const c = TAC.CASES[caseId];
    const res = TAC.inventory.open(caseId, rng);
    if (!res.ok) { toast('Не хватает жетонов'); return res; }
    const it = res.item;
    M.lastCaseItem = it;
    $('caseTitle').textContent = c.name;
    $('caseResult').innerHTML = '';
    $('caseEquip').style.visibility = 'hidden';
    const strip = $('caseStrip');
    strip.innerHTML = '';
    strip.style.transition = 'none'; strip.style.transform = 'translateX(0px)';
    const N = 48, WIN = 42, CW = 136;
    const r = TAC.makeRng((it.uid * 7919) >>> 0);
    for (let i = 0; i < N; i++) {
      let w, p;
      if (i === WIN) { w = it.weapon; p = it.pattern; } else {
        const roll = r(); let acc = 0, rar = 'common';
        for (const k of TAC.RARITY_ORDER) { acc += TAC.RARITY[k].weight; if (roll < acc) { rar = k; break; } }
        const pool = c.items.filter(([, pp]) => TAC.PATTERNS[pp].rarity === rar);
        [w, p] = (pool.length ? pool : c.items)[Math.floor(r() * (pool.length || c.items.length))];
      }
      const d = document.createElement('div'); d.className = 'ci';
      d.style.setProperty('--rc', TAC.RARITY[TAC.PATTERNS[p].rarity].color);
      const cv = document.createElement('canvas'); cv.width = 118; cv.height = 58; M.drawWeapon(cv, w, p);
      d.appendChild(cv);
      const s = document.createElement('span'); s.textContent = TAC.itemName(w, p); d.appendChild(s);
      strip.appendChild(d);
    }
    $('caseopen').classList.add('show');
    const reelW = strip.parentElement.clientWidth || 800;
    const jitter = (r() - 0.5) * (CW - 30);
    const target = -(WIN * CW + CW / 2 - reelW / 2 + jitter);
    const dur = FAST ? 0.25 : 5.6;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      strip.style.transition = `transform ${dur}s cubic-bezier(0.1, 0.62, 0.12, 1)`;
      strip.style.transform = `translateX(${target}px)`;
    }));
    // щелчки при прохождении карточек
    let lastIdx = -1;
    const t0 = performance.now();
    const tick = () => {
      const m = new DOMMatrix(getComputedStyle(strip).transform);
      const idx = Math.floor((-m.m41 + reelW / 2) / CW);
      if (idx !== lastIdx) { lastIdx = idx; if (TAC.audio) TAC.audio.play('tick'); }
      if (performance.now() - t0 < dur * 1000 + 50) requestAnimationFrame(tick);
      else {
        const rar = TAC.RARITY[it.rarity];
        $('caseResult').innerHTML = `<div class="cr-name" style="color:${rar.color}">${esc(TAC.itemName(it.weapon, it.pattern))}</div><div class="cr-rar" style="color:${rar.color}">${rar.name}</div>`;
        $('caseEquip').style.visibility = 'visible';
        if (TAC.audio) TAC.audio.play('reveal');
        M.refresh();
      }
    };
    requestAnimationFrame(tick);
    return res;
  };

  // ---------- Статистика ----------
  M.renderStats = function () {
    const v = TAC.stats.view();
    const pct = (x) => (x * 100).toFixed(1) + '%';
    const tiles = [
      [v.matches, 'Матчей'], [v.wins, 'Побед'], [pct(v.winRate), 'Доля побед'], [v.kd.toFixed(2), 'Убийства / смерти'],
      [pct(v.accuracy), 'Точность'], [pct(v.hsPercent), 'Убийств в голову'], [v.kills, 'Убийств'], [v.mvps, 'Лучший в раунде'],
      [v.favourite ? TAC.WEAPONS[v.favourite].short : '—', 'Любимое оружие'], [TAC.store.get('rangeBest', 0), 'Рекорд разминки'],
    ];
    const wk = Object.entries(v.weaponKills).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = wk.length ? wk[0][1] : 1;
    const r = TAC.profile.rank();
    $('statsBody').innerHTML = `<div class="statgrid">${tiles.map(([a, b]) => `<div class="stat"><div class="sv">${a}</div><div class="sl">${b}</div></div>`).join('')}</div>
      <div class="statcols"><div class="statbox"><h3>Убийства по оружию</h3>${wk.length ? wk.map(([w, n]) => `<div class="wbar"><span>${TAC.WEAPONS[w].name}</span><i style="width:${(n / max * 100).toFixed(0)}%"></i><span>${n}</span></div>`).join('') : '<div class="dim">Сыграйте матч - здесь появится ваше оружие.</div>'}</div>
      <div class="statbox"><h3>Звание</h3><div class="rankbox" style="border:0;padding:0;background:none">${TAC.rankIcon(r, 54)}<div><div class="rn">${TAC.RANKS[r].name}</div><div class="rp">${TAC.profile.data.rankPoints} очков. Победа над ботами даёт очки: лёгкие +25, средние +35, сильные +45, эксперты +60. Лёгкие поднимают не выше «${TAC.RANKS[TAC.RANK_RULES.cap.easy].name}», средние - «${TAC.RANKS[TAC.RANK_RULES.cap.medium].name}», сильные - «${TAC.RANKS[TAC.RANK_RULES.cap.hard].name}». Поражение отнимает очки.</div></div></div>
      <h3 style="margin-top:14px">Раунды</h3><div>Сыграно ${v.roundsPlayed}, выиграно ${v.roundsWon}. Урона нанесено: ${v.damage}. Смертей: ${v.deaths}, помощи: ${v.assists}.</div></div></div>`;
  };

  // ---------- Настройки ----------
  function row(parent, label, hint, control, valueText) {
    const r = document.createElement('div'); r.className = 'srow';
    const l = document.createElement('label'); l.innerHTML = label + (hint ? `<small>${hint}</small>` : '');
    const v = document.createElement('div'); v.className = 'sval'; v.textContent = valueText || '';
    r.appendChild(l); r.appendChild(control); r.appendChild(v);
    parent.appendChild(r);
    return v;
  }
  function changed() { TAC.saveSettings(); TAC.app.applySettings(); }
  function slider(parent, label, obj, key, min, max, step, fmt, hint, after) {
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = obj[key];
    inp.dataset.key = key;
    const v = row(parent, label, hint, inp, fmt(obj[key]));
    inp.addEventListener('input', () => { obj[key] = Number(inp.value); v.textContent = fmt(obj[key]); changed(); if (after) after(); });
    return inp;
  }
  function choice(parent, label, obj, key, opts, hint, after) {
    const box = document.createElement('div'); box.className = 'seg'; box.dataset.key = key;
    row(parent, label, hint, box, '');
    seg(box, opts, obj[key], (v) => { obj[key] = typeof obj[key] === 'number' ? Number(v) : typeof obj[key] === 'boolean' ? v === true || v === 'true' : v; changed(); if (after) after(); });
    return box;
  }
  function onoff(parent, label, obj, key, hint, after) { return choice(parent, label, obj, key, [[false, 'Выкл'], [true, 'Вкл']], hint, after); }
  function group(parent, t) { const g = document.createElement('div'); g.className = 'sgroup'; g.textContent = t; parent.appendChild(g); }
  function foot(parent, section) {
    const f = document.createElement('div'); f.className = 'setfoot';
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'По умолчанию'; b.dataset.reset = section;
    click(b, () => { TAC.resetSettings(section); TAC.app.applySettings(); M.renderSettings(); toast('Раздел сброшен'); });
    f.appendChild(b); parent.appendChild(f);
  }
  const pct = (v) => Math.round(v * 100) + '%';
  M.renderSettings = function () {
    for (const b of document.querySelectorAll('.settabs button')) b.classList.toggle('on', b.dataset.set === M.setTab);
    for (const p of document.querySelectorAll('.setpane')) p.classList.toggle('show', p.id === 'set-' + M.setTab);
    const S = TAC.settings;
    // Игра
    const g = $('set-game'); g.innerHTML = '';
    group(g, 'Матч');
    choice(g, 'Сложность ботов', S.game, 'difficulty', Object.entries(TAC.DIFFICULTY).map(([k, d]) => [k, d.name]));
    choice(g, 'Сторона по умолчанию', S.game, 'side', [['auto', 'Любая'], ['T', 'Атака'], ['CT', 'Защита']]);
    choice(g, 'Длина матча', S.game, 'matchLength', [['short', 'Короткий (8 из 15)'], ['long', 'Длинный (13 из 24)']]);
    slider(g, 'Поле зрения', S.game, 'fov', 75, 100, 1, (v) => v + '°', 'по горизонтали для экрана 4:3');
    group(g, 'Интерфейс');
    slider(g, 'Масштаб интерфейса', S.game, 'hudScale', 0.8, 1.3, 0.05, pct);
    choice(g, 'Цвет интерфейса', S.game, 'hudColor', Object.keys(TAC.HUD_COLORS).map((k) => [k, `<span style="color:${TAC.HUD_COLORS[k]}">■</span> ${{ white: 'Белый', blue: 'Голубой', green: 'Зелёный', yellow: 'Жёлтый', red: 'Красный', purple: 'Лиловый' }[k]}`]));
    onoff(g, 'Цвета союзников', S.game, 'teamColors', 'у каждого союзника свой цвет на радаре и в таблице');
    group(g, 'Радар');
    slider(g, 'Масштаб радара', S.game, 'radarZoom', 0.5, 2, 0.05, pct);
    onoff(g, 'Вращать радар', S.game, 'radarRotate', 'поворачивается вместе со взглядом');
    onoff(g, 'Центр на игроке', S.game, 'radarCenter', 'выкл - видна вся карта');
    group(g, 'Оружие в руках');
    slider(g, 'Поле зрения модели', S.game, 'vmFov', 54, 90, 1, (v) => v + '°');
    choice(g, 'Положение', { p: '' }, 'p', [['classic', 'Классика'], ['desktop', 'Ближе'], ['couch', 'Дальше']], 'готовые смещения', () => {});
    g.querySelector('[data-key=p]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const p = TAC.VM_PRESETS[b.dataset.val]; S.game.vmX = p[0]; S.game.vmY = p[1]; S.game.vmZ = p[2]; changed(); M.renderSettings(); });
    slider(g, 'Смещение вправо', S.game, 'vmX', -0.06, 0.06, 0.005, (v) => v.toFixed(3));
    slider(g, 'Смещение вверх', S.game, 'vmY', -0.06, 0.06, 0.005, (v) => v.toFixed(3));
    slider(g, 'Смещение вперёд', S.game, 'vmZ', -0.06, 0.06, 0.005, (v) => v.toFixed(3));
    foot(g, 'game');
    M.renderCrosshairSettings();
    // Видео
    const v = $('set-video'); v.innerHTML = '';
    group(v, 'Качество');
    const presetBox = choice(v, 'Готовый набор', S.video, 'preset', [['low', 'Низкие'], ['medium', 'Средние'], ['high', 'Высокие'], ['ultra', 'Очень высокие']], null, () => { TAC.applyVideoPreset(S.video.preset); changed(); M.renderSettings(); });
    void presetBox;
    const custom = () => { S.video.preset = 'custom'; TAC.saveSettings(); for (const b of v.querySelector('[data-key=preset]').children) b.classList.remove('on'); };
    slider(v, 'Масштаб отрисовки', S.video, 'renderScale', 0.5, 1, 0.05, pct, 'меньше - быстрее', custom);
    slider(v, 'Яркость', S.video, 'brightness', 0.7, 1.4, 0.05, pct, null, null);
    choice(v, 'Тени', S.video, 'shadows', [['off', 'Запечённые'], ['low', 'Низкие'], ['high', 'Высокие']], 'запечённые - самые быстрые', custom);
    choice(v, 'Текстуры', S.video, 'textures', [['low', 'Низкие'], ['high', 'Высокие']], null, custom);
    choice(v, 'Сглаживание', S.video, 'aa', [['off', 'Выкл'], ['on', 'Вкл']], null, custom);
    choice(v, 'Частицы', S.video, 'particles', [['low', 'Мало'], ['high', 'Много']], null, custom);
    slider(v, 'Дальность прорисовки', S.video, 'distance', 60, 200, 5, (x) => x + ' м', null, custom);
    onoff(v, 'Показывать FPS', S.video, 'showFps');
    foot(v, 'video');
    // Аудио
    const a = $('set-audio'); a.innerHTML = '';
    group(a, 'Громкость');
    slider(a, 'Общая', S.audio, 'master', 0, 1, 0.01, pct);
    slider(a, 'Эффекты', S.audio, 'effects', 0, 1, 0.01, pct, 'выстрелы, взрывы, бомба');
    slider(a, 'Шаги', S.audio, 'steps', 0, 1, 0.01, pct);
    slider(a, 'Музыка меню', S.audio, 'music', 0, 1, 0.01, pct);
    choice(a, 'Профиль звука', S.audio, 'eq', [['natural', 'Естественный'], ['crisp', 'Шаги врагов громче']], 'поднимает шаги и их верхние частоты');
    const tb = document.createElement('button'); tb.className = 'btn'; tb.textContent = 'Проверить звук';
    click(tb, () => { TAC.audio.init(); TAC.audio.setLevels(S.audio); TAC.audio.play('shot', { model: 'rifle' }); setTimeout(() => TAC.audio.play('step', { surface: 'metal' }), 400); setTimeout(() => TAC.audio.play('beep'), 800); });
    row(a, 'Пробный звук', 'выстрел, шаг, писк бомбы', tb, '');
    foot(a, 'audio');
    M.renderInputSettings();
  };
  M.renderCrosshairSettings = function () {
    const S = TAC.settings, c = S.crosshair;
    const box = $('xhControls'); box.innerHTML = '';
    const upd = () => { TAC.hud.buildCrosshair($('xhPreviewCross'), c, c.style === 'dynamic' ? 6 : 0); };
    choice(box, 'Стиль', c, 'style', [['static', 'Классический статичный'], ['dynamic', 'Классический динамический']], 'динамический раздвигается на бегу и в стрельбе', upd);
    slider(box, 'Размер', c, 'size', 0, 10, 0.5, (v) => v.toFixed(1), null, upd);
    slider(box, 'Толщина', c, 'thickness', 0, 5, 0.5, (v) => v.toFixed(1), null, upd);
    slider(box, 'Промежуток', c, 'gap', -5, 5, 0.5, (v) => v.toFixed(1), null, upd);
    onoff(box, 'Точка в центре', c, 'dot', null, upd);
    onoff(box, 'Обводка', c, 'outline', null, upd);
    slider(box, 'Толщина обводки', c, 'outlineThickness', 0.5, 3, 0.5, (v) => v.toFixed(1), null, upd);
    choice(box, 'Цвет', c, 'color', Object.keys(TAC.XHAIR_COLORS).map((k) => [k, `<span style="color:rgb(${TAC.XHAIR_COLORS[k].join(',')})">■</span>`]).concat([['custom', 'Свой']]), null, () => { upd(); M.renderCrosshairSettings(); });
    if (c.color === 'custom') {
      slider(box, 'Красный', c, 'r', 0, 255, 1, (v) => v, null, upd);
      slider(box, 'Зелёный', c, 'g', 0, 255, 1, (v) => v, null, upd);
      slider(box, 'Синий', c, 'b', 0, 255, 1, (v) => v, null, upd);
    }
    slider(box, 'Прозрачность', c, 'alpha', 0, 255, 1, (v) => Math.round(v / 2.55) + '%', null, upd);
    onoff(box, 'Т-образный', c, 'tStyle', 'без верхней черты', upd);
    onoff(box, 'Следовать отдаче', c, 'followRecoil', 'прицел показывает, куда летят пули', upd);
    const code = document.createElement('div'); code.className = 'xhcode';
    code.innerHTML = '<input type="text" id="xhCode" spellcheck="false" placeholder="XH-..."><button class="btn" id="xhExport">Экспорт</button><button class="btn" id="xhImport">Импорт</button>';
    box.appendChild(code);
    $('xhCode').value = TAC.crosshairToCode(c);
    click($('xhExport'), () => { const s = TAC.crosshairToCode(c); $('xhCode').value = s; try { navigator.clipboard.writeText(s).catch(() => {}); } catch (e) { /* буфер недоступен */ } toast('Код прицела скопирован'); });
    click($('xhImport'), () => {
      const v = TAC.codeToCrosshair($('xhCode').value);
      if (!v) { toast('Код прицела не распознан'); return; }
      Object.assign(c, v); changed(); M.renderCrosshairSettings(); toast('Прицел загружен');
    });
    foot(box, 'crosshair');
    upd();
  };
  // Фон превью прицела: кадр карты из меню
  M.afterRender = function (canvas) {
    if (M.tab !== 'settings' || M.setTab !== 'crosshair') return;
    M.xhFrame = (M.xhFrame || 0) + 1;
    if (M.xhFrame % 6) return;
    const bg = $('xhBg'), g = bg.getContext('2d');
    const w = canvas.width, h = canvas.height;
    g.drawImage(canvas, w * 0.55, h * 0.3, w * 0.3, h * 0.3 * (bg.height / bg.width) * (w / h), 0, 0, bg.width, bg.height);
  };
  M.renderInputSettings = function () {
    const S = TAC.settings, i = $('set-input'); i.innerHTML = '';
    group(i, 'Мышь');
    slider(i, 'Чувствительность', S.input, 'sens', 0.1, 8, 0.05, (v) => v.toFixed(2));
    slider(i, 'Множитель в прицеле', S.input, 'zoomSens', 0.2, 2, 0.05, (v) => v.toFixed(2), 'снайперские винтовки');
    onoff(i, 'Сырой ввод', S.input, 'rawInput', 'движение мыши без обработки системой');
    onoff(i, 'Ускорение мыши', S.input, 'accel', 'лучше выключить');
    onoff(i, 'Инверсия по вертикали', S.input, 'invertY');
    group(i, 'Клавиши');
    const msg = document.createElement('div'); msg.className = 'conflictmsg'; msg.id = 'bindMsg'; msg.textContent = M.bindMsg || '';
    i.appendChild(msg);
    for (const [id, name] of TAC.ACTIONS) {
      const r = document.createElement('div'); r.className = 'keyrow' + (M.conflictAction === id ? ' conflict' : ''); r.dataset.action = id;
      const l = document.createElement('span'); l.textContent = name;
      const b = document.createElement('button'); b.className = 'keybtn'; b.textContent = TAC.keyLabel(S.input.keys[id]); b.dataset.action = id;
      click(b, () => M.startBind(id));
      r.appendChild(l); r.appendChild(b); i.appendChild(r);
    }
    const f = document.createElement('div'); f.className = 'setfoot';
    const rb = document.createElement('button'); rb.className = 'btn'; rb.textContent = 'Клавиши по умолчанию'; rb.id = 'keysReset';
    click(rb, () => { S.input.keys = JSON.parse(JSON.stringify(TAC.DEFAULT_SETTINGS.input.keys)); TAC.saveSettings(); M.bindMsg = ''; M.conflictAction = null; M.renderInputSettings(); toast('Клавиши сброшены'); });
    const ra = document.createElement('button'); ra.className = 'btn'; ra.textContent = 'Мышь по умолчанию'; ra.dataset.reset = 'input';
    click(ra, () => { TAC.resetSettings('input'); M.bindMsg = ''; M.conflictAction = null; changed(); M.renderInputSettings(); });
    f.appendChild(rb); f.appendChild(ra); i.appendChild(f);
    const note = document.createElement('p'); note.className = 'dim'; note.style.fontSize = '12px';
    note.textContent = 'В браузере Ctrl+W закрывает вкладку, поэтому присесть по умолчанию - C. Esc всегда открывает паузу.';
    i.appendChild(note);
  };
  M.startBind = function (action) {
    M.binding = action;
    $('bindFor').textContent = 'Действие: ' + TAC.actionName(action);
    $('bindwait').classList.add('show');
  };
  // Перехват клавиши для назначения
  M.captureKey = function (e) {
    if (!M.binding) return false;
    const action = M.binding;
    M.binding = null;
    $('bindwait').classList.remove('show');
    if (e.code === 'Escape') return true;
    const conflict = TAC.bindKey(action, e.code);
    M.conflictAction = conflict;
    M.bindMsg = conflict ? `Клавиша ${TAC.keyLabel(e.code)} была у действия «${TAC.actionName(conflict)}» - теперь у него нет клавиши.` : '';
    M.renderInputSettings();
    return true;
  };
  document.addEventListener('mousedown', (e) => {
    if (!M.binding || e.button === 0 || e.button === 2) return;
    const code = e.button === 1 ? 'Mouse3' : e.button === 3 ? 'Mouse4' : 'Mouse5';
    M.captureKey({ code });
    e.preventDefault();
  });
})();

// Профиль игрока: настройки, инвентарь и кейсы, статистика, звания, кампания, код прицела.
// Всё хранится в localStorage с приставкой mix.tactical.
(function () {
  'use strict';
  const TAC = window.TAC;
  const S = TAC.store;

  // ---------- Настройки ----------
  // Сохранённое могло испортиться или устареть: числа - в пределы, значения - из допустимых
  const num = (v, lo, hi, def) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  TAC.cleanSettings = function (s) {
    const D = TAC.DEFAULT_SETTINGS;
    for (const sec of Object.keys(TAC.SETTING_RANGES)) for (const [k, [lo, hi]] of Object.entries(TAC.SETTING_RANGES[sec])) s[sec][k] = num(s[sec][k], lo, hi, D[sec][k]);
    for (const sec of Object.keys(TAC.SETTING_ENUMS)) for (const [k, list] of Object.entries(TAC.SETTING_ENUMS[sec])) if (!list.includes(s[sec][k])) s[sec][k] = D[sec][k];
    for (const k of Object.keys(s.input.keys)) if (typeof s.input.keys[k] !== 'string') s.input.keys[k] = D.input.keys[k];
    return s;
  };
  TAC.settings = TAC.cleanSettings(TAC.mergeDefaults(TAC.DEFAULT_SETTINGS, S.get('settings', null)));
  { const rb = S.get('rangeBest', 0); if (typeof rb !== 'number' || !isFinite(rb) || rb < 0) S.set('rangeBest', 0); }
  // клавиши: новые действия получают свои умолчания
  TAC.saveSettings = function () { S.set('settings', TAC.settings); };
  TAC.resetSettings = function (section) {
    const def = JSON.parse(JSON.stringify(TAC.DEFAULT_SETTINGS));
    if (section) TAC.settings[section] = def[section]; else TAC.settings = def;
    TAC.saveSettings();
  };
  TAC.applyVideoPreset = function (name) {
    const p = TAC.VIDEO_PRESETS[name];
    if (!p) return;
    Object.assign(TAC.settings.video, p, { preset: name });
  };
  TAC.actionName = (id) => { const a = TAC.ACTIONS.find((x) => x[0] === id); return a ? a[1] : id; };
  // Назначить клавишу: если она занята другим действием, то действие остаётся без клавиши
  TAC.bindKey = function (action, code) {
    const keys = TAC.settings.input.keys;
    let conflict = null;
    for (const k of Object.keys(keys)) if (k !== action && keys[k] === code) { conflict = k; keys[k] = ''; }
    keys[action] = code;
    TAC.saveSettings();
    return conflict;
  };
  TAC.keyLabel = function (code) {
    if (!code) return '—';
    const names = { Space: 'Пробел', ShiftLeft: 'Shift', ShiftRight: 'Правый Shift', ControlLeft: 'Ctrl', ControlRight: 'Правый Ctrl', AltLeft: 'Alt', Tab: 'Tab', Enter: 'Enter', Backquote: '`', CapsLock: 'Caps Lock', Mouse3: 'Средняя кнопка', Mouse4: 'Кнопка 4', Mouse5: 'Кнопка 5' };
    if (names[code]) return names[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code];
    return code;
  };

  // ---------- Код прицела ----------
  const ALPH = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';          // 32 знака без похожих
  const COLOR_KEYS = ['green', 'yellow', 'blue', 'cyan', 'red', 'white', 'custom'];
  TAC.crosshairToCode = function (c) {
    const q = (v, lo, hi, k) => Math.round(TAC.clamp(v, lo, hi) * k);
    const bytes = [1, c.style === 'dynamic' ? 1 : 0, q(c.size, 0, 10, 2), q(c.thickness, 0, 5, 2), q(c.gap + 5, 0, 10, 2),
      (c.dot ? 1 : 0) | (c.outline ? 2 : 0) | (c.tStyle ? 4 : 0) | (c.followRecoil ? 8 : 0), q(c.outlineThickness, 0, 3, 2),
      c.r & 255, c.g & 255, c.b & 255, c.alpha & 255, Math.max(0, COLOR_KEYS.indexOf(c.color))];
    bytes.push(bytes.reduce((s, v) => s + v, 0) & 255);
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    while (bits.length % 5) bits += '0';
    let s = '';
    for (let i = 0; i < bits.length; i += 5) s += ALPH[parseInt(bits.slice(i, i + 5), 2)];
    return 'XH-' + s.match(/.{1,5}/g).join('-');
  };
  TAC.codeToCrosshair = function (code) {
    const s = String(code || '').trim().toUpperCase().replace(/^XH-/, '').replace(/-/g, '');
    if (!s.length) return null;
    let bits = '';
    for (const ch of s) { const v = ALPH.indexOf(ch); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    if (bytes.length < 13 || bytes[0] !== 1) return null;
    const sum = bytes.slice(0, 12).reduce((a, v) => a + v, 0) & 255;
    if (sum !== bytes[12]) return null;
    return {
      style: bytes[1] ? 'dynamic' : 'static', size: bytes[2] / 2, thickness: bytes[3] / 2, gap: bytes[4] / 2 - 5,
      dot: !!(bytes[5] & 1), outline: !!(bytes[5] & 2), tStyle: !!(bytes[5] & 4), followRecoil: !!(bytes[5] & 8),
      outlineThickness: bytes[6] / 2, r: bytes[7], g: bytes[8], b: bytes[9], alpha: bytes[10], color: COLOR_KEYS[bytes[11]] || 'custom',
    };
  };
  TAC.crosshairColor = function (c) {
    const rgb = c.color !== 'custom' && TAC.XHAIR_COLORS[c.color] ? TAC.XHAIR_COLORS[c.color] : [c.r, c.g, c.b];
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(c.alpha / 255).toFixed(3)})`;
  };

  // ---------- Инвентарь и кейсы ----------
  const INV_DEF = { tokens: TAC.TOKENS.start, items: [], equipped: {}, nextUid: 1, opened: 0 };
  function cleanInventory(d) {
    d.tokens = Math.floor(num(d.tokens, 0, 1e7, TAC.TOKENS.start));
    const seen = new Set();
    d.items = (Array.isArray(d.items) ? d.items : []).filter((i) => i && typeof i === 'object' && typeof i.uid === 'number' && isFinite(i.uid) && !seen.has(i.uid) && seen.add(i.uid)
      && TAC.WEAPONS[i.weapon] && ['primary', 'secondary', 'knife'].includes(TAC.WEAPONS[i.weapon].slot) && TAC.PATTERNS[i.pattern]);
    for (const i of d.items) i.rarity = TAC.PATTERNS[i.pattern].rarity;
    const eq = {};
    for (const [w, uid] of Object.entries(d.equipped && typeof d.equipped === 'object' ? d.equipped : {})) { const it = d.items.find((i) => i.uid === uid); if (it && it.weapon === w) eq[w] = uid; }
    d.equipped = eq;
    d.nextUid = Math.max(1, Math.floor(num(d.nextUid, 1, 1e9, 1)), ...d.items.map((i) => i.uid + 1));
    d.opened = Math.floor(num(d.opened, 0, 1e9, 0));
    return d;
  }
  const inv = TAC.inventory = {
    data: cleanInventory(TAC.mergeDefaults(INV_DEF, S.get('inventory', null))),
    save() { S.set('inventory', this.data); },
    reload() { this.data = cleanInventory(TAC.mergeDefaults(INV_DEF, S.get('inventory', null))); },
    item(uid) { return this.data.items.find((i) => i.uid === uid) || null; },
    skinFor(weaponId) { const uid = this.data.equipped[weaponId]; const it = uid && this.item(uid); return it ? it.pattern : null; },
    equip(weaponId, uid) {
      if (uid == null) delete this.data.equipped[weaponId];
      else { const it = this.item(uid); if (!it || it.weapon !== weaponId) return false; this.data.equipped[weaponId] = uid; }
      this.save(); return true;
    },
    itemsFor(weaponId) { return this.data.items.filter((i) => i.weapon === weaponId); },
    addTokens(n) { this.data.tokens = Math.max(0, this.data.tokens + Math.round(n)); this.save(); },
    // Открыть кейс: жетоны списываются, выпадает предмет по весам редкости
    open(caseId, rng) {
      const c = TAC.CASES[caseId];
      if (!c) return { ok: false, reason: 'case' };
      if (this.data.tokens < c.price) return { ok: false, reason: 'tokens' };
      rng = rng || Math.random;
      const roll = rng();
      let acc = 0, rarity = 'common';
      for (const r of TAC.RARITY_ORDER) { acc += TAC.RARITY[r].weight; if (roll < acc) { rarity = r; break; } }
      let pool = c.items.filter(([, p]) => TAC.PATTERNS[p].rarity === rarity);
      if (!pool.length) pool = c.items;
      const [weapon, pattern] = pool[Math.floor(rng() * pool.length)];
      const it = { uid: this.data.nextUid++, weapon, pattern, rarity: TAC.PATTERNS[pattern].rarity, case: caseId, got: Date.now() };
      this.data.tokens -= c.price;
      this.data.items.push(it);
      this.data.opened++;
      this.save();
      return { ok: true, item: it };
    },
  };
  TAC.itemName = (weapon, pattern) => (weapon === 'knife' ? '★ ' : '') + TAC.WEAPONS[weapon].short + ' | ' + TAC.PATTERNS[pattern].name;

  // ---------- Статистика ----------
  const STATS_DEF = { matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, assists: 0, shots: 0, hits: 0, headHits: 0, hsKills: 0, damage: 0, mvps: 0, roundsPlayed: 0, roundsWon: 0, plants: 0, defuses: 0, weaponKills: {}, byMode: { comp: 0, dm: 0, tdm: 0 } };
  function cleanStats(d) {
    for (const k of Object.keys(STATS_DEF)) if (typeof STATS_DEF[k] === 'number') d[k] = Math.floor(num(d[k], 0, 1e12, 0));
    const wk = {};
    for (const [w, n] of Object.entries(d.weaponKills && typeof d.weaponKills === 'object' ? d.weaponKills : {})) if (TAC.WEAPONS[w] && typeof n === 'number' && isFinite(n) && n > 0) wk[w] = Math.floor(n);
    d.weaponKills = wk;
    for (const k of Object.keys(STATS_DEF.byMode)) d.byMode[k] = Math.floor(num(d.byMode[k], 0, 1e12, 0));
    return d;
  }
  TAC.stats = {
    data: cleanStats(TAC.mergeDefaults(STATS_DEF, S.get('stats', null))),
    save() { S.set('stats', this.data); },
    reload() { this.data = cleanStats(TAC.mergeDefaults(STATS_DEF, S.get('stats', null))); },
    record(s, abandoned) {
      if (s.mode === 'train') return;
      const d = this.data;
      if (!abandoned) {
        d.matches++;
        d.byMode[s.mode] = (d.byMode[s.mode] || 0) + 1;
        if (s.draw) d.draws++; else if (s.won) d.wins++; else d.losses++;
      }
      for (const k of ['kills', 'deaths', 'assists', 'shots', 'hits', 'headHits', 'hsKills', 'damage', 'mvps', 'roundsPlayed', 'roundsWon', 'plants', 'defuses']) d[k] += s[k] || 0;
      for (const [w, n] of Object.entries(s.weaponKills || {})) d.weaponKills[w] = (d.weaponKills[w] || 0) + n;
      this.save();
    },
    view() {
      const d = this.data;
      let fav = null, favN = 0;
      for (const [w, n] of Object.entries(d.weaponKills)) if (n > favN) { favN = n; fav = w; }
      return {
        matches: d.matches, wins: d.wins, losses: d.losses, draws: d.draws,
        winRate: d.matches ? d.wins / d.matches : 0,
        kd: d.deaths ? d.kills / d.deaths : d.kills,
        accuracy: d.shots ? d.hits / d.shots : 0,
        hsPercent: d.kills ? d.hsKills / d.kills : 0,
        favourite: fav, favouriteKills: favN, kills: d.kills, deaths: d.deaths, assists: d.assists, mvps: d.mvps, damage: d.damage,
        weaponKills: d.weaponKills, roundsPlayed: d.roundsPlayed, roundsWon: d.roundsWon,
      };
    },
  };

  // ---------- Звания ----------
  TAC.rankOf = (points) => Math.min(TAC.RANKS.length - 1, Math.floor(Math.max(0, points) / TAC.RANK_RULES.step));
  TAC.rankStep = function (points, diff, result) {
    const R = TAC.RANK_RULES;
    if (result === 'win') {
      const cap = (R.cap[diff] + 1) * R.step - 1;
      if (points >= cap) return points;
      return Math.min(cap, points + R.win[diff]);
    }
    if (result === 'loss') return Math.max(0, points + R.loss[diff]);
    return points;
  };
  function cleanProfile(d) { d.rankPoints = Math.floor(num(d.rankPoints, 0, 1e6, 0)); d.rankedMatches = Math.floor(num(d.rankedMatches, 0, 1e9, 0)); return d; }
  TAC.profile = {
    data: cleanProfile(TAC.mergeDefaults({ rankPoints: 0, rankedMatches: 0 }, S.get('profile', null))),
    save() { S.set('profile', this.data); },
    reload() { this.data = cleanProfile(TAC.mergeDefaults({ rankPoints: 0, rankedMatches: 0 }, S.get('profile', null))); },
    rank() { return TAC.rankOf(this.data.rankPoints); },
    applyMatch(s) {
      if (s.mode !== 'comp') return null;
      const before = this.data.rankPoints, rb = TAC.rankOf(before);
      const result = s.draw ? 'draw' : s.won ? 'win' : 'loss';
      this.data.rankPoints = TAC.rankStep(before, s.diff, result);
      this.data.rankedMatches++;
      this.save();
      return { before, after: this.data.rankPoints, rankBefore: rb, rankAfter: TAC.rankOf(this.data.rankPoints), result };
    },
  };
  // Значок звания: щит с шевронами, у старших - звезда, у последнего - венок
  TAC.rankIcon = function (i, size) {
    const r = TAC.RANKS[i] || TAC.RANKS[0];
    size = size || 40;
    const tier = Math.floor(i / 3), n = (i % 3) + 1;
    let inner = '';
    if (i === TAC.RANKS.length - 1) {
      inner = '<path d="M20 9 l3 6 6.5 .9 -4.7 4.6 1.1 6.5 -5.9-3.1 -5.9 3.1 1.1-6.5 -4.7-4.6 6.5-.9z" fill="#fff"/><path d="M8 30 q12 8 24 0" stroke="#fff" stroke-width="2" fill="none"/>';
    } else if (tier >= 3) {
      for (let k = 0; k < n; k++) inner += `<path d="M${14 + k * 6 - (n - 1) * 3} 17 l2 4 4.4.6 -3.2 3.1 .8 4.4 -4-2.1 -4 2.1 .8-4.4 -3.2-3.1 4.4-.6z" fill="#fff"/>`;
    } else {
      for (let k = 0; k < n; k++) inner += `<path d="M11 ${14 + k * 6} l9 5 9-5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linejoin="round"/>`;
    }
    return `<svg class="rankicon" width="${size}" height="${size}" viewBox="0 0 40 40" aria-label="${r.name}"><path d="M20 2 L35 7 V20 C35 29 28 35 20 38 C12 35 5 29 5 20 V7 Z" fill="${r.color}" stroke="rgba(255,255,255,.55)" stroke-width="1.2"/>${inner}</svg>`;
  };

  // ---------- Кампания ----------
  function cleanCampaign(d) {
    const st = {};
    const src = d.stars && typeof d.stars === 'object' ? d.stars : {};
    for (const m of TAC.MISSIONS) if (m.id in src) st[m.id] = typeof src[m.id] === 'number' && isFinite(src[m.id]) ? Math.max(0, Math.min(3, Math.floor(src[m.id]))) : 0;
    d.stars = st;
    d.finished = d.finished === true && (st.m8 || 0) > 0;
    return d;
  }
  TAC.campaign = {
    data: cleanCampaign(TAC.mergeDefaults({ stars: {}, finished: false }, S.get('campaign', null))),
    save() { S.set('campaign', this.data); },
    reload() { this.data = cleanCampaign(TAC.mergeDefaults({ stars: {}, finished: false }, S.get('campaign', null))); },
    unlocked(id) {
      const i = TAC.MISSIONS.findIndex((m) => m.id === id);
      if (i <= 0) return true;
      const m = TAC.MISSIONS[i];
      if (m.final) return TAC.MISSIONS.slice(0, i).every((x) => (this.data.stars[x.id] || 0) > 0);
      return (this.data.stars[TAC.MISSIONS[i - 1].id] || 0) > 0;
    },
    totalStars() { return Object.values(this.data.stars).reduce((a, b) => a + b, 0); },
    // Звёзды за миссию по итогам матча: считается только сыгранная как эта миссия, с её режимом и условиями
    evaluate(id, s) {
      const m = TAC.MISSIONS.find((x) => x.id === id);
      if (!m || !s || s.missionId !== id) return 0;
      if (s.mode !== m.mode || s.map !== m.map || s.diff !== m.diff) return 0;
      if (m.side && s.side !== m.side) return 0;
      if (m.mode === 'comp' && !s.short) return 0;
      const won = !!s.won && !s.draw;
      switch (id) {
        case 'm1': return s.rangeHits >= 35 ? 3 : s.rangeHits >= 25 ? 2 : s.rangeHits >= 15 ? 1 : 0;
        case 'm2': return s.kills >= 20 ? 3 : s.kills >= 15 ? 2 : s.kills >= 10 ? 1 : 0;
        case 'm3': return s.plants >= 5 && won ? 3 : s.plants >= 3 && won ? 2 : s.plants >= 3 ? 1 : 0;
        case 'm4': case 'm8': return won && s.margin >= 5 ? 3 : won && s.margin >= 3 ? 2 : won ? 1 : 0;
        case 'm5': return s.clutches >= 2 && won ? 3 : s.clutches >= 1 && won ? 2 : s.clutches >= 1 ? 1 : 0;
        case 'm6': return s.sniperKills >= 16 ? 3 : s.sniperKills >= 12 ? 2 : s.sniperKills >= 8 ? 1 : 0;
        case 'm7': return s.teamWon && s.kills >= 25 ? 3 : s.teamWon && s.kills >= 15 ? 2 : s.teamWon ? 1 : 0;
        default: return 0;
      }
    },
    record(s) {
      if (!s.missionId) return null;
      const stars = this.evaluate(s.missionId, s);
      const before = this.data.stars[s.missionId] || 0;
      if (stars > before) this.data.stars[s.missionId] = stars;
      const m = TAC.MISSIONS.find((x) => x.id === s.missionId);
      let finale = false;
      if (m && m.final && stars > 0 && !this.data.finished) { this.data.finished = true; finale = true; }
      this.save();
      return { stars, before, finale };
    },
  };

  TAC.resetProgress = function () {
    for (const k of ['inventory', 'stats', 'profile', 'campaign', 'rangeBest']) S.remove(k);
    inv.reload(); TAC.stats.reload(); TAC.profile.reload(); TAC.campaign.reload();
  };
})();

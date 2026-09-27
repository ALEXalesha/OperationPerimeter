// Звук синтезируется WebAudio: выстрелы по типам оружия, шаги по покрытию, перезарядка,
// писк бомбы, взрывы, звуки меню и фоновая музыка меню. Звуки мира идут через панорамирование.
(function () {
  'use strict';
  const TAC = window.TAC;

  const A = {
    ctx: null, master: null, buses: {}, noise: null, music: null, muted: false, suspendedByPause: false,
    levels: { master: 0.7, effects: 0.8, steps: 0.8, music: 0.35, eq: 'natural' },
    listener: { x: 0, y: 0, z: 0 },
    played: [],                 // последние звуки - для проверок
  };
  TAC.audio = A;

  A.init = function () {
    if (A.ctx) return A.ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = A.ctx = new Ctx();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      A.master = ctx.createGain();
      A.master.connect(comp).connect(ctx.destination);
      for (const b of ['effects', 'steps', 'ui', 'music']) { const g = ctx.createGain(); g.connect(A.master); A.buses[b] = g; }
      // «Шаги врагов громче»: подъём верхних частот у шагов
      A.stepEq = ctx.createBiquadFilter(); A.stepEq.type = 'highshelf'; A.stepEq.frequency.value = 1800; A.stepEq.gain.value = 0;
      A.stepEq.connect(A.buses.steps);
      const len = ctx.sampleRate * 1.5, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
      A.noise = buf;
      A.apply();
    } catch (e) { A.ctx = null; }
    return A.ctx;
  };
  A.setLevels = function (lv) { Object.assign(A.levels, lv); A.apply(); };
  A.apply = function () {
    if (!A.ctx) return;
    const L = A.levels, t = A.ctx.currentTime;
    A.master.gain.setTargetAtTime(A.muted ? 0 : L.master, t, 0.02);
    A.buses.effects.gain.setTargetAtTime(L.effects, t, 0.02);
    A.buses.ui.gain.setTargetAtTime(L.effects * 0.8, t, 0.02);
    A.buses.steps.gain.setTargetAtTime(L.steps * (L.eq === 'crisp' ? 1.5 : 1), t, 0.02);
    A.buses.music.gain.setTargetAtTime(L.music * 0.5, t, 0.05);
    A.stepEq.gain.setTargetAtTime(L.eq === 'crisp' ? 9 : 0, t, 0.02);
  };
  // Уровни, как их видит звуковой граф (для проверок и индикатора)
  A.effective = function () {
    const L = A.levels;
    return { master: A.muted ? 0 : L.master, effects: L.effects, steps: L.steps * (L.eq === 'crisp' ? 1.5 : 1), stepBoostDb: L.eq === 'crisp' ? 9 : 0, music: L.music * 0.5 };
  };
  A.setMuted = function (m) { A.muted = !!m; A.apply(); };
  // suspend и resume асинхронны: resume ждёт незаконченный suspend, иначе быстрое «скрыть-показать» оставляло звук выключенным
  A.pending = null;
  A.suspend = function () {
    A.suspendedByPause = true;
    if (A.ctx && A.ctx.state !== 'closed') A.pending = A.ctx.suspend().catch(() => {});
  };
  A.resume = function () {
    A.suspendedByPause = false;
    if (!A.ctx || A.ctx.state === 'closed') return;
    // браузер под нагрузкой может не проснуться с первого раза - повторяем, пока не заработает или снова не скрыли
    let tries = 0;
    const kick = () => {
      if (A.suspendedByPause || !A.ctx || A.ctx.state === 'running' || A.ctx.state === 'closed' || tries++ > 20) return;
      A.ctx.resume().catch(() => {});
      setTimeout(kick, 250);
    };
    (A.pending || Promise.resolve()).then(kick);
  };

  A.setListener = function (pos, yaw) {
    A.listener.x = pos.x; A.listener.y = pos.y; A.listener.z = pos.z;
    if (!A.ctx) return;
    const l = A.ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.positionX) {
      const t = A.ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else if (l.setPosition) { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  };

  // Выход звука: либо прямо в шину, либо через панорамирование в точке мира
  function out(bus, pos, ref) {
    const ctx = A.ctx;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref || 3; p.rolloffFactor = 1.3; p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(bus === 'steps' ? A.stepEq : A.buses[bus]);
    } else g.connect(bus === 'steps' ? A.stepEq : A.buses[bus]);
    return g;
  }
  function noiseBurst(dest, t, dur, type, freq, q, vol, attack) {
    const ctx = A.ctx, src = ctx.createBufferSource();
    src.buffer = A.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    return f;
  }
  function tone(dest, t, dur, type, f0, f1, vol, attack) {
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // Голоса оружия: [частота фильтра, длина, громкость, низ удара, хвост]
  const GUN = {
    pistol: [2400, 0.16, 0.55, 150, 0.18], heavypistol: [1500, 0.3, 0.8, 110, 0.35], smg: [3000, 0.12, 0.45, 170, 0.15],
    rifle: [1800, 0.22, 0.7, 120, 0.3], rifle2: [2100, 0.2, 0.65, 130, 0.28], sniper: [1300, 0.4, 0.9, 90, 0.6], awp: [900, 0.55, 1.0, 70, 0.8],
    shotgun: [1100, 0.35, 0.9, 80, 0.4], mg: [1600, 0.2, 0.7, 110, 0.3],
  };
  const STEP = { sand: ['lowpass', 900, 0.1, 0.35], concrete: ['bandpass', 2200, 0.06, 0.45], metal: ['bandpass', 3200, 0.08, 0.4], wood: ['lowpass', 1400, 0.09, 0.5] };

  // Сыграть звук. opts: pos (точка мира), weapon, surface, near (звук своего бойца - без панорамы)
  A.play = function (kind, opts) {
    opts = opts || {};
    A.played.push(kind); if (A.played.length > 50) A.played.shift();
    if (!A.ctx || A.muted || A.suspendedByPause) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const pos = opts.near ? null : opts.pos;
    // далёкие звуки не синтезируем
    if (pos) { const d = Math.hypot(pos.x - A.listener.x, pos.z - A.listener.z); if (d > 90) return; }
    try {
      switch (kind) {
        case 'shot': {
          const v = GUN[opts.model] || GUN.rifle, dst = out('effects', pos, 6);
          noiseBurst(dst, t, v[1], 'lowpass', v[0], 0.8, v[2]);
          noiseBurst(dst, t, v[1] * 0.5, 'highpass', 3500, 0.5, v[2] * 0.35);
          tone(dst, t, v[1] * 0.8, 'sine', v[3], v[3] * 0.4, v[2] * 0.8);
          noiseBurst(dst, t + 0.03, v[4] + 0.2, 'lowpass', 500, 0.5, v[2] * 0.12, 0.05);
          break;
        }
        case 'empty': tone(out('effects', pos), t, 0.04, 'square', 900, 0, 0.1); break;
        case 'reload': {
          const dst = out('effects', pos, 2);
          tone(dst, t, 0.05, 'square', 700, 0, 0.12); noiseBurst(dst, t + 0.02, 0.1, 'bandpass', 3000, 3, 0.2);
          tone(dst, t + (opts.len || 1) * 0.55, 0.05, 'square', 500, 0, 0.12); noiseBurst(dst, t + (opts.len || 1) * 0.6, 0.12, 'bandpass', 2400, 3, 0.25);
          tone(dst, t + (opts.len || 1) * 0.9, 0.06, 'square', 1100, 0, 0.12);
          break;
        }
        case 'step': {
          const s = STEP[opts.surface] || STEP.concrete, dst = out('steps', pos, 2.5);
          noiseBurst(dst, t, s[2], s[0], s[1], 1.2, s[3] * (opts.vol || 1));
          if (opts.surface === 'metal') tone(dst, t, 0.12, 'triangle', 1200 + Math.random() * 300, 900, 0.08);
          if (opts.surface === 'wood') tone(dst, t, 0.08, 'sine', 170, 120, 0.2);
          break;
        }
        case 'land': noiseBurst(out('steps', pos, 2.5), t, 0.14, 'lowpass', 700, 1, 0.5); break;
        case 'knife': noiseBurst(out('effects', pos, 2), t, 0.18, 'bandpass', 2600, 2, 0.3, 0.05); break;
        case 'knifeHeavy': noiseBurst(out('effects', pos, 2), t, 0.3, 'bandpass', 1600, 2, 0.4, 0.08); break;
        case 'hit': tone(out('ui', null), t, 0.05, 'triangle', 1600, 1300, 0.12); break;
        case 'headshot': { const d = out('ui', null); tone(d, t, 0.2, 'sine', 2800, 2600, 0.18); tone(d, t, 0.15, 'triangle', 4200, 0, 0.06); break; }
        case 'hurt': noiseBurst(out('effects', null), t, 0.12, 'lowpass', 400, 1, 0.4); break;
        case 'death': noiseBurst(out('effects', pos, 3), t, 0.3, 'lowpass', 600, 1, 0.4); break;
        case 'beep': tone(out('effects', pos, 5), t, 0.08, 'sine', 1900, 0, 0.35); break;
        case 'plantBeep': tone(out('effects', pos, 3), t, 0.05, 'square', 1200 + (opts.i || 0) * 90, 0, 0.12); break;
        case 'planted': { const d = out('ui', null); tone(d, t, 0.25, 'triangle', 660, 0, 0.25); tone(d, t + 0.25, 0.4, 'triangle', 440, 0, 0.25); break; }
        case 'defused': { const d = out('ui', null); tone(d, t, 0.2, 'triangle', 520, 0, 0.25); tone(d, t + 0.2, 0.4, 'triangle', 780, 0, 0.25); break; }
        case 'explode': { const d = out('effects', pos, 12); noiseBurst(d, t, 1.6, 'lowpass', 420, 0.7, 1.4, 0.01); tone(d, t, 0.9, 'sine', 70, 28, 1.1); break; }
        case 'bombExplode': { const d = out('effects', null); noiseBurst(d, t, 3.0, 'lowpass', 300, 0.7, 1.6, 0.02); tone(d, t, 2.0, 'sine', 55, 20, 1.3); break; }
        case 'flash': { const d = out('effects', pos, 10); noiseBurst(d, t, 0.5, 'highpass', 2500, 0.7, 0.9); break; }
        case 'ringing': tone(out('effects', null), t, opts.len || 2, 'sine', 3400, 3300, 0.06, 0.01); break;
        case 'smoke': noiseBurst(out('effects', pos, 4), t, 2.2, 'lowpass', 1400, 0.5, 0.35, 0.2); break;
        case 'fire': { const d = out('effects', pos, 4); for (let i = 0; i < 6; i++) noiseBurst(d, t + i * 0.12, 0.2, 'bandpass', 900 + i * 200, 1, 0.3); break; }
        case 'throw': noiseBurst(out('effects', pos, 2), t, 0.15, 'bandpass', 1200, 1.5, 0.25, 0.03); break;
        case 'bounce': tone(out('effects', pos, 2), t, 0.06, 'triangle', 800, 500, 0.15); break;
        case 'pickup': tone(out('ui', null), t, 0.08, 'square', 900, 1200, 0.08); break;
        case 'buy': { const d = out('ui', null); tone(d, t, 0.06, 'square', 1000, 0, 0.08); tone(d, t + 0.07, 0.08, 'square', 1500, 0, 0.08); break; }
        case 'deny': tone(out('ui', null), t, 0.15, 'square', 180, 150, 0.12); break;
        case 'click': tone(out('ui', null), t, 0.03, 'square', 1400, 0, 0.05); break;
        case 'hover': tone(out('ui', null), t, 0.02, 'sine', 2200, 0, 0.03); break;
        case 'tick': tone(out('ui', null), t, 0.025, 'square', 2600 + Math.random() * 200, 0, 0.06); break;
        case 'reveal': { const d = out('ui', null); [523, 659, 784, 1046].forEach((f, i) => tone(d, t + i * 0.08, 0.5, 'triangle', f, 0, 0.18)); break; }
        case 'roundStart': { const d = out('ui', null); tone(d, t, 0.15, 'triangle', 440, 0, 0.15); tone(d, t + 0.15, 0.25, 'triangle', 660, 0, 0.15); break; }
        case 'win': { const d = out('ui', null); [392, 494, 587, 784].forEach((f, i) => tone(d, t + i * 0.12, 0.45, 'triangle', f, 0, 0.18)); break; }
        case 'lose': { const d = out('ui', null); [392, 330, 262].forEach((f, i) => tone(d, t + i * 0.18, 0.5, 'triangle', f, 0, 0.16)); break; }
        default: break;
      }
    } catch (e) { /* звук недоступен */ }
  };

  // Фоновая музыка меню: медленные аккорды с плавающим фильтром
  A.startMusic = function () {
    if (!A.ctx || A.music) return;
    const ctx = A.ctx, filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    filter.connect(g).connect(A.buses.music);
    g.gain.setTargetAtTime(0.22, ctx.currentTime, 1.5);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 380; lfo.connect(lg).connect(filter.frequency); lfo.start();
    const chords = [[110, 164.8, 220, 261.6], [98, 146.8, 196, 246.9], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 233.1]];
    const oscs = [];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = k ? 7 : -7;
      const og = ctx.createGain(); og.gain.value = 0.06; o.connect(og).connect(filter); o.start(); oscs.push(o);
    }
    let ci = 0;
    const setChord = () => { const ch = chords[ci++ % chords.length]; oscs.forEach((o, i) => o.frequency.setTargetAtTime(ch[i >> 1], ctx.currentTime, 0.8)); };
    setChord();
    const timer = setInterval(setChord, 8000);
    A.music = { g, oscs, lfo, timer };
  };
  A.stopMusic = function () {
    if (!A.music || !A.ctx) return;
    const m = A.music; A.music = null;
    clearInterval(m.timer);
    m.g.gain.setTargetAtTime(0.0001, A.ctx.currentTime, 0.4);
    setTimeout(() => { for (const o of m.oscs) o.stop(); m.lfo.stop(); }, 1500);
  };
})();

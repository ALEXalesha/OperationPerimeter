// Текстуры рисуются кодом на холсте: песок, песчаник, штукатурка, бетон, плитка, асфальт,
// доски, ящик, контейнер, профнастил. Облики оружия - тоже узоры на холсте. Семена постоянные,
// поэтому картинка одна и та же при каждом запуске.
(function () {
  'use strict';
  const TAC = window.TAC;

  // Сглаженный шум по решётке + несколько октав
  function makeNoise(seed) {
    const rng = TAC.makeRng(seed);
    const N = 256, perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rng(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[256 + i] = perm[i];
    const sm = (t) => t * t * (3 - 2 * t);
    function n2(x, y, period) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const p = period || N;
      const X0 = ((xi % p) + p) % p, Y0 = ((yi % p) + p) % p, X1 = (X0 + 1) % p, Y1 = (Y0 + 1) % p;
      const a = val[perm[(X0 & 255) + perm[Y0 & 255]]], b = val[perm[(X1 & 255) + perm[Y0 & 255]]];
      const c = val[perm[(X0 & 255) + perm[Y1 & 255]]], d = val[perm[(X1 & 255) + perm[Y1 & 255]]];
      const u = sm(xf), v = sm(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    function fbm(x, y, oct, period) {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let i = 0; i < oct; i++) { s += amp * n2(x * f, y * f, period ? period * f : 0); norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    }
    return { n2, fbm, rng };
  }
  TAC.makeNoise = makeNoise;

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // Попиксельная заливка: fn(x, y) -> [r, g, b]
  function paint(size, fn, h) {
    const c = canvas(size, h || size), ctx = c.getContext('2d');
    const img = ctx.createImageData(size, h || size), d = img.data;
    for (let y = 0; y < (h || size); y++) for (let x = 0; x < size; x++) {
      const col = fn(x, y), k = (y * size + x) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  const GEN = {
    sand(S) {
      const nz = makeNoise(11), P = S / 32;
      return paint(S, (x, y) => {
        const f = nz.fbm(x / 32 * (S / 256), y / 32 * (S / 256), 4, P);
        const r = nz.rng();
        const ripple = Math.sin((x * 0.09 + nz.n2(x / 50, y / 50, S / 50) * 4) * 1.3) * 0.03;
        const k = 0.82 + f * 0.3 + ripple + (r > 0.97 ? -0.12 : r < 0.02 ? 0.1 : 0);
        return [cl(206 * k), cl(176 * k), cl(128 * k)];
      });
    },
    sandstone(S) {
      const nz = makeNoise(12), rows = 8, bh = S / rows;
      const tone = []; for (let i = 0; i < 64; i++) tone.push(0.86 + nz.rng() * 0.22);
      return paint(S, (x, y) => {
        const row = Math.floor(y / bh), off = (row % 2) * (S / 8);
        const bw = S / 4, col = Math.floor(((x + off) % S) / bw);
        const lx = ((x + off) % S) % bw, ly = y % bh;
        const mortar = lx < 3 || ly < 3;
        const f = nz.fbm(x / 24, y / 24, 4, S / 24);
        let k = tone[(row * 4 + col) % 64] * (0.82 + f * 0.32);
        if (mortar) k *= 0.62;
        if (ly > bh - 4 && !mortar) k *= 0.9;
        return [cl(196 * k), cl(160 * k), cl(112 * k)];
      });
    },
    plaster(S) {
      const nz = makeNoise(13);
      return paint(S, (x, y) => {
        const f = nz.fbm(x / 40, y / 40, 5, S / 40), g = nz.fbm(x / 9 + 50, y / 9, 2, S / 9);
        let k = 0.78 + f * 0.3 + g * 0.06;
        const crack = Math.abs(nz.fbm(x / 30 + 9, y / 30 + 3, 3, S / 30) - 0.5) < 0.008 ? 0.75 : 1;
        k *= crack;
        const stain = y > S * 0.8 ? 1 - (y - S * 0.8) / S * 0.8 : 1;
        return [cl(214 * k * stain), cl(198 * k * stain), cl(170 * k * stain)];
      });
    },
    concrete(S) {
      const nz = makeNoise(14);
      return paint(S, (x, y) => {
        const f = nz.fbm(x / 30, y / 30, 5, S / 30);
        let k = 0.72 + f * 0.36;
        if (x % (S / 2) < 2 || y % (S / 2) < 2) k *= 0.7;
        const hole = nz.rng() > 0.996 ? 0.6 : 1;
        return [cl(150 * k * hole), cl(150 * k * hole), cl(146 * k * hole)];
      });
    },
    tiles(S) {
      const nz = makeNoise(15), n = 4, ts = S / n;
      const tone = []; for (let i = 0; i < 16; i++) tone.push(0.88 + nz.rng() * 0.16);
      return paint(S, (x, y) => {
        const tx = Math.floor(x / ts), ty = Math.floor(y / ts), lx = x % ts, ly = y % ts;
        const grout = lx < 3 || ly < 3;
        const f = nz.fbm(x / 20, y / 20, 3, S / 20);
        let k = tone[ty * n + tx] * (0.86 + f * 0.2);
        if (grout) k *= 0.6;
        return [cl(188 * k), cl(172 * k), cl(146 * k)];
      });
    },
    asphalt(S) {
      const nz = makeNoise(16);
      return paint(S, (x, y) => {
        const f = nz.fbm(x / 20, y / 20, 4, S / 20), r = nz.rng();
        let k = 0.75 + f * 0.35 + (r > 0.9 ? 0.15 : 0) - (r < 0.05 ? 0.12 : 0);
        return [cl(78 * k), cl(80 * k), cl(84 * k)];
      });
    },
    planks(S) {
      const nz = makeNoise(17), n = 6, ph = S / n;
      const tone = []; for (let i = 0; i < n; i++) tone.push(0.82 + nz.rng() * 0.25);
      return paint(S, (x, y) => {
        const row = Math.floor(y / ph), ly = y % ph;
        const grain = Math.sin((x / S) * Math.PI * 2 * 3 + nz.fbm(x / 60, y / 8 + row * 7, 3) * 8) * 0.06;
        let k = tone[row] * (0.88 + grain + nz.fbm(x / 12, y / 12, 2) * 0.1);
        if (ly < 2) k *= 0.45;
        if ((x + row * 97) % S < 2) k *= 0.55;
        return [cl(150 * k), cl(112 * k), cl(74 * k)];
      });
    },
    crate(S) {
      const nz = makeNoise(18), fr = S * 0.1;
      return paint(S, (x, y) => {
        const inFrame = x < fr || y < fr || x > S - fr || y > S - fr;
        const diag = Math.abs(x - y) < fr * 0.55 || Math.abs(x - (S - y)) < 0;
        const planks = Math.floor(x / (S / 5));
        const grain = Math.sin(y * 0.15 + nz.fbm(x / 40, y / 8, 3) * 6) * 0.05;
        let k = 0.9 + grain + nz.fbm(x / 16, y / 16, 3) * 0.12;
        if (inFrame || diag) k *= 1.08; else k *= 0.92 - (planks % 2) * 0.05;
        if (!inFrame && !diag && x % (S / 5) < 2) k *= 0.6;
        if ((inFrame || diag) && (x === Math.round(fr) || y === Math.round(fr))) k *= 0.7;
        return [cl(176 * k), cl(132 * k), cl(78 * k)];
      });
    },
    container(S) {
      const nz = makeNoise(19);
      return paint(S, (x, y) => {
        const rib = Math.sin(x / S * Math.PI * 2 * 12);
        let k = 0.8 + rib * 0.12 + nz.fbm(x / 24, y / 24, 3) * 0.1;
        if (y < S * 0.06 || y > S * 0.94) k = 0.7;
        const rust = nz.fbm(x / 18 + 30, y / 18, 4) > 0.66 ? 0.8 : 1;
        return [cl(235 * k * rust), cl(235 * k * (rust < 1 ? 0.85 : 1)), cl(235 * k * (rust < 1 ? 0.7 : 1))];
      });
    },
    metalwall(S) {
      const nz = makeNoise(20);
      return paint(S, (x, y) => {
        const rib = Math.sin(x / S * Math.PI * 2 * 8);
        let k = 0.76 + (rib > 0.6 ? 0.18 : rib < -0.6 ? -0.1 : 0) + nz.fbm(x / 30, y / 30, 4) * 0.12;
        const dirt = y > S * 0.75 ? 1 - (y - S * 0.75) / S : 1;
        return [cl(128 * k * dirt), cl(140 * k * dirt), cl(146 * k * dirt)];
      });
    },
  };
  const texCache = {};
  TAC.texture = function (name, hi) {
    const key = name + (hi ? '@hi' : '');
    if (texCache[key]) return texCache[key];
    const c = GEN[name](hi ? 256 : 128);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = hi ? 4 : 1;
    t.userData = { name };
    texCache[key] = t;
    return t;
  };
  TAC.textureCanvas = (name) => GEN[name](128);

  // ---------- Облики оружия ----------
  function voronoiCamo(S, H, seed, colors, cells) {
    const nz = makeNoise(seed), pts = [];
    for (let i = 0; i < cells; i++) pts.push([nz.rng() * S, nz.rng() * H, Math.floor(nz.rng() * colors.length)]);
    return paint(S, (x, y) => {
      const wx = x + (nz.fbm(x / 20, y / 20, 3) - 0.5) * 30, wy = y + (nz.fbm(x / 20 + 5, y / 20, 3) - 0.5) * 30;
      let best = 1e9, c = 0;
      for (const p of pts) {
        let dx = Math.abs(wx - p[0]); dx = Math.min(dx, S - dx);
        let dy = Math.abs(wy - p[1]); dy = Math.min(dy, H - dy);
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; c = p[2]; }
      }
      const k = 0.92 + nz.fbm(x / 6, y / 6, 2) * 0.12;
      const col = colors[c];
      return [cl(col[0] * k), cl(col[1] * k), cl(col[2] * k)];
    }, H);
  }
  function grad(stops, t) {
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], u = (t - a[0]) / (b[0] - a[0] || 1);
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + (b[3] - a[3]) * u];
      }
    }
    const l = stops[stops.length - 1]; return [l[1], l[2], l[3]];
  }
  const PAT = {
    factory: (S, H) => { const nz = makeNoise(40); return paint(S, (x, y) => { const k = 0.85 + nz.fbm(x / 10, y / 10, 3) * 0.2; return [cl(58 * k), cl(60 * k), cl(64 * k)]; }, H); },
    sand_camo: (S, H) => voronoiCamo(S, H, 41, [[196, 170, 120], [160, 128, 84], [120, 96, 64], [212, 196, 150]], 26),
    forest_camo: (S, H) => voronoiCamo(S, H, 42, [[74, 92, 52], [48, 62, 36], [110, 104, 70], [32, 38, 28]], 28),
    arctic: (S, H) => voronoiCamo(S, H, 43, [[232, 236, 240], [180, 188, 198], [140, 150, 164], [210, 216, 224]], 24),
    urban_pixel: (S, H) => { const nz = makeNoise(44); const cols = [[92, 98, 110], [140, 148, 160], [58, 64, 76], [180, 186, 196]]; return paint(S, (x, y) => { const px = Math.floor(x / 8), py = Math.floor(y / 8); const v = nz.fbm(px / 4, py / 4, 3); return cols[Math.min(3, Math.floor(v * 4.4))]; }, H); },
    carbon: (S, H) => paint(S, (x, y) => { const cx = Math.floor(x / 6), cy = Math.floor(y / 6); const weave = ((cx + cy) % 2) ? Math.abs(Math.sin(x / 6 * Math.PI)) : Math.abs(Math.sin(y / 6 * Math.PI)); const k = 30 + weave * 40; return [k, k, k + 6]; }, H),
    ocean: (S, H) => { const nz = makeNoise(45); return paint(S, (x, y) => { const w = Math.sin(x / 9 + nz.fbm(x / 30, y / 30, 3) * 9) * 0.5 + 0.5; const c = grad([[0, 10, 40, 90], [0.6, 30, 120, 190], [1, 150, 230, 250]], (w * 0.6 + y / H * 0.4)); return [cl(c[0]), cl(c[1]), cl(c[2])]; }, H); },
    zebra: (S, H) => { const nz = makeNoise(46); return paint(S, (x, y) => { const v = Math.sin((x + nz.fbm(x / 25, y / 25, 3) * 50) / 7); return v > 0.1 ? [236, 236, 230] : [20, 20, 22]; }, H); },
    circuit: (S, H) => { const nz = makeNoise(47); const c = canvas(S, H), g = c.getContext('2d'); g.fillStyle = '#0d3b24'; g.fillRect(0, 0, S, H); g.strokeStyle = '#3dff9a'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { let x = Math.floor(nz.rng() * S / 8) * 8, y = Math.floor(nz.rng() * H / 8) * 8; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { if (nz.rng() < 0.5) x += (nz.rng() < 0.5 ? -1 : 1) * 16; else y += (nz.rng() < 0.5 ? -1 : 1) * 16; g.lineTo(x, y); } g.stroke(); g.fillStyle = '#b6ffd6'; g.fillRect(x - 2, y - 2, 4, 4); } return c; },
    tiger: (S, H) => { const nz = makeNoise(48); return paint(S, (x, y) => { const v = Math.sin((y + x * 0.3 + nz.fbm(x / 18, y / 18, 4) * 60) / 6); const base = [230, 130, 30]; return v > 0.55 ? [25, 18, 12] : [cl(base[0] - y * 0.2), base[1], base[2]]; }, H); },
    marble: (S, H) => { const nz = makeNoise(49); return paint(S, (x, y) => { const v = Math.abs(Math.sin((x + y) / 20 + nz.fbm(x / 30, y / 30, 5) * 10)); const k = 170 + v * 80; return [cl(k), cl(k - 6), cl(k - 2)]; }, H); },
    hex: (S, H) => { const c = canvas(S, H), g = c.getContext('2d'); const bg = g.createLinearGradient(0, 0, S, H); bg.addColorStop(0, '#12102a'); bg.addColorStop(1, '#2a0f3a'); g.fillStyle = bg; g.fillRect(0, 0, S, H); const r = 10; g.lineWidth = 2; for (let yy = -r; yy < H + r; yy += r * 1.5) for (let xx = -r; xx < S + r; xx += r * Math.sqrt(3)) { const ox = ((Math.round(yy / (r * 1.5)) % 2) ? r * Math.sqrt(3) / 2 : 0); g.strokeStyle = `hsl(${180 + (xx / S) * 120}, 100%, 60%)`; g.beginPath(); for (let a = 0; a < 6; a++) { const ang = Math.PI / 6 + a * Math.PI / 3; g.lineTo(xx + ox + Math.cos(ang) * r * 0.9, yy + Math.sin(ang) * r * 0.9); } g.closePath(); g.stroke(); } return c; },
    lava: (S, H) => { const nz = makeNoise(50); return paint(S, (x, y) => { const v = nz.fbm(x / 22, y / 22, 5); const e = Math.abs(v - 0.5); if (e < 0.03) return [255, cl(200 - e * 3000), 40]; if (e < 0.07) return [220, 70, 10]; return [cl(30 + v * 20), cl(20 + v * 10), 18]; }, H); },
    fade: (S, H) => paint(S, (x, y) => { const c = grad([[0, 250, 220, 60], [0.35, 255, 90, 150], [0.7, 150, 60, 230], [1, 60, 40, 200]], x / S * 0.8 + y / H * 0.2); return [cl(c[0]), cl(c[1]), cl(c[2])]; }, H),
    emerald: (S, H) => { const nz = makeNoise(51); return paint(S, (x, y) => { const v = nz.fbm(x / 16, y / 16, 4); const c = grad([[0, 5, 60, 30], [0.5, 20, 170, 90], [1, 150, 255, 190]], v); return [cl(c[0]), cl(c[1]), cl(c[2])]; }, H); },
    gold: (S, H) => { const nz = makeNoise(52); return paint(S, (x, y) => { const eng = Math.sin(x / 4 + Math.sin(y / 9) * 3) * Math.sin(y / 4 + Math.sin(x / 11) * 2); const k = 0.8 + nz.fbm(x / 20, y / 20, 3) * 0.3 + (eng > 0.7 ? -0.25 : 0); return [cl(230 * k), cl(180 * k), cl(70 * k)]; }, H),
  };
  const skinCache = {};
  TAC.skinCanvas = function (pattern) { return PAT[pattern] ? PAT[pattern](128, 64) : PAT.factory(128, 64); };
  TAC.skinTexture = function (pattern) {
    if (skinCache[pattern]) return skinCache[pattern];
    const t = new THREE.CanvasTexture(TAC.skinCanvas(pattern));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.userData = { pattern };
    skinCache[pattern] = t;
    return t;
  };

  // Небо: вертикальный градиент, облака и солнце - развёртка на сферу.
  TAC.skyTexture = function (kind) {
    const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
    const nz = makeNoise(kind === 'overcast' ? 61 : 60);
    const top = kind === 'overcast' ? [96, 118, 142] : [58, 112, 186];
    const hor = kind === 'overcast' ? [196, 206, 214] : [236, 214, 176];
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = Math.min(1, Math.max(0, (y / H - 0.05) / 0.45));
      let r = top[0] + (hor[0] - top[0]) * t, gg = top[1] + (hor[1] - top[1]) * t, b = top[2] + (hor[2] - top[2]) * t;
      if (y < H * 0.5) {
        const cloud = nz.fbm(x / 60, y / 22, 5, W / 60);
        const amt = Math.max(0, cloud - (kind === 'overcast' ? 0.38 : 0.52)) * (kind === 'overcast' ? 1.8 : 2.4) * (1 - t * 0.6);
        r += (250 - r) * amt; gg += (250 - gg) * amt; b += (252 - b) * amt;
      }
      if (y >= H * 0.5) { const k = 0.8; r *= k; gg *= k; b *= k; }
      const k = (y * W + x) * 4; d[k] = cl(r); d[k + 1] = cl(gg); d[k + 2] = cl(b); d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (kind !== 'overcast') {
      const sx = W * 0.62, sy = H * 0.2;
      const rg = g.createRadialGradient(sx, sy, 2, sx, sy, 60);
      rg.addColorStop(0, 'rgba(255,252,235,1)'); rg.addColorStop(0.12, 'rgba(255,240,200,0.9)'); rg.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  };

  // Мягкое пятно для дыма, огня, вспышек
  TAC.blobTexture = (function () {
    let t = null;
    return function () {
      if (t) return t;
      const c = canvas(64, 64), g = c.getContext('2d');
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.45, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      t = new THREE.CanvasTexture(c);
      return t;
    };
  })();
  TAC.smokeTexture = (function () {
    let t = null;
    return function () {
      if (t) return t;
      const S = 128, nz = makeNoise(70), c = canvas(S, S), g = c.getContext('2d');
      const img = g.createImageData(S, S), d = img.data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), r = Math.hypot(dx, dy);
        const f = nz.fbm(x / 18, y / 18, 4);
        const a = Math.max(0, 1 - r) ** 1.3 * (0.55 + f * 0.7);
        const k = (y * S + x) * 4; d[k] = d[k + 1] = d[k + 2] = 200 + f * 50; d[k + 3] = cl(a * 255);
      }
      g.putImageData(img, 0, 0);
      t = new THREE.CanvasTexture(c);
      return t;
    };
  })();
  // Надпись зоны закладки краской на полу
  TAC.letterTexture = function (letter) {
    const c = canvas(128, 128), g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.font = 'bold 96px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(210,40,30,0.85)';
    g.fillText(letter, 64, 70);
    g.globalCompositeOperation = 'destination-out';
    const nz = makeNoise(letter.charCodeAt(0));
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${nz.rng() * 0.6})`; g.fillRect(nz.rng() * 128, nz.rng() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c);
    return t;
  };
})();

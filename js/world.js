// Мир карты: сетка клеток, ящики-препятствия, столкновения, луч (пули и взгляд ботов),
// поиск пути по клеткам для ботов. Логика не зависит от three.js, поэтому её легко проверять.
(function () {
  'use strict';
  const TAC = window.TAC;
  const CELL = 2;
  const SOLID = { '#': 6, '=': 3.6, 'M': 5.6, 'm': 2.8, 'c': 1.0, 'x': 1.1, 'X': 2.2 };
  const FLOORS = { '.': 1, ',': 1, 'r': 1 };
  const ZONES = { A: 1, B: 1, t: 1, u: 1 };
  const STEP = 0.45, EPS = 1e-4;

  const THEMES = {
    sand: { main: 'sandstone', inner: 'plaster', floor1: 'sand', floor2: 'tiles', sky: 'desert', fog: 0xd9c7a3, sun: [0.55, 0.62, 0.38] },
    port: { main: 'concrete', inner: 'metalwall', floor1: 'asphalt', floor2: 'planks', sky: 'overcast', fog: 0xaebccb, sun: [-0.45, 0.66, 0.42] },
    range: { main: 'concrete', inner: 'plaster', floor1: 'sand', floor2: 'tiles', sky: 'desert', fog: 0xcfc6b2, sun: [0.4, 0.7, 0.5] },
  };
  TAC.THEMES = THEMES;
  const SURFACE = { sand: 'sand', tiles: 'concrete', asphalt: 'concrete', planks: 'wood', concrete: 'concrete', crate: 'wood', container: 'metal', metalwall: 'metal', plaster: 'concrete', sandstone: 'concrete' };

  function World(def) {
    this.def = def;
    this.W = def.w; this.H = def.h; this.CELL = CELL;
    this.theme = THEMES[def.theme] || THEMES.sand;
    const n = this.W * this.H;
    this.cell = new Array(n).fill('#');
    this.floor = new Array(n).fill('.');
    this.zone = new Array(n).fill('');
    for (const [ch, x, y, w, h] of def.ops) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
        if (i < 1 || j < 1 || i >= this.W - 1 || j >= this.H - 1) continue;   // край всегда скала
        const k = j * this.W + i;
        if (ZONES[ch]) {
          this.zone[k] = ch;
          if (SOLID[this.cell[k]]) { this.cell[k] = '.'; }
        } else if (ch === '.' || ch === ',') {
          this.cell[k] = ch; this.floor[k] = ch;
        } else if (ch === 'r') {
          if (SOLID[this.cell[k]]) this.floor[k] = '.';
          this.cell[k] = 'r';
        } else {
          if (this.cell[k] === ',' ) this.floor[k] = ',';
          this.cell[k] = ch;
        }
      }
    }
    this.buildBoxes();
    this.buildZones();
    this.stamp = 1;
  }
  TAC.World = World;
  World.CELL = CELL;
  const P = World.prototype;

  P.idx = function (cx, cy) { return cy * this.W + cx; };
  P.inside = function (cx, cy) { return cx >= 0 && cy >= 0 && cx < this.W && cy < this.H; };
  P.charAt = function (cx, cy) { return this.inside(cx, cy) ? this.cell[this.idx(cx, cy)] : '#'; };
  P.walkable = function (cx, cy) { return this.inside(cx, cy) && !!FLOORS[this.cell[this.idx(cx, cy)]]; };
  P.cellOf = function (x, z) { return [Math.floor(x / CELL), Math.floor(z / CELL)]; };
  P.center = function (cx, cy, y) { return { x: (cx + 0.5) * CELL, y: y || 0, z: (cy + 0.5) * CELL }; };
  P.zoneAt = function (x, z) { const [cx, cy] = this.cellOf(x, z); return this.inside(cx, cy) ? this.zone[this.idx(cx, cy)] : ''; };
  P.materialOfFloor = function (x, z) {
    const [cx, cy] = this.cellOf(x, z);
    const f = this.inside(cx, cy) ? this.floor[this.idx(cx, cy)] : '.';
    return f === ',' ? this.theme.floor2 : this.theme.floor1;
  };
  P.surfaceAt = function (x, z, y) {
    if (y > 0.3) {                                  // стоим на ящике или контейнере
      const b = this.boxUnder(x, z, y);
      if (b) return SURFACE[b.mat] || 'concrete';
    }
    return SURFACE[this.materialOfFloor(x, z)] || 'concrete';
  };

  // Сплошные клетки сливаются в прямоугольники: меньше ящиков - быстрее луч и отрисовка.
  P.buildBoxes = function () {
    const W = this.W, H = this.H, t = this.theme;
    const boxes = [];
    const used = new Uint8Array(W * H);
    const matOf = { '#': t.main, '=': t.inner, 'M': 'container', 'm': 'container', 'c': 'concrete' };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x, ch = this.cell[k];
      if (used[k]) continue;
      if (ch === 'x' || ch === 'X') {
        const ins = 0.18, hgt = SOLID[ch];
        boxes.push({ x0: x * CELL + ins, x1: (x + 1) * CELL - ins, y0: 0, y1: hgt, z0: y * CELL + ins, z1: (y + 1) * CELL - ins, mat: 'crate', ch });
        used[k] = 1; continue;
      }
      if (ch === 'r') {
        boxes.push({ x0: x * CELL, x1: (x + 1) * CELL, y0: 3.4, y1: 4.0, z0: y * CELL, z1: (y + 1) * CELL, mat: 'concrete', ch: 'roof', roof: true });
        used[k] = 1; continue;
      }
      if (!matOf[ch]) continue;
      // Контейнеры не сливаем в длину больше 3 клеток: пусть видно отдельные контейнеры.
      let w = 1;
      while (x + w < W && this.cell[k + w] === ch && !used[k + w] && !(ch.toLowerCase() === 'm' && w >= 3)) w++;
      let h = 1;
      outer: while (y + h < H && !(ch.toLowerCase() === 'm' && h >= 3 && w > 1)) {
        for (let i = 0; i < w; i++) { const kk = (y + h) * W + x + i; if (this.cell[kk] !== ch || used[kk]) break outer; }
        if (ch.toLowerCase() === 'm' && w === 1 && h >= 3) break;
        h++;
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used[(y + j) * W + x + i] = 1;
      const hgt = SOLID[ch];
      if (ch === 'M') {                              // два яруса контейнеров
        boxes.push({ x0: x * CELL, x1: (x + w) * CELL, y0: 0, y1: 2.8, z0: y * CELL, z1: (y + h) * CELL, mat: 'container', ch, tint: (x * 7 + y * 3) % 5 });
        boxes.push({ x0: x * CELL + 0.05, x1: (x + w) * CELL - 0.05, y0: 2.8, y1: 5.6, z0: y * CELL + 0.05, z1: (y + h) * CELL - 0.05, mat: 'container', ch, tint: (x * 5 + y * 11 + 2) % 5 });
      } else {
        boxes.push({ x0: x * CELL, x1: (x + w) * CELL, y0: 0, y1: hgt, z0: y * CELL, z1: (y + h) * CELL, mat: matOf[ch], ch, tint: (x * 7 + y * 3) % 5 });
      }
    }
    boxes.forEach((b, i) => { b.id = i; b.s = 0; });
    this.boxes = boxes;
    // Ячейки: какие ящики задевают клетку
    this.cellBoxes = [];
    for (let i = 0; i < W * H; i++) this.cellBoxes.push([]);
    for (const b of boxes) {
      const cx0 = Math.floor(b.x0 / CELL + EPS), cx1 = Math.floor(b.x1 / CELL - EPS);
      const cz0 = Math.floor(b.z0 / CELL + EPS), cz1 = Math.floor(b.z1 / CELL - EPS);
      for (let j = cz0; j <= cz1; j++) for (let i = cx0; i <= cx1; i++) if (this.inside(i, j)) this.cellBoxes[j * W + i].push(b);
    }
    // Высота препятствия в клетке - для запечённых теней и радара
    this.heights = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      let hm = 0;
      for (const b of this.cellBoxes[i]) if (!b.roof) hm = Math.max(hm, b.y1);
      this.heights[i] = hm;
    }
  };

  P.buildZones = function () {
    const z = { A: [], B: [], t: [], u: [], open: [], walk: [] };
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const k = this.idx(x, y);
      if (!this.walkable(x, y)) continue;
      z.walk.push([x, y]);
      if (this.zone[k] && z[this.zone[k]]) z[this.zone[k]].push([x, y]);
      let open = true;
      for (let j = -1; j <= 1 && open; j++) for (let i = -1; i <= 1; i++) if (!this.walkable(x + i, y + j)) { open = false; break; }
      if (open && !this.zone[k]) z.open.push([x, y]);
    }
    this.zones = z;
    const centerOf = (cells) => {
      if (!cells.length) return null;
      let sx = 0, sy = 0;
      for (const c of cells) { sx += c[0]; sy += c[1]; }
      sx /= cells.length; sy /= cells.length;
      let best = cells[0], bd = 1e9;
      for (const c of cells) { const d = (c[0] - sx) ** 2 + (c[1] - sy) ** 2; if (d < bd) { bd = d; best = c; } }
      return best;
    };
    this.siteCenter = { A: centerOf(z.A), B: centerOf(z.B) };
  };

  // ---------- Луч ----------
  function rayBox(ox, oy, oz, ix, iy, iz, b) {
    let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (b.y0 - oy) * iy; t2 = (b.y1 - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.z0 - oz) * iz; t2 = (b.z1 - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0)) return tmin < 0 ? 0 : tmin;
    return -1;
  }
  TAC.rayBox = rayBox;
  const inv = (v) => 1 / (Math.abs(v) < 1e-9 ? (v < 0 ? -1e-9 : 1e-9) : v);

  // Первое препятствие на луче o + d*t (d - единичный), t <= maxT. Пол тоже препятствие.
  P.raycast = function (o, d, maxT) {
    const ix = inv(d.x), iy = inv(d.y), iz = inv(d.z);
    let best = maxT, bestBox = null;
    if (d.y < -1e-6) { const tf = -o.y / d.y; if (tf >= 0 && tf < best) { best = tf; bestBox = 'floor'; } }
    const stamp = ++this.stamp;
    let cx = Math.floor(o.x / CELL), cz = Math.floor(o.z / CELL);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    // луч вдоль оси: по этой оси клетки не меняются (иначе шаг уходит в минус и стены пропускаются)
    const flatX = Math.abs(d.x) < 1e-9, flatZ = Math.abs(d.z) < 1e-9;
    const dX = flatX ? Infinity : Math.abs(CELL / d.x), dZ = flatZ ? Infinity : Math.abs(CELL / d.z);
    let tX = flatX ? Infinity : ((cx + (d.x > 0 ? 1 : 0)) * CELL - o.x) / d.x;
    let tZ = flatZ ? Infinity : ((cz + (d.z > 0 ? 1 : 0)) * CELL - o.z) / d.z;
    let tEnter = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (tEnter > best) break;
      if (this.inside(cx, cz)) {
        const list = this.cellBoxes[cz * this.W + cx];
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b.s === stamp) continue;
          b.s = stamp;
          const t = rayBox(o.x, o.y, o.z, ix, iy, iz, b);
          if (t >= 0 && t < best) { best = t; bestBox = b; }
        }
      } else if (tEnter > 0) break;
      if (tX === Infinity && tZ === Infinity) break;
      if (tX < tZ) { tEnter = tX; tX += dX; cx += sx; } else { tEnter = tZ; tZ += dZ; cz += sz; }
    }
    if (!bestBox) return null;
    const p = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
    let n = { x: 0, y: 1, z: 0 };
    if (bestBox !== 'floor') {
      const b = bestBox;
      const cand = [[Math.abs(p.x - b.x0), -1, 0, 0], [Math.abs(p.x - b.x1), 1, 0, 0], [Math.abs(p.y - b.y0), 0, -1, 0], [Math.abs(p.y - b.y1), 0, 1, 0], [Math.abs(p.z - b.z0), 0, 0, -1], [Math.abs(p.z - b.z1), 0, 0, 1]];
      cand.sort((a, c) => a[0] - c[0]);
      n = { x: cand[0][1], y: cand[0][2], z: cand[0][3] };
    }
    return { t: best, box: bestBox, point: p, normal: n, mat: bestBox === 'floor' ? this.materialOfFloor(p.x, p.z) : bestBox.mat };
  };
  // Свободна ли прямая между точками (для взгляда ботов и взрывов)
  P.clear = function (a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-6) return true;
    const hit = this.raycast(a, { x: dx / L, y: dy / L, z: dz / L }, L);
    return !hit;
  };

  // ---------- Движение с тем, что стоит на пути ----------
  P.boxesNear = function (x0, z0, x1, z1, out) {
    out.length = 0;
    const stamp = ++this.stamp;
    const cx0 = Math.max(0, Math.floor(x0 / CELL)), cx1 = Math.min(this.W - 1, Math.floor(x1 / CELL));
    const cz0 = Math.max(0, Math.floor(z0 / CELL)), cz1 = Math.min(this.H - 1, Math.floor(z1 / CELL));
    for (let j = cz0; j <= cz1; j++) for (let i = cx0; i <= cx1; i++) {
      const list = this.cellBoxes[j * this.W + i];
      for (const b of list) if (b.s !== stamp) { b.s = stamp; out.push(b); }
    }
    return out;
  };
  const tmpList = [];
  function overlaps(b, p, r, h) {
    return b.x0 < p.x + r && b.x1 > p.x - r && b.z0 < p.z + r && b.z1 > p.z - r && b.y0 < p.y + h && b.y1 > p.y + 0.001;
  }
  P.freeAt = function (p, r, h) {
    const list = this.boxesNear(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1, []);
    for (const b of list) if (overlaps(b, p, r, h)) return false;
    return true;
  };
  P.boxUnder = function (x, z, y) {
    const list = this.boxesNear(x - 0.4, z - 0.4, x + 0.4, z + 0.4, []);
    let best = null;
    for (const b of list) if (x > b.x0 - 0.36 && x < b.x1 + 0.36 && z > b.z0 - 0.36 && z < b.z1 + 0.36 && Math.abs(b.y1 - y) < 0.06) best = b;
    return best;
  };

  // Сдвинуть тело (ноги в p, радиус r, рост h) на vel*dt. Возвращает true, если стоит на опоре.
  P.move = function (p, vel, dt, r, h, canStep) {
    const list = this.boxesNear(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1, tmpList);
    const wasGround = p.y <= EPS || this.onGround(p, r, list);
    const self = this;
    function horiz(axis, delta) {
      if (!delta) return;
      p[axis] += delta;
      for (const b of list) {
        if (!overlaps(b, p, r, h)) continue;
        if (canStep && wasGround && b.y1 - p.y <= STEP && b.y1 - p.y > 0) {
          const oy = p.y; p.y = b.y1;
          let ok = true;
          for (const c of list) if (overlaps(c, p, r, h)) { ok = false; break; }
          if (ok) continue;
          p.y = oy;
        }
        if (axis === 'x') p.x = delta > 0 ? b.x0 - r - EPS : b.x1 + r + EPS;
        else p.z = delta > 0 ? b.z0 - r - EPS : b.z1 + r + EPS;
        vel[axis] = 0;
      }
    }
    horiz('x', vel.x * dt);
    horiz('z', vel.z * dt);
    p.y += vel.y * dt;
    let ground = false;
    for (const b of list) {
      if (!overlaps(b, p, r, h)) continue;
      if (vel.y <= 0 && p.y - vel.y * dt >= b.y1 - STEP) { p.y = b.y1; vel.y = 0; ground = true; }
      else if (vel.y > 0) { p.y = b.y0 - h - EPS; vel.y = 0; }
      else { p.y = b.y1; vel.y = 0; ground = true; }
    }
    if (p.y <= 0) { p.y = 0; if (vel.y < 0) vel.y = 0; ground = true; }
    if (!ground) ground = this.onGround(p, r, list);
    void self;
    return ground;
  };
  P.onGround = function (p, r, list) {
    if (p.y <= EPS) return true;
    for (const b of list) {
      if (Math.abs(b.y1 - p.y) < 0.02 && b.x0 < p.x + r && b.x1 > p.x - r && b.z0 < p.z + r && b.z1 > p.z - r) return true;
    }
    return false;
  };

  // ---------- Путь по клеткам (A*) ----------
  P.findPath = function (from, to) {
    const W = this.W;
    let [sx, sy] = this.cellOf(from.x, from.z);
    let [gx, gy] = this.cellOf(to.x, to.z);
    if (!this.walkable(sx, sy)) [sx, sy] = this.nearestWalkable(sx, sy);
    if (!this.walkable(gx, gy)) [gx, gy] = this.nearestWalkable(gx, gy);
    const start = sy * W + sx, goal = gy * W + gx;
    if (start === goal) return [{ x: to.x, z: to.z }];
    const n = W * this.H;
    if (!this._g || this._g.length !== n) { this._g = new Float32Array(n); this._came = new Int32Array(n); this._seen = new Int32Array(n); this._closed = new Int32Array(n); this._gen = 0; }
    const g = this._g, came = this._came, seen = this._seen, closed = this._closed;
    const gen = ++this._gen;
    const heap = [];                     // [f, k]
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (heap[pa][0] <= heap[i][0]) break; [heap[pa], heap[i]] = [heap[i], heap[pa]]; i = pa; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const hfn = (k) => { const x = k % W, y = (k / W) | 0; const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    g[start] = 0; seen[start] = gen; came[start] = -1; push(hfn(start), start);
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k] === gen) continue;
      closed[k] = gen;
      if (k === goal) { found = true; break; }
      const x = k % W, y = (k / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!this.walkable(nx, ny)) continue;
        if (dx && dy && (!this.walkable(x + dx, y) || !this.walkable(x, y + dy))) continue;
        const nk = ny * W + nx;
        if (closed[nk] === gen) continue;
        const cost = g[k] + (dx && dy ? 1.414 : 1) + (this.nearWall(nx, ny) ? 0.35 : 0);
        if (seen[nk] !== gen || cost < g[nk]) { seen[nk] = gen; g[nk] = cost; came[nk] = k; push(cost + hfn(nk), nk); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => this.center(k % W, (k / W) | 0));
    pts[pts.length - 1] = { x: to.x, y: 0, z: to.z };
    // Спрямление: пропускаем точки, если до следующей можно дойти по прямой
    const out = [];
    let i = 0;
    const cur = { x: from.x, z: from.z };
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineWalkable(cur, pts[j], 0.4)) j--;
      out.push({ x: pts[j].x, z: pts[j].z });
      cur.x = pts[j].x; cur.z = pts[j].z;
      i = j + 1;
    }
    return out;
  };
  P.nearWall = function (x, y) {
    if (!this._nw) {
      this._nw = new Uint8Array(this.W * this.H);
      for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
        let near = false;
        for (let b = -1; b <= 1 && !near; b++) for (let a = -1; a <= 1; a++) if (!this.walkable(i + a, j + b)) { near = true; break; }
        this._nw[j * this.W + i] = near ? 1 : 0;
      }
    }
    return this._nw[y * this.W + x] === 1;
  };
  P.nearestWalkable = function (cx, cy) {
    for (let r = 1; r < 8; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (this.walkable(cx + i, cy + j)) return [cx + i, cy + j];
    return [cx, cy];
  };
  P.pointWalkable = function (x, z) { const [cx, cy] = this.cellOf(x, z); return this.walkable(cx, cy); };
  P.lineWalkable = function (a, b, r) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      if (!this.pointWalkable(x - r, z - r) || !this.pointWalkable(x + r, z - r) || !this.pointWalkable(x - r, z + r) || !this.pointWalkable(x + r, z + r)) return false;
    }
    return true;
  };
  P.randomCell = function (rng, list) { const c = rng.pick(list || this.zones.walk); return this.center(c[0], c[1]); };
})();

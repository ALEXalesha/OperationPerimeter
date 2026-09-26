// Отрисовка карты: ящики сливаются в одну сетку на материал, у стен тень у основания
// (цвет вершин), у пола запечённая карта света - тени от солнца и затенение углов.
(function () {
  'use strict';
  const TAC = window.TAC;
  const TINTS = [[0.78, 0.26, 0.2], [0.22, 0.42, 0.7], [0.3, 0.55, 0.32], [0.86, 0.5, 0.18], [0.55, 0.58, 0.6]];
  const TILE = { sandstone: 4, plaster: 4, concrete: 4, metalwall: 3, container: 2.4, sand: 4, tiles: 4, asphalt: 5, planks: 3 };

  function Builder() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  Builder.prototype.quad = function (a, b, c, d, n, uvs, cols) {
    const base = this.pos.length / 3;
    for (const [p, t, k] of [[a, uvs[0], cols[0]], [b, uvs[1], cols[1]], [c, uvs[2], cols[2]], [d, uvs[3], cols[3]]]) {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(t[0], t[1]); this.col.push(k[0], k[1], k[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  Builder.prototype.geometry = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  };

  const AO_BOTTOM = 0.55, AO_MID = 0.93, AO_H = 1.3;
  // Коробка: стороны делятся на полосу у земли (темнее) и верх
  function addBox(B, b, mat, tint) {
    const local = mat === 'crate';
    const s = TILE[mat] || 4;
    const t = tint || [1, 1, 1];
    const cAt = (y) => {
      const kk = y <= 0.01 ? AO_BOTTOM : y <= AO_H + 0.01 ? AO_MID : 1;
      return [t[0] * kk, t[1] * kk, t[2] * kk];
    };
    const { x0, x1, y0, y1, z0, z1 } = b;
    const ys = y0 < 0.01 && y1 > AO_H + 0.2 ? [y0, AO_H, y1] : [y0, y1];
    const yscale = mat === 'crate' ? 1.1 : s;
    // Четыре стороны
    const sides = [
      { n: [0, 0, 1], a: [x0, z1], b: [x1, z1] },
      { n: [0, 0, -1], a: [x1, z0], b: [x0, z0] },
      { n: [1, 0, 0], a: [x1, z1], b: [x1, z0] },
      { n: [-1, 0, 0], a: [x0, z0], b: [x0, z1] },
    ];
    for (const sd of sides) {
      const u0 = local ? 0 : (sd.n[0] ? sd.a[1] : sd.a[0]) / s;
      const u1 = local ? 1 : (sd.n[0] ? sd.b[1] : sd.b[0]) / s;
      for (let i = 0; i + 1 < ys.length; i++) {
        const ya = ys[i], yb = ys[i + 1];
        const va = local ? (ya - y0) / yscale : ya / s, vb = local ? (yb - y0) / yscale : yb / s;
        B.quad([sd.a[0], ya, sd.a[1]], [sd.b[0], ya, sd.b[1]], [sd.b[0], yb, sd.b[1]], [sd.a[0], yb, sd.a[1]], sd.n,
          [[u0, va], [u1, va], [u1, vb], [u0, vb]], [cAt(ya), cAt(ya), cAt(yb), cAt(yb)]);
      }
    }
    // Верх
    const top = [t[0], t[1], t[2]];
    const tu = local ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s], [x0 / s, z0 / s]];
    B.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], tu, [top, top, top, top]);
    if (y0 > 0.05) {                               // низ висящих (крыша, верхний контейнер)
      const dk = [t[0] * 0.5, t[1] * 0.5, t[2] * 0.5];
      B.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 / s, z0 / s], [x1 / s, z0 / s], [x1 / s, z1 / s], [x0 / s, z1 / s]], [dk, dk, dk, dk]);
    }
  }

  // Карта света пола: 8 точек на клетку. Солнечная тень - шаг по лучу к солнцу, затенение углов - соседи.
  function bakeLightmap(world, sunDir, withSun) {
    const LM = 8, W = world.W * LM, H = world.H * LM, C = world.CELL;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
    const hAt = (x, z) => {
      const cx = Math.floor(x / C), cz = Math.floor(z / C);
      if (cx < 0 || cz < 0 || cx >= world.W || cz >= world.H) return 6;
      const ch = world.cell[cz * world.W + cx];
      if (ch === 'x' || ch === 'X') {             // ящик меньше клетки
        const lx = x - cx * C, lz = z - cz * C;
        if (lx < 0.18 || lx > C - 0.18 || lz < 0.18 || lz > C - 0.18) return 0;
      }
      return world.heights[cz * world.W + cx];
    };
    const roofAt = (x, z) => { const cx = Math.floor(x / C), cz = Math.floor(z / C); return cx >= 0 && cz >= 0 && cx < world.W && cz < world.H && world.cell[cz * world.W + cx] === 'r'; };
    const L = Math.hypot(sunDir[0], sunDir[1], sunDir[2]);
    const sx = sunDir[0] / L, sy = sunDir[1] / L, sz = sunDir[2] / L;
    const vals = new Float32Array(W * H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / LM * C, z = (py + 0.5) / LM * C;
      let lit = 1;
      if (withSun) {
        for (let t = 0.2; t < 16; t += 0.2) {
          const qx = x + sx * t, qy = sy * t, qz = z + sz * t;
          if (qy > 6.2) break;
          if (hAt(qx, qz) > qy) { lit = 0; break; }
          if (qy > 3.4 && qy < 4.0 && roofAt(qx, qz)) { lit = 0; break; }
        }
      }
      let occ = 0, cnt = 0;
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4;
        for (const r of [0.45, 0.9, 1.5]) {
          const hh = hAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
          occ += hh > 0.3 ? (r < 0.5 ? 1.4 : r < 1 ? 1 : 0.6) : 0; cnt++;
        }
      }
      let ao = 1 - Math.min(0.55, occ / cnt * 0.9);
      if (roofAt(x, z)) ao *= 0.62;
      vals[py * W + px] = withSun ? (0.52 + 0.48 * lit) * ao : ao;
    }
    // лёгкое размытие краёв теней
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      let s = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const xx = px + i, yy = py + j;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += vals[yy * W + xx]; n++; }
      }
      const v = Math.round(Math.min(1, s / n) * 255), k = (py * W + px) * 4;
      d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.userData = { canvas: c };
    return tex;
  }

  // Строит всё, что видно на карте. Возвращает группу и управление качеством.
  TAC.buildMapMeshes = function (world, opts) {
    opts = opts || {};
    const hi = opts.textures !== 'low';
    const group = new THREE.Group();
    group.name = 'map';
    const th = world.theme;
    const builders = {};
    const getB = (m) => (builders[m] = builders[m] || new Builder());
    for (const b of world.boxes) {
      const tint = b.mat === 'container' ? TINTS[b.tint || 0] : null;
      addBox(getB(b.mat), b, b.mat, tint);
    }
    const mats = {};
    for (const m of Object.keys(builders)) {
      const mat = new THREE.MeshLambertMaterial({ map: TAC.texture(m, hi), vertexColors: true });
      mats[m] = mat;
      const mesh = new THREE.Mesh(builders[m].geometry(), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = 'box-' + m;
      group.add(mesh);
    }
    // Пол: квад на клетку, uv2 - для карты света
    const floorB = { f1: new Builder(), f2: new Builder() };
    const C = world.CELL, WW = world.W * C, HH = world.H * C;
    const white = [1, 1, 1];
    for (let y = 0; y < world.H; y++) for (let x = 0; x < world.W; x++) {
      const k = y * world.W + x, ch = world.cell[k];
      if (ch === '#' || ch === '=' || ch === 'M') continue;
      const B = world.floor[k] === ',' ? floorB.f2 : floorB.f1;
      const mat = world.floor[k] === ',' ? th.floor2 : th.floor1, s = TILE[mat] || 4;
      const x0 = x * C, x1 = x0 + C, z0 = y * C, z1 = z0 + C;
      B.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [[x0 / s, -z1 / s], [x1 / s, -z1 / s], [x1 / s, -z0 / s], [x0 / s, -z0 / s]], [white, white, white, white]);
      B.uv2 = B.uv2 || [];
      B.uv2.push(x0 / WW, 1 - z1 / HH, x1 / WW, 1 - z1 / HH, x1 / WW, 1 - z0 / HH, x0 / WW, 1 - z0 / HH);
    }
    const lmSun = bakeLightmap(world, th.sun, true);
    const lmAO = bakeLightmap(world, th.sun, false);
    const floorMeshes = [];
    for (const key of ['f1', 'f2']) {
      const B = floorB[key];
      if (!B.pos.length) continue;
      const geo = B.geometry();
      geo.setAttribute('uv2', new THREE.Float32BufferAttribute(B.uv2, 2));
      const tex = TAC.texture(key === 'f1' ? th.floor1 : th.floor2, hi);
      const baked = new THREE.MeshBasicMaterial({ map: tex, lightMap: lmSun, lightMapIntensity: 1.05 });
      const live = new THREE.MeshLambertMaterial({ map: tex, lightMap: lmAO, lightMapIntensity: 0.55 });
      const mesh = new THREE.Mesh(geo, baked);
      mesh.receiveShadow = true;
      mesh.userData = { baked, live };
      mesh.name = 'floor-' + key;
      floorMeshes.push(mesh);
      group.add(mesh);
    }
    // Буквы зон
    for (const L of ['A', 'B']) {
      const cc = world.siteCenter[L];
      if (!cc) continue;
      const p = world.center(cc[0], cc[1]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: TAC.letterTexture(L), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x + 2, 0.02, p.z + 2);
      m.name = 'site-' + L;
      group.add(m);
    }
    // Небо - сфера вокруг камеры, рисуется первой
    const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.MeshBasicMaterial({ map: TAC.skyTexture(th.sky), side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    sky.name = 'sky';
    group.add(sky);
    // Свет
    const hemi = new THREE.HemisphereLight(th.sky === 'overcast' ? 0xcfdcea : 0xfff0d8, 0x6a5a48, 0.78);
    const sun = new THREE.DirectionalLight(th.sky === 'overcast' ? 0xf2f4ff : 0xfff0d0, 0.78);
    const center = { x: WW / 2, z: HH / 2 };
    sun.position.set(center.x + th.sun[0] * 60, th.sun[1] * 60, center.z + th.sun[2] * 60);
    sun.target.position.set(center.x, 0, center.z);
    sun.shadow.mapSize.set(2048, 2048);
    const ext = Math.max(WW, HH) * 0.62;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 160 });
    sun.shadow.bias = -0.0008;
    group.add(hemi, sun, sun.target);
    const fog = new THREE.Fog(th.fog, 30, 160);
    return {
      group, sky, sun, hemi, fog, floorMeshes, mats, lightmap: lmSun,
      setShadows(on) {
        sun.castShadow = !!on;
        for (const m of floorMeshes) m.material = on ? m.userData.live : m.userData.baked;
      },
      setDistance(dist) { fog.near = Math.max(10, dist * 0.35); fog.far = dist; },
      setBrightness(k) {
        hemi.intensity = 0.78 * k; sun.intensity = 0.78 * k;
        for (const m of floorMeshes) { m.userData.baked.lightMapIntensity = 1.05 * k; m.userData.live.lightMapIntensity = 0.55 * k; }
      },
      dispose() {
        group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        lmSun.dispose(); lmAO.dispose();
      },
    };
  };

  // Карта сверху для радара и карточек выбора: клетки в цвета.
  TAC.drawMapPreview = function (world, px, opts) {
    opts = opts || {};
    const c = document.createElement('canvas');
    c.width = world.W * px; c.height = world.H * px;
    const g = c.getContext('2d');
    for (let y = 0; y < world.H; y++) for (let x = 0; x < world.W; x++) {
      const k = y * world.W + x, ch = world.cell[k], z = world.zone[k];
      let col;
      if (ch === '#') col = opts.radar ? 'rgba(0,0,0,0)' : '#1a1d22';
      else if (ch === '=') col = '#5a6068';
      else if ('MmxXc'.includes(ch)) col = '#7d858e';
      else if (z === 'A' || z === 'B') col = opts.radar ? '#7a5b4b' : '#8a5a48';
      else if (ch === 'r') col = '#566069';
      else col = world.floor[k] === ',' ? '#6d7680' : '#606a74';
      g.fillStyle = col;
      g.fillRect(x * px, y * px, px, px);
    }
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = `bold ${px * 3}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of ['A', 'B']) {
      const cc = world.siteCenter[L];
      if (cc) g.fillText(L, (cc[0] + 0.5) * px, (cc[1] + 0.5) * px);
    }
    return c;
  };
})();

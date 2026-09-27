// Бойцы (игрок и боты): состояние, зоны попадания (голова, грудь, живот, ноги), модель из коробок.
(function () {
  'use strict';
  const TAC = window.TAC;
  const STAND_H = 1.8, CROUCH_H = 1.3, RADIUS = 0.35;
  TAC.STAND_H = STAND_H; TAC.CROUCH_H = CROUCH_H; TAC.RADIUS = RADIUS;

  let nextId = 1;
  // номера бойцов - свои в каждом матче, иначе поведение ботов зависело бы от прошлых матчей
  TAC.resetAgentIds = () => { nextId = 1; };
  function Agent(o) {
    this.id = nextId++;
    this.name = o.name || 'Игрок';
    this.team = o.team || null;
    this.isBot = !!o.isBot;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.crouch = 0;               // 0 стоит .. 1 присел (плавно)
    this.crouching = false; this.walking = false;
    this.onGround = true;
    this.hp = 100; this.armor = 0; this.helmet = false; this.kit = false;
    this.money = TAC.ECON.start;
    this.alive = true;
    this.inv = { primary: null, secondary: null, knife: TAC.makeWeapon('knife'), grenades: [], bomb: false };
    this.slot = 'knife'; this.lastSlot = 'knife';
    this.fire = { next: 0, spray: 0, lastShot: -10, punchX: 0, punchY: 0, reload: 0, draw: 0, scope: 0, trigger: false, held: false, inspect: 0, heavy: false };
    this.stats = { k: 0, d: 0, a: 0, mvp: 0, score: 0, hs: 0, roundKills: 0, dmgTo: {} };
    this.flash = 0; this.flashMax = 0;
    this.stepDist = 0; this.stepSide = 0;
    this.spawnProtect = 0;
    this.deathTime = 0;
    this.color = o.color || null;
  }
  TAC.Agent = Agent;
  Agent.prototype.height = function () { return STAND_H - (STAND_H - CROUCH_H) * this.crouch; };
  Agent.prototype.eyeY = function () { return this.height() - 0.16; };
  Agent.prototype.eye = function () { return { x: this.pos.x, y: this.pos.y + this.eyeY(), z: this.pos.z }; };
  Agent.prototype.weapon = function () {
    const s = this.slot;
    if (s === 'primary') return this.inv.primary;
    if (s === 'secondary') return this.inv.secondary;
    if (s === 'grenade') return this.inv.grenades[0] ? TAC.makeWeapon(this.inv.grenades[0]) : null;
    if (s === 'bomb') return this.inv.bomb ? TAC.BOMB_ITEM : null;
    return this.inv.knife;
  };
  Agent.prototype.weaponDef = function () { const w = this.weapon(); return w ? w.def : TAC.WEAPONS.knife; };
  Agent.prototype.maxSpeed = function () {
    const def = this.weaponDef();
    let s = def.speed || 6;
    if (this.fire.scope > 0) s *= 0.55;
    if (this.crouch > 0.5) s *= 0.34;
    else if (this.walking) s *= 0.52;
    return s;
  };

  TAC.makeWeapon = function (id, skin) {
    const def = TAC.WEAPONS[id];
    return { id, def, mag: def.mag || 0, reserve: def.reserve || 0, skin: skin || null };
  };
  TAC.BOMB_ITEM = { id: 'bomb', def: null, mag: 0, reserve: 0 };
  Object.defineProperty(TAC.BOMB_ITEM, 'def', { get: () => TAC.WEAPONS.bomb });

  // ---------- Зоны попадания ----------
  // Высоты для стоящего (1.8 м); присевший сжимается пропорционально.
  const ZONE_BOXES = [
    { zone: 'legs', y0: 0, y1: 0.86, half: 0.19 },
    { zone: 'stomach', y0: 0.86, y1: 1.08, half: 0.2 },
    { zone: 'chest', y0: 1.08, y1: 1.52, half: 0.24 },
  ];
  const HEAD_Y = 1.66, HEAD_R = 0.15;
  TAC.ZONE_BOXES = ZONE_BOXES;
  // Луч o + d*t против бойца. Возвращает { t, zone } ближайшей зоны или null.
  TAC.rayAgent = function (o, d, maxT, a) {
    const k = a.height() / STAND_H;
    const px = a.pos.x, py = a.pos.y, pz = a.pos.z;
    // быстрый отсев по охватывающему цилиндру
    const ox = o.x - px, oz = o.z - pz;
    const b = ox * d.x + oz * d.z, dd = d.x * d.x + d.z * d.z;
    if (dd > 1e-9) {
      const c = ox * ox + oz * oz - 0.5 * 0.5;
      const disc = b * b - dd * c;
      if (disc < 0) return null;
    }
    let best = maxT, zone = null;
    // голова - шар
    const hy = py + HEAD_Y * k;
    const lx = o.x - px, ly = o.y - hy, lz = o.z - pz;
    const B = lx * d.x + ly * d.y + lz * d.z, Cc = lx * lx + ly * ly + lz * lz - HEAD_R * HEAD_R;
    const disc = B * B - Cc;
    if (disc >= 0) {
      const t = -B - Math.sqrt(disc);
      if (t >= 0 && t < best) { best = t; zone = 'head'; }
    }
    const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
    for (const zb of ZONE_BOXES) {
      const box = { x0: px - zb.half, x1: px + zb.half, y0: py + zb.y0 * k, y1: py + zb.y1 * k, z0: pz - zb.half, z1: pz + zb.half };
      const t = TAC.rayBox(o.x, o.y, o.z, ix, iy, iz, box);
      if (t >= 0 && t < best) { best = t; zone = zb.zone; }
    }
    return zone ? { t: best, zone } : null;
  };
  TAC.zonePoint = function (a, zone) {
    const k = a.height() / STAND_H;
    const y = zone === 'head' ? HEAD_Y : zone === 'chest' ? 1.3 : zone === 'stomach' ? 0.97 : 0.5;
    return { x: a.pos.x, y: a.pos.y + y * k, z: a.pos.z };
  };

  // ---------- Модель ----------
  // Бойцы собираются кодом из простых тел: эллипсоиды, конусы, цилиндры, коробки со скосом.
  // Всё сливается в одну сетку с цветами вершин - одна отрисовка на часть тела.
  const PALETTE = {
    T: { pants: 0x7a6a4c, shirt: 0x6b5a44, vest: 0x3e3a2f, pouch: 0x544c3b, strap: 0x2e2a22, skin: 0xc49a78, mask: 0x2a2826, boots: 0x2b241d, pad: 0x3a3630, glove: 0x26231f, accent: 0xa8843c, lens: 0x303030 },
    CT: { pants: 0x3b4658, shirt: 0x2f3b4c, vest: 0x222b36, pouch: 0x303c4b, strap: 0x1a2028, skin: 0xd0a888, mask: 0x1f252b, boots: 0x16191d, pad: 0x232a33, glove: 0x1c1f23, accent: 0x5a8bd6, lens: 0x6f9fc0 },
  };
  function boxInto(arr, w, h, d, x, y, z, color) { arr.push({ w, h, d, x, y, z, color: new THREE.Color(color) }); }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function place(g, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    _m.compose(_v.set(x, y, z), _q, _s.set(sx || 1, sy || 1, sz || 1));
    g.applyMatrix4(_m);
    return g;
  }
  // тела: s - скруглённая «коробка» (эллипсоид), c - конус/цилиндр, b - коробка
  function part(arr, geo, color) { arr.push({ geo, color: new THREE.Color(color) }); }
  const ell = (arr, rx, ry, rz, x, y, z, color, seg) => part(arr, place(new THREE.SphereGeometry(1, seg || 12, (seg || 12) - 3), x, y, z, 0, 0, 0, rx, ry, rz), color);
  const dome = (arr, r, x, y, z, color, sx, sz) => part(arr, place(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), x, y, z, 0, 0, 0, sx || 1, 1, sz || 1), color);
  const box = (arr, w, h, d, x, y, z, color, rx, ry, rz) => part(arr, place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), color);
  // «коробка» со скосами: конус на 4 грани, повёрнутый на 45°
  const slab = (arr, wTop, wBot, h, depth, x, y, z, color) => part(arr, place(new THREE.CylinderGeometry(wTop * 0.7071, wBot * 0.7071, h, 4, 1), x, y, z, 0, Math.PI / 4, 0, 1, 1, depth), color);
  // цилиндр между двумя точками (руки, ноги)
  function limb(arr, a, b, r0, r1, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    const g = new THREE.CylinderGeometry(r1, r0, L, 9, 1);
    _q.setFromUnitVectors(_up, _v.set(dx / L, dy / L, dz / L));
    _m.compose(_s.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(_m);
    part(arr, g, color);
  }
  TAC.modelParts = { ell, dome, box, slab, limb };
  function merged(parts) {
    const geos = [];
    for (const p of parts) {
      let g = p.geo;
      if (!g) { g = new THREE.BoxGeometry(p.w, p.h, p.d); g.translate(p.x, p.y, p.z); }
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const ny = g.attributes.normal.getY(i);
        const shade = 0.8 + ny * 0.24;                       // верх светлее, низ темнее
        col[i * 3] = p.color.r * shade; col[i * 3 + 1] = p.color.g * shade; col[i * 3 + 2] = p.color.b * shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    }
    let total = 0, totalIdx = 0;
    for (const g of geos) { total += g.attributes.position.count; totalIdx += g.index.count; }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    const idx = total > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
    let o = 0, oi = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + o;
      o += g.attributes.position.count; oi += ia.length;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  }
  TAC.mergeParts = merged;
  const geoCache = {};
  let bodyMat = null, shadowMat = null, shadowGeo = null;
  function teamGeos(team) {
    if (geoCache[team]) return geoCache[team];
    const c = PALETTE[team] || PALETTE.T;
    const up = [];
    // всё от бёдер (0) вверх, лицо смотрит на -Z
    slab(up, 0.4, 0.36, 0.14, 0.62, 0, 0.04, 0, c.pants);                      // таз
    box(up, 0.42, 0.06, 0.25, 0, 0.1, 0, c.strap);                             // ремень
    box(up, 0.06, 0.05, 0.02, 0, 0.1, -0.128, c.accent);                      // пряжка
    slab(up, 0.46, 0.36, 0.5, 0.58, 0, 0.36, 0, c.shirt);                      // корпус: шире в плечах
    slab(up, 0.44, 0.4, 0.36, 0.72, 0, 0.36, 0, c.vest);                       // бронежилет
    for (const x of [-0.12, 0, 0.12]) box(up, 0.1, 0.13, 0.05, x, 0.26, -0.165, c.pouch);   // подсумки
    box(up, 0.1, 0.1, 0.05, 0.13, 0.42, -0.158, c.pouch);                     // рация
    box(up, 0.06, 0.2, 0.04, -0.13, 0.46, -0.155, c.strap);                   // лямка
    box(up, 0.28, 0.2, 0.06, 0, 0.36, 0.17, c.pouch);                         // рюкзак-гидратор сзади
    for (const x of [-0.17, 0.17]) box(up, 0.07, 0.03, 0.3, x, 0.55, 0, c.strap);           // лямки на плечах
    limb(up, [0, 0.54, 0], [0, 0.66, 0], 0.06, 0.055, c.skin);                // шея
    // голова: эллипсоид
    ell(up, 0.115, 0.135, 0.125, 0, 0.78, 0, c.skin, 14);
    if (team === 'CT') {
      ell(up, 0.12, 0.07, 0.13, 0, 0.73, 0.004, c.mask, 12);                 // маска на нижней половине лица
      dome(up, 0.145, 0, 0.8, 0, 0x2b3440, 1, 1.08);                         // шлем
      box(up, 0.3, 0.025, 0.3, 0, 0.8, 0, 0x242c36);                          // край шлема
      box(up, 0.2, 0.055, 0.05, 0, 0.8, -0.12, c.lens);                       // очки
      box(up, 0.26, 0.025, 0.24, 0, 0.8, 0.01, c.strap);                      // ремешок очков
      box(up, 0.05, 0.08, 0.05, 0.15, 0.84, 0.01, c.accent);                  // фонарь на шлеме
    } else {
      ell(up, 0.123, 0.142, 0.132, 0, 0.785, 0.002, c.mask, 14);              // балаклава
      box(up, 0.16, 0.034, 0.03, 0, 0.8, -0.12, c.skin);                      // прорезь для глаз
      box(up, 0.12, 0.018, 0.02, 0, 0.8, -0.133, 0x1a1a1a);                    // глаза
      limb(up, [0, 0.6, 0], [0, 0.68, 0], 0.085, 0.08, c.accent);             // платок на шее
    }
    // плечи и руки к оружию: правая держит рукоять, левая - цевьё
    ell(up, 0.075, 0.07, 0.08, 0.23, 0.52, 0, c.shirt);
    ell(up, 0.075, 0.07, 0.08, -0.23, 0.52, 0, c.shirt);
    limb(up, [0.24, 0.5, 0], [0.25, 0.32, -0.1], 0.058, 0.052, c.shirt);
    limb(up, [0.25, 0.32, -0.1], [0.13, 0.4, -0.3], 0.05, 0.045, c.shirt);
    ell(up, 0.045, 0.05, 0.055, 0.12, 0.4, -0.32, c.glove);
    limb(up, [-0.24, 0.5, 0], [-0.2, 0.33, -0.18], 0.058, 0.052, c.shirt);
    limb(up, [-0.2, 0.33, -0.18], [-0.02, 0.4, -0.46], 0.05, 0.045, c.shirt);
    ell(up, 0.045, 0.05, 0.055, -0.01, 0.4, -0.48, c.glove);
    // нога от бедра вниз: бедро, наколенник, голень, ботинок
    const leg = [];
    limb(leg, [0, 0, 0], [0, -0.43, -0.01], 0.105, 0.085, c.pants);
    ell(leg, 0.08, 0.075, 0.08, 0, -0.44, -0.01, c.pants);
    box(leg, 0.12, 0.11, 0.05, 0, -0.44, -0.085, c.pad, 0.1);                  // наколенник
    limb(leg, [0, -0.44, -0.01], [0, -0.8, 0], 0.08, 0.065, c.pants);
    box(leg, 0.03, 0.09, 0.12, 0.1, -0.2, 0, c.pouch);                       // карман на бедре
    slab(leg, 0.14, 0.15, 0.12, 1.7, 0, -0.83, -0.035, c.boots);              // ботинок
    box(leg, 0.13, 0.025, 0.27, 0, -0.9, -0.04, 0x141210);                    // подошва
    geoCache[team] = { upper: merged(up), leg: merged(leg) };
    return geoCache[team];
  }
  const gunGeoCache = {};
  function gunGeo(model) {
    if (gunGeoCache[model]) return gunGeoCache[model];
    const p = [], dark = 0x24272b, mid = 0x3a3f45;
    const L = { pistol: 0.22, heavypistol: 0.26, smg: 0.45, rifle: 0.72, rifle2: 0.7, sniper: 0.9, awp: 1.0, shotgun: 0.8, mg: 0.85, knife: 0.2, frag: 0.1, smoke: 0.1, flash: 0.1, fire: 0.1, bomb: 0.3 }[model] || 0.5;
    if (model === 'knife') boxInto(p, 0.03, 0.04, 0.22, 0, 0, -0.1, 0x9aa2aa);
    else if (['frag', 'smoke', 'flash', 'fire'].includes(model)) boxInto(p, 0.08, 0.11, 0.08, 0, 0, 0, model === 'smoke' ? 0x7a8a7a : model === 'flash' ? 0x9aa0a8 : model === 'fire' ? 0x6a4020 : 0x4a5a3a);
    else if (model === 'bomb') { boxInto(p, 0.26, 0.12, 0.18, 0, 0, 0, 0x4a4030); boxInto(p, 0.1, 0.03, 0.08, 0.04, 0.07, 0, 0x202020); }
    else {
      boxInto(p, 0.06, 0.09, L, 0, 0, -L / 2 + 0.08, dark);
      boxInto(p, 0.04, 0.12, 0.06, 0, -0.08, 0.02, mid);
      if (L > 0.4) boxInto(p, 0.05, 0.1, 0.18, 0, -0.01, 0.2, mid);
      if (model === 'sniper' || model === 'awp') boxInto(p, 0.05, 0.05, 0.26, 0, 0.08, -0.25, 0x111111);
      if (model === 'mg') boxInto(p, 0.1, 0.1, 0.12, 0, -0.08, -0.2, mid);
    }
    gunGeoCache[model] = merged(p);
    return gunGeoCache[model];
  }

  TAC.gunGeo = gunGeo;
  TAC.bodyMaterial = () => bodyMat || (bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true }));
  Agent.prototype.buildMesh = function (scene, team) {
    TAC.bodyMaterial();
    if (!shadowMat) {
      shadowMat = new THREE.MeshBasicMaterial({ map: TAC.blobTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
      shadowGeo = new THREE.PlaneGeometry(0.9, 0.9); shadowGeo.rotateX(-Math.PI / 2);
    }
    const g = teamGeos(team || this.team || 'T');
    const root = new THREE.Group();
    const upper = new THREE.Mesh(g.upper, bodyMat);
    upper.position.y = 0.86;
    const legL = new THREE.Mesh(g.leg, bodyMat), legR = new THREE.Mesh(g.leg, bodyMat);
    legL.position.set(-0.11, 0.86, 0); legR.position.set(0.11, 0.86, 0);
    const gun = new THREE.Mesh(gunGeo('rifle'), bodyMat);
    gun.position.set(0.12, 0.42, -0.32);
    upper.add(gun);
    const blob = new THREE.Mesh(shadowGeo, shadowMat);
    blob.position.y = 0.015;
    root.add(upper, legL, legR, blob);
    for (const m of [upper, legL, legR, gun]) { m.castShadow = true; }
    root.userData.agent = this;
    scene.add(root);
    this.mesh = { root, upper, legL, legR, gun, blob, gunModel: 'rifle', team: team || this.team };
    return root;
  };
  Agent.prototype.removeMesh = function () {
    if (this.mesh) { this.mesh.root.parent && this.mesh.root.parent.remove(this.mesh.root); this.mesh = null; }
  };
  // Кадр анимации: alpha - доля между прошлым и текущим шагом логики
  Agent.prototype.updateMesh = function (alpha, time, shadowsOn) {
    const m = this.mesh;
    if (!m) return;
    const x = this.prev.x + (this.pos.x - this.prev.x) * alpha;
    const y = this.prev.y + (this.pos.y - this.prev.y) * alpha;
    const z = this.prev.z + (this.pos.z - this.prev.z) * alpha;
    m.root.position.set(x, y, z);
    m.blob.visible = !shadowsOn;
    m.blob.position.y = 0.015;
    if (!this.alive) {
      const t = Math.min(1, (time - this.deathTime) / 0.45);
      m.root.rotation.set(-Math.PI / 2 * t * t, this.yaw, 0, 'YXZ');
      m.root.position.y = y + 0.18 * t;
      m.legL.rotation.x = m.legR.rotation.x = 0;
      m.blob.visible = false;
      return;
    }
    m.root.rotation.set(0, this.yaw, 0, 'YXZ');
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const swing = Math.sin(this.stepDist * 2.6) * Math.min(1, speed / 4) * 0.55;
    const cr = this.crouch;
    m.legL.rotation.x = swing - cr * 0.9; m.legR.rotation.x = -swing - cr * 0.9;
    m.legL.scale.y = m.legR.scale.y = 1 - cr * 0.25;
    m.upper.position.y = 0.86 - cr * 0.45;
    m.upper.rotation.x = TAC.clamp(this.pitch, -0.6, 0.6) * 0.5 + cr * 0.15;
    const model = this.weaponDef().model;
    if (model !== m.gunModel) { m.gun.geometry = gunGeo(model); m.gunModel = model; }
  };
})();

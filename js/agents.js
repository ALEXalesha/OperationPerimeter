// Бойцы (игрок и боты): состояние, зоны попадания (голова, грудь, живот, ноги), модель из коробок.
(function () {
  'use strict';
  const TAC = window.TAC;
  const STAND_H = 1.8, CROUCH_H = 1.3, RADIUS = 0.35;
  TAC.STAND_H = STAND_H; TAC.CROUCH_H = CROUCH_H; TAC.RADIUS = RADIUS;

  let nextId = 1;
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
  const PALETTE = {
    T: { pants: 0x7d6e52, shirt: 0x6a5842, vest: 0x3b3830, pouch: 0x4d473b, skin: 0xc49a78, head: 0x262626, boots: 0x2b241d, accent: 0xb08a3e },
    CT: { pants: 0x3a4454, shirt: 0x2d394a, vest: 0x1c2530, pouch: 0x2c3846, skin: 0xd0a888, head: 0x1f272d, boots: 0x16191d, accent: 0x5a8bd6 },
  };
  function boxInto(arr, w, h, d, x, y, z, color) { arr.push({ w, h, d, x, y, z, color: new THREE.Color(color) }); }
  function merged(parts) {
    const geos = [];
    for (const p of parts) {
      const g = new THREE.BoxGeometry(p.w, p.h, p.d);
      g.translate(p.x, p.y, p.z);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const ny = g.attributes.normal.getY(i);
        const shade = ny > 0.5 ? 1.08 : ny < -0.5 ? 0.6 : 0.9;
        col[i * 3] = p.color.r * shade; col[i * 3 + 1] = p.color.g * shade; col[i * 3 + 2] = p.color.b * shade;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
    }
    // простое слияние без утилит three
    let total = 0, totalIdx = 0;
    for (const g of geos) { total += g.attributes.position.count; totalIdx += g.index.count; }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), idx = new Uint16Array(totalIdx);
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
  const geoCache = {};
  let bodyMat = null, shadowMat = null, shadowGeo = null;
  function teamGeos(team) {
    if (geoCache[team]) return geoCache[team];
    const c = PALETTE[team] || PALETTE.T;
    const up = [];
    // от бёдер (0) вверх
    boxInto(up, 0.44, 0.6, 0.26, 0, 0.3, 0, c.shirt);
    boxInto(up, 0.48, 0.42, 0.32, 0, 0.36, 0, c.vest);
    boxInto(up, 0.14, 0.12, 0.06, -0.11, 0.26, 0.17, c.pouch);
    boxInto(up, 0.14, 0.12, 0.06, 0.11, 0.26, 0.17, c.pouch);
    boxInto(up, 0.46, 0.07, 0.3, 0, 0.02, 0, c.boots);
    boxInto(up, 0.12, 0.08, 0.12, 0, 0.64, 0, c.skin);                 // шея
    if (team === 'CT') {
      boxInto(up, 0.24, 0.24, 0.25, 0, 0.8, 0, c.skin);
      boxInto(up, 0.29, 0.14, 0.3, 0, 0.92, 0, c.head);                 // шлем
      boxInto(up, 0.22, 0.06, 0.04, 0, 0.83, -0.13, 0x9fc0d8);          // очки
      boxInto(up, 0.08, 0.1, 0.05, 0.16, 0.88, 0, c.accent);
    } else {
      boxInto(up, 0.24, 0.26, 0.25, 0, 0.8, 0, c.head);                 // балаклава
      boxInto(up, 0.2, 0.05, 0.02, 0, 0.83, -0.125, c.skin);            // прорезь для глаз
      boxInto(up, 0.26, 0.05, 0.27, 0, 0.94, 0, c.accent);
    }
    // руки вперёд к оружию
    boxInto(up, 0.1, 0.1, 0.36, 0.22, 0.42, -0.2, c.shirt);
    boxInto(up, 0.1, 0.1, 0.34, -0.14, 0.4, -0.28, c.shirt);
    boxInto(up, 0.09, 0.09, 0.09, 0.2, 0.4, -0.4, c.head);
    boxInto(up, 0.09, 0.09, 0.09, -0.04, 0.38, -0.46, c.head);
    const leg = [];
    boxInto(leg, 0.17, 0.66, 0.2, 0, -0.33, 0, c.pants);
    boxInto(leg, 0.18, 0.2, 0.26, 0, -0.76, -0.03, c.boots);
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

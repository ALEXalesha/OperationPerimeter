// Зрелища: трассеры, следы пуль, пыль и искры, вспышки, взрывы, дым и огонь гранат,
// лежащее оружие, бомба. Всё из пулов, чтобы не плодить объекты во время боя.
(function () {
  'use strict';
  const TAC = window.TAC;
  const DUST = { sand: [0.85, 0.72, 0.5], concrete: [0.7, 0.7, 0.68], sandstone: [0.8, 0.66, 0.45], plaster: [0.85, 0.8, 0.7], crate: [0.6, 0.45, 0.28], container: [0.9, 0.7, 0.3], metalwall: [0.9, 0.75, 0.4], asphalt: [0.4, 0.4, 0.42], tiles: [0.75, 0.7, 0.6], planks: [0.6, 0.45, 0.3] };

  function Effects(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'effects';
    scene.add(this.group);
    this.quality = 'high';
    // Частицы
    const N = this.pN = 500;
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 4);
    this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pMax = new Float32Array(N); this.pBase = new Float32Array(N * 3); this.pGrav = new Float32Array(N);
    this.pNext = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 4));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.14, map: TAC.blobTexture(), vertexColors: true, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    // Трассеры
    const T = this.tN = 32;
    this.tPos = new Float32Array(T * 6); this.tCol = new Float32Array(T * 8); this.tLife = new Float32Array(T); this.tNext = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 4));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.tracers.frustumCulled = false;
    this.group.add(this.tracers);
    // Следы пуль
    const hc = document.createElement('canvas'); hc.width = hc.height = 32;
    const hg = hc.getContext('2d');
    const rg = hg.createRadialGradient(16, 16, 1, 16, 16, 15);
    rg.addColorStop(0, 'rgba(10,10,10,1)'); rg.addColorStop(0.35, 'rgba(25,22,20,0.9)'); rg.addColorStop(1, 'rgba(40,35,30,0)');
    hg.fillStyle = rg; hg.fillRect(0, 0, 32, 32);
    const D = this.dN = 96;
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), D);
    this.decals.count = 0; this.dNext = 0;
    this.decals.frustumCulled = false;
    this.group.add(this.decals);
    // Свет вспышек: заведён заранее, чтобы не пересобирать шейдеры посреди боя
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 9);
    this.boomLight = new THREE.PointLight(0xffa040, 0, 22);
    this.group.add(this.muzzleLight, this.boomLight);
    // Спрайты дыма, огня, взрывов
    this.sprites = [];
    this.smokes = []; this.fires = []; this.booms = [];
    this.grenadeMeshes = new Map();
    this.dropMeshes = new Map();
    this.bombMesh = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._n = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, 1);
  }
  TAC.Effects = Effects;
  const P = Effects.prototype;

  P.spawn = function (x, y, z, vx, vy, vz, life, col, alpha, grav) {
    const i = this.pNext; this.pNext = (i + 1) % this.pN;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pLife[i] = life; this.pMax[i] = life; this.pGrav[i] = grav == null ? 6 : grav;
    this.pBase[i * 3] = col[0]; this.pBase[i * 3 + 1] = col[1]; this.pBase[i * 3 + 2] = col[2];
    this.pCol[i * 4] = col[0]; this.pCol[i * 4 + 1] = col[1]; this.pCol[i * 4 + 2] = col[2]; this.pCol[i * 4 + 3] = alpha;
  };
  P.impact = function (p, n, mat) {
    const many = this.quality === 'high' ? 7 : 3;
    const c = DUST[mat] || DUST.concrete;
    for (let k = 0; k < many; k++) {
      const r = () => Math.random() - 0.5;
      this.spawn(p.x + n.x * 0.03, p.y + n.y * 0.03, p.z + n.z * 0.03, n.x * 1.6 + r() * 1.8, n.y * 1.6 + r() * 1.8 + 0.8, n.z * 1.6 + r() * 1.8, 0.45, c, 0.8, 5);
    }
    if (mat === 'container' || mat === 'metalwall') for (let k = 0; k < 3; k++) this.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 5 + n.x * 3, Math.random() * 3, (Math.random() - 0.5) * 5 + n.z * 3, 0.2, [1, 0.8, 0.3], 1, 9);
    // след на поверхности
    const i = this.dNext; this.dNext = (i + 1) % this.dN;
    this._n.set(n.x, n.y, n.z);
    this._q.setFromUnitVectors(this._z, this._n);
    this._v.set(p.x + n.x * 0.01, p.y + n.y * 0.01, p.z + n.z * 0.01);
    const sc = 0.7 + Math.random() * 0.6; this._s.set(sc, sc, sc);
    this._m.compose(this._v, this._q, this._s);
    this.decals.setMatrixAt(i, this._m);
    this.decals.count = Math.max(this.decals.count, i + 1);
    this.decals.instanceMatrix.needsUpdate = true;
  };
  P.blood = function (p, dir, head) {
    const many = head ? 10 : 5;
    for (let k = 0; k < many; k++) this.spawn(p.x, p.y, p.z, dir.x * 1.5 + (Math.random() - 0.5) * 2, (Math.random() - 0.2) * 2, dir.z * 1.5 + (Math.random() - 0.5) * 2, 0.4, [0.55, 0.05, 0.04], 0.9, 7);
  };
  P.tracer = function (a, b, bright) {
    const i = this.tNext; this.tNext = (i + 1) % this.tN;
    // трассер - кусок пути пули, а не весь луч
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz) || 1;
    const s0 = Math.min(L, 1.2), s1 = Math.min(L, s0 + Math.min(12, L * 0.6));
    this.tPos.set([a.x + dx / L * s0, a.y + dy / L * s0, a.z + dz / L * s0, a.x + dx / L * s1, a.y + dy / L * s1, a.z + dz / L * s1], i * 6);
    this.tLife[i] = 0.07;
    const c = bright ? [1, 0.85, 0.5] : [1, 0.8, 0.45];
    this.tCol.set([c[0], c[1], c[2], 0.9, c[0], c[1], c[2], 0.1], i * 8);
  };
  P.muzzle = function (p) { this.muzzleLight.position.set(p.x, p.y, p.z); this.muzzleLight.intensity = 1.6; };

  function spriteMat(color, additive) {
    return new THREE.SpriteMaterial({ map: additive ? TAC.blobTexture() : TAC.smokeTexture(), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  }
  P.sprite = function (color, additive) {
    let s = this.sprites.find((x) => !x.visible && x.userData.additive === !!additive);
    if (!s) {
      s = new THREE.Sprite(spriteMat(color, additive));
      s.userData.additive = !!additive;
      this.sprites.push(s); this.group.add(s);
    }
    s.material.color.set(color); s.material.opacity = 1; s.material.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
    return s;
  };
  P.explosion = function (p) {
    const s = this.sprite(0xffb050, true);
    s.position.set(p.x, p.y + 0.6, p.z); s.scale.set(1, 1, 1);
    this.booms.push({ s, t: 0, max: 0.45, grow: 7 });
    const sm = this.sprite(0x555048, false);
    sm.position.set(p.x, p.y + 1, p.z); sm.scale.set(2, 2, 2);
    this.booms.push({ s: sm, t: 0, max: 1.6, grow: 5, smoke: true });
    this.boomLight.position.set(p.x, p.y + 1, p.z); this.boomLight.intensity = 5;
    for (let k = 0; k < 20; k++) this.spawn(p.x, p.y + 0.3, p.z, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12, 0.6, [1, 0.6, 0.2], 1, 12);
  };
  P.flashBurst = function (p) {
    const s = this.sprite(0xffffff, true);
    s.position.set(p.x, p.y + 0.2, p.z); s.scale.set(2, 2, 2);
    this.booms.push({ s, t: 0, max: 0.25, grow: 14 });
    this.boomLight.position.set(p.x, p.y + 0.5, p.z); this.boomLight.intensity = 6;
  };
  // Облако дыма - набор спрайтов, растёт, держится, тает
  P.addSmoke = function (sm) {
    const n = this.quality === 'high' ? 16 : 9;
    sm.sprites = [];
    for (let k = 0; k < n; k++) {
      const s = this.sprite(0xc9ccd0, false);
      const a = k / n * Math.PI * 2, r = (k % 3) * 0.9 + 0.3;
      s.userData.off = [Math.cos(a) * r, 0.6 + (k % 4) * 0.55, Math.sin(a) * r];
      s.position.set(sm.pos.x, sm.pos.y + 0.5, sm.pos.z);
      sm.sprites.push(s);
    }
    this.smokes.push(sm);
  };
  P.addFire = function (fi) {
    const n = this.quality === 'high' ? 14 : 8;
    fi.sprites = [];
    for (let k = 0; k < n; k++) {
      const s = this.sprite(0xff7a20, true);
      const a = k / n * Math.PI * 2, r = (k % 2 ? 0.55 : 0.9) * fi.r * (0.4 + (k % 5) * 0.12);
      s.userData.off = [Math.cos(a) * r, 0.35, Math.sin(a) * r];
      s.userData.ph = Math.random() * 10;
      fi.sprites.push(s);
    }
    this.fires.push(fi);
  };
  P.releaseSprites = function (list) { for (const s of list) s.visible = false; };

  P.grenadeMesh = function (gr, on) {
    let m = this.grenadeMeshes.get(gr);
    if (!on) { if (m) { this.group.remove(m); this.grenadeMeshes.delete(gr); } return; }
    if (!m) {
      m = new THREE.Mesh(TAC.gunGeo(gr.def.model), TAC.bodyMaterial());
      this.group.add(m); this.grenadeMeshes.set(gr, m);
    }
    m.position.set(gr.pos.x, gr.pos.y, gr.pos.z);
    m.rotation.x += 0.2; m.rotation.z += 0.13;
  };
  P.dropMesh = function (it, on) {
    let m = this.dropMeshes.get(it);
    if (!on) { if (m) { this.group.remove(m); this.dropMeshes.delete(it); } return; }
    if (!m) {
      m = new THREE.Mesh(TAC.gunGeo(it.def.model), TAC.bodyMaterial());
      m.rotation.set(0, it.rot || 0, Math.PI / 2);
      m.scale.setScalar(1.15);
      this.group.add(m); this.dropMeshes.set(it, m);
    }
    m.position.set(it.pos.x, it.pos.y + 0.05, it.pos.z);
  };
  P.setBomb = function (b) {
    if (!b) { if (this.bombMesh) this.bombMesh.visible = false; return; }
    if (!this.bombMesh) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(TAC.gunGeo('bomb'), TAC.bodyMaterial()));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      led.position.set(-0.08, 0.08, 0.05); led.name = 'led';
      g.add(led);
      this.bombMesh = g; this.group.add(g);
    }
    this.bombMesh.visible = true;
    this.bombMesh.position.set(b.pos.x, b.pos.y + 0.06, b.pos.z);
    this.bombMesh.getObjectByName('led').visible = b.led;
  };

  P.clearRound = function () {
    for (const s of this.sprites) s.visible = false;
    this.smokes.length = 0; this.fires.length = 0; this.booms.length = 0;
    for (const [, m] of this.grenadeMeshes) this.group.remove(m);
    this.grenadeMeshes.clear();
    for (const [, m] of this.dropMeshes) this.group.remove(m);
    this.dropMeshes.clear();
    this.setBomb(null);
    this.decals.count = 0; this.dNext = 0;
    this.pLife.fill(0); this.pCol.fill(0);
    this.tLife.fill(0); this.tCol.fill(0);
  };

  P.update = function (dt, time) {
    // частицы
    for (let i = 0; i < this.pN; i++) {
      if (this.pLife[i] <= 0) { this.pCol[i * 4 + 3] = 0; continue; }
      this.pLife[i] -= dt;
      this.pVel[i * 3 + 1] -= this.pGrav[i] * dt;
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (this.pPos[i * 3 + 1] < 0.02) { this.pPos[i * 3 + 1] = 0.02; this.pVel[i * 3 + 1] = 0; }
      this.pCol[i * 4 + 3] = Math.max(0, this.pLife[i] / this.pMax[i]) * 0.9;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (let i = 0; i < this.tN; i++) {
      if (this.tLife[i] > 0) { this.tLife[i] -= dt; const k = Math.max(0, this.tLife[i] / 0.07); this.tCol[i * 8 + 3] = 0.9 * k; this.tCol[i * 8 + 7] = 0.1 * k; }
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 30);
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 14);
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / b.max;
      const sc = 1 + b.grow * Math.sqrt(k);
      b.s.scale.set(sc, sc, sc);
      b.s.material.opacity = Math.max(0, 1 - k) * (b.smoke ? 0.7 : 1);
      if (b.smoke) b.s.position.y += dt * 0.8;
      if (k >= 1) { b.s.visible = false; this.booms.splice(i, 1); }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const sm = this.smokes[i];
      const age = time - sm.start, left = sm.end - time;
      const grow = Math.min(1, age / 1.2);
      const fade = Math.min(1, left / 2.5);
      for (const s of sm.sprites) {
        const o = s.userData.off;
        s.position.set(sm.pos.x + o[0] * grow, sm.pos.y + o[1] * (0.4 + grow * 0.6), sm.pos.z + o[2] * grow);
        const sc = 1.2 + grow * 3.4;
        s.scale.set(sc, sc, sc);
        s.material.opacity = 0.92 * fade;
        s.material.rotation += dt * 0.05;
      }
      if (left <= 0) { this.releaseSprites(sm.sprites); this.smokes.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fi = this.fires[i];
      const left = fi.end - time;
      for (const s of fi.sprites) {
        const o = s.userData.off, ph = s.userData.ph;
        const fl = 0.75 + Math.sin(time * 13 + ph) * 0.25;
        s.position.set(fi.pos.x + o[0], fi.pos.y + o[1] + fl * 0.2, fi.pos.z + o[2]);
        const sc = (0.9 + fl * 0.6) * Math.min(1, left);
        s.scale.set(sc, sc * 1.5, sc);
        s.material.opacity = 0.85 * Math.min(1, left);
      }
      if (left <= 0 || fi.out) { this.releaseSprites(fi.sprites); this.fires.splice(i, 1); }
    }
  };
})();

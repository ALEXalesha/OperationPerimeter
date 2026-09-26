// Оружие в руках (вид от первого лица): своя сцена и камера поверх мира, чтобы ствол
// не проваливался в стены. Облик (скин) - материал корпуса. Анимации: покачивание на ходу,
// отдача, доставание, перезарядка, осмотр, удар ножом, бросок гранаты.
(function () {
  'use strict';
  const TAC = window.TAC;

  const DARK = 0x1f2226, MID = 0x33383e, GLOVE = 0x2a2723;
  const SLEEVE = { T: 0x5d4d3a, CT: 0x2c3848 };
  let darkMat, midMat, gloveMat;
  const sleeveMats = {};

  function part(g, w, h, d, x, y, z, mat, rx) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    g.add(m);
    return m;
  }
  // Модель оружия: детали с пометкой skin получают материал облика
  function buildGun(model, skinMat) {
    const g = new THREE.Group();
    const S = skinMat, D = darkMat, M = midMat;
    switch (model) {
      case 'pistol':
        part(g, 0.036, 0.042, 0.19, 0, 0.02, -0.08, S); part(g, 0.032, 0.032, 0.17, 0, -0.012, -0.075, M);
        part(g, 0.034, 0.1, 0.05, 0, -0.06, 0.0, D, 0.25); part(g, 0.01, 0.014, 0.01, 0, 0.047, -0.17, D);
        break;
      case 'heavypistol':
        part(g, 0.044, 0.05, 0.25, 0, 0.022, -0.1, S); part(g, 0.036, 0.034, 0.22, 0, -0.016, -0.09, S);
        part(g, 0.04, 0.11, 0.055, 0, -0.07, 0.01, D, 0.25); part(g, 0.02, 0.02, 0.06, 0, 0.02, -0.25, M);
        break;
      case 'smg':
        part(g, 0.06, 0.085, 0.3, 0, 0, -0.1, S); part(g, 0.028, 0.028, 0.12, 0, 0.01, -0.3, D);
        part(g, 0.04, 0.17, 0.05, 0, -0.12, -0.12, M); part(g, 0.035, 0.09, 0.045, 0, -0.07, 0.03, D, 0.3);
        part(g, 0.045, 0.05, 0.14, 0, -0.01, 0.1, S); part(g, 0.01, 0.025, 0.02, 0, 0.055, -0.2, D);
        break;
      case 'rifle': case 'rifle2':
        part(g, 0.064, 0.09, 0.34, 0, 0, -0.08, S);
        part(g, 0.058, 0.07, 0.22, 0, 0.005, -0.34, model === 'rifle' ? S : M);
        part(g, 0.024, 0.024, 0.2, 0, 0.012, -0.54, D);
        part(g, 0.046, 0.16, 0.07, 0, -0.12, -0.1, model === 'rifle' ? D : S, model === 'rifle' ? 0.35 : 0.1);
        part(g, 0.038, 0.09, 0.05, 0, -0.08, 0.06, D, 0.3);
        part(g, 0.056, 0.08, 0.22, 0, -0.01, 0.2, S);
        if (model === 'rifle2') { part(g, 0.03, 0.04, 0.18, 0, 0.065, -0.1, D); part(g, 0.018, 0.04, 0.02, 0, 0.06, -0.42, D); }
        else part(g, 0.012, 0.03, 0.02, 0, 0.06, -0.4, D);
        break;
      case 'sniper': case 'awp':
        part(g, 0.066, 0.09, 0.4, 0, 0, -0.1, S);
        part(g, 0.028, 0.028, model === 'awp' ? 0.5 : 0.38, 0, 0.012, model === 'awp' ? -0.53 : -0.47, D);
        part(g, 0.05, 0.05, 0.3, 0, 0.085, -0.1, D); part(g, 0.06, 0.06, 0.05, 0, 0.085, -0.26, M); part(g, 0.06, 0.06, 0.05, 0, 0.085, 0.06, M);
        part(g, 0.04, 0.12, 0.06, 0, -0.1, -0.06, D);
        part(g, 0.06, 0.1, 0.26, 0, -0.02, 0.22, S);
        break;
      case 'shotgun':
        part(g, 0.06, 0.08, 0.3, 0, 0, -0.06, S); part(g, 0.03, 0.03, 0.46, 0, 0.02, -0.4, D);
        part(g, 0.05, 0.05, 0.16, 0, -0.035, -0.34, M); part(g, 0.038, 0.09, 0.05, 0, -0.07, 0.06, D, 0.3);
        part(g, 0.056, 0.08, 0.24, 0, -0.02, 0.2, S);
        break;
      case 'mg':
        part(g, 0.08, 0.11, 0.42, 0, 0, -0.1, S); part(g, 0.03, 0.03, 0.34, 0, 0.012, -0.47, D);
        part(g, 0.1, 0.12, 0.12, 0.02, -0.11, -0.1, M); part(g, 0.04, 0.1, 0.05, 0, -0.08, 0.08, D, 0.3);
        part(g, 0.066, 0.09, 0.22, 0, -0.01, 0.24, S); part(g, 0.08, 0.02, 0.2, 0, 0.066, -0.14, D);
        break;
      case 'knife':
        part(g, 0.008, 0.045, 0.2, 0, 0.01, -0.14, S); part(g, 0.008, 0.02, 0.2, 0, 0.042, -0.13, S);
        part(g, 0.026, 0.034, 0.1, 0, 0, 0.01, D); part(g, 0.036, 0.05, 0.012, 0, 0.005, -0.04, M);
        break;
      case 'frag': case 'smoke': case 'flash': case 'fire': {
        const col = { frag: 0x4b5a3a, smoke: 0x7f8f84, flash: 0x9aa0a8, fire: 0x7a3d1a }[model];
        const m = new THREE.Mesh(model === 'frag' ? new THREE.SphereGeometry(0.035, 12, 10) : new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), new THREE.MeshLambertMaterial({ color: col }));
        g.add(m); part(g, 0.02, 0.02, 0.03, 0, 0.05, 0, M);
        break;
      }
      case 'bomb':
        part(g, 0.2, 0.08, 0.14, 0, 0, -0.04, new THREE.MeshLambertMaterial({ color: 0x4f4533 }));
        part(g, 0.08, 0.02, 0.06, 0.03, 0.05, -0.04, D);
        part(g, 0.05, 0.012, 0.02, -0.05, 0.045, -0.02, new THREE.MeshBasicMaterial({ color: 0x40ff40 }));
        break;
      default:
        part(g, 0.06, 0.09, 0.3, 0, 0, -0.1, S);
    }
    return g;
  }
  // Руки: перчатки и рукава своей стороны
  function buildArms(model, team) {
    const g = new THREE.Group(), sl = sleeveMats[team] || sleeveMats.T;
    const pistol = model === 'pistol' || model === 'heavypistol';
    const small = ['knife', 'frag', 'smoke', 'flash', 'fire', 'bomb'].includes(model);
    // правая рука
    part(g, 0.05, 0.05, 0.08, 0.005, -0.07, 0.04, gloveMat);
    part(g, 0.065, 0.065, 0.3, 0.03, -0.1, 0.22, sl, 0.35);
    if (!small) {
      const z = pistol ? -0.02 : model === 'smg' ? -0.26 : -0.33;
      part(g, 0.05, 0.045, 0.08, -0.02, -0.045, z, gloveMat);
      part(g, 0.065, 0.065, 0.36, -0.13, -0.12, z + 0.2, sl, 0.25).rotation.y = -0.5;
    }
    return g;
  }

  function ViewModel() {
    darkMat = darkMat || new THREE.MeshLambertMaterial({ color: DARK });
    midMat = midMat || new THREE.MeshLambertMaterial({ color: MID });
    gloveMat = gloveMat || new THREE.MeshLambertMaterial({ color: GLOVE });
    sleeveMats.T = sleeveMats.T || new THREE.MeshLambertMaterial({ color: SLEEVE.T });
    sleeveMats.CT = sleeveMats.CT || new THREE.MeshLambertMaterial({ color: SLEEVE.CT });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.01, 5);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x404040, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(0.5, 1, 0.6); this.scene.add(sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.root.scale.setScalar(0.85);
    this.holder = new THREE.Group(); this.root.add(this.holder);
    this.cache = new Map();
    this.key = null; this.model = null; this.skin = null; this.skinMat = null;
    this.kick = 0; this.bobT = 0; this.draw = 0; this.swing = 0; this.throwT = 0;
    this.swayX = 0; this.swayY = 0;
    this.offset = { x: 0, y: 0, z: 0 };
  }
  TAC.ViewModel = ViewModel;
  const P = ViewModel.prototype;
  const skinMats = {};
  TAC.skinMaterial = function (pattern) {
    pattern = pattern || 'factory';
    if (!skinMats[pattern]) { skinMats[pattern] = new THREE.MeshLambertMaterial({ map: TAC.skinTexture(pattern) }); skinMats[pattern].userData.skin = pattern; }
    return skinMats[pattern];
  };

  // Поставить в руки оружие def с обликом pattern
  P.set = function (def, pattern, team) {
    const model = def ? def.model : 'knife';
    const key = model + '|' + (pattern || 'factory') + '|' + (team || 'T');
    if (key === this.key) return;
    this.key = key; this.model = model; this.skin = pattern || 'factory';
    let g = this.cache.get(key);
    if (!g) {
      g = new THREE.Group();
      this.skinMat = TAC.skinMaterial(pattern);
      const gun = buildGun(model, this.skinMat);
      g.add(gun, buildArms(model, team));
      g.userData.skinMat = this.skinMat;
      this.cache.set(key, g);
    }
    this.skinMat = g.userData.skinMat;
    this.holder.clear();
    this.holder.add(g);
    this.draw = 1;
  };
  P.onShot = function (def) {
    this.kick = Math.min(1.4, this.kick + (def.cat === 'sniper' || def.cat === 'heavy' ? 1.2 : def.cat === 'pistol' ? 0.8 : 0.55));
    if (def.cat === 'knife') this.swing = 1;
    if (def.cat === 'grenade') this.throwT = 1;
  };
  P.resize = function (aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); };
  P.setFov = function (fov) { if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); } };

  // Поза в этот кадр по состоянию бойца
  P.update = function (dt, a, time) {
    const f = a.fire, def = a.weaponDef();
    const speed = Math.hypot(a.vel.x, a.vel.z) * (a.onGround ? 1 : 0.2);
    this.bobT += dt * (2 + speed * 1.5);
    const amp = Math.min(1, speed / 5);
    this.kick *= Math.exp(-14 * dt);
    this.draw = Math.max(0, this.draw - dt * 3.2);
    this.swing = Math.max(0, this.swing - dt * 3.5);
    this.throwT = Math.max(0, this.throwT - dt * 2.5);
    this.swayX *= Math.exp(-8 * dt); this.swayY *= Math.exp(-8 * dt);
    const o = this.offset;
    let x = 0.15 + o.x + Math.sin(this.bobT) * 0.012 * amp + this.swayX;
    let y = -0.155 + o.y - Math.abs(Math.cos(this.bobT)) * 0.012 * amp + this.swayY;
    let z = -0.36 + o.z + this.kick * 0.035;
    let rx = this.kick * 0.07, ry = 0, rz = 0;
    // доставание
    y -= this.draw * this.draw * 0.25; rx -= this.draw * 0.7;
    // перезарядка: оружие уходит вниз и наклоняется
    if (f.reload > 0 && def.reload) {
      const p = 1 - f.reload / def.reload, s = Math.sin(Math.min(1, p) * Math.PI);
      y -= s * 0.07; rz += s * 0.55; rx += s * 0.25;
    }
    // осмотр: поворот боком, чтобы видеть облик
    if (f.inspect > 0) {
      const p = 1 - f.inspect / 3, s = Math.sin(Math.min(1, p) * Math.PI);
      ry += s * 1.1; rz += s * 0.45; x -= s * 0.06; y += s * 0.03;
    }
    if (this.swing > 0) { const s = Math.sin(this.swing * Math.PI); ry -= s * 0.9; rx -= s * 0.4; x -= s * 0.06; }
    if (this.throwT > 0) { const s = Math.sin(this.throwT * Math.PI); y += s * 0.1; z -= s * 0.1; rx -= s * 0.8; }
    if (a.crouch > 0.5) y += 0.01;
    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);
    this.root.visible = !(f.scope > 0);
  };
  P.render = function (renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  };
})();

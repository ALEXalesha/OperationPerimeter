// Запуск: отрисовка three.js, цикл (логика фиксированным шагом, отрисовка отдельно),
// ввод с учётом назначенных клавиш, камера и наблюдение, пауза (и при скрытии вкладки),
// применение настроек, крючок для проверок window.__tactical.
(function () {
  'use strict';
  const TAC = window.TAC;
  const $ = (id) => document.getElementById(id);
  const DEG = Math.PI / 180;
  const DT = TAC.DT;

  const app = TAC.app = {
    mode: 'menu', match: null, paused: false, locked: false, manual: false, expectUnlock: false,
    keys: {}, act: {}, mouseL: false, acc: 0, alpha: 0, last: performance.now(),
    frameMs: [], cpuMs: [], viewAgent: null, spectIdx: 0, fps: 0, fpsT: 0, fpsN: 0,
  };

  // ---------- Отрисовка ----------
  function makeRenderer() {
    const old = $('view');
    const v = TAC.settings.video;
    let canvas = old;
    if (app.renderer) {                                 // сглаживание меняется только с новым холстом
      canvas = document.createElement('canvas'); canvas.id = 'view';
      old.replaceWith(canvas);
      // старый контекст отпускаем сразу, иначе браузер копит их и пишет «Too many active WebGL contexts»
      app.renderer.dispose();
      app.renderer.forceContextLoss();
      app.renderer.domElement.width = app.renderer.domElement.height = 1;
    }
    const r = new THREE.WebGLRenderer({ canvas, antialias: v.aa === 'on', powerPreference: 'high-performance' });
    r.autoClear = false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    app.renderer = r;
    app.aa = v.aa;
    resize();
    return r;
  }
  function vfov(hfov43) { return 2 * Math.atan(Math.tan(hfov43 * DEG / 2) / (4 / 3)) / DEG; }
  TAC.vfov = vfov;
  function resize() {
    const r = app.renderer, v = TAC.settings.video;
    if (!r) return;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * v.renderScale);
    r.setSize(innerWidth, innerHeight, false);
    r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    const asp = innerWidth / innerHeight;
    if (app.camera) { app.camera.aspect = asp; app.camera.updateProjectionMatrix(); }
    if (app.menuCam) { app.menuCam.aspect = asp; app.menuCam.updateProjectionMatrix(); }
    if (app.vm) app.vm.resize(asp);
  }
  addEventListener('resize', resize);

  // ---------- Фон меню: карта и два бойца ----------
  function buildMenuScene() {
    const scene = new THREE.Scene();
    const world = new TAC.World(TAC.MAPS.quarry);
    const mr = TAC.buildMapMeshes(world, { textures: TAC.settings.video.textures });
    scene.add(mr.group); scene.fog = mr.fog;
    mr.setDistance(160);
    const c = world.siteCenter.A, p = world.center(c[0], c[1]);
    const t = new TAC.Agent({ name: 't', team: 'T' }), ct = new TAC.Agent({ name: 'ct', team: 'CT' });
    t.pos = { x: p.x + 1.1, y: 0, z: p.z + 3.2 }; ct.pos = { x: p.x - 0.1, y: 0, z: p.z + 4.2 };
    t.prev = Object.assign({}, t.pos); ct.prev = Object.assign({}, ct.pos);
    t.inv.primary = TAC.makeWeapon('burya'); t.slot = 'primary'; ct.inv.primary = TAC.makeWeapon('strazh'); ct.slot = 'primary';
    t.yaw = -2.6; ct.yaw = -2.9; t.pitch = -0.15; ct.pitch = -0.1;
    t.buildMesh(scene, 'T'); ct.buildMesh(scene, 'CT');
    t.updateMesh(1, 0, false); ct.updateMesh(1, 0, false);
    app.menu3d = { scene, world, mr, focus: { x: p.x + 0.5, y: 1.2, z: p.z + 3.7 }, t: 0 };
    app.menuCam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
  }
  function renderMenu(dt) {
    const m = app.menu3d;
    m.t += dt;
    const cam = app.menuCam, f = m.focus;
    const ang = 0.35 + Math.sin(m.t * 0.07) * 0.35;
    cam.position.set(f.x - Math.sin(ang) * 5.2, 1.65 + Math.sin(m.t * 0.11) * 0.1, f.z + Math.cos(ang) * 5.2);
    cam.lookAt(f.x, f.y, f.z);
    // бойцы справа от центра экрана
    const w = innerWidth, h = innerHeight;
    cam.setViewOffset(w, h, -w * 0.18, 0, w, h);
    m.mr.sky.position.copy(cam.position);
    app.renderer.clear();
    app.renderer.render(m.scene, cam);
  }

  // ---------- Матч ----------
  function disposeGame() {
    if (app.disposeTargets) { app.disposeTargets(); app.disposeTargets = null; }
    if (app.mapRender) { app.scene.remove(app.mapRender.group); app.mapRender.dispose(); app.mapRender = null; }
    if (app.match) for (const a of app.match.agents) a.removeMesh();
    if (app.effects) app.effects.clearRound();
    app.match = null;
  }
  function onMatchOver(summary, match) {
    const rewards = TAC.menu ? TAC.menu.recordMatch(summary, match) : null;
    if (app.manual) { app.lastRewards = rewards; return; }
    const delay = summary.mode === 'comp' ? 3500 : summary.mode === 'train' ? 300 : 2000;
    setTimeout(() => { if (app.match === match) TAC.menu.showMatchOver(summary, match, rewards); }, delay);
  }
  // Создать матч сразу (без экрана загрузки) - для проверок и после загрузки
  app.createMatch = function (opts) {
    disposeGame();
    app.scene = app.scene || new THREE.Scene();
    const world = new TAC.World(TAC.MAPS[opts.map]);
    const v = TAC.settings.video;
    app.mapRender = TAC.buildMapMeshes(world, { textures: v.textures });
    app.scene.add(app.mapRender.group);
    app.scene.fog = app.mapRender.fog;
    app.effects = app.effects || new TAC.Effects(app.scene);
    app.camera = app.camera || new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 200);
    app.vm = app.vm || new TAC.ViewModel();
    const env = { scene: app.scene, effects: app.effects, onMatchOver };
    const m = new TAC.Match(Object.assign({ world }, opts), env);
    app.match = m;
    app.opts = opts;
    app.viewAgent = m.player;
    env.viewAgent = m.player;
    app.mode = 'game';
    app.paused = false;
    app.acc = 0;
    document.body.classList.remove('over');
    app.targetMeshes = [];
    if (m.targets) buildTargets(m);
    document.body.classList.add('ingame');
    TAC.hud.reset(m);
    app.applySettings();
    if (TAC.audio) TAC.audio.stopMusic();
    return m;
  };
  let tgtRes = null;
  function buildTargets(m) {
    tgtRes = tgtRes || { geo: new THREE.SphereGeometry(0.5, 16, 12), torus: new THREE.TorusGeometry(0.3, 0.04, 6, 20), mat: new THREE.MeshLambertMaterial({ color: 0xff3a4a, emissive: 0x661020 }), ring: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    const { geo, torus, mat, ring } = tgtRes;
    for (const t of m.targets) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(geo, mat));
      const r = new THREE.Mesh(torus, ring); r.position.z = 0.02; g.add(r);
      app.scene.add(g);
      app.targetMeshes.push({ t, g });
    }
    const home = app.targetMeshes;
    app.disposeTargets = () => { for (const x of home) app.scene.remove(x.g); };
  }
  // Полный путь из меню: экран загрузки с картой и советом, по шагам строится мир
  app.startMatch = async function (opts) {
    const L = TAC.menu;
    L.showLoading(opts);
    const steps = ['Карта', 'Текстуры и освещение', 'Бойцы и боты', 'Готово'];
    for (let i = 0; i < steps.length - 1; i++) {
      L.loadingProgress((i + 0.3) / steps.length, steps[i]);
      await new Promise((r) => setTimeout(r, 220));
    }
    if (app.disposeTargets) { app.disposeTargets(); app.disposeTargets = null; }
    app.manual = false;
    app.createMatch(opts);
    L.loadingProgress(1, steps[3]);
    await new Promise((r) => setTimeout(r, 350));
    L.hideLoading();
    document.getElementById('menu').classList.remove('show');
    app.showClickIn();
  };
  app.showClickIn = function () {
    const m = app.match;
    $('clickMode').textContent = TAC.MODES[m.mode].name + (m.missionId ? ' · миссия' : '');
    $('clickMap').textContent = TAC.MAPS[m.mapId].name;
    $('clickin').classList.add('show');
    app.paused = true;
  };
  $('clickin').addEventListener('click', () => { $('clickin').classList.remove('show'); app.resume(); });

  app.quitToMenu = function (abandon) {
    const m = app.match;
    if (m && abandon && !m.over && m.player) {
      const s = m.summary();
      if (m.mode === 'comp') {                       // брошенный соревновательный матч - поражение, как в оригинале
        s.won = false; s.draw = false;
        TAC.stats.record(s, false);
        TAC.profile.applyMatch(s);
      } else TAC.stats.record(s, true);
    }
    hideGameOverlays();
    if (app.disposeTargets) { app.disposeTargets(); app.disposeTargets = null; }
    disposeGame();
    app.mode = 'menu'; app.paused = false;
    document.body.classList.remove('ingame');
    if (document.pointerLockElement) { app.expectUnlock = true; document.exitPointerLock(); }
    $('menu').classList.add('show');
    TAC.menu.refresh();
    if (TAC.audio && TAC.audio.ctx) { TAC.audio.resume(); TAC.audio.startMusic(); }
  };
  function hideGameOverlays() {
    for (const id of ['pause', 'matchover', 'clickin']) $(id).classList.remove('show');
    document.body.classList.remove('over');
    TAC.hud.showBuy(false); TAC.hud.showScoreboard(false);
    $('roundbanner').className = '';
    $('pauseSettingsHost').classList.remove('show');
  }

  // ---------- Пауза ----------
  app.pause = function (reason) {
    if (app.mode !== 'game' || app.paused) return;
    app.paused = true;
    for (const k in app.act) app.act[k] = false;
    app.mouseL = false;
    TAC.hud.showBuy(false); TAC.hud.showScoreboard(false);
    $('pauseInfo').textContent = reason || 'Игра остановлена.';
    $('pause').classList.add('show');
    if (document.pointerLockElement) { app.expectUnlock = true; document.exitPointerLock(); }
  };
  app.resume = function () {
    if (app.mode !== 'game') return;
    $('pause').classList.remove('show');
    $('pauseSettingsHost').classList.remove('show');
    app.paused = false;
    app.last = performance.now(); app.acc = 0;
    if (TAC.audio) { TAC.audio.init(); TAC.audio.resume(); }
    lockPointer();
  };
  function lockPointer() {
    // под автоматикой (проверки, пробы) мышь не захватываем: чужие окна не должны ловить курсор владельца
    if (app.manual || navigator.webdriver) return;
    const c = app.renderer.domElement;
    try {
      const p = c.requestPointerLock(TAC.settings.input.rawInput ? { unadjustedMovement: true } : undefined);
      if (p && p.catch) p.catch(() => { try { c.requestPointerLock(); } catch (e) { /* нет захвата */ } });
    } catch (e) { try { c.requestPointerLock(); } catch (e2) { /* нет захвата */ } }
  }
  document.addEventListener('pointerlockchange', () => {
    app.locked = document.pointerLockElement === app.renderer.domElement;
    if (!app.locked && app.mode === 'game' && !app.paused) {
      if (app.expectUnlock) { app.expectUnlock = false; return; }
      if (TAC.hud.buyOpen) return;
      app.pause();
    }
    if (app.locked) app.expectUnlock = false;
  });
  // Вкладка скрыта: пауза, звук выключен, мышь отпущена. Вернулись - остаётся пауза.
  // В бою звук вернётся вместе с «Продолжить», в меню - сразу, как вкладку показали.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (app.mode === 'game' && !app.paused) app.pause('Игра остановлена: вкладка была скрыта.');
      if (TAC.audio) TAC.audio.suspend();
    } else if (app.mode !== 'game' && TAC.audio) {
      TAC.audio.resume();
    }
  });
  // Окно потеряло фокус или страницу сняли с окна (вкладка в оболочке «Игротека») - тоже пауза
  const focusLost = (why) => {
    for (const k in app.act) app.act[k] = false;
    app.mouseL = false;
    if (app.mode === 'game' && !app.paused && !app.manual) app.pause(why);
  };
  addEventListener('blur', () => focusLost('Игра остановлена: окно потеряло фокус.'));
  // В обычном браузере Ctrl+W (присесть + вперёд) закрывает вкладку и это не отменить - во время матча спрашиваем.
  // В «Игротеке» (Electron) такого сочетания нет, вопрос не нужен.
  const inElectron = /Electron/i.test(navigator.userAgent);
  addEventListener('beforeunload', (e) => {
    if (app.mode === 'game' && app.match && !app.match.over && !inElectron) { e.preventDefault(); e.returnValue = ''; }
  });
  addEventListener('pagehide', () => { focusLost('Игра остановлена.'); if (TAC.audio) TAC.audio.suspend(); });
  // Оболочки ОС (игра в iframe внутри симуляторов Windows и macOS) шлют {mix:'pause'} и {mix:'resume'}.
  // pause - как скрытая вкладка: пауза в бою, звук заглушён, ввод сброшен, мышь отпущена.
  // resume - пауза в бою остаётся (продолжает сам игрок), в меню звук возвращается.
  addEventListener('message', (e) => {
    const cmd = e.data && typeof e.data === 'object' ? e.data.mix : null;
    if (cmd === 'pause') {
      for (const k in app.act) app.act[k] = false;
      app.mouseL = false;
      if (app.mode === 'game' && !app.paused) app.pause('Игра остановлена: окно свёрнуто или неактивно.');
      if (document.pointerLockElement) { app.expectUnlock = true; document.exitPointerLock(); }
      if (TAC.audio) TAC.audio.suspend();
    } else if (cmd === 'resume') {
      if (app.mode !== 'game' && TAC.audio) TAC.audio.resume();
    }
  });

  // ---------- Ввод ----------
  function actionOf(code) {
    const keys = TAC.settings.input.keys;
    for (const k in keys) if (keys[k] === code) return k;
    return null;
  }
  app.actionOf = actionOf;
  document.addEventListener('keydown', (e) => {
    if (TAC.menu && TAC.menu.captureKey && TAC.menu.captureKey(e)) { e.preventDefault(); return; }
    if (app.mode !== 'game') { if (e.code === 'Escape' && TAC.menu) TAC.menu.escape(); return; }
    const m = app.match;
    if (e.code === 'Escape') {
      if (TAC.hud.buyOpen) { TAC.hud.showBuy(false); lockPointer(); return; }
      if ($('matchover').classList.contains('show')) return;
      if (app.paused) { if ($('pauseSettingsHost').classList.contains('show')) $('pauseSettingsHost').classList.remove('show'); else if (!$('clickin').classList.contains('show')) app.resume(); }
      return;
    }
    if (app.paused || !m) return;
    const act = actionOf(e.code);
    // зажатый Ctrl (присесть) не должен запускать сочетания браузера: Ctrl+D, Ctrl+S, Ctrl+цифра...
    // Ctrl+W и Ctrl+T браузер не отдаёт - для них ниже вопрос перед уходом со страницы
    if (e.code === 'Tab' || act || e.ctrlKey || e.metaKey) e.preventDefault();
    if (TAC.hud.buyOpen && /^Digit[0-9]$/.test(e.code)) { TAC.hud.buyKey(m, Number(e.code.slice(5))); return; }
    if (!act) return;
    if (e.repeat && act !== 'forward') return;
    app.act[act] = true;
    handleAction(act, true);
  });
  document.addEventListener('keyup', (e) => {
    const act = actionOf(e.code);
    if (!act) return;
    app.act[act] = false;
    handleAction(act, false);
  });
  function handleAction(act, down) {
    const m = app.match, p = m && m.player;
    if (!p) return;
    if (act === 'scoreboard') { TAC.hud.showScoreboard(down); return; }
    if (!down) return;
    const slot = { slot1: 'primary', slot2: 'secondary', slot3: 'knife', slot4: 'grenade', slot5: 'bomb' }[act];
    if (!p.alive) return;
    if (slot) { m.switchSlot(p, slot); return; }
    if (act === 'lastWeapon') m.lastWeapon(p);
    else if (act === 'drop') m.dropCurrent(p);
    else if (act === 'reload') p.input.reload = true;
    else if (act === 'use') p.input.usePressed = true;
    else if (act === 'inspect') { if (p.fire.reload <= 0 && p.fire.draw <= 0) p.fire.inspect = 3; }
    else if (act === 'buy') {
      const open = !TAC.hud.buyOpen;
      TAC.hud.showBuy(open); TAC.hud.buyStage = 'cat';
      if (open && document.pointerLockElement) { app.expectUnlock = true; document.exitPointerLock(); }
      if (!open) lockPointer();
    }
  }
  document.addEventListener('mousedown', (e) => {
    if (app.mode !== 'game' || app.paused || !app.match) return;
    if (TAC.hud.buyOpen) return;
    if (!app.locked && !app.manual) { lockPointer(); return; }
    const m = app.match, p = m.player;
    if (!p.alive) { app.spectIdx++; return; }
    if (e.button === 0) { app.mouseL = true; p.input.firePressed = true; }
    if (e.button === 2) p.input.fire2Pressed = true;
    const code = e.button === 1 ? 'Mouse3' : e.button === 3 ? 'Mouse4' : e.button === 4 ? 'Mouse5' : null;
    if (code) { const act = actionOf(code); if (act) { app.act[act] = true; handleAction(act, true); } }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) app.mouseL = false;
    const code = e.button === 1 ? 'Mouse3' : e.button === 3 ? 'Mouse4' : e.button === 4 ? 'Mouse5' : null;
    if (code) { const act = actionOf(code); if (act) { app.act[act] = false; handleAction(act, false); } }
  });
  document.addEventListener('contextmenu', (e) => { if (app.mode === 'game') e.preventDefault(); });
  document.addEventListener('wheel', (e) => {
    if (app.mode !== 'game' || app.paused || !app.match || TAC.hud.buyOpen) return;
    const m = app.match, p = m.player;
    const order = ['primary', 'secondary', 'knife', 'grenade', 'bomb'].filter((s) => m.hasSlot(p, s));
    const i = order.indexOf(p.slot);
    m.switchSlot(p, order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length]);
  }, { passive: true });
  // Мышь: чувствительность как в оригинале - 0.022° на единицу движения, умноженные на множитель
  app.look = function (dx, dy) {
    const m = app.match, p = m && m.player;
    if (!p || !p.alive) return;
    const inp = TAC.settings.input;
    let k = inp.sens * 0.022 * DEG;
    const def = p.weaponDef();
    if (p.fire.scope > 0 && def.scope) k *= inp.zoomSens * (def.scope[p.fire.scope - 1] / TAC.settings.game.fov);
    if (inp.accel) k *= 1 + Math.min(1.5, Math.hypot(dx, dy) * 0.02);
    p.yaw = TAC.wrapAngle(p.yaw - dx * k);
    p.pitch = TAC.clamp(p.pitch - dy * k * (inp.invertY ? -1 : 1), -1.55, 1.55);
    if (app.vm) { app.vm.swayX = TAC.clamp(app.vm.swayX + dx * 0.00008, -0.02, 0.02); app.vm.swayY = TAC.clamp(app.vm.swayY - dy * 0.00008, -0.02, 0.02); }
  };
  document.addEventListener('mousemove', (e) => {
    if (app.mode !== 'game' || app.paused || !app.locked) return;
    app.look(e.movementX, e.movementY);
  });
  // Ввод игрока на шаг логики
  function applyInput() {
    const m = app.match, p = m.player, a = app.act, inp = p.input;
    inp.mz = (a.forward ? 1 : 0) - (a.back ? 1 : 0);
    inp.mx = (a.right ? 1 : 0) - (a.left ? 1 : 0);
    inp.jump = !!a.jump; inp.crouch = !!a.crouch; inp.walk = !!a.walk; inp.use = !!a.use;
    inp.fire = app.mouseL && !TAC.hud.buyOpen;
  }

  // ---------- Камера ----------
  function pickSpectate(m) {
    const p = m.player;
    if (p.alive || m.mode !== 'comp') return p;
    const mates = m.agents.filter((a) => a.alive && a.team === p.team);
    const pool = mates.length ? mates : m.agents.filter((a) => a.alive);
    if (!pool.length) return app.viewAgent && app.viewAgent !== p ? app.viewAgent : p;
    return pool[app.spectIdx % pool.length];
  }
  function updateCamera(m, alpha) {
    const cam = app.camera, a = app.viewAgent;
    const x = a.prev.x + (a.pos.x - a.prev.x) * alpha, y = a.prev.y + (a.pos.y - a.prev.y) * alpha, z = a.prev.z + (a.pos.z - a.prev.z) * alpha;
    let eyeY = a.eyeY();
    if (!a.alive) eyeY = 0.4;
    cam.position.set(x, y + eyeY, z);
    const f = a.fire;
    cam.rotation.set(a.pitch + f.punchY * DEG, a.yaw - f.punchX * DEG, 0, 'YXZ');
    // смерть в бою насмерть: смотреть на убийцу
    if (!a.alive && m.mode !== 'comp') { const k = m.killfeed[m.killfeed.length - 1]; const killer = k && m.agents.find((b) => b.name === k.killer); if (killer) cam.lookAt(killer.pos.x, killer.pos.y + 1.4, killer.pos.z); }
    const g = TAC.settings.game, def = a.weaponDef();
    const hf = f.scope > 0 && def.scope ? def.scope[f.scope - 1] : g.fov;
    const fov = vfov(hf);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (TAC.audio) TAC.audio.setListener(cam.position, a.yaw);
  }

  // ---------- Цикл ----------
  function frame(now) {
    const t0 = performance.now();
    const dtReal = Math.min(0.25, (now - app.last) / 1000);
    app.last = now;
    try {
      if (app.mode === 'game' && app.match) {
        const m = app.match;
        if (!app.paused && !app.manual) {
          app.acc += dtReal;
          let n = 0;
          while (app.acc >= DT && n < 8) { applyInput(); m.step(); app.acc -= DT; n++; }
          if (n >= 8) app.acc = 0;
        }
        app.alpha = app.manual ? 1 : TAC.clamp(app.acc / DT, 0, 1);
        renderGame(dtReal);
      } else if (app.menu3d) {
        renderMenu(dtReal);
        if (TAC.menu && TAC.menu.afterRender) TAC.menu.afterRender(app.renderer.domElement);
      }
    } catch (err) {
      console.error(err);
    }
    const t1 = performance.now();
    app.cpuMs.push(t1 - t0); if (app.cpuMs.length > 600) app.cpuMs.shift();
    app.frameMs.push(dtReal * 1000); if (app.frameMs.length > 600) app.frameMs.shift();
    app.fpsN++; app.fpsT += dtReal;
    if (app.fpsT >= 0.5) { app.fps = Math.round(app.fpsN / app.fpsT); app.fpsN = 0; app.fpsT = 0; if (TAC.settings.video.showFps) $('fps').textContent = app.fps + ' кадр/с · ' + (t1 - t0).toFixed(1) + ' мс'; }
    requestAnimationFrame(frame);
  }
  function renderGame(dt) {
    const m = app.match;
    const shadowsOn = TAC.settings.video.shadows !== 'off';
    app.viewAgent = pickSpectate(m);
    m.env.viewAgent = app.viewAgent;
    for (const a of m.agents) {
      a.updateMesh(app.alpha, m.time, shadowsOn);
      if (a.mesh) a.mesh.root.visible = a !== app.viewAgent || !a.alive;
    }
    for (const x of app.targetMeshes || []) { x.g.visible = x.t.alive; x.g.position.set(x.t.pos.x, x.t.pos.y, x.t.pos.z); x.g.lookAt(m.player.pos.x, x.t.pos.y, m.player.pos.z); }
    updateCamera(m, app.alpha);
    app.mapRender.sky.position.copy(app.camera.position);
    app.effects.update(dt, m.time);
    app.renderer.clear();
    app.renderer.render(app.scene, app.camera);
    // оружие в руках
    const a = app.viewAgent;
    if (a.alive) {
      const w = a.weapon(), def = a.weaponDef();
      app.vm.set(def, w && w.skin, a.team || 'T');
      if (a.fire.lastShot !== app.vmShot) { if (app.vmShot != null && m.time - a.fire.lastShot < 0.1) app.vm.onShot(def); app.vmShot = a.fire.lastShot; }
      app.vm.update(dt, a, m.time);
      app.vm.render(app.renderer);
    }
    TAC.hud.update(app, dt);
  }
  // выстрел и удар ножом тоже качают модель (lastShot ставится и для ножа)

  // ---------- Настройки ----------
  app.applySettings = function () {
    const s = TAC.settings;
    if (app.renderer && s.video.aa !== app.aa) makeRenderer();
    resize();
    const k = s.video.brightness;
    if (app.renderer) { app.renderer.shadowMap.enabled = s.video.shadows !== 'off'; app.renderer.toneMappingExposure = k; }
    for (const mr of [app.mapRender, app.menu3d && app.menu3d.mr]) {
      if (!mr) continue;
      mr.setShadows(s.video.shadows !== 'off');
      mr.sun.shadow.mapSize.set(s.video.shadows === 'high' ? 2048 : 1024, s.video.shadows === 'high' ? 2048 : 1024);
      if (mr.sun.shadow.map) { mr.sun.shadow.map.dispose(); mr.sun.shadow.map = null; }
      mr.setBrightness(k);
      for (const name of Object.keys(mr.mats)) mr.mats[name].map = TAC.texture(name, s.video.textures !== 'low');
      for (const f of mr.floorMeshes) { const n = f.userData.baked.map.userData.name; f.userData.baked.map = f.userData.live.map = TAC.texture(n, s.video.textures !== 'low'); f.userData.baked.needsUpdate = f.userData.live.needsUpdate = true; }
      for (const name of Object.keys(mr.mats)) mr.mats[name].needsUpdate = true;
    }
    if (app.mapRender) app.mapRender.setDistance(s.video.distance);
    if (app.camera) { app.camera.far = s.video.distance + 20; app.camera.updateProjectionMatrix(); }
    if (app.effects) app.effects.quality = s.video.particles;
    if (app.vm) { app.vm.setFov(s.game.vmFov); app.vm.offset.x = s.game.vmX; app.vm.offset.y = s.game.vmY; app.vm.offset.z = s.game.vmZ; }
    if (TAC.audio) TAC.audio.setLevels(s.audio);
    document.body.style.filter = '';
    TAC.hud.applySettings();
  };

  // ---------- Запуск ----------
  makeRenderer();
  buildMenuScene();
  app.applySettings();
  TAC.menu.init();
  // первый жест включает звук и музыку меню
  const unlockAudio = () => { if (TAC.audio.init()) { TAC.audio.setLevels(TAC.settings.audio); if (app.mode === 'menu') TAC.audio.startMusic(); } removeEventListener('pointerdown', unlockAudio); removeEventListener('keydown', unlockAudio); };
  addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
  requestAnimationFrame(frame);

  // ---------- Крючок для проверок ----------
  window.__tactical = {
    ready: true, app, TAC,
    // Матч сразу, логика шагает только по step() - повторяемо
    start(opts) {
      opts = Object.assign({ mode: 'comp', map: 'quarry', diff: 'medium', seed: Number(TAC.params.get('seed')) || 1 }, opts || {});
      $('menu').classList.remove('show');
      app.manual = opts.manual !== false;
      const m = app.createMatch(opts);
      return { mode: m.mode, map: m.mapId, side: m.player.team };
    },
    step(n) { const m = app.match; for (let i = 0; i < (n || 1); i++) m.step(); return m.time; },
    stepPlayer(n) { const m = app.match; for (let i = 0; i < (n || 1); i++) { applyInput(); m.step(); } return m.time; },
    get match() { return app.match; },
    get player() { return app.match && app.match.player; },
    fire(n) {
      const p = app.match.player; const out = [];
      for (let i = 0; i < (n || 1); i++) { p.input.fire = true; p.input.firePressed = true; app.match.step(); p.input.fire = false; out.push(p.fire.lastShot); }
      return out;
    },
    aimAt(x, y, z) { const p = app.match.player; const a = TAC.anglesTo(p.eye(), { x, y, z }); p.yaw = a.yaw; p.pitch = a.pitch; },
    buy(id) { return app.match.buy(app.match.player, id); },
    render() { renderGame(0.016); },
    viewmodelSkin() { renderGame(0.016); return app.vm && app.vm.skinMat ? app.vm.skinMat.userData.skin : null; },
    look(dx, dy) { app.look(dx, dy); },
    keydown(code) { document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); },
    keyup(code) { document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); },
    applyInput() { applyInput(); },
    perf() {
      const f = app.frameMs.slice(-300).sort((a, b) => a - b), c = app.cpuMs.slice(-300).sort((a, b) => a - b);
      const avg = (l) => l.reduce((s, v) => s + v, 0) / (l.length || 1);
      const worst1 = (l) => avg(l.slice(Math.floor(l.length * 0.99)));
      return { frames: f.length, avgFrame: avg(f), worst1Frame: worst1(f), avgCpu: avg(c), worst1Cpu: worst1(c) };
    },
    resetPerf() { app.frameMs.length = 0; app.cpuMs.length = 0; },
  };
})();

// Правила боя: урон по зонам и броне, разброс, узор отдачи, выстрел лучом, нож, гранаты.
(function () {
  'use strict';
  const TAC = window.TAC;
  const DEG = Math.PI / 180;

  // Урон одной пули по таблице: множитель зоны, падение с расстоянием, броня и шлем.
  TAC.calcDamage = function (def, zone, dist, armor, helmet) {
    let dmg = def.dmg * Math.pow(def.rangeMod || 1, (dist || 0) / 12.7) * (TAC.ZONES[zone] || 1);
    const armored = armor > 0 && zone !== 'legs' && (zone !== 'head' || helmet);
    if (!armored) return { hp: Math.floor(dmg), armor: 0 };
    let hp = dmg * def.pen, ar = (dmg - hp) * 0.5;
    if (ar > armor) { ar = armor; hp = dmg - armor * 2; }
    return { hp: Math.floor(hp), armor: Math.floor(ar) };
  };

  // Разброс (радианы) в эту секунду: стойка, бег, прыжок, присед, прицел, накопленный от стрельбы.
  TAC.inaccuracy = function (a, def) {
    const sp = def.spread;
    if (!sp) return 0;
    const scoped = a.fire.scope > 0 && sp.scoped != null;
    let base = scoped ? sp.scoped : sp.stand;
    const speed = Math.hypot(a.vel.x, a.vel.z);
    const frac = speed / (def.speed || 6);
    const moveF = TAC.clamp((frac - 0.34) / 0.66, 0, 1);
    base += (scoped ? sp.scopedMove : sp.move) * moveF;
    if (!a.onGround) base += sp.jump;
    if (a.crouch > 0.5 && a.onGround) base *= sp.crouch;
    return base + (a.fire.inacc || 0);
  };

  // Смещение отдачи для номера выстрела в очереди (дробный номер - плавный возврат)
  TAC.patternAt = function (def, spray) {
    const p = def.pattern;
    if (!p || !p.length) return [0, 0];
    const i = Math.min(p.length - 1, Math.floor(spray)), j = Math.min(p.length - 1, i + 1), f = spray - Math.floor(spray);
    return [p[i][0] + (p[j][0] - p[i][0]) * f, p[i][1] + (p[j][1] - p[i][1]) * f];
  };

  // Шаг состояния оружия: перезарядка, доставание, отдача возвращается, разброс остывает.
  TAC.weaponTick = function (a, dt, time) {
    const f = a.fire, w = a.weapon(), def = w && w.def;
    if (f.draw > 0) f.draw = Math.max(0, f.draw - dt);
    if (f.inspect > 0) f.inspect = Math.max(0, f.inspect - dt);
    if (f.reload > 0) {
      f.reload -= dt;
      if (f.reload <= 0) {
        f.reload = 0;
        if (w && def && def.mag) {
          const need = def.mag - w.mag, take = Math.min(need, w.reserve);
          w.mag += take; w.reserve -= take;
        }
      }
    }
    if (def && def.spread) {
      const idle = time - f.lastShot;
      if (idle > def.interval * 1.2) f.spray = Math.max(0, f.spray - dt * (def.spread.recover * 2.4));
      f.inacc = (f.inacc || 0) * Math.exp(-def.spread.recover * dt);
      const pat = TAC.patternAt(def, f.spray);
      f.punchX = pat[0] * (def.punch || 0.5); f.punchY = pat[1] * (def.punch || 0.5);
    } else { f.spray = 0; f.punchX *= Math.exp(-10 * dt); f.punchY *= Math.exp(-10 * dt); }
  };

  TAC.startReload = function (a) {
    const w = a.weapon();
    if (!w || !w.def.mag || a.fire.reload > 0 || w.mag >= w.def.mag || w.reserve <= 0) return false;
    a.fire.reload = w.def.reload;
    a.fire.scope = 0;
    a.fire.inspect = 0;
    return true;
  };

  // Выстрел из текущего оружия. Возвращает описание выстрела или null (не стреляет).
  // match даёт мир, бойцов, время, генератор случайностей и обработчик попаданий.
  TAC.fire = function (match, a, opts) {
    opts = opts || {};
    const w = a.weapon();
    if (!w) return null;
    const def = w.def, f = a.fire, time = match.time;
    if (f.reload > 0 || f.draw > 0 || time < f.next - 1e-6) return null;
    if (def.cat === 'knife') return knife(match, a, def, !!opts.heavy);
    if (def.cat === 'grenade') return match.throwGrenade(a, def, !!opts.heavy);
    if (def.cat === 'bomb') return null;
    if (w.mag <= 0) {
      f.next = time + 0.2;
      match.sound('empty', a);
      TAC.startReload(a);
      return null;
    }
    w.mag--;
    f.next = time + def.interval;
    f.inspect = 0;
    const eye = a.eye();
    const pat = TAC.patternAt(def, f.spray);
    const inacc = TAC.inaccuracy(a, def);
    const baseYaw = a.yaw - pat[0] * DEG + (a.aimOffYaw || 0);
    const basePitch = a.pitch + pat[1] * DEG + (a.aimOffPitch || 0);
    const shot = { agent: a, weapon: def.id, hits: [], ends: [], inacc, yaw: baseYaw, pitch: basePitch };
    const pellets = def.pellets || 1;
    const dir = { x: 0, y: 0, z: 0 };
    for (let p = 0; p < pellets; p++) {
      const ang = match.rng() * Math.PI * 2, rr = match.rng() * inacc;
      const yaw = baseYaw + Math.cos(ang) * rr / Math.max(0.2, Math.cos(basePitch));
      const pitch = basePitch + Math.sin(ang) * rr;
      TAC.dirFromAngles(yaw, pitch, dir);
      const res = TAC.traceBullet(match, a, eye, dir, 120);
      shot.ends.push(res);
      if (res.agent) shot.hits.push(res);
    }
    // урон по бойцам: дробь складывается
    const byVictim = new Map();
    for (const h of shot.hits) {
      const dmg = TAC.calcDamage(def, h.zone, h.t, h.agent.armor, h.agent.helmet);
      const prev = byVictim.get(h.agent) || { hp: 0, armor: 0, zone: h.zone, head: false, point: h.point };
      prev.hp += dmg.hp; prev.armor += dmg.armor; prev.head = prev.head || h.zone === 'head';
      if (h.zone === 'head') prev.zone = 'head';
      byVictim.set(h.agent, prev);
    }
    for (const [victim, d] of byVictim) match.applyDamage(a, victim, d.hp, d.armor, def, d.zone, d.point);
    f.spray += 1;
    f.lastShot = time;
    if (def.spread) f.inacc = Math.min(def.spread.max || 0.05, (f.inacc || 0) + (def.spread.shot || 0));
    if (def.cat === 'sniper') f.scope = 0;          // после выстрела винтовка выходит из прицела
    match.onShot(a, def, shot, eye);
    if (w.mag === 0 && w.reserve > 0 && !a.isBot && match.autoReload !== false) { /* игрок перезаряжает сам (R) или кликом по пустому */ }
    return shot;
  };

  // Луч пули: стены и пол останавливают, бойцы своей команды пропускают пулю (огонь по своим выкл.)
  TAC.traceBullet = function (match, a, o, d, maxT) {
    const wall = match.world.raycast(o, d, maxT);
    let best = wall ? wall.t : maxT, hitAgent = null, zone = null;
    for (const b of match.agents) {
      if (b === a || !b.alive) continue;
      if (a.team && b.team === a.team && !match.friendlyFire) continue;
      const r = TAC.rayAgent(o, d, best, b);
      if (r && r.t < best) { best = r.t; hitAgent = b; zone = r.zone; }
    }
    const point = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
    if (hitAgent) return { agent: hitAgent, zone, t: best, point };
    return { agent: null, t: best, point, wall };
  };

  function knife(match, a, def, heavy) {
    const f = a.fire;
    f.next = match.time + (heavy ? 60 / def.rpmHeavy : 60 / def.rpm);
    const eye = a.eye(), dir = TAC.dirFromAngles(a.yaw, a.pitch);
    const res = TAC.traceBullet(match, a, eye, dir, def.range);
    match.sound(heavy ? 'knifeHeavy' : 'knife', a);
    const shot = { agent: a, weapon: 'knife', hits: [], ends: [res], melee: true };
    if (res.agent) {
      // удар в спину сильнее
      const toA = Math.atan2(-(a.pos.x - res.agent.pos.x), -(a.pos.z - res.agent.pos.z));
      const back = Math.abs(TAC.wrapAngle(toA - res.agent.yaw)) > Math.PI * 0.6;
      let dmg = heavy ? (back ? 180 : def.dmgHeavy) : (back ? 90 : def.dmg);
      const armored = res.agent.armor > 0;
      const hp = Math.floor(armored ? dmg * def.pen : dmg), ar = armored ? Math.floor(dmg * (1 - def.pen) * 0.5) : 0;
      shot.hits.push(res);
      match.applyDamage(a, res.agent, hp, ar, def, 'chest', res.point);
    } else if (res.wall) match.effects && match.effects.impact(res.point, res.wall.normal, res.wall.mat);
    f.spray = 0;
    match.onShot(a, def, shot, eye);
    return shot;
  }

  // Урон от взрыва по бойцам в радиусе, стены закрывают
  TAC.explosionDamage = function (match, owner, pos, def) {
    const from = { x: pos.x, y: pos.y + 0.3, z: pos.z };
    for (const b of match.agents) {
      if (!b.alive) continue;
      const c = TAC.zonePoint(b, 'chest');
      const d = TAC.dist3(from, c);
      if (d > def.radius) continue;
      if (!match.world.clear(from, c) && !match.world.clear(from, TAC.zonePoint(b, 'head'))) continue;
      if (owner && owner !== b && owner.team && b.team === owner.team && !match.friendlyFire) continue;
      const raw = def.dmg * Math.pow(1 - d / def.radius, 1.2);
      const armored = b.armor > 0;
      const hp = Math.floor(armored ? raw * 0.57 : raw), ar = armored ? Math.floor(raw * 0.43 * 0.5) : 0;
      if (hp > 0) match.applyDamage(owner, b, hp, ar, def, 'chest', c);
    }
  };
})();

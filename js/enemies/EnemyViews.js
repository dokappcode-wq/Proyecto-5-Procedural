import * as THREE from 'three';
import { boulderSet } from '../render/Rocks.js';

/**
 * EnemyViews — modelos low-poly de los enemigos y su animación a partir del estado
 * de cada Enemy (sin lógica: solo lo dibujan).
 *
 *   GÓLEM       piedras que, dormido, están tiradas en el suelo y al despertar vuelan a
 *               su sitio (piernas, tronco, cabeza con ojos que brillan, brazos).
 *   SLIME       humanoide de baba: cuerpo translúcido verde con un núcleo, brazos que
 *               cuelgan y gotean, se tambalea y salta al moverse.
 *   GOBLIN      tipo mono: encorvado, brazos largos, cabeza grande con orejas, mazo.
 *   JEFE GOBLIN negro, más grande, ojos rojos, cuernos y collar de huesos.
 *
 * Todos miran a +Z (el rumbo del Enemy) y se apoyan en y = 0.
 */
const geoCache = new Map();
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const ico = () => geo('ico', () => new THREE.IcosahedronGeometry(1, 0));
const sphere = (seg = 10) => geo(`s${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(6, seg - 3)));
const cone = (seg = 6) => geo(`c${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
const cyl = (seg = 6) => geo(`y${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg));

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const mesh = (g, m, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
};

export function createEnemyView(enemy) {
  const make = { GOLEM: golemView, SLIME: slimeView, GOBLIN: goblinView, GOBLIN_BOSS: goblinView }[enemy.type];
  const view = make(enemy);
  view.root.name = `enemy_${enemy.id}`;
  view.bar = healthBar(enemy.def.HEIGHT * enemy.scale + 0.45);
  view.root.add(view.bar.group);
  return view;
}

/** Barra de vida sobre la cabeza (solo herido y despierto). */
function healthBar(y) {
  const group = new THREE.Group();
  group.position.y = y;
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false }));
  bg.scale.set(0.9, 0.09, 1);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe0413a, depthWrite: false }));
  fg.scale.set(0.86, 0.06, 1);
  bg.renderOrder = 5;
  fg.renderOrder = 6;
  group.add(bg, fg);
  group.visible = false;
  return {
    group,
    set(ratio, visible) {
      group.visible = visible;
      if (!visible) return;
      const r = Math.max(0.02, ratio);
      fg.scale.x = 0.86 * r;
      fg.center.set(1 / (2 * r), 0.5); // el borde izquierdo queda fijo
      fg.material.color.setHex(r > 0.5 ? 0x7bd34a : r > 0.25 ? 0xe6b23a : 0xe0413a);
    },
  };
}

function flash(materials, k, base = 0x000000) {
  for (const m of materials) {
    if (!m.emissive) continue;
    if (k > 0) m.emissive.setRGB(0.9 * k, 0.1 * k, 0.05 * k);
    else m.emissive.setHex(m.userData.emissive ?? base);
  }
}

// ---- Gólem -----------------------------------------------------------------------

function golemView(enemy) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); // el EnemySystem coloca `root`; la animación mueve `inner`
  root.add(inner);
  const rng = mulberry(hashStr(enemy.id));
  const rocks = boulderSet();
  const stone = lambert(0x837f75);
  const dark = lambert(0x66625a);
  const moss = lambert(0x4f6d2a);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0 });
  const mats = [stone, dark, moss];
  const rock = (m, [x, y, z], [sx, sy, sz]) => {
    const o = mesh(rocks[Math.floor(rng() * rocks.length)], m, [x, y, z], [sx, sy, sz]);
    o.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI, (rng() - 0.5) * 0.3);
    return o;
  };
  const mossCap = ([x, y, z], [sx, sz]) => {
    const o = mesh(rocks[Math.floor(rng() * rocks.length)], moss, [x, y, z], [sx, 0.07, sz]);
    o.rotation.y = rng() * 3;
    return o;
  };
  const parts = [];
  const part = (bodyPos, children) => {
    const g = new THREE.Group();
    g.position.set(...bodyPos);
    for (const c of children) g.add(c);
    inner.add(g);
    const a = rng() * Math.PI * 2;
    const r = 0.5 + rng() * 0.9;
    parts.push({
      obj: g,
      body: new THREE.Vector3(...bodyPos),
      bodyQ: new THREE.Quaternion(),
      pile: new THREE.Vector3(Math.cos(a) * r, 0.22 + rng() * 0.15, Math.sin(a) * r),
      pileQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, Math.PI / 2 + (rng() - 0.5))),
      delay: rng() * 0.35,
    });
    return g;
  };
  // Piernas cortas y gruesas con un pie de losa.
  const leg = (x) => part([x, 0.95, 0], [rock(dark, [0, -0.38, 0], [0.3, 0.42, 0.3]), rock(stone, [0, -0.82, 0.08], [0.32, 0.16, 0.38])]);
  const hipL = leg(-0.34);
  const hipR = leg(0.34);
  // Tronco ancho con un cristal pequeño en el pecho.
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0 }));
  crystal.position.set(0, 0.08, 0.5);
  crystal.scale.set(0.11, 0.17, 0.08);
  const torso = part([0, 1.52, 0], [
    rock(stone, [0, 0.05, 0], [0.82, 0.62, 0.55]),
    rock(dark, [0, -0.38, 0.04], [0.52, 0.3, 0.42]),
    rock(stone, [0, 0.22, -0.32], [0.62, 0.42, 0.34]),
    mossCap([0.1, 0.62, -0.12], [0.58, 0.42]),
    crystal,
  ]);
  torso.userData.stone = true;
  // Cabeza pequeña con dos ranuras que brillan.
  const eyes = [mesh(box(0.12, 0.045, 0.04), eyeMat, [-0.11, 0.02, 0.27]), mesh(box(0.12, 0.045, 0.04), eyeMat, [0.11, 0.02, 0.27])];
  const head = part([0, 2.18, 0.12], [rock(stone, [0, 0, 0], [0.33, 0.28, 0.3]), rock(dark, [0, 0.1, 0.18], [0.3, 0.07, 0.12]), mossCap([0, 0.25, -0.03], [0.26, 0.22]), ...eyes]);
  // Brazos largos con codo y puño grande.
  const arm = (x) => {
    const g = part([x, 1.88, 0], [rock(stone, [0, 0.05, 0], [0.32, 0.3, 0.32]), rock(stone, [0, -0.38, 0], [0.24, 0.38, 0.25])]);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.72, 0);
    elbow.add(rock(dark, [0, -0.25, 0.02], [0.24, 0.32, 0.25]), rock(stone, [0, -0.62, 0.05], [0.34, 0.27, 0.33]));
    g.add(elbow);
    g.userData.elbow = elbow;
    return g;
  };
  const armL = arm(-0.95);
  const armR = arm(0.95);
  root.scale.setScalar(enemy.scale);
  return {
    root,
    update(e, t, dt = 1 / 60) {
      // Montaje: cada piedra vuela de su sitio en el montón a su sitio en el cuerpo.
      let k = e.assemble;
      if (e.state === 'DEAD') k = Math.max(0, 1 - e.deathProgress * 1.6);
      for (const p of parts) {
        const u = smooth(clamp01((k - p.delay) / (1 - 0.35)));
        p.obj.position.lerpVectors(p.pile, p.body, u);
        p.obj.position.y += Math.sin(u * Math.PI) * 0.7;
        p.obj.quaternion.slerpQuaternions(p.pileQ, p.bodyQ, u);
      }
      const up = k >= 1;
      const glow = e.state === 'DEAD' ? 0 : clamp01(e.assemble * 1.4 - 0.3) * (0.8 + Math.sin(t * 5) * 0.2);
      eyeMat.opacity = glow;
      crystal.material.opacity = glow;
      if (up) {
        const z = Math.min(1, dt * 10);
        const moving = Math.min(1, e.speed / 1.2);
        const sw = Math.sin(e.gait) * moving;
        const hit = e.hitFlash / 0.3; // 1 → 0 justo tras recibir un golpe
        // Andar pesado: cadera que se balancea, hombros que giran, brazos que cuelgan.
        let legL = sw * 0.5;
        let legR = -sw * 0.5;
        let armLx = -sw * 0.35;
        let armRx = sw * 0.35;
        let elbowL = -0.25 - Math.max(0, sw) * 0.2;
        let elbowR = -0.25 - Math.max(0, -sw) * 0.2;
        let lean = 0.06 + moving * 0.08;
        let twist = Math.sin(e.gait) * 0.12 * moving;
        let dip = Math.abs(Math.sin(e.gait)) * 0.06 * moving;
        let spread = 0.12;
        if (e.windup > 0) {
          // Los dos puños juntos por encima de la cabeza (maza de dos manos).
          const w = smooth(e.windup);
          armLx = armRx = -2.9 * w;
          elbowL = elbowR = -0.7 * w;
          spread = 0.12 - 0.25 * w;
          lean = 0.06 - 0.3 * w;
          legL = 0.25 * w;
          legR = -0.3 * w;
          twist = 0;
        }
        if (e.strike > 0) {
          // ¡Golpe! Los puños bajan delante y el cuerpo se dobla.
          armLx = armRx = -0.95;
          elbowL = elbowR = -0.05;
          spread = -0.1;
          lean = 0.45;
          dip = -0.18;
          twist = 0;
        }
        // Al recibir un golpe: se tambalea hacia atrás.
        lean -= hit * 0.35;
        damp(hipL.rotation, 'x', legL, z);
        damp(hipR.rotation, 'x', legR, z);
        damp(armL.rotation, 'x', armLx, e.strike > 0 ? 1 : z);
        damp(armR.rotation, 'x', armRx, e.strike > 0 ? 1 : z);
        damp(armL.rotation, 'z', -spread, z);
        damp(armR.rotation, 'z', spread, z);
        damp(armL.userData.elbow.rotation, 'x', elbowL, z);
        damp(armR.userData.elbow.rotation, 'x', elbowR, z);
        damp(torso.rotation, 'x', lean, e.strike > 0 ? 1 : z);
        damp(torso.rotation, 'y', twist, z);
        damp(inner.rotation, 'z', Math.sin(e.gait) * 0.05 * moving, z);
        damp(inner.position, 'z', -hit * 0.25, z);
        torso.scale.y = 1 + Math.sin(t * 1.4) * 0.015 * (1 - moving);
        head.rotation.y = e.state === 'IDLE' ? Math.sin(t * 0.5) * 0.5 : Math.sin(t * 0.7) * 0.1;
        inner.position.y = dip;
      } else inner.position.y = 0;
      if (e.state === 'DEAD' && e.deathProgress > 0.75) inner.position.y = -(e.deathProgress - 0.75) * 2;
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

// ---- Slime -------------------------------------------------------------------------

function slimeView(enemy) {
  const root = new THREE.Group();
  const goo = new THREE.MeshPhongMaterial({ color: 0x6fdc4c, emissive: 0x16380c, specular: 0xeaffd8, shininess: 110, transparent: true, opacity: 0.72, depthWrite: false });
  goo.userData.emissive = 0x16380c;
  const core = lambert(0x2f6d1f);
  const eye = new THREE.MeshBasicMaterial({ color: 0x0b1a06 });
  const inner = new THREE.Group();
  root.add(inner);
  const puddle = mesh(cyl(10), goo, [0, 0.04, 0], [0.55, 0.08, 0.5]);
  const body = mesh(sphere(12), goo, [0, 0.7, 0], [0.42, 0.62, 0.36]);
  const nucleus = mesh(sphere(8), core, [0, 0.72, 0], [0.16, 0.2, 0.16]);
  const head = mesh(sphere(12), goo, [0, 1.32, 0.02], [0.3, 0.27, 0.28]);
  const eyes = [mesh(sphere(6), eye, [-0.11, 1.36, 0.24], [0.05, 0.065, 0.03]), mesh(sphere(6), eye, [0.11, 1.36, 0.24], [0.05, 0.065, 0.03])];
  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.05, 0);
  armL.add(mesh(sphere(8), goo, [0, -0.3, 0], [0.11, 0.36, 0.11]));
  const armR = new THREE.Group();
  armR.position.set(0.36, 1.05, 0);
  armR.add(mesh(sphere(8), goo, [0, -0.3, 0], [0.11, 0.36, 0.11]));
  const drips = [0, 1, 2].map((i) => mesh(sphere(6), goo, [i === 0 ? -0.4 : i === 1 ? 0.4 : 0.15, 0.4, 0.1], [0.05, 0.07, 0.05]));
  // Brillo en los ojos, boca torcida y burbujas que suben por dentro.
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sparkles = [-0.1, 0.12].map((x) => mesh(sphere(6), shine, [x, 1.385, 0.265], [0.016, 0.016, 0.01]));
  const mouth = mesh(geo('slimeMouth', () => new THREE.TorusGeometry(0.06, 0.012, 4, 10, Math.PI)), eye, [0.01, 1.25, 0.255]);
  mouth.rotation.set(0, 0, Math.PI + 0.15);
  const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xd8ffc8, transparent: true, opacity: 0.6, depthWrite: false });
  const bubbles = [0, 1, 2, 3].map((i) => mesh(sphere(6), bubbleMat, [(i - 1.5) * 0.08, 0.4, 0.05 * (i % 2)], [0.035, 0.035, 0.035]));
  inner.add(puddle, body, nucleus, head, ...eyes, ...sparkles, mouth, ...bubbles, armL, armR, ...drips);
  for (const o of [body, head, puddle]) o.castShadow = false;
  root.scale.setScalar(enemy.scale);
  return {
    root,
    update(e, t) {
      const hit = e.hitFlash / 0.3;
      const wob = Math.sin(t * 6 + e.x) * 0.06 - hit * 0.25; // al recibir: se aplasta
      const moving = Math.min(1, e.speed / 1.5);
      const hop = Math.abs(Math.sin(e.gait * 1.6)) * 0.25 * moving;
      let sy = 1 + wob;
      let lunge = 0;
      if (e.windup > 0) sy = 1 - 0.28 * smooth(e.windup);
      if (e.strike > 0) {
        sy = 1.15;
        lunge = e.strike * 1.2;
      }
      inner.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      inner.position.set(0, hop, lunge);
      armL.rotation.z = -0.25 + Math.sin(t * 3) * 0.1;
      armR.rotation.z = 0.25 - Math.sin(t * 3 + 1) * 0.1;
      armL.rotation.x = armR.rotation.x = e.windup > 0 ? -1.6 * e.windup : e.strike > 0 ? -1.2 : Math.sin(e.gait) * 0.3;
      bubbles.forEach((bb, i) => {
        const ph = (t * 0.35 + i * 0.27) % 1;
        bb.position.y = 0.35 + ph * 0.8;
        bb.scale.setScalar(0.02 + ph * 0.025);
      });
      drips.forEach((d, i) => {
        const ph = (t * 0.6 + i * 0.33) % 1;
        d.position.y = 0.45 - ph * 0.42;
        d.visible = ph < 0.95;
      });
      let fade = 0.72;
      if (e.state === 'DEAD') {
        const k = e.deathProgress;
        inner.scale.set(1 + k * 0.8, Math.max(0.05, 1 - k), 1 + k * 0.8);
        fade = 0.72 * (1 - k * 0.8);
      }
      goo.opacity = fade;
      flash([goo], e.hitFlash / 0.3, 0x16380c);
    },
  };
}

// ---- Goblin y jefe goblin --------------------------------------------------------------

function goblinView(enemy) {
  const boss = enemy.type === 'GOBLIN_BOSS';
  const root = new THREE.Group();
  const skin = lambert(boss ? 0x3c3744 : 0x6d8a3c);
  const skinDark = lambert(boss ? 0x26222c : 0x55702c);
  const cloth = lambert(boss ? 0x5a1a1a : 0x6b4a2b);
  const strap = lambert(0x3d2a1a);
  const wood = lambert(0x7a5a34);
  const iron = lambert(0x8e9296);
  const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff3a2a : 0xffe25a });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x120a04 });
  const bone = lambert(0xe9e2cf);
  const mats = [skin, skinDark, cloth];
  const ball = geo('gIco1', () => new THREE.IcosahedronGeometry(1, 1));
  const cap = (r, l) => geo(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 2, 7));
  const body = new THREE.Group();
  root.add(body);
  // Piernas cortas, dobladas, con pies grandes.
  const leg = (x) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.52, 0);
    hip.add(mesh(cap(0.075, 0.14), skin, [0, -0.12, 0.02]));
    const knee = new THREE.Group();
    knee.position.set(0, -0.25, 0.04);
    knee.add(mesh(cap(0.062, 0.12), skinDark, [0, -0.1, -0.02]));
    const foot = mesh(ball, skinDark, [0, -0.245, 0.06], [0.085, 0.045, 0.15]);
    knee.add(foot);
    for (const tx of [-0.04, 0, 0.04]) knee.add(mesh(ball, skinDark, [tx, -0.25, 0.2], [0.025, 0.022, 0.03]));
    hip.add(knee);
    body.add(hip);
    return { hip, knee };
  };
  const legL = leg(-0.14);
  const legR = leg(0.14);
  // Tronco encorvado, barriga, taparrabos y correa cruzada.
  const torso = new THREE.Group();
  torso.position.set(0, 0.6, 0);
  torso.rotation.x = 0.38;
  torso.add(
    mesh(ball, skin, [0, 0.29, 0], [0.24, 0.26, 0.17]),
    mesh(ball, skinDark, [0, 0.12, 0.08], [0.2, 0.17, 0.15]),
    mesh(cyl(9), cloth, [0, 0.0, 0], [0.22, 0.14, 0.17]),
  );
  for (let i = 0; i < 5; i++) torso.add(mesh(box(0.08, 0.12, 0.02), cloth, [-0.14 + i * 0.07, -0.1, 0.165 - Math.abs(i - 2) * 0.012]));
  const belt = mesh(box(0.06, 0.62, 0.03), strap, [0, 0.27, 0.17]);
  belt.rotation.z = 0.7;
  torso.add(belt);
  if (boss) {
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + (i / 6) * 2.4;
      const tooth = mesh(cone(5), bone, [Math.sin(a) * 0.19, 0.46 - Math.cos(a) * 0.06, 0.15], [0.025, 0.08, 0.025]);
      tooth.rotation.x = Math.PI;
      torso.add(tooth);
    }
  }
  body.add(torso);
  // Cabeza grande: nariz larga, boca con colmillos, ojos con pupila y orejas en punta.
  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.06);
  head.add(
    mesh(ball, skin, [0, 0.2, 0.03], [0.24, 0.21, 0.22]),
    mesh(ball, skinDark, [0, 0.29, 0.17], [0.19, 0.05, 0.07]), // ceño
    mesh(box(0.2, 0.035, 0.03), new THREE.MeshBasicMaterial({ color: 0x2a0f0a }), [0, 0.09, 0.225]),
  );
  const nose = mesh(cone(5), skinDark, [0, 0.19, 0.28], [0.045, 0.16, 0.05]);
  nose.rotation.x = Math.PI / 2 + 0.25;
  head.add(nose);
  for (const s2 of [-1, 1]) {
    const fang = mesh(cone(4), bone, [s2 * 0.06, 0.115, 0.225], [0.016, 0.045, 0.016]);
    head.add(fang);
    head.add(mesh(ball, eyeMat, [s2 * 0.085, 0.235, 0.19], [0.042, 0.036, 0.025]));
    head.add(mesh(box(0.012, 0.04, 0.01), pupil, [s2 * 0.085, 0.235, 0.214]));
    const ear = mesh(cone(4), skin, [s2 * 0.3, 0.25, -0.02], [0.07, 0.36, 0.025]);
    ear.rotation.set(0, s2 * 0.35, s2 * -1.25);
    head.add(ear);
  }
  if (boss) {
    const hornL = mesh(cone(5), bone, [-0.13, 0.42, 0.02], [0.05, 0.22, 0.05]);
    hornL.rotation.z = 0.35;
    const hornR = mesh(cone(5), bone, [0.13, 0.42, 0.02], [0.05, 0.22, 0.05]);
    hornR.rotation.z = -0.35;
    head.add(hornL, hornR);
  }
  torso.add(head);
  // Brazos largos con codo y mano de tres garras; el derecho lleva una porra con clavos.
  const arm = (x) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(x, 0.44, 0.02);
    shoulder.add(mesh(cap(0.055, 0.2), skin, [0, -0.15, 0]));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.31, 0);
    elbow.add(mesh(cap(0.05, 0.2), skinDark, [0, -0.14, 0]));
    const hand = new THREE.Group();
    hand.position.set(0, -0.32, 0.02);
    hand.add(mesh(ball, skinDark, [0, 0, 0], [0.065, 0.06, 0.065]));
    for (const cx of [-0.035, 0, 0.035]) {
      const claw = mesh(cone(4), bone, [cx, -0.06, 0.03], [0.012, 0.05, 0.012]);
      claw.rotation.x = Math.PI - 0.4;
      hand.add(claw);
    }
    elbow.add(hand);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  const armL = arm(-0.29);
  const armR = arm(0.29);
  const mallet = new THREE.Group();
  mallet.rotation.x = Math.PI / 2; // el mango sale hacia delante
  const clubGeo = geo('club', () => new THREE.CylinderGeometry(0.085, 0.032, 0.8, 7));
  mallet.add(mesh(clubGeo, wood, [0, 0.36, 0]));
  if (boss) mallet.add(mesh(box(0.34, 0.22, 0.22), lambert(0x4a4a52), [0, 0.72, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const spike = mesh(cone(4), iron, [Math.cos(a) * 0.08, 0.58 + (i % 2) * 0.1, Math.sin(a) * 0.08], [0.018, 0.07, 0.018]);
    spike.rotation.set(Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4);
    mallet.add(spike);
  }
  armR.hand.add(mallet);
  root.scale.setScalar(enemy.scale);
  return {
    root,
    update(e, t, dt = 1 / 60) {
      const z = Math.min(1, dt * 12);
      const moving = Math.min(1, e.speed / 2);
      const run = clamp01((e.speed - 2) / 2); // corriendo (persiguiendo)
      const ph = e.gait * 1.4;
      const sw = Math.sin(ph) * moving;
      const hit = e.hitFlash / 0.3;
      // Piernas: zancada (más larga corriendo) con rodillas que se doblan.
      let hipL = sw * (0.7 + run * 0.35) - 0.25;
      let hipR = -sw * (0.7 + run * 0.35) - 0.25;
      let kneeL = 0.35 + Math.max(0, -Math.cos(ph)) * (0.6 + run * 0.5) * moving;
      let kneeR = 0.35 + Math.max(0, Math.cos(ph)) * (0.6 + run * 0.5) * moving;
      // Brazo libre: bombea al correr; quieto, a veces se rasca la cabeza.
      let armLx = -sw * (0.6 + run * 0.6) - 0.2;
      let elbowL = -0.4 - run * 0.7;
      const idle = e.state === 'IDLE' && moving < 0.1;
      const scratch = idle ? clamp01(Math.sin(t * 0.45 + e.x) * 3 - 2) : 0;
      if (scratch > 0) {
        armLx = -2.5 * scratch - 0.2 * (1 - scratch);
        elbowL = -0.4 - 1.6 * scratch;
      }
      let bodyY = Math.abs(Math.sin(ph)) * (0.05 + run * 0.06) * moving + Math.sin(t * 2.2) * 0.01 - 0.03;
      let bodyZ = 0;
      // La porra: amago lento por encima de la cabeza… y salto con golpe.
      let a = sw * 0.6 - 0.25;
      let el = -0.5;
      let lean = 0.38 + run * 0.2;
      if (e.windup > 0) {
        const w = smooth(e.windup);
        a = -2.9 * w;
        el = -0.5 - 0.9 * w;
        lean = 0.38 - 0.3 * w;
        hipL = hipR = -0.25 - 0.45 * w; // se agacha para saltar
        kneeL = kneeR = 0.35 + 0.8 * w;
        bodyY = -0.12 * w;
      }
      if (e.strike > 0) {
        const k2 = e.strike / 0.35; // 1 → 0
        a = -0.3;
        el = -0.05;
        lean = 0.7;
        bodyY = Math.sin(k2 * Math.PI) * 0.18;
        bodyZ = (1 - k2) * 0.3;
        hipL = -0.6;
        hipR = 0.2;
      }
      // Golpeado: se echa atrás y encoge la cabeza.
      lean -= hit * 0.5;
      bodyZ -= hit * 0.15;
      damp(legL.hip.rotation, 'x', hipL, z);
      damp(legR.hip.rotation, 'x', hipR, z);
      damp(legL.knee.rotation, 'x', kneeL, z);
      damp(legR.knee.rotation, 'x', kneeR, z);
      damp(armL.shoulder.rotation, 'x', armLx, z);
      damp(armL.elbow.rotation, 'x', elbowL, z);
      damp(armR.shoulder.rotation, 'x', a, e.strike > 0 ? 1 : z);
      damp(armR.elbow.rotation, 'x', el, e.strike > 0 ? 1 : z);
      damp(torso.rotation, 'x', lean, e.strike > 0 ? 1 : z);
      damp(torso.rotation, 'y', Math.sin(ph) * 0.15 * moving, z);
      body.position.y = bodyY;
      damp(body.position, 'z', bodyZ, z);
      // Cabeza: mira alrededor quieto; al correr, hacia delante; sacudida al recibir.
      const look = idle ? Math.sin(t * 0.8 + e.x) * 0.5 : 0;
      damp(head.rotation, 'y', look, Math.min(1, dt * 4));
      head.rotation.x = -0.25 - run * 0.15 + Math.sin(t * 1.7 + e.z) * 0.04 + hit * 0.3;
      if (e.state === 'DEAD') {
        const k = smooth(Math.min(1, e.deathProgress * 1.6));
        body.rotation.x = -k * Math.PI * 0.48;
        body.rotation.z = k * 0.35;
        body.position.y = k * 0.15 - Math.max(0, e.deathProgress - 0.7) * 1.2 + Math.sin(Math.min(1, e.deathProgress * 2.2) * Math.PI) * 0.12;
      } else {
        body.rotation.x = 0;
        body.rotation.z = 0;
      }
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

// ---- Base goblin ------------------------------------------------------------------------

/**
 * Base de goblins alrededor de un árbol grande: chozas de pieles, empalizada de
 * estacas con una entrada, hoguera y un tótem. Devuelve la malla y sus obstáculos.
 * @returns {{ group: THREE.Group, colliders: {x,z,r,h}[], fire: THREE.Object3D }}
 */
export function buildGoblinBase(site, groundAt, rng) {
  const group = new THREE.Group();
  group.name = `goblinBase_${site.id}`;
  const cx = site.x;
  const cz = site.z;
  const y0 = groundAt(cx, cz);
  group.position.set(cx, y0, cz);
  const colliders = [];
  const bark = lambert(0x5b4128);
  const leaves = lambert(0x355f2a);
  const leaves2 = lambert(0x2c5224);
  const hide = lambert(0x8b6a45);
  const hideDark = lambert(0x6e5034);
  const stake = lambert(0x7a5a36);
  const stoneM = lambert(0x77746c);
  const bone = lambert(0xe9e2cf);
  const local = (x, z) => groundAt(cx + x, cz + z) - y0;
  // Árbol grande en el centro.
  const trunk = mesh(cyl(8), bark, [0, 4, 0], [0.85, 8, 0.85]);
  trunk.scale.set(0.85, 8, 0.85);
  group.add(trunk, mesh(cyl(7), bark, [0.9, 6.3, 0], [0.18, 2.4, 0.18]));
  group.children[group.children.length - 1].rotation.z = -0.9;
  for (const [x, y, z, r, m] of [[0, 9.5, 0, 3.6, leaves], [1.8, 8.4, 0.8, 2.6, leaves2], [-1.6, 8.6, -1, 2.8, leaves2], [0.4, 11, -0.5, 2.4, leaves]]) {
    group.add(mesh(ico(), m, [x, y, z], [r, r * 0.8, r]));
  }
  colliders.push({ x: cx, z: cz, r: 1.05, h: 9 });
  // Plataforma con barandilla alrededor del tronco (casa del árbol).
  const deck = mesh(cyl(10), stake, [0, 4.2, 0], [2.6, 0.18, 2.6]);
  group.add(deck);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    group.add(mesh(box(0.08, 0.7, 0.08), stake, [Math.cos(a) * 2.5, 4.6, Math.sin(a) * 2.5]));
  }
  // Escalera de mano.
  const ladder = new THREE.Group();
  ladder.position.set(0, 0, 2.7);
  ladder.add(mesh(box(0.07, 4.3, 0.07), stake, [-0.25, 2.1, 0]), mesh(box(0.07, 4.3, 0.07), stake, [0.25, 2.1, 0]));
  for (let i = 0; i < 9; i++) ladder.add(mesh(box(0.55, 0.05, 0.06), stake, [0, 0.35 + i * 0.45, 0]));
  ladder.rotation.x = -0.12;
  group.add(ladder);
  // Chozas de pieles alrededor.
  const huts = 3;
  for (let i = 0; i < huts; i++) {
    const a = site.yaw + (i / huts) * Math.PI * 2 + 0.6;
    const x = Math.cos(a) * 7.5;
    const z = Math.sin(a) * 7.5;
    const hut = new THREE.Group();
    hut.position.set(x, local(x, z), z);
    hut.rotation.y = -a + Math.PI / 2;
    hut.add(mesh(cone(7), i % 2 ? hide : hideDark, [0, 1.25, 0], [1.7, 2.5, 1.7]));
    for (let k = 0; k < 4; k++) {
      const s = mesh(cyl(5), stake, [Math.cos(k * 1.6) * 0.3, 2.6, Math.sin(k * 1.6) * 0.3], [0.04, 0.8, 0.04]);
      s.rotation.z = Math.cos(k * 1.6) * 0.4;
      s.rotation.x = Math.sin(k * 1.6) * 0.4;
      hut.add(s);
    }
    hut.add(mesh(box(0.7, 1.0, 0.05), lambert(0x2b2016), [0, 0.5, 1.45]));
    group.add(hut);
    colliders.push({ x: cx + x, z: cz + z, r: 1.6, h: 2.6 });
  }
  // Empalizada de estacas afiladas con una entrada.
  const R = 13;
  const n = Math.round((Math.PI * 2 * R) / 0.75);
  const gate = site.yaw;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(wrap(a - gate)) < 0.17) continue; // entrada
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    const h = 1.6 + rng() * 0.6;
    const y = local(x, z);
    group.add(mesh(cyl(5), stake, [x, y + h / 2, z], [0.13, h, 0.13]), mesh(cone(5), stake, [x, y + h + 0.18, z], [0.13, 0.36, 0.13]));
    colliders.push({ x: cx + x, z: cz + z, r: 0.28, h });
  }
  // Calaveras sobre las estacas de la entrada.
  for (const s of [-1, 1]) {
    const a = gate + s * 0.2;
    const x = Math.cos(a) * R;
    const z = Math.sin(a) * R;
    group.add(mesh(box(0.22, 0.2, 0.22), bone, [x, local(x, z) + 2.3, z]));
  }
  // Hoguera.
  const fx = Math.cos(gate) * 4;
  const fz = Math.sin(gate) * 4;
  const fire = new THREE.Group();
  fire.position.set(fx, local(fx, fz), fz);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    fire.add(mesh(ico(), stoneM, [Math.cos(a) * 0.65, 0.1, Math.sin(a) * 0.65], [0.18, 0.13, 0.18]));
  }
  for (let i = 0; i < 3; i++) {
    const log = mesh(cyl(5), bark, [0, 0.12, 0], [0.08, 1.0, 0.08]);
    log.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0);
    fire.add(log);
  }
  const flames = new THREE.Group();
  const fl1 = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const fl2 = new THREE.MeshBasicMaterial({ color: 0xffd25a });
  flames.add(mesh(cone(6), fl1, [0, 0.45, 0], [0.32, 0.8, 0.32]), mesh(cone(6), fl2, [0.05, 0.4, 0.04], [0.18, 0.55, 0.18]));
  fire.add(flames);
  fire.userData.flames = flames;
  group.add(fire);
  // Tótem con una cara de goblin.
  const tx = Math.cos(gate + 0.9) * 5.5;
  const tz = Math.sin(gate + 0.9) * 5.5;
  const totem = new THREE.Group();
  totem.position.set(tx, local(tx, tz), tz);
  totem.add(mesh(cyl(6), bark, [0, 1.3, 0], [0.18, 2.6, 0.18]), mesh(box(0.55, 0.5, 0.45), lambert(0x6d8a3c), [0, 2.75, 0]), mesh(box(0.1, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffe25a }), [-0.12, 2.82, 0.23]), mesh(box(0.1, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xffe25a }), [0.12, 2.82, 0.23]));
  totem.rotation.y = -(gate + 0.9) - Math.PI / 2;
  group.add(totem);
  colliders.push({ x: cx + tx, z: cz + tz, r: 0.35, h: 3 });
  group.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
  });
  return { group, colliders, fire };
}

// ---- utilidades ----------------------------------------------------------------------------

/** Acerca o[k] a v (suavizado por fotograma: k = fracción). */
function damp(o, key, v, k) {
  o[key] += (v - o[key]) * k;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v) {
  return v * v * (3 - 2 * v);
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import * as THREE from 'three';

/**
 * CreatureViews — modelos low-poly y animación de los enemigos nuevos (P10):
 *
 *   ARAÑA       cuerpo en dos partes, ocho patas que se mueven a pares, ojos rojos y
 *               colmillos; se levanta sobre las patas de atrás antes de morder.
 *   MURCIÉLAGO  cuelga del techo boca abajo con las alas plegadas; al despertar se suelta
 *               y revolotea en zigzag batiendo las alas.
 *   LOBO        cuadrúpedo gris de ojos amarillos; trota, corre a saltos y se agacha antes
 *               de lanzarse.
 *   CANGREJO    caparazón ancho, ojos en pedúnculos y dos pinzas que se abren; anda de lado.
 *
 * Igual que EnemyViews: miran a +Z (el rumbo del Enemy), se apoyan en y = 0 y no tienen
 * lógica (solo dibujan el estado del Enemy).
 */
const geoCache = new Map();
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const sphere = (seg = 8) => geo(`s${seg}`, () => new THREE.SphereGeometry(1, seg, Math.max(5, seg - 3)));
const ico = () => geo('ico1', () => new THREE.IcosahedronGeometry(1, 1));
const cone = (seg = 5) => geo(`c${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
const cyl = (seg = 6) => geo(`y${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg));
const box = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
const mesh = (g, m, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
};
/** Segmento (cilindro) de longitud `len` que sale de (0,0,0) hacia -Y. */
const limb = (r, len, mat) => {
  const g = new THREE.Group();
  g.add(mesh(cyl(5), mat, [0, -len / 2, 0], [r, len, r]));
  return g;
};

function flash(materials, k) {
  for (const m of materials) {
    if (!m.emissive) continue;
    if (k > 0) m.emissive.setRGB(0.9 * k, 0.1 * k, 0.05 * k);
    else m.emissive.setHex(m.userData.emissive ?? 0);
  }
}
const damp = (o, key, v, k) => (o[key] += (v - o[key]) * k);
const smooth = (v) => v * v * (3 - 2 * v);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function creatureView(enemy) {
  const make = { SPIDER: spiderView, BAT: batView, WOLF: wolfView, CRAB: crabView }[enemy.type];
  return make ? make(enemy) : null;
}

// ---- Araña -----------------------------------------------------------------------------

function spiderView(enemy) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = lambert(0x2b2420);
  const hair = lambert(0x3d332b);
  const mark = lambert(0xa3201c);
  const eyeMat = glow(0xff3020);
  const fangMat = lambert(0x1a1210);
  const mats = [shell, hair];
  const abdomen = mesh(ico(), shell, [0, 0.5, -0.45], [0.42, 0.34, 0.52]);
  const thorax = mesh(ico(), hair, [0, 0.42, 0.08], [0.27, 0.2, 0.3]);
  const head = new THREE.Group();
  head.position.set(0, 0.42, 0.34);
  head.add(mesh(ico(), shell, [0, 0, 0], [0.17, 0.14, 0.15]));
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) head.add(mesh(sphere(5), eyeMat, [s * (0.04 + i * 0.025), 0.06 - (i % 2) * 0.04, 0.12 - i * 0.012], [0.022, 0.022, 0.016]));
  }
  const fangs = [-1, 1].map((s) => {
    const f = mesh(cone(4), fangMat, [s * 0.05, -0.09, 0.12], [0.025, 0.12, 0.025]);
    f.rotation.x = Math.PI + 0.3;
    head.add(f);
    return f;
  });
  body.add(abdomen, thorax, head, mesh(sphere(6), mark, [0, 0.74, -0.5], [0.09, 0.05, 0.16]));
  // Ocho patas: muslo hacia arriba y fuera, tibia hacia el suelo.
  const legs = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.2, 0.42, 0.22 - i * 0.14);
      const spread = (i - 1.5) * 0.42;
      hip.rotation.y = s * (Math.PI / 2) - s * spread;
      const thigh = limb(0.035, 0.5, hair);
      thigh.rotation.z = Math.PI * 0.72; // sube hacia fuera
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      const shin = limb(0.028, 0.72, shell);
      shin.rotation.z = -Math.PI * 0.62;
      knee.add(shin);
      thigh.add(knee);
      hip.add(thigh);
      body.add(hip);
      legs.push({ hip, thigh, s, i, base: hip.rotation.y });
    }
  }
  root.scale.setScalar(enemy.scale);
  return {
    root,
    update(e, t, dt = 1 / 60) {
      const z = Math.min(1, dt * 12);
      const moving = clamp01(e.speed / 2.5);
      const ph = e.gait * 2.2;
      legs.forEach((L) => {
        // Patas alternas (1 y 3 de un lado con 2 y 4 del otro).
        const phase = ph + (L.i % 2 === (L.s > 0 ? 0 : 1) ? 0 : Math.PI);
        L.hip.rotation.y = L.base + Math.sin(phase) * 0.35 * moving;
        L.thigh.rotation.z = Math.PI * 0.72 + Math.max(0, Math.cos(phase)) * 0.3 * moving;
      });
      let rear = 0;
      let lunge = 0;
      if (e.windup > 0) rear = smooth(e.windup);
      if (e.strike > 0) {
        rear = 0.4;
        lunge = (e.strike / 0.35) * 0.45;
      }
      damp(body.rotation, 'x', -rear * 0.55, z);
      body.position.z = lunge;
      body.position.y = Math.abs(Math.sin(ph)) * 0.03 * moving + rear * 0.12;
      fangs.forEach((f, k) => (f.rotation.z = (k ? -1 : 1) * (0.2 + rear * 0.5 + Math.sin(t * 9) * 0.05)));
      abdomen.scale.y = 0.34 + Math.sin(t * 3) * 0.015;
      if (e.state === 'DEAD') {
        const k = smooth(Math.min(1, e.deathProgress * 1.8));
        body.rotation.z = k * Math.PI;
        body.position.y = k * 0.8 - Math.max(0, e.deathProgress - 0.7) * 1.5;
        legs.forEach((L) => (L.thigh.rotation.z = Math.PI * (0.72 + k * 0.2)));
      } else body.rotation.z = 0;
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

// ---- Murciélago ------------------------------------------------------------------------

function batView(enemy) {
  const root = new THREE.Group();
  const flyer = new THREE.Group();
  root.add(flyer);
  const fur = lambert(0x3a2f2c);
  const skin = lambert(0x5a4640, { side: THREE.DoubleSide });
  const eyeMat = glow(0xffd84a);
  const mats = [fur, skin];
  flyer.add(mesh(sphere(7), fur, [0, 0, 0], [0.12, 0.13, 0.17]));
  const head = new THREE.Group();
  head.position.set(0, 0.06, 0.15);
  head.add(mesh(sphere(6), fur, [0, 0, 0], [0.09, 0.08, 0.08]));
  for (const s of [-1, 1]) {
    const ear = mesh(cone(4), fur, [s * 0.05, 0.09, -0.01], [0.03, 0.09, 0.02]);
    ear.rotation.z = -s * 0.3;
    head.add(ear, mesh(sphere(4), eyeMat, [s * 0.035, 0.015, 0.07], [0.014, 0.014, 0.01]));
  }
  flyer.add(head);
  // Alas: membrana triangular (dos tramos) que se pliega.
  const wingGeo = geo('batWing', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.08, 0.28, 0.02, 0.05, 0, 0, -0.1, 0.28, 0.02, 0.05, 0.5, -0.04, -0.02, 0, 0, -0.1, 0.5, -0.04, -0.02, 0.3, -0.03, -0.16, 0, 0, -0.1], 3));
    g.computeVertexNormals();
    return g;
  });
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Group();
    w.position.set(s * 0.08, 0.02, 0);
    const m = new THREE.Mesh(wingGeo, skin);
    m.scale.x = s;
    m.castShadow = true;
    w.add(m);
    flyer.add(w);
    return { w, s };
  });
  root.scale.setScalar(enemy.scale);
  const fly = enemy.def.FLY ?? 1.5;
  return {
    root,
    update(e, t) {
      const awake = e.assemble; // 0 colgado · 1 volando
      const k = smooth(clamp01(awake));
      // Colgado: boca abajo, alas plegadas, cerca del techo.
      const hang = 1 - k;
      const zig = Math.sin(t * 5 + e.x) * 0.25 * k;
      const bob = Math.sin(t * 7 + e.z) * 0.15 * k;
      let dive = 0;
      if (e.windup > 0) dive = -smooth(e.windup) * 0.5;
      if (e.strike > 0) dive = -0.8 * (e.strike / 0.35);
      flyer.position.set(zig, fly + hang * 1.5 + bob + dive, 0);
      flyer.rotation.z = hang * Math.PI;
      flyer.rotation.x = k * (0.2 + (e.windup > 0 ? 0.5 : 0));
      const flap = k > 0.05 ? Math.sin(t * 22 + e.x) : 0;
      wings.forEach(({ w, s }) => {
        w.rotation.z = s * (hang * 1.3 + flap * 0.9 * k);
        w.scale.x = 0.35 + 0.65 * k;
      });
      if (e.state === 'DEAD') {
        const d = smooth(Math.min(1, e.deathProgress * 1.5));
        flyer.position.y = (fly + 0.3) * (1 - d) + 0.08;
        flyer.rotation.z = d * 1.6;
        wings.forEach(({ w, s }) => (w.rotation.z = s * 1.2));
      }
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

// ---- Lobo ------------------------------------------------------------------------------

function wolfView(enemy) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = lambert(0x6b6e74);
  const back = lambert(0x45484e);
  const belly = lambert(0xa9abaf);
  const nose = lambert(0x1c1c1e);
  const eyeMat = glow(0xffd23a);
  const tooth = lambert(0xece6d6);
  const mats = [fur, back, belly];
  const torso = new THREE.Group();
  torso.position.set(0, 0.72, 0);
  torso.add(
    mesh(ico(), fur, [0, 0, 0.12], [0.26, 0.28, 0.42]),
    mesh(ico(), back, [0, 0.07, -0.25], [0.22, 0.22, 0.36]),
    mesh(ico(), belly, [0, -0.1, 0.05], [0.18, 0.16, 0.36]),
    mesh(ico(), back, [0, 0.16, 0.0], [0.16, 0.1, 0.42]), // lomo
  );
  body.add(torso);
  // Cuello y cabeza.
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.48);
  head.add(
    mesh(ico(), fur, [0, 0.02, 0], [0.17, 0.16, 0.18]),
    mesh(box(), fur, [0, -0.04, 0.2], [0.13, 0.11, 0.24]), // hocico
    mesh(sphere(5), nose, [0, -0.01, 0.33], [0.035, 0.03, 0.03]),
    mesh(box(), belly, [0, -0.1, 0.16], [0.11, 0.04, 0.2]),
  );
  for (const s of [-1, 1]) {
    const ear = mesh(cone(4), back, [s * 0.08, 0.17, -0.03], [0.05, 0.13, 0.035]);
    ear.rotation.z = -s * 0.2;
    head.add(ear, mesh(sphere(4), eyeMat, [s * 0.075, 0.06, 0.13], [0.025, 0.02, 0.012]));
    const fang = mesh(cone(4), tooth, [s * 0.035, -0.11, 0.27], [0.012, 0.04, 0.012]);
    fang.rotation.x = Math.PI;
    head.add(fang);
  }
  torso.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.12, -0.55);
  const tailMesh = mesh(cone(5), back, [0, 0, -0.22], [0.07, 0.48, 0.07]);
  tailMesh.rotation.x = -Math.PI / 2;
  tail.add(tailMesh);
  torso.add(tail);
  // Patas: muslo y caña.
  const legs = [];
  for (const [x, zz, front] of [[-0.14, 0.32, true], [0.14, 0.32, true], [-0.14, -0.36, false], [0.14, -0.36, false]]) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.08, zz);
    const upper = limb(0.055, 0.34, fur);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    knee.add(limb(0.04, 0.32, back));
    upper.add(knee);
    hip.add(upper);
    torso.add(hip);
    legs.push({ upper, knee, front, side: x < 0 ? 0 : 1 });
  }
  root.scale.setScalar(enemy.scale);
  return {
    root,
    update(e, t, dt = 1 / 60) {
      const z = Math.min(1, dt * 12);
      const moving = clamp01(e.speed / 1.5);
      const run = clamp01((e.speed - 3) / 3);
      const ph = e.gait * (1.2 + run * 0.3);
      legs.forEach((L) => {
        // Trote: diagonales juntas; galope: delanteras juntas y traseras juntas.
        const trot = (L.front ? 0 : Math.PI) + (L.side ? Math.PI : 0);
        const gallop = L.front ? 0 : Math.PI * 0.8;
        const off = trot * (1 - run) + gallop * run;
        const sw = Math.sin(ph + off) * (0.55 + run * 0.4) * moving;
        damp(L.upper.rotation, 'x', sw, z);
        damp(L.knee.rotation, 'x', (L.front ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * 0.7 * moving, z);
      });
      let crouch = 0;
      let lunge = 0;
      if (e.windup > 0) crouch = smooth(e.windup);
      if (e.strike > 0) lunge = (e.strike / 0.35);
      torso.position.y = 0.72 - crouch * 0.22 + Math.abs(Math.sin(ph)) * 0.05 * moving * (1 + run) + lunge * 0.15;
      torso.position.z = lunge * 0.5;
      damp(torso.rotation, 'x', crouch * 0.18 - lunge * 0.25 + Math.sin(ph) * 0.06 * run, z);
      head.rotation.x = crouch * 0.35 - lunge * 0.3 + (e.state === 'IDLE' ? Math.sin(t * 0.7 + e.x) * 0.15 : 0);
      tail.rotation.x = 0.4 + run * 0.3 - crouch * 0.5 + Math.sin(t * 4) * 0.08;
      tail.rotation.y = Math.sin(t * (e.hostile ? 2 : 5)) * 0.25;
      if (e.state === 'DEAD') {
        const k = smooth(Math.min(1, e.deathProgress * 1.6));
        body.rotation.z = k * Math.PI * 0.5;
        body.position.y = k * 0.25 - Math.max(0, e.deathProgress - 0.7) * 1.5;
      } else body.rotation.z = 0;
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

// ---- Cangrejo gigante --------------------------------------------------------------------

function crabView(enemy) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const shell = lambert(0xc4502a);
  const under = lambert(0xe9a06e);
  const dark = lambert(0x7a2a16);
  const eyeMat = glow(0x111111);
  const mats = [shell, under, dark];
  const body = new THREE.Group();
  body.position.y = 0.55;
  inner.add(body);
  body.add(
    mesh(sphere(10), shell, [0, 0.05, 0], [0.75, 0.28, 0.55]),
    mesh(sphere(8), under, [0, -0.08, 0], [0.66, 0.16, 0.48]),
  );
  for (let i = 0; i < 5; i++) body.add(mesh(cone(4), dark, [-0.5 + i * 0.25, 0.18, 0.42], [0.04, 0.1, 0.04]));
  // Ojos en pedúnculos.
  const stalks = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 0.18, 0.18, 0.4);
    g.add(mesh(cyl(4), under, [0, 0.12, 0], [0.025, 0.24, 0.025]), mesh(sphere(6), eyeMat, [0, 0.26, 0], [0.05, 0.05, 0.05]));
    body.add(g);
    return g;
  });
  // Pinzas: brazo y pinza con mandíbula superior que se abre.
  const claws = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.55, 0.0, 0.35);
    arm.rotation.y = -s * 0.5;
    arm.add(mesh(cyl(5), shell, [0, 0, 0.2], [0.07, 0.4, 0.07]).rotateX(Math.PI / 2));
    const claw = new THREE.Group();
    claw.position.set(0, 0, 0.42);
    claw.add(mesh(sphere(8), shell, [0, 0, 0.12], [0.16, 0.13, 0.22]));
    claw.add(mesh(cone(5), dark, [0, -0.04, 0.38], [0.07, 0.26, 0.06]).rotateX(Math.PI / 2));
    const jaw = new THREE.Group();
    jaw.position.set(0, 0.06, 0.24);
    jaw.add(mesh(cone(5), dark, [0, 0, 0.13], [0.05, 0.26, 0.05]).rotateX(Math.PI / 2));
    claw.add(jaw);
    arm.add(claw);
    body.add(arm);
    return { arm, claw, jaw, s };
  });
  // Seis patas finas y dobladas.
  const legs = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.6, -0.02, 0.15 - i * 0.22);
      hip.rotation.y = s * (Math.PI / 2) + s * (i - 1) * 0.35;
      const up = limb(0.035, 0.38, shell);
      up.rotation.z = Math.PI * 0.68;
      const knee = new THREE.Group();
      knee.position.y = -0.38;
      const low = limb(0.028, 0.5, dark);
      low.rotation.z = -Math.PI * 0.55;
      knee.add(low);
      up.add(knee);
      hip.add(up);
      body.add(hip);
      legs.push({ up, i, s, base: hip.rotation.y });
    }
  }
  root.scale.setScalar(enemy.scale);
  let side = 0;
  return {
    root,
    update(e, t, dt = 1 / 60) {
      const z = Math.min(1, dt * 10);
      const moving = clamp01(e.speed / 1.2);
      // Anda de lado; para pelear se pone de frente.
      side += ((moving > 0.3 && !e.hostile ? Math.PI / 2 : 0) - side) * Math.min(1, dt * 4);
      inner.rotation.y = -side;
      const ph = e.gait * 2.6;
      legs.forEach((L) => {
        const phase = ph + L.i * 2.1 + (L.s > 0 ? Math.PI : 0);
        L.up.rotation.z = Math.PI * 0.68 + Math.max(0, Math.sin(phase)) * 0.35 * moving;
      });
      body.position.y = 0.55 + Math.abs(Math.sin(ph)) * 0.03 * moving;
      let raise = 0;
      let open = 0.15 + Math.max(0, Math.sin(t * 1.5 + e.x)) * 0.15;
      if (e.windup > 0) {
        raise = smooth(e.windup);
        open = 0.15 + raise * 0.6;
      }
      if (e.strike > 0) {
        raise = -0.4 * (e.strike / 0.35);
        open = 0;
      }
      claws.forEach(({ arm, jaw }) => {
        damp(arm.rotation, 'x', -raise * 0.9, e.strike > 0 ? 1 : z);
        jaw.rotation.x = -open;
      });
      stalks.forEach((g, k) => (g.rotation.z = Math.sin(t * 2 + k) * 0.15));
      if (e.state === 'DEAD') {
        const k = smooth(Math.min(1, e.deathProgress * 1.6));
        inner.rotation.z = k * Math.PI;
        inner.position.y = k * 0.95 - Math.max(0, e.deathProgress - 0.7) * 1.5;
      } else inner.rotation.z = 0;
      flash(mats, e.hitFlash / 0.3);
    },
  };
}

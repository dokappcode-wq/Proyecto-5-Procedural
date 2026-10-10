import * as THREE from 'three';

/**
 * AmbientLife — vida pequeña alrededor del jugador (P7). Solo decorado (no se cazan):
 *   - pájaros: bandadas que vuelan en círculos altos de día (no en tormenta);
 *   - mariposas: de día, con buen tiempo, en praderas y bosques;
 *   - luciérnagas: de noche sin lluvia, en bosques, praderas y orillas;
 *   - peces: en el agua dulce cercana, nadando bajo la superficie.
 * Todo con InstancedMesh / Points (pocas llamadas de dibujo) y solo cerca del jugador.
 */
const BIRDS = 14;
const BUTTERFLIES = 12;
const FIREFLIES = 60;
const FISH = 10;
const LIE_FLAT = new THREE.Matrix4().makeRotationX(-Math.PI / 2); // alas de la mariposa en horizontal

export class AmbientLife {
  constructor({ scene, player, time, world, weather = null, isActive = () => true, random = Math.random }) {
    this.name = 'ambientLife';
    this._player = player;
    this._time = time;
    this._world = world;
    this._weather = weather;
    this._isActive = isActive;
    this._random = random;
    this._t = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();

    // Pájaro: una "V" de dos triángulos (las alas se agitan con la escala).
    const bird = new THREE.BufferGeometry();
    bird.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, -0.5, 0, -0.1, 0, 0, -0.05, 0, 0, 0.15, 0, 0, -0.05, 0.5, 0, -0.1], 3));
    bird.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: 0x2a2a30, side: THREE.DoubleSide }), BIRDS);
    this.birds.frustumCulled = false;
    this._flocks = [this._newFlock(), this._newFlock()];
    // Mariposas: dos alas (cuadrados) con color por instancia.
    const wing = new THREE.PlaneGeometry(0.09, 0.07);
    wing.translate(0.045, 0, 0);
    const w2 = wing.clone().scale(-1, 1, 1);
    const butterfly = mergeGeos([wing, w2]);
    this.butterflies = new THREE.InstancedMesh(butterfly, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), BUTTERFLIES);
    this.butterflies.frustumCulled = false;
    const colors = [0xffd84a, 0xff8ac0, 0x6aa8ff, 0xffffff, 0xff9a2a, 0xa66cff];
    this._bf = Array.from({ length: BUTTERFLIES }, (_, i) => {
      this.butterflies.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      return { x: 0, y: 0, z: 0, tx: 0, tz: 0, ph: random() * 6, live: false };
    });
    // Luciérnagas: puntos que se encienden y apagan (mezcla aditiva).
    this._ffPos = new Float32Array(FIREFLIES * 3);
    this._ffCol = new Float32Array(FIREFLIES * 3);
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(this._ffPos, 3));
    ffGeo.setAttribute('color', new THREE.BufferAttribute(this._ffCol, 3));
    this.fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fireflies.frustumCulled = false;
    this._ff = Array.from({ length: FIREFLIES }, () => ({ x: 0, y: -1e4, z: 0, ph: random() * 6, sp: 0.5 + random(), live: false }));
    // Peces: cuerpo alargado y cola.
    const fishGeo = mergeGeos([new THREE.SphereGeometry(0.06, 6, 4).scale(0.6, 0.5, 1.6), new THREE.ConeGeometry(0.05, 0.08, 4).rotateX(Math.PI / 2).translate(0, 0, -0.12)]);
    this.fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshLambertMaterial({ color: 0x8a9aa0 }), FISH);
    this.fish.frustumCulled = false;
    this._fish = Array.from({ length: FISH }, () => ({ x: 0, y: -1e4, z: 0, h: random() * 6, live: false, level: 0 }));
    scene.add(this.birds, this.butterflies, this.fireflies, this.fish);
  }

  _newFlock() {
    return { cx: 0, cz: 0, r: 30 + this._random() * 30, h: 28 + this._random() * 18, a: this._random() * 6, sp: 0.18 + this._random() * 0.1, live: false, life: 0 };
  }

  update(dt) {
    this._t += dt;
    const active = this._isActive();
    const p = this._player.position;
    const day = this._time.daylight ?? 1;
    const rain = this._weather?.rain ?? 0;
    const storm = this._weather?.state === 'STORM';
    this._updateBirds(dt, active && day > 0.4 && !storm, p);
    this._updateButterflies(dt, active && day > 0.6 && rain < 0.1 && (this._weather?.cloud ?? 0) < 0.6, p);
    this._updateFireflies(dt, active && day < 0.2 && rain < 0.2, p);
    this._updateFish(dt, active, p);
  }

  _updateBirds(dt, on, p) {
    let n = 0;
    for (const f of this._flocks) {
      f.life -= dt;
      if (!f.live || f.life <= 0 || Math.hypot(f.cx - p.x, f.cz - p.z) > 220) {
        Object.assign(f, this._newFlock(), { live: on && this._random() < 0.7, life: 60 + this._random() * 120 });
        const a = this._random() * Math.PI * 2;
        f.cx = p.x + Math.cos(a) * 60;
        f.cz = p.z + Math.sin(a) * 60;
      }
      if (!f.live || !on) continue;
      f.a += f.sp * dt;
      const g = this._world.getHeightAt(f.cx, f.cz);
      for (let i = 0; i < 7 && n < BIRDS; i++, n++) {
        const a = f.a - i * 0.06;
        const r = f.r + Math.sin(i * 1.7) * 3;
        const x = f.cx + Math.cos(a) * r - (i % 2 ? 1 : -1) * i * 0.6;
        const z = f.cz + Math.sin(a) * r;
        const y = Math.max(g, 0) + f.h + Math.sin(this._t * 0.5 + i) * 1.5;
        const flap = Math.sin(this._t * 9 + i * 1.3);
        this._e.set(0, -a, 0);
        this._q.setFromEuler(this._e);
        // Aleteo: la envergadura se abre y se cierra (vistos desde abajo).
        this._s.set(1.6 * (0.55 + 0.45 * Math.abs(flap)), 1, 1.6);
        this._m.compose(this._p.set(x, y + flap * 0.15, z), this._q, this._s);
        this.birds.setMatrixAt(n, this._m);
      }
    }
    this.birds.count = n;
    this.birds.instanceMatrix.needsUpdate = true;
  }

  _updateButterflies(dt, on, p) {
    let n = 0;
    if (on) {
      for (const b of this._bf) {
        if (!b.live || Math.hypot(b.x - p.x, b.z - p.z) > 26) {
          const a = this._random() * Math.PI * 2;
          const d = 6 + this._random() * 16;
          b.x = p.x + Math.cos(a) * d;
          b.z = p.z + Math.sin(a) * d;
          const biome = this._world.getBiomeAt?.(b.x, b.z)?.id;
          b.live = biome === 'PLAINS' || biome === 'FOREST' || biome === 'RIVER';
          b.tx = b.x;
          b.tz = b.z;
          if (!b.live) continue;
        }
        b.ph += dt;
        if (Math.hypot(b.tx - b.x, b.tz - b.z) < 0.3) {
          b.tx = b.x + (this._random() - 0.5) * 4;
          b.tz = b.z + (this._random() - 0.5) * 4;
        }
        const dx = b.tx - b.x;
        const dz = b.tz - b.z;
        const d = Math.hypot(dx, dz) || 1;
        b.x += (dx / d) * dt * 0.9;
        b.z += (dz / d) * dt * 0.9;
        const g = this._world.getHeightAt(b.x, b.z);
        b.y = g + 0.6 + Math.sin(b.ph * 2.3) * 0.35;
        const flap = Math.abs(Math.sin(b.ph * 18));
        this._e.set(0, Math.atan2(dx, dz), 0);
        this._q.setFromEuler(this._e);
        this._s.set(0.25 + flap * 0.75, 1, 1);
        this._m.compose(this._p.set(b.x, b.y, b.z), this._q, this._s);
        this._m.multiply(LIE_FLAT);
        this.butterflies.setMatrixAt(n++, this._m);
      }
    }
    this.butterflies.count = n;
    this.butterflies.instanceMatrix.needsUpdate = true;
  }

  _updateFireflies(dt, on, p) {
    for (let i = 0; i < FIREFLIES; i++) {
      const f = this._ff[i];
      if (on && (!f.live || Math.hypot(f.x - p.x, f.z - p.z) > 28)) {
        const a = this._random() * Math.PI * 2;
        const d = 3 + this._random() * 22;
        f.x = p.x + Math.cos(a) * d;
        f.z = p.z + Math.sin(a) * d;
        const biome = this._world.getBiomeAt?.(f.x, f.z)?.id;
        f.live = biome !== 'FROZEN_MOUNTAINS' && biome !== 'MOUNTAINS' && !this._world.inCave?.(p.x, p.y + 1, p.z);
        f.base = this._world.getHeightAt(f.x, f.z);
      }
      const show = on && f.live;
      f.ph += dt * f.sp;
      f.x += Math.sin(f.ph * 0.7) * dt * 0.3;
      f.z += Math.cos(f.ph * 0.6) * dt * 0.3;
      f.y = (f.base ?? 0) + 0.8 + Math.sin(f.ph * 0.9) * 0.6 + 0.6;
      this._ffPos[i * 3] = f.x;
      this._ffPos[i * 3 + 1] = show ? f.y : -1e4;
      this._ffPos[i * 3 + 2] = f.z;
      const blink = show ? Math.max(0, Math.sin(f.ph * 2.2)) ** 3 : 0;
      this._ffCol[i * 3] = 0.75 * blink;
      this._ffCol[i * 3 + 1] = 1.0 * blink;
      this._ffCol[i * 3 + 2] = 0.35 * blink;
    }
    this.fireflies.geometry.attributes.position.needsUpdate = true;
    this.fireflies.geometry.attributes.color.needsUpdate = true;
  }

  /** Nivel del agua dulce en (x, z) con al menos `depth` de fondo, o null. */
  _water(x, z, depth) {
    const w = this._world;
    const lv = w.map?.waterAt?.(x, z) ?? w.water?.getPondAt?.(x, z)?.level ?? null;
    if (lv === null || lv === undefined) return null;
    return lv - w.getHeightAt(x, z) > depth ? lv : null;
  }

  _updateFish(dt, on, p) {
    let n = 0;
    for (const f of this._fish) {
      if (!on) break;
      if (!f.live || Math.hypot(f.x - p.x, f.z - p.z) > 30) {
        const a = this._random() * Math.PI * 2;
        const d = 3 + this._random() * 20;
        f.x = p.x + Math.cos(a) * d;
        f.z = p.z + Math.sin(a) * d;
        const lv = this._water(f.x, f.z, 0.7);
        f.live = lv !== null;
        if (!f.live) continue;
        f.level = lv;
        f.h = this._random() * Math.PI * 2;
      }
      // Nada en curvas; si la siguiente posición no es agua honda, gira.
      f.h += Math.sin(this._t * 0.7 + f.x) * dt * 0.8;
      const nx = f.x + Math.sin(f.h) * dt * 0.8;
      const nz = f.z + Math.cos(f.h) * dt * 0.8;
      if (this._water(nx, nz, 0.5) === null) f.h += Math.PI * 0.6;
      else {
        f.x = nx;
        f.z = nz;
      }
      this._e.set(0, f.h + Math.sin(this._t * 8 + f.x) * 0.2, 0);
      this._q.setFromEuler(this._e);
      this._s.set(1, 1, 1);
      this._m.compose(this._p.set(f.x, f.level - 0.35, f.z), this._q, this._s);
      this.fish.setMatrixAt(n++, this._m);
    }
    this.fish.count = n;
    this.fish.instanceMatrix.needsUpdate = true;
  }
}

/** Junta varias geometrías no indexadas (posición y normal) en una. */
function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

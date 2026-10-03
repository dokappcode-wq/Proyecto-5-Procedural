import * as THREE from 'three';

/**
 * Gólem gigante — el primer jefe (fondo de la mazmorra del centro de investigación).
 *
 * Reglas (lista del diseño):
 *   - 300 de vida. Solo se le hace daño en el ojo (cristal azul que brilla): hay que dispararle.
 *   - Golpea el suelo: una onda se abre desde él (20 de daño si pilla al jugador en el suelo;
 *     se esquiva saltando o con el esquive). Cada golpe hace caer 5 piedras del techo.
 *   - Llama a gólems (4 en total: 2 a 250 de vida y 2 a 150).
 *   - Desde el 50 % (150, 100 y 50 de vida) se tapa el ojo 10 s con una mano y ataca
 *     con la otra: manotazo de 50 de daño (se ve venir: levanta el brazo).
 *   - Al morir se desploma.
 *
 * BossLogic es lógica pura (sin Three.js); BossView la dibuja.
 */
export const BOSS = {
  HEALTH: 300,
  SLAM_DAMAGE: 20,
  SLAP_DAMAGE: 50,
  SLAM_EVERY: 7,
  SLAM_WINDUP: 1.6,
  WAVE_SPEED: 8,
  WAVE_MAX: 24,
  WAVE_BAND: 0.9,
  COVER_AT: [150, 100, 50],
  COVER_TIME: 10,
  SLAP_EVERY: 3.4,
  SLAP_WINDUP: 1.3,
  SLAP_RANGE: 10,
  SLAP_CONE: 1.1,
  ADDS_AT: [250, 150],
  ADDS_EACH: 2,
  RISE_TIME: 4.5,
  DEATH_TIME: 3.5,
  EYE_HEIGHT: 7.5,
  EYE_RADIUS: 0.8,
  TURN: 0.9,
  STONES_PER_SLAM: 5,
};

export class BossLogic {
  constructor({ x, y, z, heading = 0 }) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = heading;
    this.reset();
  }

  reset() {
    this.state = 'DORMANT';
    this.health = BOSS.HEALTH;
    this.maxHealth = BOSS.HEALTH;
    this.rise = 0;
    this.death = 0;
    this.covered = 0;
    this.windup = null;
    this.windupT = 0;
    this.strike = 0;
    this.strikeKind = null;
    this.slamT = 3.5;
    this.slapT = 1.5;
    this.waves = [];
    this.eyeFlash = 0;
    this._cover = new Set();
    this._adds = new Set();
  }

  get alive() {
    return this.state !== 'DEAD';
  }

  get fighting() {
    return this.state === 'FIGHT';
  }

  get eyeOpen() {
    return this.state === 'FIGHT' && this.covered <= 0;
  }

  get eye() {
    return { x: this.x + Math.sin(this.heading) * 0.75, y: this.y + BOSS.EYE_HEIGHT, z: this.z + Math.cos(this.heading) * 0.75 };
  }

  /** Empieza la pelea: las rocas se levantan y forman el gólem. */
  start() {
    if (this.state === 'DORMANT') this.state = 'RISING';
  }

  /**
   * Un disparo al ojo. @returns {{ ok: boolean, events: object[] }}
   * ok = false si tenía el ojo tapado (o no se puede dañar ahora).
   */
  hitEye(damage) {
    const events = [];
    if (!this.eyeOpen) return { ok: false, events };
    this.health = Math.max(0, this.health - damage);
    this.eyeFlash = 0.25;
    for (const t of BOSS.ADDS_AT) {
      if (this.health <= t && !this._adds.has(t)) {
        this._adds.add(t);
        events.push({ type: 'adds', count: BOSS.ADDS_EACH });
      }
    }
    if (this.health <= 0) {
      this.state = 'DEAD';
      this.waves = [];
      this.windup = null;
      events.push({ type: 'dead' });
      return { ok: true, events };
    }
    for (const t of BOSS.COVER_AT) {
      if (this.health <= t && !this._cover.has(t)) {
        this._cover.add(t);
        this.covered = BOSS.COVER_TIME;
        this.windup = null;
        this.slapT = 1.2;
        events.push({ type: 'cover' });
        break;
      }
    }
    return { ok: true, events };
  }

  /**
   * @param {number} dt
   * @param {{ x, y, z, alive, onGround, dodging }} p el jugador
   * @returns {object[]} eventos: slam · waveHit · slap{hit} · uncover · risen
   */
  update(dt, p) {
    const events = [];
    this.eyeFlash = Math.max(0, this.eyeFlash - dt);
    this.strike = Math.max(0, this.strike - dt);
    if (this.state === 'RISING') {
      this.rise = Math.min(1, this.rise + dt / BOSS.RISE_TIME);
      if (this.rise >= 1) {
        this.state = 'FIGHT';
        events.push({ type: 'risen' });
      }
      return events;
    }
    if (this.state === 'DEAD') {
      this.death = Math.min(1, this.death + dt / BOSS.DEATH_TIME);
      return events;
    }
    if (this.state !== 'FIGHT') return events;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    // Gira despacio hacia el jugador.
    const want = Math.atan2(dx, dz);
    const turn = BOSS.TURN * dt;
    this.heading += Math.max(-turn, Math.min(turn, wrap(want - this.heading)));
    // Amagos en curso.
    if (this.windup) {
      this.windupT -= dt;
      if (this.windupT <= 0) {
        const kind = this.windup;
        this.windup = null;
        this.strike = 0.45;
        this.strikeKind = kind;
        if (kind === 'SLAM') {
          this.waves.push({ r: 2.5, hit: false });
          events.push({ type: 'slam' });
        } else {
          const ang = Math.abs(wrap(Math.atan2(dx, dz) - this.heading));
          const hit = p.alive && dist < BOSS.SLAP_RANGE && ang < BOSS.SLAP_CONE && Math.abs(p.y - this.y) < 3;
          events.push({ type: 'slap', hit });
        }
      }
    } else if (this.covered > 0) {
      this.slapT -= dt;
      if (this.slapT <= 0) {
        this.windup = 'SLAP';
        this.windupT = BOSS.SLAP_WINDUP;
        this.slapT = BOSS.SLAP_EVERY;
      }
    } else {
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.windup = 'SLAM';
        this.windupT = BOSS.SLAM_WINDUP;
        this.slamT = BOSS.SLAM_EVERY;
      }
    }
    if (this.covered > 0) {
      this.covered -= dt;
      if (this.covered <= 0) {
        this.covered = 0;
        if (this.windup === 'SLAP') this.windup = null;
        events.push({ type: 'uncover' });
      }
    }
    // Ondas.
    for (const w of this.waves) {
      w.r += BOSS.WAVE_SPEED * dt;
      if (!w.hit && p.alive && p.onGround && !p.dodging && Math.abs(dist - w.r) < BOSS.WAVE_BAND && Math.abs(p.y - this.y) < 1.5) {
        w.hit = true;
        events.push({ type: 'waveHit' });
      }
    }
    this.waves = this.waves.filter((w) => w.r < BOSS.WAVE_MAX);
    return events;
  }
}

// ---- Dibujo ------------------------------------------------------------------------------

export class BossView {
  constructor(parent, logic) {
    this.logic = logic;
    this.root = new THREE.Group();
    this.root.name = 'GiantGolem';
    parent.add(this.root);
    const inner = (this.inner = new THREE.Group());
    this.root.add(inner);
    const stone = new THREE.MeshLambertMaterial({ color: 0x77736a, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x55524c, flatShading: true });
    const moss = new THREE.MeshLambertMaterial({ color: 0x4f6e33, flatShading: true });
    const crystal = new THREE.MeshLambertMaterial({ color: 0x3fb8e8, emissive: 0x1a6a90, flatShading: true });
    this._mats = [stone, dark, moss];
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const m = (mat, [x, y, z], [sx, sy, sz]) => {
      const o = new THREE.Mesh(ico, mat);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      o.castShadow = true;
      return o;
    };
    const rng = mulberry(7);
    const parts = [];
    const part = (pos, children) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      for (const c of children) g.add(c);
      inner.add(g);
      const a = rng() * Math.PI * 2;
      const r = 2 + rng() * 4.5;
      parts.push({
        obj: g,
        body: new THREE.Vector3(...pos),
        bodyQ: new THREE.Quaternion(),
        pile: new THREE.Vector3(Math.cos(a) * r, 0.6, Math.sin(a) * r),
        pileQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, Math.PI / 2)),
        delay: rng() * 0.4,
      });
      return g;
    };
    this.legL = part([-1.0, 3.2, 0], [m(dark, [0, -1.6, 0], [0.95, 1.7, 0.95])]);
    this.legR = part([1.0, 3.2, 0], [m(dark, [0, -1.6, 0], [0.95, 1.7, 0.95])]);
    this.torso = part([0, 5.0, 0], [
      m(stone, [0, 0, 0], [2.3, 1.9, 1.5]),
      m(dark, [0, -1.4, 0.1], [1.5, 0.8, 1.1]),
      m(moss, [0.9, 1.3, -0.4], [0.9, 0.35, 0.7]),
      m(crystal, [-1.1, 1.0, -1.0], [0.35, 0.8, 0.35]),
      m(crystal, [0.6, 1.4, -1.1], [0.25, 0.6, 0.25]),
    ]);
    // Cabeza con el ojo.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7fe8ff });
    this.eyeMat = eyeMat;
    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), eyeMat);
    eye.position.set(0, 0.15, 0.78);
    this.eyeLight = new THREE.PointLight(0x6fd8ff, 3, 18, 1.6);
    this.eyeLight.position.set(0, 0.2, 1.3);
    this.head = part([0, 7.35, 0.1], [m(stone, [0, 0, 0], [1.0, 0.85, 0.9]), m(moss, [0, 0.75, -0.1], [0.6, 0.2, 0.5]), eye, this.eyeLight]);
    this.eye = eye;
    // Brazos enormes con puños de roca.
    const arm = (s) => part([s * 2.5, 6.1, 0], [m(stone, [0, -1.4, 0], [0.75, 1.6, 0.75]), m(dark, [0, -3.0, 0.1], [1.15, 1.0, 1.1])]);
    this.armL = arm(-1);
    this.armR = arm(1);
    this._parts = parts;
    // Ondas en el suelo.
    this._waveGeo = new THREE.TorusGeometry(1, 0.22, 6, 48);
    this._waveMat = new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.7 });
    this._waves = [];
    this.root.position.set(logic.x, logic.y, logic.z);
  }

  update(dt, t) {
    const L = this.logic;
    this.root.position.set(L.x, L.y, L.z);
    this.root.rotation.y = L.heading;
    let k = L.state === 'DORMANT' ? 0 : L.state === 'RISING' ? L.rise : 1;
    for (const p of this._parts) {
      const u = smooth(clamp01((k - p.delay) / 0.6));
      p.obj.position.lerpVectors(p.pile, p.body, u);
      p.obj.position.y += Math.sin(u * Math.PI) * 2.5;
      p.obj.quaternion.slerpQuaternions(p.pileQ, p.bodyQ, u);
    }
    const up = k >= 1;
    // Poses.
    if (up) {
      const breathe = Math.sin(t * 1.3) * 0.04;
      this.torso.rotation.set(breathe, 0, 0);
      let aL = Math.sin(t * 0.9) * 0.08;
      let aR = -aL;
      let zR = 0;
      let zL = 0;
      if (L.windup === 'SLAM') {
        const w = smooth(1 - L.windupT / 1.6);
        aL = aR = -2.7 * w;
        this.torso.rotation.x = -0.25 * w;
      } else if (L.strike > 0 && L.strikeKind === 'SLAM') {
        aL = aR = -0.6;
        this.torso.rotation.x = 0.35;
      }
      if (L.covered > 0) {
        // Mano izquierda delante del ojo.
        aL = -2.4;
        zL = -0.5;
      }
      if (L.windup === 'SLAP') {
        const w = smooth(1 - L.windupT / 1.3);
        aR = -1.4 * w;
        zR = 1.4 * w; // brazo hacia fuera y atrás
      } else if (L.strike > 0 && L.strikeKind === 'SLAP') {
        aR = -1.3;
        zR = -0.9; // barrido por delante
      }
      this.armL.rotation.set(aL, 0, zL);
      this.armR.rotation.set(aR, 0, zR);
      this.legL.rotation.x = this.legR.rotation.x = 0;
    }
    // Ojo: brilla (más al recibir un disparo; casi apagado tapado).
    const covered = L.covered > 0;
    this.eyeMat.color.setHex(L.eyeFlash > 0 ? 0xffffff : covered ? 0x2a6a80 : 0x7fe8ff);
    this.eyeLight.intensity = L.state === 'DEAD' ? 0 : covered ? 0.6 : 3 + Math.sin(t * 4) * 0.5;
    this.eye.rotation.y = t * 1.5;
    // Muerte: se desploma hacia atrás.
    if (L.state === 'DEAD') {
      const d = smooth(L.death);
      this.inner.rotation.x = -d * Math.PI * 0.46;
      this.inner.position.y = -Math.max(0, L.death - 0.7) * 3;
      this.eyeMat.color.setHex(0x203038);
    } else {
      this.inner.rotation.x = 0;
      this.inner.position.y = 0;
    }
    // Ondas.
    while (this._waves.length < L.waves.length) {
      const w = new THREE.Mesh(this._waveGeo, this._waveMat.clone());
      w.rotation.x = -Math.PI / 2;
      this.root.parent.add(w);
      this._waves.push(w);
    }
    this._waves.forEach((mesh, i) => {
      const w = L.waves[i];
      mesh.visible = !!w;
      if (!w) return;
      mesh.position.set(L.x, L.y + 0.25, L.z);
      mesh.scale.set(w.r, w.r, 1 + w.r * 0.05);
      mesh.material.opacity = 0.75 * (1 - w.r / BOSS.WAVE_MAX);
    });
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const w of this._waves) w.parent?.remove(w);
  }
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v) {
  return v * v * (3 - 2 * v);
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

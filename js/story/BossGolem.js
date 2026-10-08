import * as THREE from 'three';
import { boulderGeo } from '../render/Rocks.js';

/**
 * Gólem gigante — «Guardián del altar», el jefe del fondo de la mazmorra.
 *
 * Según la hoja de diseño (imagen de referencia):
 *   1. Introducción: despierta en el altar (se levanta de rodillas, el cristal se enciende).
 *   2. Golpe en el suelo: levanta el puño y golpea delante; una onda se abre desde el
 *      impacto (se salta o se esquiva en el momento justo). Hace caer piedras del techo.
 *   3. Lanzamiento de rocas: coge una roca y la lanza (en parábola) adonde va el jugador;
 *      hay que moverse o cubrirse tras los muros del altar. La roca deja piedras.
 *   4. Láser del cristal: el cristal se carga y dispara un rayo que persigue al jugador;
 *      los muros lo paran. Después el cristal queda al rojo un momento (más daño).
 *   5. Fase 2 (mitad de vida): ruge; más rápido, se mueve por el altar y encadena ataques.
 *   6. Derrota: el cristal se rompe y el gólem se desmorona; el altar queda libre.
 * Solo se le hace daño en el cristal del pecho (piedras del tirachinas, flechas).
 *
 * BossLogic es lógica pura (sin Three.js, con un `env` para el suelo y los muros);
 * BossView lo dibuja y anima (piezas de roca con musgo, poses, efectos).
 */
export const BOSS = {
  HEALTH: 300,
  CRYSTAL_MULT: 1,      // daño normal en el cristal…
  VENT_MULT: 2,         // …y doble al rojo (tras el láser): el hueco para atacar
  PHASE2_AT: 150,
  CRYSTAL_RADIUS: 0.95,
  RISE_TIME: 6,
  DEATH_TIME: 6,
  ROAR_TIME: 2.4,
  TURN: [1.0, 1.7],         // rad/s (fase 1, fase 2)
  COOLDOWN: [2.3, 1.0],     // s entre ataques
  COMBO: [0, 0.45],         // probabilidad de encadenar otro ataque sin pausa
  ROAM: 2.6,                // m que se aparta del centro del altar (fase 2)
  WALK_SPEED: 1.5,
  SLAM: { WINDUP: [1.3, 0.95], RECOVER: 0.9, REACH: 6.2, MIN: 3.2, DIRECT: 2.6, DIRECT_DAMAGE: 35, WAVE_DAMAGE: 20, WAVE_SPEED: [9, 11.5], WAVE_MAX: 26, WAVE_BAND: 0.9 },
  ROCK: { WINDUP: [1.5, 1.05], RECOVER: 0.55, FLIGHT: [1.35, 1.05], GRAVITY: 18, RADIUS: 2.4, DAMAGE: 25, LEAD: 0.6, HAND: [1.1, 9.2] },
  LASER: { CHARGE: [1.7, 1.15], FIRE: [2.6, 3.0], TRACK: [4.2, 6.2], TICK: 0.35, DAMAGE: 10, WIDTH: 0.75, VENT: 2.6, RANGE: 45, OFFSET: 4 },
  STONES_PER_SLAM: 4,
  STONES_PER_ROCK: 2,
  // Esqueleto (lo comparten la lógica y el dibujo, así el cristal está donde se ve).
  HIP: 3.4,
  CRYSTAL: [0, 1.95, 1.3],  // respecto a la cadera, antes de inclinar el torso
};


export class BossLogic {
  /**
   * @param {{ x, y, z, heading?, env?, seed? }} o
   * env: groundAt(x, z) altura del suelo (por defecto, la del gólem); floorY suelo de la sala;
   *      blocked(ax, ay, az, bx, by, bz) ¿un muro entre los dos puntos?;
   *      ray(ox, oy, oz, dx, dy, dz, max) distancia hasta un muro o null.
   */
  constructor({ x, y, z, heading = 0, env = {}, seed = 7 }) {
    this.home = { x, y, z };
    // Por defecto: suelo llano a la altura del gólem y sin muros.
    this.env = { groundAt: () => y, blocked: () => false, ray: () => null, ...env };
    this._seed = seed;
    this.heading0 = heading;
    this.reset();
  }

  reset() {
    this.x = this.home.x;
    this.y = this.home.y;
    this.z = this.home.z;
    this.heading = this.heading0;
    this.state = 'DORMANT';
    this.health = BOSS.HEALTH;
    this.maxHealth = BOSS.HEALTH;
    this.phase = 1;
    this.rise = 0;
    this.death = 0;
    this.action = null;     // SLAM · ROCK · LASER · VENT · ROAR
    this.actionT = 0;
    this.cooldown = 3;
    this.lean = 0.9;        // inclinación del torso (rad, + hacia delante); la usa la vista
    this.walking = false;
    this.waves = [];
    this.rocks = [];
    this.held = false;      // roca en las manos
    this.laser = null;      // { phase: 'CHARGE'|'FIRE', aim, end, tick }
    this.slamAt = null;
    this.flash = 0;
    this._last = [];
    this._rng = mulberry(this._seed);
  }

  get alive() {
    return this.state !== 'DEAD';
  }

  get fighting() {
    return this.state === 'FIGHT';
  }

  /** ¿Se le puede dañar ahora? (el cristal está siempre a la vista mientras pelea) */
  get exposed() {
    return this.state === 'FIGHT';
  }

  get venting() {
    return this.action === 'VENT';
  }

  /** Grietas del cristal: 0 (entero) … 3 (a punto de romperse). */
  get cracks() {
    return Math.min(3, Math.floor((1 - this.health / BOSS.HEALTH) * 4));
  }

  /** Posición del cristal en el mundo (con la inclinación del torso). */
  get crystal() {
    const [, cy, cz] = BOSS.CRYSTAL;
    const c = Math.cos(this.lean);
    const s = Math.sin(this.lean);
    const fwd = cz * c + cy * s;
    const up = cy * c - cz * s;
    return { x: this.x + Math.sin(this.heading) * fwd, y: this.y + BOSS.HIP + up, z: this.z + Math.cos(this.heading) * fwd };
  }

  _p(arr) {
    return Array.isArray(arr) ? arr[this.phase - 1] : arr;
  }

  /** Empieza la pelea: se levanta. */
  start() {
    if (this.state === 'DORMANT') this.state = 'RISING';
  }

  /** Un impacto en el cristal. @returns {{ ok, dealt, events }} */
  hitCrystal(damage) {
    const events = [];
    if (!this.exposed) return { ok: false, dealt: 0, events };
    const dealt = damage * BOSS.CRYSTAL_MULT * (this.venting ? BOSS.VENT_MULT : 1);
    const before = this.cracks;
    this.health = Math.max(0, this.health - dealt);
    this.flash = 0.25;
    if (this.cracks > before && this.health > 0) events.push({ type: 'crack', level: this.cracks });
    if (this.health <= 0) {
      this.state = 'DEAD';
      this.death = 0;
      this.action = null;
      this.laser = null;
      this.held = false;
      this.waves = [];
      this.rocks = [];
      events.push({ type: 'dead' });
      return { ok: true, dealt, events };
    }
    if (this.phase === 1 && this.health <= BOSS.PHASE2_AT) {
      this.phase = 2;
      // Ruge (interrumpe lo que hacía, salvo una roca ya en el aire).
      this.action = 'ROAR';
      this.actionT = 0;
      this.laser = null;
      this.held = false;
      events.push({ type: 'phase2' });
    }
    return { ok: true, dealt, events };
  }

  /**
   * @param {number} dt
   * @param {{ x, y, z, vx?, vz?, alive, onGround, dodging }} p el jugador
   * @returns {object[]} eventos
   */
  update(dt, p) {
    const events = [];
    this.flash = Math.max(0, this.flash - dt);
    if (this.state === 'DORMANT') {
      this.lean = 0.9;
      return events;
    }
    if (this.state === 'RISING') {
      this.rise = Math.min(1, this.rise + dt / BOSS.RISE_TIME);
      this.lean = 0.9 * (1 - smooth(clamp01((this.rise - 0.35) / 0.5))) + 0.12;
      if (this.rise >= 1) {
        this.state = 'FIGHT';
        this.cooldown = 1.6;
        events.push({ type: 'risen' });
      }
      return events;
    }
    if (this.state === 'DEAD') {
      this.death = Math.min(1, this.death + dt / BOSS.DEATH_TIME);
      return events;
    }
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    // Girar hacia el jugador (salvo al final del golpe y mientras dispara el láser).
    const lockTurn = (this.action === 'SLAM' && this.actionT > this._p(BOSS.SLAM.WINDUP) * 0.7) || this.laser?.phase === 'FIRE' || this.action === 'VENT';
    if (!lockTurn) {
      const turn = this._p(BOSS.TURN) * dt;
      this.heading += Math.max(-turn, Math.min(turn, wrap(toPlayer - this.heading)));
    }
    let lean = 0.12;
    this.walking = false;
    if (this.action) {
      this.actionT += dt;
      lean = this._runAction(dt, p, dist, events);
    } else {
      this.cooldown -= dt;
      // Fase 2: se acerca por el altar.
      if (this.phase === 2 && dist > 7) {
        const nx = this.x + Math.sin(this.heading) * BOSS.WALK_SPEED * dt;
        const nz = this.z + Math.cos(this.heading) * BOSS.WALK_SPEED * dt;
        if (Math.hypot(nx - this.home.x, nz - this.home.z) < BOSS.ROAM) {
          this.x = nx;
          this.z = nz;
          this.walking = true;
        }
      }
      if (this.cooldown <= 0) this._choose(dist, events);
    }
    this.lean += (lean - this.lean) * Math.min(1, dt * 6);
    this._updateWaves(dt, p, events);
    this._updateRocks(dt, p, events);
    return events;
  }

  _choose(dist, events) {
    const w = dist < 8 ? { SLAM: 0.6, LASER: 0.25, ROCK: 0.15 } : { ROCK: 0.45, LASER: 0.35, SLAM: 0.2 };
    // Nunca tres veces seguidas lo mismo.
    if (this._last.length >= 2 && this._last[0] === this._last[1]) delete w[this._last[0]];
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    let r = this._rng() * total;
    let pick = 'SLAM';
    for (const [k, v] of Object.entries(w)) {
      r -= v;
      if (r <= 0) {
        pick = k;
        break;
      }
    }
    this._begin(pick, events);
  }

  _begin(kind, events) {
    this.action = kind;
    this.slamAt = null;
    this.actionT = 0;
    this._last = [kind, ...this._last].slice(0, 2);
    if (kind === 'SLAM') events.push({ type: 'slamWindup' });
    if (kind === 'ROCK') {
      this.held = false;
      events.push({ type: 'rockWindup' });
    }
    if (kind === 'LASER') {
      this.laser = { phase: 'CHARGE', aim: null, end: null, tick: 0 };
      events.push({ type: 'laserCharge' });
    }
  }

  _end() {
    this.action = null;
    this.actionT = 0;
    const combo = this._rng() < this._p(BOSS.COMBO);
    this.cooldown = combo ? 0.25 : this._p(BOSS.COOLDOWN);
  }

  /** @returns {number} inclinación del torso que pide la acción */
  _runAction(dt, p, dist, events) {
    const t = this.actionT;
    switch (this.action) {
      case 'ROAR': {
        if (t >= BOSS.ROAR_TIME) {
          this.action = null;
          this._begin('SLAM', events); // empieza la fase 2 con un golpe
        }
        return -0.35;
      }
      case 'SLAM': {
        const W = this._p(BOSS.SLAM.WINDUP);
        if (t < W) return -0.18 * smooth(t / W);
        if (!this.slamAt) {
          const S = BOSS.SLAM;
          const reach = Math.max(S.MIN, Math.min(S.REACH, dist));
          const x = this.x + Math.sin(this.heading) * reach;
          const z = this.z + Math.cos(this.heading) * reach;
          const y = this.env.groundAt(x, z);
          this.slamAt = { x, y, z };
          const near = Math.hypot(p.x - x, p.z - z) < S.DIRECT && Math.abs(p.y - y) < 2.2;
          const direct = p.alive && near && !p.dodging;
          events.push({ type: 'slam', x, y, z, direct });
          if (direct) events.push({ type: 'slamHit', amount: S.DIRECT_DAMAGE });
          this.waves.push({ x, y, z, r: S.DIRECT, hit: direct || near });
        }
        if (t >= W + BOSS.SLAM.RECOVER) {
          this.slamAt = null;
          this._end();
        }
        return t < W + 0.25 ? 0.6 : 0.6 - 0.45 * smooth((t - W - 0.25) / (BOSS.SLAM.RECOVER - 0.25));
      }
      case 'ROCK': {
        const W = this._p(BOSS.ROCK.WINDUP);
        if (t >= W * 0.42 && !this.held && t < W) {
          this.held = true;
          events.push({ type: 'rockPick' });
        }
        if (t >= W && this.held) {
          this.held = false;
          this._throw(p, events);
        }
        if (t >= W + BOSS.ROCK.RECOVER) this._end();
        if (t < W * 0.42) return 0.12 + 0.6 * smooth(t / (W * 0.42));
        if (t < W) return 0.72 - 0.95 * smooth((t - W * 0.42) / (W * 0.58));
        return 0.35;
      }
      case 'LASER': {
        const L = BOSS.LASER;
        const C = this._p(L.CHARGE);
        const F = this._p(L.FIRE);
        const las = this.laser;
        if (t < C) return -0.25 * smooth(t / C);
        if (las.phase === 'CHARGE') {
          las.phase = 'FIRE';
          // Empieza apuntando a un lado del jugador y lo persigue.
          const side = this._rng() < 0.5 ? -1 : 1;
          const a = toPlayerAngle(this, p) + Math.PI / 2;
          las.aim = { x: p.x + Math.sin(a) * L.OFFSET * side, y: p.y + 0.9, z: p.z + Math.cos(a) * L.OFFSET * side };
          las.tick = 0;
          events.push({ type: 'laserFire' });
        }
        // El punto de mira va hacia el jugador (a velocidad limitada: corriendo se escapa).
        const target = { x: p.x, y: p.y + 0.9, z: p.z };
        const ax = target.x - las.aim.x;
        const az = target.z - las.aim.z;
        const ad = Math.hypot(ax, az);
        const step = this._p(L.TRACK) * dt;
        if (ad > 1e-3) {
          const k = Math.min(1, step / ad);
          las.aim.x += ax * k;
          las.aim.z += az * k;
        }
        las.aim.y += (target.y - las.aim.y) * Math.min(1, dt * 3);
        // El cuerpo sigue al rayo.
        const want = Math.atan2(las.aim.x - this.x, las.aim.z - this.z);
        this.heading += Math.max(-dt * 2, Math.min(dt * 2, wrap(want - this.heading)));
        // Rayo: del cristal hacia el punto de mira y más allá, hasta el suelo o un muro.
        const c = this.crystal;
        let dx = las.aim.x - c.x;
        let dy = las.aim.y - c.y;
        let dz = las.aim.z - c.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        dx /= len;
        dy /= len;
        dz /= len;
        let max = L.RANGE;
        if (dy < -1e-3) max = Math.min(max, (c.y - (this.env.floorY ?? this.home.y)) / -dy); // suelo de la sala
        const wall = this.env.ray(c.x, c.y, c.z, dx, dy, dz, max);
        if (wall !== null && wall !== undefined) max = Math.min(max, wall);
        las.end = { x: c.x + dx * max, y: c.y + dy * max, z: c.z + dz * max };
        // ¿Toca al jugador?
        las.tick -= dt;
        if (p.alive && las.tick <= 0 && segmentHitsPlayer(c, las.end, p, L.WIDTH)) {
          las.tick = L.TICK;
          events.push({ type: 'laserHit', amount: L.DAMAGE });
        }
        if (t >= C + F) {
          this.laser = null;
          this.action = 'VENT';
          this.actionT = 0;
          events.push({ type: 'vent' });
        }
        return -0.1;
      }
      case 'VENT': {
        if (t >= BOSS.LASER.VENT) {
          events.push({ type: 'ventEnd' });
          this._end();
        }
        return 0.45;
      }
      default:
        this._end();
        return 0.12;
    }
  }

  _throw(p, events) {
    const R = BOSS.ROCK;
    const F = this._p(R.FLIGHT);
    const hx = this.x + Math.sin(this.heading) * R.HAND[0];
    const hz = this.z + Math.cos(this.heading) * R.HAND[0];
    const hy = this.y + R.HAND[1];
    // Apunta adonde va a estar el jugador.
    let tx = p.x + (p.vx ?? 0) * F * R.LEAD;
    let tz = p.z + (p.vz ?? 0) * F * R.LEAD;
    const d = Math.hypot(tx - this.x, tz - this.z);
    if (d > 32) {
      tx = this.x + ((tx - this.x) / d) * 32;
      tz = this.z + ((tz - this.z) / d) * 32;
    }
    let ty = this.env.groundAt(tx, tz);
    // Escondido tras un muro: la roca se estrella contra el muro.
    const cx = p.x - hx;
    const cy = p.y + 1 - hy;
    const cz = p.z - hz;
    const cd = Math.hypot(cx, cy, cz) || 1;
    const wall = this.env.ray(hx, hy, hz, cx / cd, cy / cd, cz / cd, cd);
    if (wall !== null && wall !== undefined && wall < cd - 0.3) {
      tx = hx + (cx / cd) * wall;
      ty = hy + (cy / cd) * wall;
      tz = hz + (cz / cd) * wall;
    }
    const rock = {
      x: hx, y: hy, z: hz,
      vx: (tx - hx) / F, vz: (tz - hz) / F, vy: (ty - hy + 0.5 * R.GRAVITY * F * F) / F,
      target: { x: tx, y: ty, z: tz }, t: 0,
    };
    this.rocks.push(rock);
    events.push({ type: 'rockThrow', target: rock.target });
  }

  _updateRocks(dt, p, events) {
    const R = BOSS.ROCK;
    this.rocks = this.rocks.filter((r) => {
      const ox = r.x;
      const oy = r.y;
      const oz = r.z;
      r.vy -= R.GRAVITY * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.z += r.vz * dt;
      r.t += dt;
      let hit = null;
      if (r.vy < 0 && this.env.blocked(ox, oy, oz, r.x, r.y, r.z)) hit = { x: ox, y: oy, z: oz };
      else {
        const g = this.env.groundAt(r.x, r.z);
        if (r.y <= g) hit = { x: r.x, y: g, z: r.z };
      }
      if (!hit && r.t < 6) return true;
      if (!hit) return false;
      const near = Math.hypot(p.x - hit.x, p.z - hit.z) < R.RADIUS && Math.abs(p.y - hit.y) < 2.5;
      const covered = near && this.env.blocked(hit.x, hit.y + 0.6, hit.z, p.x, p.y + 1, p.z);
      const dmg = p.alive && near && !covered && !p.dodging;
      events.push({ type: 'rockImpact', x: hit.x, y: hit.y, z: hit.z, hit: dmg });
      if (dmg) events.push({ type: 'rockHit', amount: R.DAMAGE });
      return false;
    });
  }

  _updateWaves(dt, p, events) {
    const S = BOSS.SLAM;
    const speed = this._p(S.WAVE_SPEED);
    for (const w of this.waves) {
      w.r += speed * dt;
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (!w.hit && p.alive && p.onGround && !p.dodging && Math.abs(d - w.r) < S.WAVE_BAND && p.y < w.y + 2.5 && p.y > w.y - 3) {
        w.hit = true;
        events.push({ type: 'waveHit', amount: S.WAVE_DAMAGE });
      }
    }
    this.waves = this.waves.filter((w) => w.r < S.WAVE_MAX);
  }
}

function toPlayerAngle(b, p) {
  return Math.atan2(p.x - b.x, p.z - b.z);
}

/** ¿El segmento a→b pasa a menos de `w` del cuerpo del jugador (pies a cabeza)? */
function segmentHitsPlayer(a, b, p, w) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.3);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    if (y > p.y - 0.2 && y < p.y + 1.9 && Math.hypot(x - p.x, z - p.z) < w) return true;
  }
  return false;
}

// ---- Dibujo ------------------------------------------------------------------------------

const STONE = [0x8a877d, 0x7b786f, 0x969286, 0x6d6a62];
const MOSS = [0x4f6d2a, 0x3f5a22, 0x5a7a33];

function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(80,200,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, 'rgba(120,220,255,0.55)');
  gr.addColorStop(1, outer);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let _glowTex = null;
let _dustTex = null;
export function glowTex() {
  return (_glowTex ??= glowTexture());
}
function dustTex() {
  if (_dustTex) return _dustTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(200,190,170,0.9)');
  gr.addColorStop(1, 'rgba(200,190,170,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  _dustTex = new THREE.CanvasTexture(c);
  return _dustTex;
}

export class BossView {
  constructor(parent, logic) {
    this.logic = logic;
    this.parent = parent;
    this.root = new THREE.Group();
    this.root.name = 'GiantGolem';
    parent.add(this.root);
    const rng = mulberry(11);
    this._geos = [0, 1, 2, 3, 4, 5].map((k) => boulderGeo(k + 1, 1, 0.22));
    this._stoneMats = STONE.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    this._mossMats = MOSS.map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    this._vineMat = new THREE.MeshLambertMaterial({ color: 0x3f5f22, flatShading: true, side: THREE.DoubleSide });
    this._pieces = [];
    const stone = (g, [x, y, z], [sx, sy, sz], rot = [0, 0, 0], mat = null) => {
      const m = new THREE.Mesh(this._geos[Math.floor(rng() * this._geos.length)], mat ?? this._stoneMats[Math.floor(rng() * this._stoneMats.length)]);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.rotation.set(rot[0] + (rng() - 0.5) * 0.16, rot[1] + rng() * Math.PI, rot[2] + (rng() - 0.5) * 0.16);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      this._pieces.push(m);
      return m;
    };
    // Musgo: una capa verde aplastada encima de una piedra (y alguna liana colgando).
    const moss = (g, [x, y, z], [sx, sz], vines = 0) => {
      const m = new THREE.Mesh(this._geos[Math.floor(rng() * this._geos.length)], this._mossMats[Math.floor(rng() * this._mossMats.length)]);
      m.position.set(x, y, z);
      m.scale.set(sx * 0.85, 0.16, sz * 0.85);
      m.rotation.y = rng() * Math.PI;
      g.add(m);
      this._pieces.push(m);
      for (let i = 0; i < vines; i++) {
        const l = 0.6 + rng() * 1.2;
        const v = new THREE.Mesh(new THREE.PlaneGeometry(0.12, l), this._vineMat);
        v.position.set(x + (rng() - 0.5) * sx, y - l / 2, z + (rng() - 0.5) * sz * 0.6 + sz * 0.45);
        v.rotation.y = rng() * Math.PI;
        g.add(v);
        this._pieces.push(v);
      }
    };
    const group = (parentG, [x, y, z]) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parentG.add(g);
      return g;
    };
    // root → body (agachar/caer) → caderas, piernas, torso, brazos, cabeza.
    const body = (this.body = group(this.root, [0, 0, 0]));
    const hips = (this.hips = group(body, [0, BOSS.HIP, 0]));
    stone(hips, [0, -0.25, 0], [1.55, 0.95, 1.2]);
    this.legs = [-1, 1].map((s) => {
      const thigh = group(hips, [s * 1.2, -0.4, 0]);
      stone(thigh, [0, -0.75, 0], [0.95, 1.05, 0.95]);
      const knee = group(thigh, [0, -1.55, 0.05]);
      stone(knee, [0, -0.55, 0.05], [0.9, 0.85, 0.9]);
      const foot = stone(knee, [0, -1.25, 0.35], [1.1, 0.5, 1.35]);
      foot.rotation.set(0, 0, 0);
      return { thigh, knee, s };
    });
    const torso = (this.torso = group(hips, [0, 0.1, 0]));
    stone(torso, [0, 0.75, 0.15], [1.65, 0.95, 1.3]);           // vientre
    stone(torso, [0, 2.05, 0], [2.6, 1.6, 1.8]);                 // pecho
    stone(torso, [0, 2.55, -1.05], [1.9, 1.35, 1.15]);           // joroba
    stone(torso, [-1.35, 1.7, 0.35], [0.95, 1.0, 0.9]);
    stone(torso, [1.35, 1.75, 0.3], [0.95, 1.05, 0.9]);
    moss(torso, [0.2, 3.45, -0.55], [1.6, 1.25], 3);
    moss(torso, [-0.9, 3.25, 0.3], [0.8, 0.7], 1);
    // El cristal: en un engaste de piedras, en el centro del pecho.
    const [, cy, cz] = BOSS.CRYSTAL;
    const socket = (this.socket = group(torso, [0, cy - 0.1, cz - 0.1]));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      stone(socket, [Math.cos(a) * 0.82, Math.sin(a) * 0.95, -0.1], [0.42, 0.4, 0.38], [0, 0, a], this._stoneMats[3]);
    }
    this.crystalMat = new THREE.MeshBasicMaterial({ color: 0x7fe6ff });
    const crystal = (this.crystalMesh = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), this.crystalMat));
    crystal.scale.set(0.5, 0.82, 0.38);
    crystal.position.set(0, 0.1, 0.12);
    socket.add(crystal);
    this.crystalInner = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }));
    this.crystalInner.scale.set(0.24, 0.45, 0.2);
    this.crystalInner.position.set(0, 0.1, 0.25);
    socket.add(this.crystalInner);
    // Grietas: tres finas láminas oscuras que aparecen con el daño.
    this._cracks = [0, 1, 2].map((i) => {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.9), new THREE.MeshBasicMaterial({ color: 0x0a2a3a, side: THREE.DoubleSide }));
      c.position.set((i - 1) * 0.16, 0.1, 0.5);
      c.rotation.set(0, 0, (i - 1) * 0.7 + 0.2);
      c.visible = false;
      socket.add(c);
      return c;
    });
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x6fd8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.scale.setScalar(2);
    this.halo.position.set(0, 0.1, 0.6);
    socket.add(this.halo);
    this.light = new THREE.PointLight(0x6fd8ff, 3, 20, 1.6);
    this.light.position.set(0, 0.1, 1.4);
    socket.add(this.light);
    // Cabeza pequeña, hundida entre los hombros.
    const head = (this.head = group(torso, [0, 3.45, 0.75]));
    stone(head, [0, 0.25, 0], [0.82, 0.68, 0.78]);
    stone(head, [0, 0.45, 0.45], [0.7, 0.22, 0.32]); // ceja
    moss(head, [0, 0.82, -0.1], [0.62, 0.55]);
    this._eyeMat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), this._eyeMat);
      e.position.set(s * 0.26, 0.28, 0.72);
      head.add(e);
    }
    // Brazos largos (de gorila): los puños casi tocan el suelo.
    this.arms = [-1, 1].map((s) => {
      const shoulder = group(torso, [s * 2.85, 2.8, 0.05]);
      stone(shoulder, [s * 0.1, 0.15, 0], [1.45, 1.25, 1.35]);
      moss(shoulder, [s * 0.1, 1.15, -0.05], [1.0, 0.95], 2);
      const upper = group(shoulder, [s * 0.35, -0.45, 0]);
      stone(upper, [0, -1.05, 0], [0.9, 1.35, 0.9]);
      const elbow = group(upper, [0, -2.2, 0.05]);
      stone(elbow, [0, -1.0, 0.1], [0.95, 1.25, 0.95]);
      moss(elbow, [0, -0.15, -0.2], [0.6, 0.55]);
      const fist = group(elbow, [0, -2.15, 0.15]);
      stone(fist, [0, 0, 0], [1.45, 1.2, 1.4]);
      for (let k = 0; k < 3; k++) stone(fist, [(k - 1) * 0.42, -0.35, 0.65], [0.36, 0.34, 0.36]);
      return { shoulder, upper, elbow, fist, s };
    });
    // Roca que coge para lanzar (en las manos).
    this.heldRock = new THREE.Mesh(this._geos[2], this._stoneMats[1]);
    this.heldRock.scale.setScalar(1.15);
    this.heldRock.visible = false;
    this.root.add(this.heldRock);
    // Guardar la pose de montaje de cada pieza (para recomponerlo tras desmoronarse).
    this._rest = this._pieces.map((m) => ({ m, parent: m.parent, p: m.position.clone(), q: m.quaternion.clone(), s: m.scale.clone() }));
    this._debris = null;
    this._shake = 0;
    this.fx = new BossFx(parent, logic);
    this.root.position.set(logic.x, logic.y, logic.z);
  }

  /** Vuelve a montar el gólem (tras desmoronarse) para repetir la pelea. */
  reassemble() {
    if (!this._debris) return;
    for (const r of this._rest) {
      r.parent.add(r.m);
      r.m.position.copy(r.p);
      r.m.quaternion.copy(r.q);
      r.m.scale.copy(r.s);
    }
    this._debris = null;
    this.body.visible = true;
  }

  update(dt, t) {
    const L = this.logic;
    if (L.state !== 'DEAD' && this._debris) this.reassemble();
    this.root.position.set(L.x, L.y, L.z);
    this.root.rotation.y = L.heading;
    const pose = this._pose(L, t);
    // Suavizado de articulaciones (más rápido en los golpes).
    const k = Math.min(1, dt * (pose.snap ?? 8));
    const lerpRot = (obj, [x, y, z]) => {
      obj.rotation.x += (x - obj.rotation.x) * k;
      obj.rotation.y += (y - obj.rotation.y) * k;
      obj.rotation.z += (z - obj.rotation.z) * k;
    };
    this.body.position.y += (pose.bodyY - this.body.position.y) * k;
    this.torso.rotation.x = L.lean + pose.breathe; // el torso lo manda la lógica (cristal)
    lerpRot(this.head, pose.head);
    this.arms.forEach((a, i) => {
      const ap = pose.arms[i];
      lerpRot(a.upper, ap.upper);
      lerpRot(a.elbow, ap.elbow);
    });
    this.legs.forEach((l, i) => {
      const lp = pose.legs[i];
      lerpRot(l.thigh, lp.thigh);
      lerpRot(l.knee, lp.knee);
    });
    // Sacudida al recibir un impacto.
    this._shake = Math.max(this._shake - dt, 0);
    if (L.flash > 0.2) this._shake = 0.18;
    this.body.position.x = Math.sin(t * 70) * this._shake * 0.25;
    // Roca en las manos.
    this.heldRock.visible = L.held;
    if (L.held) {
      const a = this.arms[0].fist.getWorldPosition(new THREE.Vector3());
      const b = this.arms[1].fist.getWorldPosition(new THREE.Vector3());
      this.root.worldToLocal(a);
      this.root.worldToLocal(b);
      this.heldRock.position.copy(a).add(b).multiplyScalar(0.5);
      this.heldRock.position.y += 0.4;
      this.heldRock.rotation.y = t;
    }
    this._crystal(L, t);
    this._death(L, dt);
    this.fx.update(dt, t, this);
  }

  _crystal(L, t) {
    const dead = L.state === 'DEAD';
    const dormant = L.state === 'DORMANT';
    const rise = L.state === 'RISING' ? smooth(clamp01((L.rise - 0.15) / 0.5)) : 1;
    let glow = dormant ? 0.08 : 0.35 + 0.65 * rise;
    let color = 0x7fe6ff;
    if (L.phase === 2) glow *= 1.15 + Math.sin(t * 9) * 0.12;
    if (L.laser?.phase === 'CHARGE') glow *= 1 + 1.6 * clamp01(L.actionT / BOSS.LASER.CHARGE[L.phase - 1]);
    if (L.laser?.phase === 'FIRE') glow *= 2.4;
    if (L.venting) {
      color = 0xfff1d6;
      glow *= 1.6 + Math.sin(t * 14) * 0.2;
    }
    if (L.flash > 0) color = 0xffffff;
    if (dead) glow = Math.max(0, 1 - L.death * 6);
    this.crystalMat.color.setHex(color).multiplyScalar(0.35 + 0.65 * Math.min(1, glow));
    this.crystalInner.material.opacity = 0.2 + 0.6 * Math.min(1, glow);
    this.halo.material.opacity = Math.min(0.85, glow * 0.6);
    this.halo.scale.setScalar(1.3 + glow * 0.8);
    this.light.intensity = 3.2 * glow;
    this._eyeMat.color.setHex(dormant ? 0x1d3a44 : 0x9ff0ff);
    const cracks = dead ? 3 : L.cracks;
    this._cracks.forEach((c, i) => (c.visible = i < cracks));
    this.crystalMesh.visible = this.crystalInner.visible = !(dead && L.death > 0.08);
    this.crystalMesh.rotation.y = Math.sin(t * 0.8) * 0.15;
  }

  /** Poses (rotaciones objetivo de cada articulación) según lo que hace. */
  _pose(L, t) {
    const idleArm = (s) => ({ upper: [-0.22 + Math.sin(t * 1.1 + s) * 0.04, 0, s * 0.24], elbow: [-0.32, 0, 0] });
    const pose = {
      bodyY: 0,
      breathe: Math.sin(t * 1.3) * 0.025,
      head: [0.05, 0, 0],
      arms: [idleArm(-1), idleArm(1)],
      legs: [{ thigh: [0, 0, -0.05], knee: [0, 0, 0] }, { thigh: [0, 0, 0.05], knee: [0, 0, 0] }],
      snap: 6,
    };
    const kneel = () => {
      pose.bodyY = -1.55;
      pose.legs = [{ thigh: [-1.25, 0, -0.12], knee: [2.0, 0, 0] }, { thigh: [-1.25, 0, 0.12], knee: [2.0, 0, 0] }];
      pose.arms = [-1, 1].map((s) => ({ upper: [-0.55, 0, s * 0.25], elbow: [-0.9, 0, 0] }));
      pose.head = [0.5, 0, 0];
    };
    if (L.state === 'DORMANT') {
      kneel();
      pose.breathe = 0;
      pose.snap = 20;
      return pose;
    }
    if (L.state === 'RISING') {
      const u = smooth(clamp01((L.rise - 0.3) / 0.6));
      kneel();
      pose.bodyY *= 1 - u;
      pose.legs.forEach((l) => {
        l.thigh[0] *= 1 - u;
        l.knee[0] *= 1 - u;
      });
      pose.arms.forEach((a) => {
        a.upper[0] *= 1 - u;
        a.elbow[0] = -0.9 + 0.58 * u;
      });
      // Al final se yergue y abre los brazos.
      if (L.rise > 0.85) pose.arms.forEach((a, i) => (a.upper[2] = (i ? 1 : -1) * 0.9));
      pose.head = [0.5 * (1 - u) - 0.15 * u, 0, 0];
      pose.snap = 4;
      return pose;
    }
    if (L.state === 'DEAD') {
      kneel();
      pose.snap = 3;
      return pose;
    }
    // Andar (fase 2).
    if (L.walking) {
      const w = Math.sin(t * 3.2);
      pose.legs = [{ thigh: [w * 0.35, 0, -0.05], knee: [Math.max(0, -w) * 0.5, 0, 0] }, { thigh: [-w * 0.35, 0, 0.05], knee: [Math.max(0, w) * 0.5, 0, 0] }];
      pose.arms = [{ upper: [-0.2 - w * 0.25, 0, -0.16], elbow: [-0.35, 0, 0] }, { upper: [-0.2 + w * 0.25, 0, 0.16], elbow: [-0.35, 0, 0] }];
      pose.bodyY = -Math.abs(w) * 0.12;
    }
    const at = L.actionT;
    switch (L.action) {
      case 'ROAR': {
        pose.arms = [-1, 1].map((s) => ({ upper: [-1.1, 0, s * 1.5], elbow: [-0.3, 0, 0] }));
        pose.head = [-0.4, 0, 0];
        pose.snap = 7;
        break;
      }
      case 'SLAM': {
        const W = BOSS.SLAM.WINDUP[L.phase - 1];
        if (at < W) {
          const u = smooth(at / W);
          pose.arms[1] = { upper: [-3.0 * u, 0, 0.25], elbow: [-0.7 * u, 0, 0] };
          pose.arms[0] = { upper: [-0.6 * u, 0, -0.3], elbow: [-0.4, 0, 0] };
          pose.legs = [{ thigh: [0.25 * u, 0, -0.12], knee: [0.2 * u, 0, 0] }, { thigh: [-0.35 * u, 0, 0.12], knee: [0.4 * u, 0, 0] }];
          pose.snap = 10;
        } else {
          pose.arms[1] = { upper: [-1.2, 0, 0.1], elbow: [-0.05, 0, 0] };
          pose.arms[0] = { upper: [-0.7, 0, -0.35], elbow: [-0.3, 0, 0] };
          pose.legs = [{ thigh: [0.35, 0, -0.12], knee: [0.3, 0, 0] }, { thigh: [-0.45, 0, 0.12], knee: [0.55, 0, 0] }];
          pose.bodyY = -0.35;
          pose.snap = at < W + 0.15 ? 30 : 5;
        }
        break;
      }
      case 'ROCK': {
        const W = BOSS.ROCK.WINDUP[L.phase - 1];
        if (at < W * 0.42) {
          pose.arms = [-1, 1].map((s) => ({ upper: [-0.85, 0, s * 0.35], elbow: [-0.2, 0, 0] }));
          pose.bodyY = -0.4;
        } else if (at < W) {
          pose.arms = [-1, 1].map((s) => ({ upper: [-3.1, 0, s * 0.3], elbow: [-0.55, 0, 0] }));
          pose.head = [-0.25, 0, 0];
        } else {
          pose.arms = [-1, 1].map((s) => ({ upper: [-1.5, 0, s * 0.2], elbow: [-0.15, 0, 0] }));
          pose.snap = 20;
        }
        break;
      }
      case 'LASER': {
        pose.arms = [-1, 1].map((s) => ({ upper: [0.45, 0, s * 0.55], elbow: [-0.6, 0, 0] }));
        pose.legs = [{ thigh: [0.3, 0, -0.15], knee: [0.25, 0, 0] }, { thigh: [-0.3, 0, 0.15], knee: [0.3, 0, 0] }];
        pose.head = [-0.2, 0, 0];
        break;
      }
      case 'VENT': {
        pose.arms = [-1, 1].map((s) => ({ upper: [-0.05, 0, s * 0.1], elbow: [-0.15, 0, 0] }));
        pose.head = [0.55, 0, 0];
        pose.bodyY = -0.3;
        pose.snap = 4;
        break;
      }
      default:
        break;
    }
    return pose;
  }

  /** Al morir: el cristal estalla y las rocas se sueltan y caen en un montón. */
  _death(L, dt) {
    if (L.state !== 'DEAD') return;
    if (L.death > 0.15 && !this._debris) {
      this._debris = [];
      const scene = this.parent;
      const rng = mulberry(31);
      for (const r of this._rest) {
        const m = r.m;
        scene.attach(m);
        const dir = new THREE.Vector3(m.position.x - this.root.position.x, 0, m.position.z - this.root.position.z).normalize();
        this._debris.push({
          m,
          v: new THREE.Vector3(dir.x * (1 + rng() * 3), 1 + rng() * 3, dir.z * (1 + rng() * 3)),
          spin: new THREE.Vector3((rng() - 0.5) * 4, (rng() - 0.5) * 4, (rng() - 0.5) * 4),
          rest: false,
        });
      }
    }
    if (!this._debris) return;
    const env = this.logic.env;
    for (const d of this._debris) {
      if (d.rest) continue;
      d.v.y -= 16 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.spin.x * dt;
      d.m.rotation.y += d.spin.y * dt;
      d.m.rotation.z += d.spin.z * dt;
      const bottom = env.groundAt(d.m.position.x, d.m.position.z) + Math.min(d.m.scale.y, 0.9) * 0.6;
      if (d.m.position.y < bottom) {
        d.m.position.y = bottom;
        if (Math.abs(d.v.y) < 2.5) d.rest = true;
        d.v.multiplyScalar(0.35);
        d.v.y = Math.abs(d.v.y) * 0.4;
        d.spin.multiplyScalar(0.4);
      }
    }
  }

  dispose() {
    this.reassemble();
    this.root.parent?.remove(this.root);
    this.fx.dispose();
  }
}

/** Efectos de la pelea: ondas, polvo, rocas en vuelo y su marca, el láser y los cristales rotos. */
class BossFx {
  constructor(parent, logic) {
    this.logic = logic;
    this.group = new THREE.Group();
    this.group.name = 'GolemFx';
    parent.add(this.group);
    this._ringGeo = new THREE.TorusGeometry(1, 0.16, 6, 56);
    this._waves = [];
    this._dust = [];
    this._chunks = [];
    this._chunkGeo = new THREE.IcosahedronGeometry(0.22, 0);
    this._chunkMat = new THREE.MeshLambertMaterial({ color: 0x9a968b, flatShading: true });
    this._rockGeo = boulderGeo(9, 1, 0.24);
    this._rockMat = new THREE.MeshLambertMaterial({ color: 0x7b786f, flatShading: true });
    this._rocks = new Map();
    this._marks = new Map();
    this._markGeo = new THREE.RingGeometry(BOSS.ROCK.RADIUS - 0.35, BOSS.ROCK.RADIUS, 40);
    // Láser: núcleo blanco y halo azul (aditivos), destello en el punto de impacto.
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    beamGeo.translate(0, 0.5, 0);
    beamGeo.rotateX(Math.PI / 2); // a lo largo de +Z
    this.beamCore = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamGlow = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x3fb8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamAim = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const b of [this.beamCore, this.beamGlow, this.beamAim]) {
      b.visible = false;
      b.frustumCulled = false;
      this.group.add(b);
    }
    this.hitGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9fe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.hitGlow.visible = false;
    this.group.add(this.hitGlow);
    this.hitLight = new THREE.PointLight(0x6fd8ff, 0, 12, 1.5);
    this.group.add(this.hitLight);
    // Partículas que se juntan en el cristal mientras carga.
    this._sparks = [];
    this._sparkMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0x8fe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this._shards = [];
    this._shardMat = new THREE.MeshBasicMaterial({ color: 0x8fe8ff });
    this._shardGeo = new THREE.OctahedronGeometry(0.16, 0);
    this._shattered = false;
  }

  /** Polvo y trozos de roca en un punto (golpe, impacto de roca). */
  burst(x, y, z, n = 14, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex(), transparent: true, opacity: 0.8, depthWrite: false }));
      sp.position.set(x, y + 0.4, z);
      sp.scale.setScalar(1.2 * size);
      this.group.add(sp);
      this._dust.push({ m: sp, v: new THREE.Vector3(Math.cos(a) * 3.5 * size, 1 + Math.random() * 1.5, Math.sin(a) * 3.5 * size), t: 0, life: 1.4 + Math.random() * 0.6 });
    }
    for (let i = 0; i < n * 0.7; i++) {
      const c = new THREE.Mesh(this._chunkGeo, this._chunkMat);
      c.position.set(x, y + 0.3, z);
      c.scale.setScalar(0.6 + Math.random() * 1.2);
      this.group.add(c);
      const a = Math.random() * Math.PI * 2;
      this._chunks.push({ m: c, v: new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 4), 4 + Math.random() * 5, Math.sin(a) * (2 + Math.random() * 4)), floor: y, t: 0 });
    }
  }

  update(dt, t, view) {
    const L = this.logic;
    // Ondas del golpe.
    while (this._waves.length < L.waves.length) {
      const m = new THREE.Mesh(this._ringGeo, new THREE.MeshBasicMaterial({ color: 0xd8f4ff, transparent: true, opacity: 0.8, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
      this._waves.push(m);
    }
    this._waves.forEach((m, i) => {
      const w = L.waves[i];
      m.visible = !!w;
      if (!w) return;
      m.position.set(w.x, w.y + 0.3, w.z);
      m.scale.set(w.r, w.r, 1.4);
      m.material.opacity = 0.85 * (1 - w.r / BOSS.SLAM.WAVE_MAX);
      // Polvo levantado por la onda.
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex(), transparent: true, opacity: 0.55, depthWrite: false }));
        sp.position.set(w.x + Math.cos(a) * w.r, w.y + 0.5, w.z + Math.sin(a) * w.r);
        sp.scale.setScalar(1.4);
        this.group.add(sp);
        this._dust.push({ m: sp, v: new THREE.Vector3(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5), t: 0, life: 0.9 });
      }
    });
    // Rocas en vuelo y su marca en el suelo.
    const live = new Set(L.rocks);
    for (const r of L.rocks) {
      if (!this._rocks.has(r)) {
        const m = new THREE.Mesh(this._rockGeo, this._rockMat);
        m.scale.setScalar(1.15);
        m.castShadow = true;
        this.group.add(m);
        this._rocks.set(r, m);
        const mark = new THREE.Mesh(this._markGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
        mark.rotation.x = -Math.PI / 2;
        mark.position.set(r.target.x, r.target.y + 0.35, r.target.z);
        this.group.add(mark);
        this._marks.set(r, mark);
      }
      const m = this._rocks.get(r);
      m.position.set(r.x, r.y, r.z);
      m.rotation.x += dt * 5;
      m.rotation.z += dt * 3;
      const mk = this._marks.get(r);
      mk.material.opacity = 0.5 + 0.4 * Math.sin(t * 14);
      mk.scale.setScalar(1 - Math.min(0.3, r.t * 0.2));
    }
    for (const [r, m] of this._rocks) {
      if (live.has(r)) continue;
      this.group.remove(m);
      const mk = this._marks.get(r);
      this.group.remove(mk);
      mk.material.dispose();
      this._rocks.delete(r);
      this._marks.delete(r);
    }
    // Láser.
    const las = L.laser;
    const c = las ? L.crystal : null;
    const firing = las?.phase === 'FIRE' && las.end;
    this.beamCore.visible = this.beamGlow.visible = !!firing;
    this.hitGlow.visible = !!firing;
    this.hitLight.intensity = firing ? 5 : 0;
    if (firing) {
      for (const [b, rad] of [[this.beamCore, 0.13], [this.beamGlow, 0.42 + Math.sin(t * 40) * 0.05]]) placeBeam(b, c, las.end, rad);
      this.hitGlow.position.set(las.end.x, las.end.y + 0.2, las.end.z);
      this.hitGlow.scale.setScalar(2.4 + Math.sin(t * 30) * 0.4);
      this.hitLight.position.set(las.end.x, las.end.y + 0.6, las.end.z);
      if (Math.random() < dt * 40) this._spark(las.end, 1);
    }
    // Carga: chispas que vuelan al cristal y una línea de mira tenue.
    const charging = las?.phase === 'CHARGE';
    if (charging && Math.random() < dt * 30) this._spark(c, -1);
    this.beamAim.visible = false;
    this._sparks = this._sparks.filter((s) => {
      s.t += dt;
      if (s.inward) {
        const cc = L.crystal;
        s.m.position.lerp(new THREE.Vector3(cc.x, cc.y, cc.z), Math.min(1, dt * 4));
      } else s.m.position.addScaledVector(s.v, dt);
      s.m.material.opacity = Math.max(0, 1 - s.t / s.life);
      if (s.t < s.life) return true;
      this.group.remove(s.m);
      s.m.material.dispose();
      return false;
    });
    // Polvo y trozos.
    this._dust = this._dust.filter((d) => {
      d.t += dt;
      d.m.position.addScaledVector(d.v, dt);
      d.v.multiplyScalar(1 - dt * 1.5);
      d.m.scale.setScalar(d.m.scale.x + dt * 1.6);
      d.m.material.opacity = Math.max(0, 0.8 * (1 - d.t / d.life));
      if (d.t < d.life) return true;
      this.group.remove(d.m);
      d.m.material.dispose();
      return false;
    });
    this._chunks = this._chunks.filter((c2) => {
      c2.t += dt;
      c2.v.y -= 20 * dt;
      c2.m.position.addScaledVector(c2.v, dt);
      c2.m.rotation.x += dt * 6;
      if (c2.m.position.y < c2.floor + 0.1) {
        c2.m.position.y = c2.floor + 0.1;
        c2.v.set(0, 0, 0);
      }
      if (c2.t < 2.5) return true;
      this.group.remove(c2.m);
      return false;
    });
    // El cristal estalla.
    if (L.state === 'DEAD' && L.death > 0.06 && !this._shattered) {
      this._shattered = true;
      const cc = L.crystal;
      for (let i = 0; i < 26; i++) {
        const s = new THREE.Mesh(this._shardGeo, this._shardMat);
        s.position.set(cc.x, cc.y, cc.z);
        this.group.add(s);
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 7);
        this._shards.push({ m: s, v, t: 0 });
      }
      this.hitLight.position.set(cc.x, cc.y, cc.z);
      this._flashT = 0.6;
    }
    if (this._flashT > 0) {
      this._flashT -= dt;
      this.hitLight.intensity = 30 * Math.max(0, this._flashT);
    }
    if (L.state !== 'DEAD') this._shattered = false;
    this._shards = this._shards.filter((s) => {
      s.t += dt;
      s.v.y -= 12 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += dt * 8;
      const gy = L.env.groundAt(s.m.position.x, s.m.position.z) + 0.1;
      if (s.m.position.y < gy) {
        s.m.position.y = gy;
        s.v.set(0, 0, 0);
      }
      if (s.t < 5) return true;
      this.group.remove(s.m);
      return false;
    });
  }

  _spark(at, dir) {
    const s = new THREE.Sprite(this._sparkMat.clone());
    const r = dir < 0 ? 2.2 : 0.2;
    s.position.set(at.x + (Math.random() - 0.5) * r * 2, at.y + (Math.random() - 0.5) * r * 2, at.z + (Math.random() - 0.5) * r * 2);
    s.scale.setScalar(dir < 0 ? 0.35 : 0.5);
    this.group.add(s);
    this._sparks.push({ m: s, inward: dir < 0, v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6), t: 0, life: dir < 0 ? 0.5 : 0.45 });
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}

function placeBeam(mesh, a, b, radius) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 0.01;
  mesh.position.set(a.x, a.y, a.z);
  mesh.scale.set(radius, radius, len);
  mesh.lookAt(b.x, b.y, b.z);
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v) {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
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

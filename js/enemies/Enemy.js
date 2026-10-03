/**
 * Enemy — estado y comportamiento de un enemigo (gólem, slime, goblin, jefe goblin).
 * Sin Three.js: lo dibuja EnemyViews a partir de estos datos.
 *
 * Estados:
 *   DORMANT     gólem dormido: un montón de piedras en el suelo
 *   ASSEMBLING  las piedras se juntan (no se le puede golpear todavía)
 *   IDLE/WANDER en su casa (base, equipo de exploración…)
 *   CHASE       persigue al jugador
 *   WINDUP      amago del golpe (brazos o mazo arriba): se ve venir, se puede esquivar
 *   RECOVER     después del golpe, un momento quieto
 *   RETURN      vuelve a su casa (el jugador se ha alejado o ha muerto)
 *   DEAD
 *
 * Todo el daño al jugador pasa por env.onAttack(enemy), que emite PLAYER_DAMAGED con
 * la posición del enemigo (el escudo, esquivar y la armadura lo tienen en cuenta).
 */
export const EnemyState = Object.freeze({
  DORMANT: 'DORMANT',
  ASSEMBLING: 'ASSEMBLING',
  IDLE: 'IDLE',
  WANDER: 'WANDER',
  CHASE: 'CHASE',
  WINDUP: 'WINDUP',
  RECOVER: 'RECOVER',
  RETURN: 'RETURN',
  DEAD: 'DEAD',
});

const S = EnemyState;
const TURN_SPEED = 5;
const KNOCKBACK_DECAY = 6;

export class Enemy {
  /**
   * @param {object} p
   * @param {string} p.id
   * @param {string} p.type      GOLEM | SLIME | GOBLIN | GOBLIN_BOSS
   * @param {object} p.def       GameConfig.ENEMIES.TYPES[type]
   * @param {object} p.home      { x, z, radius } a donde vuelve
   * @param {object} p.rng       SeededRandom propio
   * @param {boolean} [p.dormant] empieza dormido (gólems)
   * @param {object} [p.group]   grupo con el que se alerta (base, equipo)
   */
  constructor({ id, type, def, x, y = 0, z, home, rng, dormant = false, group = null, scale = 1 }) {
    this.id = id;
    this.type = type;
    this.def = def;
    this.home = home;
    this.rng = rng;
    this.group = group;
    this.scale = scale;
    this.x = x;
    this.y = y;
    this.z = z;
    this.heading = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.health = def.HEALTH;
    this.maxHealth = def.HEALTH;
    this.state = dormant ? S.DORMANT : S.IDLE;
    this.timer = rng.range(0.5, 3);
    this.target = null;
    this.assemble = dormant ? 0 : 1; // 0 montón de piedras · 1 de pie
    this.windup = 0;                 // 0..1 amago del golpe (visual)
    this.strike = 0;                 // >0 justo después de golpear (visual)
    this.hitFlash = 0;
    this.deathProgress = 0;
    this.gait = 0;
    this.removed = false;
    this.melting = false;            // slime al amanecer: se deshace sin soltar nada
    this._kbX = 0;
    this._kbZ = 0;
    this._lastSeen = 0;
  }

  get alive() {
    return this.state !== S.DEAD && !this.removed;
  }

  /** Se le puede golpear (despierto y vivo). */
  get hittable() {
    return this.alive && this.state !== S.DORMANT && this.state !== S.ASSEMBLING;
  }

  get awake() {
    return this.state !== S.DORMANT;
  }

  /** Persiguiendo o atacando. */
  get hostile() {
    return this.state === S.CHASE || this.state === S.WINDUP || this.state === S.RECOVER;
  }

  // Interfaz común con los animales (InteractionSystem, CombatSystem).
  get aimY() {
    return this.y + this.def.HEIGHT * this.scale * 0.6;
  }

  get aimRadius() {
    return Math.max(0.6, this.def.RADIUS * this.scale * 1.5);
  }

  get reach() {
    return this.def.RADIUS * this.scale;
  }

  /** Despierta (gólem) o se pone a perseguir. */
  alert() {
    if (!this.alive) return;
    this.locked = false;
    if (this.state === S.DORMANT) {
      this.state = S.ASSEMBLING;
      this.timer = this.def.ASSEMBLE_TIME ?? 1.5;
      return;
    }
    if (this.state === S.IDLE || this.state === S.WANDER || this.state === S.RETURN) this.state = S.CHASE;
  }

  /**
   * Golpe del jugador.
   * @returns {{ killed: boolean }}
   */
  takeHit(damage, fromX, fromZ) {
    if (!this.hittable) return { killed: false };
    this.health -= damage;
    this.hitFlash = 0.3;
    const dx = this.x - fromX;
    const dz = this.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    const kb = 3 * (this.def.KNOCKBACK ?? 1);
    this._kbX = (dx / d) * kb;
    this._kbZ = (dz / d) * kb;
    if (this.health <= 0) {
      this.health = 0;
      this.state = S.DEAD;
      this.timer = 0;
      this.speed = 0;
      return { killed: true };
    }
    // Un golpe siempre le enfada (y a su grupo).
    if (!this.hostile) this.state = S.CHASE;
    if (this.group) for (const m of this.group.members) m.alert();
    return { killed: false };
  }

  /** Lo que suelta al morir (con su parte de azar: monedas, minerales). */
  rollDrops() {
    const out = {};
    const add = (id, n) => {
      if (n > 0) out[id] = (out[id] ?? 0) + n;
    };
    for (const [id, [a, b]] of Object.entries(this.def.DROPS ?? {})) add(id, this.rng.int(a, b));
    const ore = this.def.ORE_DROP;
    if (ore && this.rng.next() < ore.CHANCE) {
      let roll = this.rng.next();
      for (const [id, w] of Object.entries(ore.TYPES)) {
        roll -= w;
        if (roll <= 0) {
          add(id, this.rng.int(ore.AMOUNT[0], ore.AMOUNT[1]));
          break;
        }
      }
    }
    if (this.def.COIN_CHANCE && this.rng.next() < this.def.COIN_CHANCE) add('COIN', 1);
    return out;
  }

  /**
   * @param {number} dt
   * @param {object} env { cfg, player:{x,y,z,alive}, groundAt(x,z,y), isWalkable(x,z,y),
   *                       resolveCollisions(pos,r,y0,y1), onAttack(enemy) }
   */
  update(dt, env) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.strike = Math.max(0, this.strike - dt);
    const d = this.def;
    if (this.state === S.DEAD) {
      this.timer += dt;
      this.deathProgress = Math.min(1, this.timer / env.cfg.DEATH_TIME);
      if (this.timer >= env.cfg.DEATH_TIME) this.removed = true;
      this._applyKnockback(dt, env);
      return;
    }
    const p = env.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const dist = Math.hypot(dx, dz);
    const dy = Math.abs((p.y ?? this.y) - this.y);
    const sees = p.alive && dy < 4.5;
    const toward = Math.atan2(dx, dz);
    this.timer -= dt;
    let wantHeading = this.heading;
    let wantSpeed = 0;

    switch (this.state) {
      case S.DORMANT:
        if (!this.locked && sees && dist < (d.WAKE_DISTANCE ?? 6)) {
          this.alert();
          if (this.group) for (const m of this.group.members) m.alert();
        }
        break;

      case S.ASSEMBLING:
        this.assemble = Math.min(1, 1 - this.timer / (d.ASSEMBLE_TIME ?? 1.5));
        wantHeading = toward;
        if (this.timer <= 0) {
          this.assemble = 1;
          this.state = S.CHASE;
        }
        break;

      case S.IDLE:
      case S.WANDER:
        if (sees && dist < d.AGGRO) {
          this.state = S.CHASE;
          if (this.group) for (const m of this.group.members) m.alert();
          break;
        }
        if (this.state === S.IDLE) {
          if (this.timer <= 0) this._pickWander(env);
        } else {
          const tx = this.target.x - this.x;
          const tz = this.target.z - this.z;
          if (Math.hypot(tx, tz) < 0.8 || this.timer <= 0) this._toIdle();
          else {
            wantHeading = Math.atan2(tx, tz);
            wantSpeed = d.SPEED * (d.WANDER_FACTOR ?? 0.35);
          }
        }
        break;

      case S.CHASE: {
        const far = Math.hypot(this.x - this.home.x, this.z - this.home.z) > (this.home.leash ?? env.cfg.LEASH);
        if (!p.alive || dist > d.AGGRO * 1.7 || far) {
          this.state = S.RETURN;
          break;
        }
        wantHeading = toward;
        if (dist > d.RANGE * 0.8) wantSpeed = d.SPEED;
        if (dist <= d.RANGE && dy < 2) {
          this.state = S.WINDUP;
          this.timer = d.WINDUP;
        }
        break;
      }

      case S.WINDUP:
        wantHeading = toward;
        this.windup = Math.min(1, 1 - this.timer / d.WINDUP);
        if (this.timer <= 0) {
          this.windup = 0;
          this.strike = 0.35;
          // Alcanza si el jugador sigue a tiro (un paso atrás a tiempo lo esquiva).
          if (p.alive && dist <= d.RANGE + 0.5 && dy < 2) env.onAttack(this);
          this.state = S.RECOVER;
          this.timer = d.COOLDOWN * 0.5;
        }
        break;

      case S.RECOVER:
        wantHeading = toward;
        if (this.timer <= 0) this.state = S.CHASE;
        break;

      case S.RETURN: {
        const hx = this.home.x - this.x;
        const hz = this.home.z - this.z;
        const hd = Math.hypot(hx, hz);
        if (sees && dist < d.AGGRO * 0.6 && Math.hypot(this.x - this.home.x, this.z - this.home.z) < (this.home.leash ?? env.cfg.LEASH)) {
          this.state = S.CHASE;
          break;
        }
        if (hd < 1.5) {
          if (this.type === 'GOLEM' && this.home.sleep) {
            // El gólem vuelve a dormirse: se deshace en piedras donde estaba.
            this.state = S.DORMANT;
            this.assemble = 0;
            this.health = Math.min(this.maxHealth, this.health + this.maxHealth * 0.5);
          } else this._toIdle();
          break;
        }
        wantHeading = Math.atan2(hx, hz);
        wantSpeed = d.SPEED * 0.8;
        break;
      }
      default:
        break;
    }
    if (this.state !== S.WINDUP) this.windup = 0;
    this._move(dt, env, wantHeading, wantSpeed);
  }

  _move(dt, env, wantHeading, wantSpeed) {
    if (this.state === S.DORMANT) {
      this.speed = 0;
      this.y = env.groundAt(this.x, this.z, this.y);
      return;
    }
    const turn = TURN_SPEED * dt;
    this.heading += clamp(wrap(wantHeading - this.heading), -turn, turn);
    const facing = Math.max(0, Math.cos(wrap(wantHeading - this.heading)));
    this.speed += clamp(wantSpeed * facing - this.speed, -8 * dt, 8 * dt);
    if (this.speed > 0.01) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (!this._tryMoveTo(nx, nz, env) && this.state === S.WANDER) this._toIdle();
    }
    this._applyKnockback(dt, env);
    this.gait += this.speed * dt * 3.2 / this.scale;
  }

  _applyKnockback(dt, env) {
    if (Math.abs(this._kbX) + Math.abs(this._kbZ) < 0.01) return;
    this._tryMoveTo(this.x + this._kbX * dt, this.z + this._kbZ * dt, env);
    const k = Math.exp(-KNOCKBACK_DECAY * dt);
    this._kbX *= k;
    this._kbZ *= k;
  }

  _tryMoveTo(nx, nz, env) {
    if (!env.isWalkable(nx, nz, this.y)) return false;
    const pos = { x: nx, z: nz, y: this.y };
    env.resolveCollisions(pos, this.def.RADIUS * this.scale, this.y + 0.2, this.y + this.def.HEIGHT * this.scale);
    if (!env.isWalkable(pos.x, pos.z, this.y)) return false;
    const ny = env.groundAt(pos.x, pos.z, this.y);
    if (Math.abs(ny - this.y) > 1.6) return false; // ni precipicios ni paredes
    this.x = pos.x;
    this.z = pos.z;
    this.y = ny;
    return true;
  }

  _toIdle() {
    this.state = S.IDLE;
    this.timer = this.rng.range(2, 6);
    this.target = null;
  }

  _pickWander(env) {
    const r = this.home.radius ?? 6;
    for (let i = 0; i < 5; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const k = Math.sqrt(this.rng.next()) * r;
      const x = this.home.x + Math.cos(a) * k;
      const z = this.home.z + Math.sin(a) * k;
      if (env.isWalkable(x, z, this.y)) {
        this.target = { x, z };
        this.state = S.WANDER;
        this.timer = 15;
        return;
      }
    }
    this.timer = 1.5;
  }
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

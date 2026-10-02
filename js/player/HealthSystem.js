import { GameEvents } from '../core/GameEvents.js';
import { VitalStat } from './VitalStat.js';

/**
 * HealthSystem — vida del jugador: daño, curación, muerte y reaparición.
 *
 * - Daño: escucha PLAYER_DAMAGED (animales, hambre, sed, caídas y frío).
 *   Cualquier sistema puede hacer daño emitiendo ese evento sin conocer a este.
 * - Caídas: escucha PLAYER_LANDED y hace daño por encima de una velocidad.
 * - Curación lenta si no ha recibido daño recientemente y `canRegenerate()`
 *   (inyectado: hambre y sed suficientes) lo permite.
 * - Muerte: emite PLAYER_DIED; tras RESPAWN_DELAY acepta PLAYER_RESPAWN_REQUEST
 *   y emite PLAYER_RESPAWNED (el resto de sistemas restablecen su estado).
 */
const CAUSE_NAMES = {
  HUNGER: 'hambre',
  THIRST: 'sed',
  FALL: 'una caída',
  COLD: 'frío',
  SUFFOCATION: 'asfixia',
  DECOMPRESSION: 'una descompresión explosiva',
};

export class HealthSystem extends VitalStat {
  constructor({ config, events, canRegenerate = () => true }) {
    super({
      id: 'HEALTH',
      max: config.MAX_HEALTH,
      lowRatio: config.LOW_RATIO,
      criticalRatio: config.CRITICAL_RATIO,
      events,
    });
    this.name = 'health';
    this._cfg = config;
    this._canRegenerate = canRegenerate;
    this._sinceDamage = Infinity;
    this.dead = false;
    this.deathTime = 0;
    this.invulnerable = false; // herramienta Admin

    // Filtro opcional del daño (armadura, esquiva, escudo): (evento) → cantidad final.
    this.modifier = null;
    events.on(GameEvents.PLAYER_DAMAGED, (d) => this.damage(this.modifier ? this.modifier(d) : d.amount, d.source, d.sourceName));
    events.on(GameEvents.PLAYER_LANDED, ({ fallSpeed }) => {
      const excess = fallSpeed - config.FALL_DAMAGE_MIN_SPEED;
      if (excess > 0) events.emit(GameEvents.PLAYER_DAMAGED, { amount: Math.round(excess * config.FALL_DAMAGE_PER_MS), source: 'FALL' });
    });
    events.on(GameEvents.PLAYER_RESPAWN_REQUEST, () => this.respawn());
  }

  damage(amount, source = 'UNKNOWN', sourceName = null) {
    if (this.dead || this.invulnerable || !(amount > 0)) return 0;
    this._sinceDamage = 0;
    const done = this.consume(amount);
    if (this.value <= 0) this._die(source, sourceName);
    return done;
  }

  heal(amount) {
    if (this.dead) return 0;
    return this.add(amount);
  }

  /** Segundos que faltan para poder reaparecer. */
  get respawnIn() {
    return Math.max(0, this._cfg.RESPAWN_DELAY - this.deathTime);
  }

  respawn() {
    if (!this.dead || this.respawnIn > 0) return false;
    this.dead = false;
    this._sinceDamage = Infinity;
    this.set(this._cfg.RESPAWN_VALUES.HEALTH);
    this._events.emit(GameEvents.PLAYER_RESPAWNED, {});
    return true;
  }

  update(dt) {
    if (this.dead) {
      this.deathTime += dt;
      return;
    }
    this._sinceDamage += dt;
    if (this._sinceDamage >= this._cfg.HEALTH_REGEN_DELAY && this.ratio < 1 && this._canRegenerate()) {
      this.add(this._cfg.HEALTH_REGEN * dt);
    }
  }

  _die(cause, sourceName) {
    this.dead = true;
    this.deathTime = 0;
    const causeName = sourceName ? `un ataque (${sourceName})` : CAUSE_NAMES[cause] ?? 'causas desconocidas';
    this._events.emit(GameEvents.PLAYER_DIED, { cause, causeName, respawnDelay: this._cfg.RESPAWN_DELAY });
  }
}

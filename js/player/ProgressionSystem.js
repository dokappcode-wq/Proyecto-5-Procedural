import { GameEvents } from '../core/GameEvents.js';

/**
 * ProgressionSystem — niveles del jugador. Sin Three.js ni DOM.
 *
 * - addXp(n): suma experiencia; al pasar de nivel da PROGRESSION.POINTS_PER_LEVEL puntos.
 * - spend(stat): gasta un punto en una estadística (PROGRESSION.STATS):
 *     HEALTH  +vida máxima      STAMINA +energía máxima
 *     DAMAGE  +daño y rapidez al talar/picar/romper
 *     SPEED   +velocidad al moverse
 *   Los sistemas leen los multiplicadores (damageMultiplier, speedMultiplier) y las
 *   máximas de vida y energía se aplican aquí (applyTo).
 * Emite PROGRESSION_CHANGED en cada cambio y PLAYER_LEVEL_UP al subir de nivel.
 */
export class ProgressionSystem {
  constructor({ config, events }) {
    this.name = 'progression';
    this._cfg = config;
    this._events = events;
    this.level = 1;
    this.xp = 0;              // experiencia dentro del nivel actual
    this.points = 0;          // puntos sin gastar
    this.stats = Object.fromEntries(Object.keys(config.STATS).map((k) => [k, 0]));
    this._targets = null;     // { health, energy, base: { health, energy } }
  }

  /** Vida y energía a las que se aplican las máximas. */
  applyTo({ health, energy }) {
    this._targets = { health, energy, base: { health: health.max, energy: energy.max } };
    this._applyMax();
  }

  /** XP necesaria para pasar del nivel `level` al siguiente. */
  xpToNext(level = this.level) {
    return this._cfg.XP_BASE + this._cfg.XP_GROWTH * (level - 1);
  }

  get maxed() {
    return this.level >= this._cfg.MAX_LEVEL;
  }

  /** @returns {number} niveles subidos */
  addXp(amount) {
    if (!(amount > 0) || this.maxed) return 0;
    this.xp += amount;
    let ups = 0;
    while (!this.maxed && this.xp >= this.xpToNext()) {
      this.xp -= this.xpToNext();
      this.level += 1;
      this.points += this._cfg.POINTS_PER_LEVEL;
      ups += 1;
    }
    if (this.maxed) this.xp = 0;
    if (ups) this._events.emit(GameEvents.PLAYER_LEVEL_UP, { level: this.level, points: this.points });
    this._changed();
    return ups;
  }

  /** Gasta un punto en una estadística. @returns {boolean} */
  spend(stat) {
    if (this.points <= 0 || !(stat in this.stats)) return false;
    this.points -= 1;
    this.stats[stat] += 1;
    this._applyMax(stat);
    this._changed();
    return true;
  }

  /** Bonificación total de una estadística (10 → +10 de vida; 0.08 → +8 %). */
  bonus(stat) {
    return this.stats[stat] * this._cfg.STATS[stat].PER_POINT;
  }

  get damageMultiplier() {
    return 1 + this.bonus('DAMAGE');
  }

  get speedMultiplier() {
    return 1 + this.bonus('SPEED');
  }

  /** Estado para guardar o viajar. */
  snapshot() {
    return { level: this.level, xp: this.xp, points: this.points, stats: { ...this.stats } };
  }

  /** Restaura (datos no fiables: se comprueba todo). */
  restore(s) {
    if (!s || typeof s !== 'object') return;
    const int = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    this.level = Math.max(1, int(s.level, this._cfg.MAX_LEVEL));
    this.xp = Math.min(int(s.xp, 1e9), this.xpToNext() - 1);
    for (const k of Object.keys(this.stats)) this.stats[k] = int(s.stats?.[k], this._cfg.MAX_LEVEL);
    const spent = Object.values(this.stats).reduce((a, b) => a + b, 0);
    const earned = (this.level - 1) * this._cfg.POINTS_PER_LEVEL;
    if (spent > earned) for (const k of Object.keys(this.stats)) this.stats[k] = 0; // manipulado: se reinicia el reparto
    this.points = Math.min(int(s.points, 1e6), earned - Object.values(this.stats).reduce((a, b) => a + b, 0));
    this._applyMax();
    this._changed();
  }

  _applyMax(only = null) {
    const t = this._targets;
    if (!t) return;
    for (const [stat, target, base] of [['HEALTH', t.health, t.base.health], ['STAMINA', t.energy, t.base.energy]]) {
      if (only && only !== stat) continue;
      const max = base + this.bonus(stat);
      const gained = max - target.max;
      target.max = max;
      // Subir la máxima también llena esa parte (y nunca deja el valor por encima).
      target.set(Math.min(max, target.value + Math.max(0, gained)));
      target.emitState();
    }
  }

  _changed() {
    this._events.emit(GameEvents.PROGRESSION_CHANGED, this.snapshot());
  }
}

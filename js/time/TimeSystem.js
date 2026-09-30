import { GameEvents } from '../core/GameEvents.js';
import { smoothstep } from '../core/MathUtils.js';

/**
 * TimeSystem — reloj del mundo y ciclo día/noche (Fase 11). Sin Three.js.
 *
 * Solo CALCULA: la hora, el día, la dirección del sol, cuánta luz de día hay y
 * cuánto frío añade la noche. Quien lo aplica:
 *   - AtmosphereSystem: luz, cielo, niebla y estrellas.
 *   - TemperatureSystem: penalización nocturna (`nightFactor`).
 *   - CelestialSystem (Fase 12): posición de las lunas (`rotationAngle`, `skyDirection`).
 *
 * El sol sale a SUNRISE_HOUR y se pone a SUNSET_HOUR: de día recorre medio
 * círculo por encima del horizonte y de noche el otro medio por debajo, así el
 * día y la noche pueden durar distinto.
 *
 * Dormir (PLAYER_SLEPT { hours }) adelanta el reloj.
 */
export const DayPeriod = Object.freeze({ DAWN: 'DAWN', DAY: 'DAY', DUSK: 'DUSK', NIGHT: 'NIGHT' });

export class TimeSystem {
  constructor({ config, events }) {
    this.name = 'time';
    this._cfg = config;
    this._events = events;
    /** Horas de juego transcurridas desde el día 1 a las 00:00. */
    this.totalHours = config.START_HOUR;
    this.speed = 1;          // multiplicador (herramienta Admin)
    this.frozen = false;     // reloj detenido (herramienta Admin)
    this.paused = false;     // sin avanzar (pantalla de inicio, muerte)
    this._minute = -1;
    this._period = this.period;
    this._sun = { x: 0, y: 1, z: 0 };

    const tilt = (config.SUN_MAX_ELEVATION_DEG * Math.PI) / 180;
    const az = (config.SUN_AZIMUTH_DEG * Math.PI) / 180;
    this._sinTilt = Math.sin(tilt);
    this._cosTilt = Math.cos(tilt);
    this._sinAz = Math.sin(az);
    this._cosAz = Math.cos(az);

    events.on(GameEvents.PLAYER_SLEPT, ({ hours }) => this.advance(hours));
  }

  // ---- Consultas -----------------------------------------------------------

  get day() {
    return Math.floor(this.totalHours / 24) + 1;
  }

  /** Hora del día en [0, 24). */
  get hour() {
    return ((this.totalHours % 24) + 24) % 24;
  }

  /** "08:05" */
  get clockText() {
    const h = this.hour;
    const m = Math.floor((h % 1) * 60);
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /**
   * Ángulo del sol en su recorrido: 0 = sale, π/2 = mediodía, π = se pone,
   * 3π/2 = medianoche. De día y de noche avanza a ritmos distintos.
   */
  get sunAngle() {
    const c = this._cfg;
    const dayLen = c.SUNSET_HOUR - c.SUNRISE_HOUR;
    let h = this.hour;
    if (h >= c.SUNRISE_HOUR && h < c.SUNSET_HOUR) return (Math.PI * (h - c.SUNRISE_HOUR)) / dayLen;
    if (h < c.SUNRISE_HOUR) h += 24;
    return Math.PI + (Math.PI * (h - c.SUNSET_HOUR)) / (24 - dayLen);
  }

  /** Dirección HACIA el sol (unitaria). `out` puede ser un Vector3 o un objeto {x,y,z}. */
  getSunDirection(out = this._sun) {
    return this.skyDirection(this.sunAngle, 0, out);
  }

  /**
   * Rotación uniforme del planeta (rad): 0 al amanecer, una vuelta cada 24 h.
   * Las lunas la usan para salir y ponerse (Fase 12).
   */
  get rotationAngle() {
    return (Math.PI * 2 * (this.totalHours - this._cfg.SUNRISE_HOUR)) / 24;
  }

  /**
   * Dirección en el cielo de un astro con ángulo `angle` en un plano como el del
   * sol inclinado `extraTilt` rad más (lunas con órbita inclinada).
   * 0 = sale por el este, π/2 = culmina, π = se pone.
   */
  skyDirection(angle, extraTilt = 0, out = {}) {
    let sinT = this._sinTilt;
    let cosT = this._cosTilt;
    if (extraTilt) {
      const t = Math.min(1.45, Math.max(0.1, Math.asin(this._sinTilt) + extraTilt));
      sinT = Math.sin(t);
      cosT = Math.cos(t);
    }
    // En el plano del astro: sale por +X, culmina hacia +Z inclinado, se pone por −X.
    const px = Math.cos(angle);
    const py = Math.sin(angle) * sinT;
    const pz = Math.sin(angle) * cosT;
    out.x = px * this._cosAz + pz * this._sinAz;
    out.y = py;
    out.z = -px * this._sinAz + pz * this._cosAz;
    return out;
  }

  /** Altura del sol: componente vertical de su dirección (−1..1). */
  get sunHeight() {
    return Math.sin(this.sunAngle) * this._sinTilt;
  }

  /** 0 = noche cerrada, 1 = pleno día. Suave alrededor del amanecer/atardecer. */
  get daylight() {
    return smoothstep(-0.12, 0.3, this.sunHeight);
  }

  /** 0 = de día, 1 = plena noche (lo usa la temperatura; cambia gradualmente). */
  get nightFactor() {
    return 1 - smoothstep(-0.2, 0.15, this.sunHeight);
  }

  get isNight() {
    return this.sunHeight < 0;
  }

  get period() {
    const c = this._cfg;
    const h = this.hour;
    if (h >= c.SUNRISE_HOUR - 1 && h < c.SUNRISE_HOUR + 1) return DayPeriod.DAWN;
    if (h >= c.SUNRISE_HOUR + 1 && h < c.SUNSET_HOUR - 1) return DayPeriod.DAY;
    if (h >= c.SUNSET_HOUR - 1 && h < c.SUNSET_HOUR + 1) return DayPeriod.DUSK;
    return DayPeriod.NIGHT;
  }

  /** °C que la noche resta a la temperatura ambiente. */
  get nightTemperatureDrop() {
    return this._cfg.NIGHT_TEMPERATURE_DROP * this.nightFactor;
  }

  // ---- Cambios -------------------------------------------------------------

  /** Adelanta el reloj (dormir, Admin). */
  advance(hours) {
    if (!(hours > 0)) return;
    this.totalHours += hours;
    this._emit(true);
  }

  /** Pone el reloj a una hora del día actual (o del día indicado). */
  setTime(hour, day = this.day) {
    const h = ((hour % 24) + 24) % 24;
    this.totalHours = (Math.max(1, Math.floor(day)) - 1) * 24 + h;
    this._emit(true);
  }

  /** Vuelve al inicio (al regenerar el mundo). */
  reset() {
    this.totalHours = this._cfg.START_HOUR;
    this._period = this.period;
    this._emit(true);
  }

  update(dt) {
    if (!this.paused && !this.frozen && dt > 0) {
      this.totalHours += (dt * this.speed * 24) / (this._cfg.DAY_LENGTH_MINUTES * 60);
    }
    this._emit(false);
  }

  /** Estado actual (lo usan UI y Admin). */
  getState() {
    const hour = this.hour;
    return {
      day: this.day,
      hour,
      minute: Math.floor((hour % 1) * 60),
      clock: this.clockText,
      totalHours: this.totalHours,
      daylight: this.daylight,
      isNight: this.isNight,
      period: this.period,
    };
  }

  _emit(force) {
    const minute = Math.floor(this.totalHours * 60);
    if (!force && minute === this._minute) return;
    this._minute = minute;
    this._events.emit(GameEvents.TIME_CHANGED, this.getState());
    const period = this.period;
    if (period !== this._period) {
      const previous = this._period;
      this._period = period;
      this._events.emit(GameEvents.TIME_PERIOD_CHANGED, { period, previous, jumped: force });
    }
  }
}

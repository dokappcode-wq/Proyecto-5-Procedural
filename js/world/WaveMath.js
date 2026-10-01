/**
 * Cálculos puros de la ola gigante (sin Three.js, para poder probarlos en Node).
 * W = perfil WAVE del cuerpo: { PERIOD_HOURS, HOUR, HEIGHT, SPEED, WARNING_HOURS, ANGLE }.
 */
export const WAVE_MARGIN = 300; // m antes y después de la región: la ola entra y sale por fuera

/** Forma de la ola (0..1): frente empinado (u > 0), espalda larga (u < 0). */
export function waveProfile(u, height) {
  const w = height * (u > 0 ? 1.4 : 3.2);
  return Math.exp(-((u / w) ** 2));
}

/**
 * Estado de la ola a una hora de juego `hours` en una región de lado `size` m.
 * `hoursPerSecond`: horas de juego por segundo real (la ola avanza a SPEED m/s reales).
 * → { active, crest, untilHours, cycle, dir }
 */
export function waveState(W, hours, size, hoursPerSecond) {
  const L = size + 2 * WAVE_MARGIN;
  const crossHours = (L / W.SPEED) * hoursPerSecond;
  const t = hours - W.HOUR;
  const P = W.PERIOD_HOURS;
  const phase = ((t % P) + P) % P;
  const active = phase < crossHours;
  return {
    active,
    crest: -L / 2 + (phase / crossHours) * L,
    untilHours: active ? 0 : P - phase,
    cycle: Math.floor(t / P),
    phase,
    dir: { x: Math.cos(W.ANGLE), z: Math.sin(W.ANGLE) },
  };
}

/** Cuánto sube el agua en (x, z) con la ola en ese estado. */
export function waveHeightAt(W, state, x, z) {
  if (!state.active) return 0;
  const u = x * state.dir.x + z * state.dir.z - state.crest;
  return W.HEIGHT * waveProfile(u, W.HEIGHT);
}

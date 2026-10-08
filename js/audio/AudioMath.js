/**
 * AudioMath — las partes del sonido que no necesitan WebAudio (se prueban en Node):
 * volúmenes guardados, superficie de los pasos, sonido posicional y música según el sitio.
 */

export const VOLUME_KEYS = ['master', 'sfx', 'ambient', 'music'];
export const DEFAULT_VOLUMES = Object.freeze({ master: 0.8, sfx: 1, ambient: 0.75, music: 0.5, muted: false });
const MAX_STORED = 512; // caracteres: lo guardado es un objeto pequeño

/**
 * Lee los volúmenes guardados. Solo JSON pequeño, solo claves conocidas, números 0…1;
 * cualquier otra cosa se ignora y se usan los valores por defecto.
 */
export function parseVolumes(text) {
  const out = { ...DEFAULT_VOLUMES };
  if (typeof text !== 'string' || text.length > MAX_STORED) return out;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return out;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const k of VOLUME_KEYS) {
    const v = data[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(1, Math.max(0, v));
  }
  if (typeof data.muted === 'boolean') out.muted = data.muted;
  return out;
}

/** Superficie de los pasos según el bioma (también los de sistemas importados, por el nombre). */
export function biomeSurface(id = '') {
  const s = String(id).toUpperCase();
  if (/SNOW|ICE|FROZEN|GLACI|TUNDRA/.test(s)) return 'snow';
  if (/SAND|BEACH|DESERT|DUNE/.test(s)) return 'sand';
  if (/MOUNTAIN|ROCK|STONE|CRATER|CLIFF|BASALT|LAVA|REGOLITH/.test(s)) return 'stone';
  return 'grass';
}

/** Superficie bajo los pies: agua, nave (metal), construcción, cueva (piedra) o la del bioma. */
export function surfaceFor({ swimming = false, aboard = false, structure = null, inCave = false, biome = '' } = {}) {
  if (swimming) return 'water';
  if (aboard) return 'metal';
  if (structure) return structure;
  if (inCave) return 'stone';
  return biomeSurface(biome);
}

/** Distancia (m) entre dos pasos. */
export function strideLength({ running = false, crouching = false, swimming = false } = {}) {
  if (swimming) return 1.7;
  if (running) return 1.15;
  if (crouching) return 0.6;
  return 0.8;
}

/**
 * Sonido posicional sencillo: panorama (−1 izquierda … 1 derecha) y volumen de un sonido
 * que está a (dx, dz) del oyente, que mira hacia (fx, fz). El volumen cae con la distancia
 * (la mitad a `ref` m) y llega a 0 en `max` m.
 */
export function spatialize(dx, dz, fx, fz, { ref = 7, max = 60 } = {}) {
  const d = Math.hypot(dx, dz);
  if (!(d < max)) return { pan: 0, gain: 0, d };
  const fl = Math.hypot(fx, fz) || 1;
  const rx = -fz / fl; // vector "derecha" de la mirada
  const rz = fx / fl;
  const side = d > 0.01 ? (dx * rx + dz * rz) / d : 0;
  const pan = Math.max(-1, Math.min(1, side)) * Math.min(1, d / 2) * 0.85; // muy cerca: centrado
  const gain = (1 / (1 + (d / ref) ** 2)) * (1 - (d / max) ** 2);
  return { pan, gain, d };
}

/** Qué música toca según dónde está el jugador. */
export function chooseMood({ title = false, space = false, boss = false, cave = false, night = false } = {}) {
  if (boss) return 'BOSS';
  if (space || title) return 'SPACE';
  if (cave) return 'CAVE';
  return night ? 'NIGHT' : 'DAY';
}

/** Nota MIDI → frecuencia (Hz). */
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

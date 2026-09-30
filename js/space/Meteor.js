import { SeededRandom } from '../core/SeededRandom.js';

/**
 * Meteor — forma procedural de un meteorito (sin Three.js).
 *
 * Una esfera deformada: radio base R y "bultos" y cráteres gaussianos sobre la
 * esfera. `surfaceRadius(dir)` da la distancia del centro a la superficie en la
 * dirección unitaria `dir`; el EVA la usa para caminar alrededor y el modelo 3D
 * para deformar una icosfera. Tiene cúmulos de cristales (mineral) que se pican.
 *
 * Posición en km (sistema de MUNDO 0), tamaños en metros.
 */
export function createMeteor({ id, seed, position, radiusRange = [26, 48], crystals = [5, 8], yields = 3 }) {
  const rng = new SeededRandom(seed);
  const radius = rng.range(radiusRange[0], radiusRange[1]);
  const randomDir = () => {
    const z = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    return { x: r * Math.cos(a), y: z, z: r * Math.sin(a) };
  };
  const features = [];
  const nBumps = rng.int(5, 9);
  for (let i = 0; i < nBumps; i++) features.push({ dir: randomDir(), amp: rng.range(0.08, 0.22), sharp: rng.range(3, 9) });
  const nCraters = rng.int(3, 6);
  for (let i = 0; i < nCraters; i++) features.push({ dir: randomDir(), amp: -rng.range(0.06, 0.14), sharp: rng.range(14, 30) });
  const stretch = { x: rng.range(0.85, 1.15), y: rng.range(0.8, 1.05), z: rng.range(0.9, 1.2) };

  function surfaceRadius(d) {
    let k = 1;
    for (const f of features) {
      const dot = d.x * f.dir.x + d.y * f.dir.y + d.z * f.dir.z;
      k += f.amp * Math.exp(-(1 - dot) * f.sharp);
    }
    // Alargamiento suave (no es una esfera perfecta).
    const s = Math.hypot(d.x / stretch.x, d.y / stretch.y, d.z / stretch.z);
    return (radius * k) / s;
  }

  const count = rng.int(crystals[0], crystals[1]);
  const deposits = [];
  for (let i = 0; i < count; i++) deposits.push({ index: i, dir: randomDir(), left: yields, scale: rng.range(0.8, 1.4) });

  return { id, seed, position: { ...position }, radius, surfaceRadius, deposits, stretch };
}

/** Normaliza (x, y, z); devuelve también la longitud. */
export function normalize(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l, length: l };
}

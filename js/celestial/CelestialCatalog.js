import { SeededRandom } from '../core/SeededRandom.js';

/**
 * CelestialCatalog — cuerpos celestes de un planeta a partir de su seed. Sin Three.js.
 *
 * Tamaño, distancia y velocidad de cada luna vienen de GameConfig.CELESTIAL
 * (MOON_A_SIZE, MOON_A_DISTANCE, MOON_A_SPEED...); la posición inicial en la
 * órbita, la inclinación y un matiz de color dependen de la sub-seed "celestial".
 *
 * La posición de una luna es una órbita circular inclinada (sin física):
 *     ángulo = fase inicial + 2π · velocidad · horas de juego
 *
 * Hoy lo usa el mapa planetario de la nave; en la Fase 12 CelestialSystem
 * dibujará estas mismas lunas en el cielo, y la Fase 13 las mostrará desde el
 * espacio. Añadir lunas/planetas = añadir entradas a `bodies`.
 */
export function createCelestialCatalog(config, celestialSeed) {
  const rng = new SeededRandom(celestialSeed);
  const maxInc = (config.MAX_INCLINATION_DEG * Math.PI) / 180;
  const moon = (id, name, prefix) => ({
    id,
    name,
    kind: 'MOON',
    radiusKm: config[`${prefix}_SIZE`],
    distanceKm: config[`${prefix}_DISTANCE`],
    speed: config[`${prefix}_SPEED`],                 // vueltas por hora de juego
    periodHours: 1 / config[`${prefix}_SPEED`],
    color: tint(config[`${prefix}_COLOR`], rng.range(-0.06, 0.06)),
    phase: rng.range(0, Math.PI * 2),                  // posición inicial (seed)
    inclination: rng.range(-maxInc, maxInc),           // inclinación de la órbita (seed)
    node: rng.range(0, Math.PI * 2),                   // orientación de la órbita (seed)
    craterSeed: Math.floor(rng.next() * 0xffffffff),   // aspecto de la superficie (seed)
    visitable: false,                                  // falta el "nodo espacial"
  });
  return {
    planet: { id: 'MUNDO_0', name: config.PLANET_NAME, radiusKm: config.PLANET_RADIUS_KM },
    bodies: [moon('MOON_A', 'Luna A', 'MOON_A'), moon('MOON_B', 'Luna B', 'MOON_B')],
  };
}

/** Ángulo orbital de un cuerpo tras `totalHours` horas de juego. */
export function orbitAngle(body, totalHours) {
  return body.phase + Math.PI * 2 * body.speed * totalHours;
}

/**
 * Posición del cuerpo en km respecto al planeta (x, y, z), con la órbita
 * inclinada `inclination` sobre el ecuador y girada `node`.
 */
export function orbitPosition(body, totalHours, out = { x: 0, y: 0, z: 0 }) {
  const a = orbitAngle(body, totalHours);
  const r = body.distanceKm;
  const x0 = Math.cos(a) * r;
  const z0 = Math.sin(a) * r;
  const y = z0 * Math.sin(body.inclination);
  const zi = z0 * Math.cos(body.inclination);
  out.x = x0 * Math.cos(body.node) - zi * Math.sin(body.node);
  out.z = x0 * Math.sin(body.node) + zi * Math.cos(body.node);
  out.y = y;
  return out;
}

function tint(hex, amount) {
  const ch = (shift) => Math.max(0, Math.min(255, Math.round(((hex >> shift) & 255) * (1 + amount))));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

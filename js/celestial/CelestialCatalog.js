import { SeededRandom } from '../core/SeededRandom.js';

/**
 * CelestialCatalog — cuerpos celestes del planeta de inicio a partir de su seed. Sin Three.js.
 *
 * Tamaño, distancia, velocidad, color y tamaño en el cielo de cada luna vienen
 * del sistema solar (SolarSystem: system.moons); la posición inicial en la
 * órbita, la inclinación y un matiz de color dependen de la sub-seed "celestial".
 *
 * La posición de una luna es una órbita circular inclinada (sin física):
 *     ángulo = fase inicial + 2π · velocidad · horas de juego
 *
 * Lo usan el mapa planetario de la nave, CelestialSystem (las lunas en el cielo),
 * SpaceView/SpaceScene (las mismas lunas vistas desde el espacio) y la IA.
 */
export function createCelestialCatalog(config, celestialSeed, system) {
  const rng = new SeededRandom(celestialSeed);
  const maxInc = (config.MAX_INCLINATION_DEG * Math.PI) / 180;
  const moon = (m, index) => ({
    id: m.id,
    name: m.name,
    kind: 'MOON',
    index,
    radiusKm: m.radiusKm,
    distanceKm: m.orbit.distanceKm,
    speed: m.orbit.speed,                              // vueltas por hora de juego
    periodHours: m.orbit.periodHours,
    skySizeDeg: m.skySizeDeg,
    color: tint(m.color, rng.range(-0.06, 0.06)),
    phase: rng.range(0, Math.PI * 2),                  // posición inicial (seed)
    inclination: rng.range(-maxInc, maxInc),           // inclinación de la órbita (seed)
    node: rng.range(0, Math.PI * 2),                   // orientación de la órbita (seed)
    craterSeed: Math.floor(rng.next() * 0xffffffff),   // aspecto de la superficie (seed)
    visitable: false,                                  // falta el "nodo espacial"
  });
  const home = system.home;
  return {
    planet: { id: home.id, name: home.name, radiusKm: home.radiusKm },
    bodies: system.moons.map(moon),
  };
}

/**
 * Ángulo del cuerpo en el cielo del planeta (como `TimeSystem.sunAngle`: 0 sale,
 * π/2 culmina, π se pone): la rotación del planeta menos lo que ha avanzado en su
 * órbita. Por eso cada día sale un poco más tarde.
 */
export function skyAngle(body, rotationAngle, totalHours) {
  return rotationAngle - orbitAngle(body, totalHours);
}

/** Fracción iluminada (0 = nueva, 1 = llena) según el ángulo con el sol visto desde el planeta. */
export function illumination(moonDir, sunDir) {
  const d = moonDir.x * sunDir.x + moonDir.y * sunDir.y + moonDir.z * sunDir.z;
  return (1 - d) / 2;
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

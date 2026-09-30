import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { createCelestialCatalog, orbitPosition } from './CelestialCatalog.js';

/**
 * SystemLayout — dónde está cada cuerpo del sistema solar (km). Sin Three.js.
 *
 * El origen es el planeta de inicio (así la navegación, los meteoritos y todo lo
 * que ya funcionaba alrededor de él no cambia). La estrella está en la dirección
 * del sol del espacio (`sunDirection`), a la distancia orbital del planeta de
 * inicio. Los demás planetas giran alrededor de la estrella en su órbita (fase
 * inicial según la seed) y cada luna alrededor de su planeta (CelestialCatalog).
 *
 * Las distancias están comprimidas (ORBIT_UNITS): un viaje entre planetas se
 * hace en segundos con el crucero interplanetario.
 */
export function createSystemLayout(config, celestialSeed, system, sunDirection) {
  const l = Math.hypot(sunDirection.x, sunDirection.y, sunDirection.z) || 1;
  const sun = { x: sunDirection.x / l, y: sunDirection.y / l, z: sunDirection.z / l };
  const homeDist = system.home.orbit.distanceKm;
  const starPos = { x: sun.x * homeDist, y: sun.y * homeDist, z: sun.z * homeDist };
  // Base del plano orbital: "fuera" (de la estrella hacia el planeta de inicio) y un eje perpendicular horizontal.
  const out = { x: -sun.x, y: 0, z: -sun.z };
  const ol = Math.hypot(out.x, out.z) || 1;
  out.x /= ol;
  out.z /= ol;
  const side = { x: -out.z, y: 0, z: out.x };

  const planets = system.planets.map((p) => {
    const home = p.id === system.homeId;
    const rng = new SeededRandom(deriveSeed(celestialSeed, `orbit:${p.id}`));
    return {
      id: p.id,
      name: p.name,
      radiusKm: p.radiusKm,
      distanceKm: p.orbit.distanceKm,
      speed: 1 / p.orbit.periodHours,
      phase: home ? 0 : rng.range(0.4, Math.PI * 2 - 0.4), // nunca encima del planeta de inicio
      tilt: home ? 0 : rng.range(-0.06, 0.06),
      home,
      catalog: createCelestialCatalog(config, celestialSeed, system, p.id),
    };
  });
  return {
    star: { id: 'STAR', name: system.star.name, kind: 'STAR', radiusKm: system.star.radiusKm, color: system.star.color, position: starPos },
    planets,
    sun,
    // Radio de la zona del sistema (desde la estrella): más allá hace falta un nodo galáctico.
    zoneRadiusKm: Math.max(...planets.map((p) => p.distanceKm + Math.max(config.ZONE_MARGIN_KM ?? 65000,
      Math.max(0, ...p.catalog.bodies.map((m) => m.distanceKm + m.radiusKm)) + 20000))),
    _base: { out, side },
  };
}

/** Posición (km) de un planeta tras `totalHours` horas. El de inicio no se mueve (es el origen). */
export function planetPosition(layout, planet, totalHours, target = { x: 0, y: 0, z: 0 }) {
  if (planet.home) {
    target.x = target.y = target.z = 0;
    return target;
  }
  const a = planet.phase + Math.PI * 2 * planet.speed * totalHours;
  const { out, side } = layout._base;
  const r = planet.distanceKm;
  const c = Math.cos(a) * r;
  const s = Math.sin(a) * r;
  const sh = s * Math.cos(planet.tilt); // órbita un poco inclinada
  const S = layout.star.position;
  target.x = S.x + out.x * c + side.x * sh;
  target.y = S.y + s * Math.sin(planet.tilt);
  target.z = S.z + out.z * c + side.z * sh;
  return target;
}

/**
 * Todos los cuerpos ahora: [{ id, name, kind, parent, radiusKm, position, landable }].
 * La estrella va primero (no se aterriza en ella).
 */
export function bodyPositions(layout, totalHours) {
  const out = [{ ...layout.star, parent: null, landable: false, position: { ...layout.star.position } }];
  for (const p of layout.planets) {
    const pos = planetPosition(layout, p, totalHours, {});
    out.push({ id: p.id, name: p.name, kind: 'PLANET', parent: null, radiusKm: p.radiusKm, position: pos, landable: true });
    for (const m of p.catalog.bodies) {
      const o = orbitPosition(m, totalHours, {});
      out.push({
        id: m.id, name: m.name, kind: 'MOON', parent: p.id, radiusKm: m.radiusKm, landable: true,
        position: { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z },
      });
    }
  }
  return out;
}

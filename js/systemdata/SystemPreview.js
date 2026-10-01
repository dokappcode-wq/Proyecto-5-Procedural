/**
 * SystemPreview — resumen legible de un sistema ya validado (para la vista previa
 * del panel de importación). Solo devuelve datos: el panel los pinta como texto.
 */
import { BODY_DEFAULTS, SIZE_CATEGORIES, STAR_TYPES, TERRAIN_GENERATORS } from './Catalog.js';

/** @param {object} result resultado de loadSystem con ok = true */
export function previewSystem(result) {
  const data = result.data;
  const bodies = result.system.bodies;
  const byId = new Map(bodies.map((b) => [b.id, b]));
  const describe = (b, d, kind) => {
    const D = BODY_DEFAULTS[kind];
    const gen = d?.terrain?.generator ?? D.generator;
    const P = b.profile;
    return {
      name: b.name,
      kind,
      size: SIZE_CATEGORIES[b.size]?.label ?? b.size,
      regionKm: b.regionKm,
      generator: TERRAIN_GENERATORS[gen]?.label ?? gen,
      breathable: P.BREATHABLE !== false,
      sea: P.HAS_SEA !== false,
      gravity: P.GRAVITY_SCALE ?? 1,
      wave: P.WAVE ? { everyHours: P.WAVE.PERIOD_HOURS, heightM: P.WAVE.HEIGHT } : null,
    };
  };
  const planets = bodies.filter((b) => b.kind === 'PLANET').map((p, i) => {
    const d = data.planets[i];
    return {
      ...describe(p, d, 'PLANET'),
      moons: bodies.filter((m) => m.parent === p.id).map((m, j) => describe(byId.get(m.id), d?.moons?.[j], 'MOON')),
    };
  });
  return {
    name: result.system.name,
    description: data.description ?? '',
    author: data.author ?? '',
    star: { name: result.system.star.name, type: STAR_TYPES[result.system.star.type]?.label ?? result.system.star.type },
    planets,
    moons: planets.reduce((n, p) => n + p.moons.length, 0),
    warnings: result.warnings.map((w) => `${w.path || '(archivo)'}: ${w.message}`),
    unsupported: [...(result.unsupported ?? [])],
  };
}

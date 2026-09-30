import { SeededRandom, deriveSeed, hashString } from '../core/SeededRandom.js';
import {
  BIOME_SLOTS, BODY_DEFAULTS, BARREN_FLORA, DEFAULT_LIFE, FAUNA_TEMPLATES, FLORA_TEMPLATES, LIMITS,
  ORBIT_UNITS, SIZE_CATEGORIES, STAR_TYPES, TERRAIN_GENERATORS, WATER_DEFAULTS,
} from './Catalog.js';

/**
 * SystemCompiler — convierte un sistema solar YA VALIDADO (Validator.js) en lo
 * que usa el motor, de forma determinista:
 *
 *   {
 *     name, description, author, seed, star, meteors, unsupported,
 *     homeId,                        // cuerpo donde se empieza (el primer planeta)
 *     bodies: [{ id, kind, parent, index, name, size, regionKm, radiusKm, color,
 *                orbit, skySizeDeg, profile }],
 *     notes: [{ path, message }],    // avisos de compilación (lo que aún no se aplica…)
 *   }
 *
 * `profile` tiene la forma interna de un perfil de planeta (TERRAIN, COLORS,
 * BIOMES, WATER, RESOURCES, FAUNA…), la que consumen WorldGenerator y compañía.
 * Todo lo que falta en el archivo toma el valor por defecto del catálogo.
 */
export function compileSystem(data, { seed } = {}) {
  const notes = [];
  const systemSeed = (seed ?? data.seed ?? hashString(`system:${data.name}`)) >>> 0;
  const starType = data.star?.type ?? 'yellow_dwarf';
  const bodies = [];

  data.planets.forEach((p, i) => {
    const id = `P${i + 1}`;
    const path = `planets[${i}]`;
    const moons = p.moons ?? [];
    const planet = compileBody(p, 'PLANET', { id, path, systemSeed, notes, moonNames: moons.map((m) => m.name) });
    planet.parent = null;
    planet.index = i;
    planet.orbit = { distance: p.orbit?.distance ?? i + 1, periodHours: p.orbit?.period_hours ?? 24 * 365 };
    bodies.push(planet);
    moons.forEach((m, j) => {
      const mid = `${id}M${j + 1}`;
      const moon = compileBody(m, 'MOON', { id: mid, path: `${path}.moons[${j}]`, systemSeed, notes });
      moon.parent = id;
      moon.index = j;
      const distanceKm = (m.orbit?.distance ?? 15 + 12 * j) * ORBIT_UNITS.MOON_KM;
      const periodHours = m.orbit?.period_hours ?? Math.max(2, Math.round(0.35 * (distanceKm / 1000) ** 1.5));
      const speed = 1 / periodHours; // vueltas por hora de juego
      moon.orbit = { distanceKm, speed, periodHours: 1 / speed };
      moon.skySizeDeg = m.sky_size_deg ?? clamp(((2 * Math.atan(moon.radiusKm / distanceKm)) * 180 / Math.PI) * 4, 1.5, 10);
      bodies.push(moon);
    });
  });
  if (data.planets.length > 1) {
    notes.push({ path: 'planets', message: `Por ahora solo se visitan el primer planeta y sus lunas; los otros ${data.planets.length - 1} llegarán con el viaje entre planetas.` });
  }

  return {
    name: data.name,
    description: data.description ?? '',
    author: data.author ?? '',
    seed: systemSeed,
    star: { name: data.star?.name ?? 'Estrella', type: starType, color: STAR_TYPES[starType].color },
    meteors: { frequency: data.meteors?.frequency ?? 0.5, richness: data.meteors?.richness ?? 0.5 },
    unsupported: [...(data.unsupported_requests ?? [])],
    homeId: 'P1',
    bodies,
    notes,
  };
}

function compileBody(b, kind, ctx) {
  const D = BODY_DEFAULTS[kind];
  const { path, notes } = ctx;
  const size = b.size ?? D.size;
  if (size !== 'small') {
    notes.push({ path: `${path}.size`, message: `Por ahora todas las regiones miden 1 km: el tamaño "${size}" (${SIZE_CATEGORIES[size].regionKm} km) se aplicará en la siguiente fase.` });
  }
  const breathable = b.physics?.breathable ?? D.breathable;
  const gravity = b.physics?.gravity ?? D.gravity;
  const hasSea = b.water?.sea ?? D.sea;
  const generatorId = b.terrain?.generator ?? D.generator;
  const gen = TERRAIN_GENERATORS[generatorId];
  const look = gen.look;
  const livingDefaults = kind === 'PLANET' && breathable;

  // Relieve.
  const params = {};
  for (const [k, def] of Object.entries(gen.params)) params[k] = b.terrain?.params?.[k] ?? def.default;
  const TERRAIN = gen.build(params);
  TERRAIN.SEA_FLOOR = hasSea ? -9 : 2; // sin mar, el borde baja a una depresión seca

  // Colores: paleta (propia, a partir del color o la de luna por defecto) o los del Edén.
  let palette = null;
  if (b.palette) palette = paletteFrom(b.palette, b.color ?? b.palette.light ?? '#bdb9b1');
  else if (kind === 'MOON' && b.color) palette = paletteFromColor(hex(b.color));
  else if (kind === 'MOON') palette = tintPalette(D.palette, new SeededRandom(deriveSeed(ctx.systemSeed, ctx.id)).range(-0.08, 0.08));
  const base = palette ? paletteColors(palette) : BODY_DEFAULTS.PLANET.colors;
  const surface = { ...base.surface, ...mapHex(b.surface_colors) };

  // Biomas.
  const baseTemp = b.climate?.temperature_c ?? b.biomes?.low?.temperature_c ?? D.temperature;
  const BIOMES = {};
  const grass = {};
  for (const [slot, { slot: id }] of Object.entries(BIOME_SLOTS)) {
    const j = b.biomes?.[slot] ?? {};
    const [hill, detail] = look.SCALES[slot];
    const def = {
      NAME: j.name ?? look.BIOME_NAMES[slot],
      TEMPERATURE: j.temperature_c ?? baseTemp + look.TEMPERATURE_OFFSETS[slot],
      HILL_SCALE: j.relief ?? hill,
      DETAIL_SCALE: j.roughness ?? detail,
    };
    if (slot === 'high') {
      def.SNOW_START_HEIGHT = j.snow_height ?? look.SNOW.SNOW_START_HEIGHT;
      def.SNOW_MIN_NORMAL_Y = look.SNOW.SNOW_MIN_NORMAL_Y;
    }
    const c = { ...base[slot], ...mapHex(j.colors) };
    def.COLORS = slot === 'high'
      ? { GROUND: c.ground, GROUND_ALT: c.ground_alt, SNOW: c.snow, ICE: c.ice }
      : { GROUND: c.ground, GROUND_ALT: c.ground_alt, ACCENT: c.accent };
    BIOMES[id] = def;
    grass[id] = j.grass ?? (livingDefaults ? DEFAULT_LIFE.grass[slot] : 0);
  }

  // Flora y rocas.
  const floraList = b.flora ?? (livingDefaults ? DEFAULT_LIFE.flora : BARREN_FLORA);
  const DENSITY = { PLAINS: {}, FOREST: {}, FROZEN_MOUNTAINS: {} };
  floraList.forEach((f, i) => {
    const slot = BIOME_SLOTS[f.biome].slot;
    const res = FLORA_TEMPLATES[f.template].resource;
    if (DENSITY[slot][res] !== undefined) notes.push({ path: `${path}.flora[${i}]`, message: `"${f.template}" ya estaba en la zona "${f.biome}": vale la última densidad.` });
    DENSITY[slot][res] = f.density;
  });
  const hasWood = floraList.some((f) => FLORA_TEMPLATES[f.template].wood && f.density > 0);

  // Fauna.
  const faunaList = b.fauna ?? (livingDefaults ? DEFAULT_LIFE.fauna : []);
  const HERDS = {};
  let herdTotal = 0;
  faunaList.forEach((f, i) => {
    const sp = FAUNA_TEMPLATES[f.template].species;
    let herds = f.herds;
    if (HERDS[sp] !== undefined) {
      notes.push({ path: `${path}.fauna[${i}]`, message: `"${f.template}" está repetido: vale el último.` });
      herdTotal -= HERDS[sp];
    }
    if (herdTotal + herds > LIMITS.HERDS_PER_BODY) {
      herds = Math.max(0, LIMITS.HERDS_PER_BODY - herdTotal);
      notes.push({ path: `${path}.fauna[${i}].herds`, message: `Demasiados rebaños (máximo ${LIMITS.HERDS_PER_BODY} por cuerpo): se reducen a ${herds}.` });
    }
    HERDS[sp] = herds;
    herdTotal += herds;
  });
  const hasWool = faunaList.some((f) => FAUNA_TEMPLATES[f.template].wool && HERDS[FAUNA_TEMPLATES[f.template].species] > 0);

  // Agua.
  const ponds = b.water?.ponds ?? (livingDefaults ? WATER_DEFAULTS.PONDS_BREATHABLE : 0);
  const mud = palette ? palette.dark : WATER_DEFAULTS.MUD_COLOR;
  const WATER = {
    DISCOVERY_DISTANCE: 7, POND_COUNT: ponds, RADIUS: [5, 10], DEPTH: ponds > 0 ? WATER_DEFAULTS.POND_DEPTH : 1,
    SHORE_WIDTH: 0.6, MIN_SPACING: 70, MAX_SLOPE: 0.18, BIOMES: ponds > 0 ? ['PLAINS', 'FOREST'] : [],
    NEAR_SPAWN_DISTANCE: [25, 55],
    COLOR: ponds > 0 ? hex(b.water?.pond_color) ?? WATER_DEFAULTS.POND_COLOR : 0x000000,
    OPACITY: ponds > 0 ? WATER_DEFAULTS.POND_OPACITY : 0,
    MUD_COLOR: mud,
  };

  const profile = {
    NAME: b.name,
    DATA: null,
    KIND: kind,
    HAS_SEA: hasSea,
    BREATHABLE: breathable,
    GRAVITY_SCALE: gravity,
  };
  if (!hasWood || !hasWool) {
    profile.BUILD_SUBSTITUTE = {};
    if (!hasWood) profile.BUILD_SUBSTITUTE.WOOD = 'STONE';
    if (!hasWool) profile.BUILD_SUBSTITUTE.WOOL = 'MINERAL';
  }
  Object.assign(profile, {
    TERRAIN,
    COLORS: {
      SAND: surface.sand, SEABED: surface.seabed, LOWLAND_ROCK: surface.rock,
      SAND_HEIGHT: hasSea ? WATER_DEFAULTS.SAND_HEIGHT : -10,
      ...look.COLORS,
      SEA: hasSea ? hex(b.water?.sea_color) ?? WATER_DEFAULTS.SEA_COLOR : 0x000000,
      SEA_OPACITY: hasSea ? WATER_DEFAULTS.SEA_OPACITY : 0,
    },
    BIOME_DISTRIBUTION: { ...look.BIOME_DISTRIBUTION },
    BIOMES,
    WATER,
    RESOURCES: {
      CELL_SIZE: 4, SPAWN_CLEAR_RADIUS: 8, MAX_SLOPE: look.RESOURCES.MAX_SLOPE,
      TREE_MAX_HEIGHT: hasWood ? BIOMES.FROZEN_MOUNTAINS.SNOW_START_HEIGHT + 14 : look.RESOURCES.TREE_MAX_HEIGHT,
      DENSITY,
      GRASS_TUFTS_PER_CHUNK: grass,
    },
    FAUNA: { HERDS, HERD_RADIUS: 24, NEAR_SPAWN_DISTANCE: [35, 120] },
  });
  if (palette) profile.PROP_COLORS = { ROCK: palette.mid };
  profile.DATA = describe(b, kind, { breathable, gravity, baseTemp, floraList, herdTotal, moonNames: ctx.moonNames, regionKm: SIZE_CATEGORIES[size].regionKm, gen });

  return {
    id: ctx.id,
    kind,
    name: b.name,
    description: b.description ?? '',
    size,
    regionKm: SIZE_CATEGORIES[size].regionKm,
    radiusKm: b.radius_km ?? SIZE_CATEGORIES[size].radiusKm,
    color: hex(b.color) ?? (palette ? palette.light : 0x6f9fd0),
    profile,
  };
}

/** Lo que cuenta la IA de la nave: los textos del archivo o unos generados. */
function describe(b, kind, s) {
  const lore = b.lore ?? {};
  const g = s.gravity.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const living = s.floraList.filter((f) => f.density > 0 && !['rock', 'mineral_rock'].includes(f.template));
  const plantKinds = new Set(living.map((f) => f.template)).size;
  const data = {
    LIFE: lore.life ?? (plantKinds || s.herdTotal
      ? `Hay vida: ${plantKinds} tipos de plantas y ${s.herdTotal} rebaños de animales.`
      : 'Sin vida conocida.'),
    ATMOSPHERE: lore.atmosphere ?? (s.breathable
      ? `Atmósfera respirable. Gravedad ${g} g.`
      : `Sin aire respirable: hace falta traje espacial u oxígeno. Gravedad ${g} g.`),
    SURFACE: lore.surface ?? `${b.description ? `${b.description} ` : ''}${s.gen.label}: región explorable de ${s.regionKm.toLocaleString('es-ES')} km, unos ${Math.round(s.baseTemp)} °C.`,
  };
  if (kind === 'PLANET') {
    const n = s.moonNames.length;
    data.MOONS = lore.moons ?? (n ? `Tiene ${n} ${n === 1 ? 'luna' : 'lunas'}: ${listNames(s.moonNames)}.` : 'No tiene lunas.');
  }
  return data;
}

// ---- Colores ----------------------------------------------------------------

function hex(v) {
  return typeof v === 'string' ? parseInt(v.slice(1), 16) : typeof v === 'number' ? v : undefined;
}

function mapHex(o) {
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, hex(v)]));
}

/** Paleta a partir de un solo color (tono claro). */
function paletteFromColor(c) {
  return { light: c, mid: scale(c, 0.87), dark: scale(c, 0.66), highlight: lighten(c, 0.12) };
}

function paletteFrom(p, fallback) {
  const auto = paletteFromColor(hex(p.light ?? fallback));
  return {
    light: hex(p.light) ?? auto.light, mid: hex(p.mid) ?? auto.mid,
    dark: hex(p.dark) ?? auto.dark, highlight: hex(p.highlight) ?? auto.highlight,
  };
}

/** Matiz cálido (+) o frío (−) sobre toda la paleta. */
function tintPalette(p, a) {
  const t = (c) => rgb(ch(c, 16) * (1 + a), ch(c, 8), ch(c, 0) * (1 - a));
  return { light: t(p.light), mid: t(p.mid), dark: t(p.dark), highlight: t(p.highlight) };
}

/** Colores de suelo de las tres zonas a partir de una paleta (así se ven las lunas). */
function paletteColors({ light, mid, dark, highlight }) {
  return {
    surface: { sand: mid, seabed: dark, rock: dark },
    low: { ground: light, ground_alt: mid, accent: highlight },
    mid: { ground: mid, ground_alt: dark, accent: light },
    high: { ground: dark, ground_alt: mid, snow: highlight, ice: light },
  };
}

const ch = (c, s) => (c >> s) & 255;
const rgb = (r, g, b) => (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const scale = (c, k) => rgb(ch(c, 16) * k, ch(c, 8) * k, ch(c, 0) * k);
const lighten = (c, k) => rgb(ch(c, 16) + (255 - ch(c, 16)) * k, ch(c, 8) + (255 - ch(c, 8)) * k, ch(c, 0) + (255 - ch(c, 0)) * k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

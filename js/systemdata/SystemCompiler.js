import { SeededRandom, deriveSeed, hashString } from '../core/SeededRandom.js';
import {
  BIOME_SLOTS, BODY_DEFAULTS, EXTRA_BIOME_LOOK, BARREN_FLORA, DEFAULT_LIFE, FAUNA_TEMPLATES, FLORA_TEMPLATES, LIMITS,
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
    const distance = p.orbit?.distance ?? i + 1;
    planet.orbit = {
      distance,
      distanceKm: distance * ORBIT_UNITS.PLANET_KM,
      periodHours: p.orbit?.period_hours ?? Math.round(24 * 365 * distance ** 1.5),
    };
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

  return {
    name: data.name,
    description: data.description ?? '',
    author: data.author ?? '',
    seed: systemSeed,
    star: { name: data.star?.name ?? 'Estrella', type: starType, color: STAR_TYPES[starType].color, radiusKm: STAR_TYPES[starType].radiusKm },
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
  // Lo que no dice el archivo se reparte según el tamaño de la región: por área en las regiones
  // pequeñas; en las grandes, más despacio (los animales solo viven cerca del jugador).
  const km = SIZE_CATEGORIES[size].regionKm;
  const sizeFactor = km < 1 ? km * km : km;
  const breathable = b.physics?.breathable ?? D.breathable;
  const gravity = b.physics?.gravity ?? D.gravity;
  const hasSea = b.water?.sea ?? D.sea;
  const generatorId = b.terrain?.generator ?? D.generator;
  const gen = TERRAIN_GENERATORS[generatorId];
  const look = gen.look;
  // Sin tierra (solo mar) no hay plantas ni animales por defecto.
  const livingDefaults = kind === 'PLANET' && breathable && !gen.look.NO_LAND;

  // Relieve.
  const params = {};
  for (const [k, def] of Object.entries(gen.params)) params[k] = b.terrain?.params?.[k] ?? def.default;
  const TERRAIN = gen.build(params);
  TERRAIN.SEA_FLOOR = hasSea ? -9 : 2; // sin mar, el borde baja a una depresión seca
  if (TERRAIN.ISLANDS && !hasSea) TERRAIN.ISLANDS.FLOOR = 2; // sin mar: hondonadas secas entre "islas"

  // Colores: paleta (propia, a partir del color o la de luna por defecto) o los del Edén.
  let palette = null;
  if (b.palette) palette = paletteFrom(b.palette, b.color ?? b.palette.light ?? '#bdb9b1');
  else if (kind === 'MOON' && b.color) palette = paletteFromColor(hex(b.color));
  else if (kind === 'MOON') palette = tintPalette(D.palette, new SeededRandom(deriveSeed(ctx.systemSeed, ctx.id)).range(-0.08, 0.08));
  else if (look.PALETTE) palette = { ...look.PALETTE }; // p. ej. las dunas: arena dorada
  const base = palette ? paletteColors(palette) : BODY_DEFAULTS.PLANET.colors;
  const surface = { ...base.surface, ...mapHex(b.surface_colors) };

  // Biomas.
  const baseTemp = b.climate?.temperature_c ?? b.biomes?.low?.temperature_c ?? D.temperature;
  const BIOMES = {};
  const grass = {};
  // Zonas opcionales (playa, río, montaña baja): solo si su capa de terreno existe.
  const enabled = (slot) => !BIOME_SLOTS[slot].param || params[BIOME_SLOTS[slot].param] > 0;
  for (const [slot, { slot: id }] of Object.entries(BIOME_SLOTS)) {
    if (!enabled(slot)) {
      if (b.biomes?.[slot]) notes.push({ path: `${path}.biomes.${slot}`, message: `La zona "${slot}" necesita terrain.params.${BIOME_SLOTS[slot].param} > 0: se ignora.` });
      continue;
    }
    const j = b.biomes?.[slot] ?? {};
    const [hill, detail] = look.SCALES[slot] ?? EXTRA_BIOME_LOOK.SCALES[slot];
    const def = {
      NAME: j.name ?? look.BIOME_NAMES[slot] ?? EXTRA_BIOME_LOOK.BIOME_NAMES[slot],
      TEMPERATURE: j.temperature_c ?? baseTemp + (look.TEMPERATURE_OFFSETS[slot] ?? EXTRA_BIOME_LOOK.TEMPERATURE_OFFSETS[slot]),
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
  const DENSITY = Object.fromEntries(Object.keys(BIOMES).map((id) => [id, {}]));
  const floraColors = {};
  const floraSize = {};
  floraList.forEach((f, i) => {
    if (!enabled(f.biome)) {
      notes.push({ path: `${path}.flora[${i}].biome`, message: `La zona "${f.biome}" no existe en este cuerpo (terrain.params.${BIOME_SLOTS[f.biome].param} = 0): se ignora.` });
      return;
    }
    const slot = BIOME_SLOTS[f.biome].slot;
    const res = FLORA_TEMPLATES[f.template].resource;
    // Color y tamaño propios: uno por tipo en todo el cuerpo (vale el último).
    if (f.color) for (const key of FLORA_TEMPLATES[f.template].colorKeys) floraColors[key] = key.endsWith('_ALT') ? shadeHex(hex(f.color), 1.12) : hex(f.color);
    if (f.fruit_color && f.template === 'fruit_tree') floraColors.APPLE = hex(f.fruit_color);
    if (f.size !== undefined) floraSize[res] = f.size;
    if (DENSITY[slot][res] !== undefined) notes.push({ path: `${path}.flora[${i}]`, message: `"${f.template}" ya estaba en la zona "${f.biome}": vale la última densidad.` });
    DENSITY[slot][res] = f.density;
  });
  const hasWood = floraList.some((f) => FLORA_TEMPLATES[f.template].wood && f.density > 0);

  // Fauna.
  const faunaList = b.fauna ?? (livingDefaults
    ? DEFAULT_LIFE.fauna.map((f) => ({ ...f, herds: Math.max(1, Math.round(f.herds * Math.min(sizeFactor, 2))) }))
    : []);
  const HERDS = {};
  const VARIANTS = {};
  let herdTotal = 0;
  faunaList.forEach((f, i) => {
    const base = FAUNA_TEMPLATES[f.template].species;
    // Con nombre, tamaño, color, carácter o bioma propios es una especie nueva de este cuerpo.
    const custom = ['name', 'size', 'color', 'temperament', 'biome'].some((k) => f[k] !== undefined);
    const sp = custom ? `${ctx.id}:${base}:${i + 1}` : base;
    if (custom) {
      VARIANTS[sp] = { BASE: base };
      if (f.name) VARIANTS[sp].NAME = f.name.trim();
      if (f.size !== undefined) VARIANTS[sp].SIZE = f.size;
      if (f.color) VARIANTS[sp].COLOR = hex(f.color);
      if (f.temperament) VARIANTS[sp].TEMPERAMENT = f.temperament;
      if (f.biome) VARIANTS[sp].BIOME = f.biome;
    }
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
  const hasWool = faunaList.some((f) => FAUNA_TEMPLATES[f.template].wool && f.herds > 0);

  // Agua.
  const ponds = b.water?.ponds ?? (livingDefaults ? Math.min(LIMITS.PONDS, Math.max(4, Math.round(WATER_DEFAULTS.PONDS_BREATHABLE * sizeFactor))) : 0);
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
    FAUNA: { HERDS, HERD_RADIUS: 24, NEAR_SPAWN_DISTANCE: [35, 120], ...(Object.keys(VARIANTS).length ? { VARIANTS } : {}) },
  });
  if (palette) profile.PROP_COLORS = { ROCK: palette.mid };
  if (Object.keys(floraColors).length) profile.PROP_COLORS = { ...(profile.PROP_COLORS ?? {}), ...floraColors };
  if (Object.keys(floraSize).length) profile.RESOURCES.SIZE = floraSize;
  // Ola gigante (capacidad del motor): cruza la región cada `period_hours` horas.
  const gw = b.water?.giant_wave;
  if (gw && hasSea) {
    profile.WAVE = {
      PERIOD_HOURS: gw.period_hours ?? 24,
      HOUR: gw.hour ?? 12,
      HEIGHT: gw.height_m ?? 18,
      SPEED: gw.speed_mps ?? 25,
      WARNING_HOURS: (gw.warning_minutes ?? 60) / 60,
      ANGLE: new SeededRandom(deriveSeed(ctx.systemSeed, `wave:${ctx.id}`)).range(0, Math.PI * 2),
    };
  } else if (gw) {
    notes.push({ path: `${path}.water.giant_wave`, message: 'La ola gigante necesita mar (water.sea = true): se ignora.' });
  }
  // Nadar y bucear (capacidad del motor): solo si el archivo lo ajusta; si no, valores por defecto.
  if (b.water && (b.water.swim !== undefined || b.water.dive !== undefined || b.water.visibility_m !== undefined)) {
    profile.FLUID = { SWIM: b.water.swim ?? true, DIVE: b.water.dive ?? true, VISIBILITY: b.water.visibility_m ?? 25 };
  }
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
    beach: { ground: highlight, ground_alt: light, accent: mid },
    river: { ground: mid, ground_alt: dark, accent: light },
    mountain: { ground: dark, ground_alt: mid, accent: light },
  };
}

const ch = (c, s) => (c >> s) & 255;
const rgb = (r, g, b) => (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const scale = (c, k) => rgb(ch(c, 16) * k, ch(c, 8) * k, ch(c, 0) * k);
const shadeHex = scale;
const lighten = (c, k) => rgb(ch(c, 16) + (255 - ch(c, 16)) * k, ch(c, 8) + (255 - ch(c, 8)) * k, ch(c, 0) + (255 - ch(c, 0)) * k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function listNames(names) {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

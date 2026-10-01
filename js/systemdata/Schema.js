import {
  LIMITS, SCHEMA_VERSION, SIZE_CATEGORIES, STAR_TYPES, BIOME_SLOTS,
  FLORA_TEMPLATES, FAUNA_TEMPLATES, TERRAIN_GENERATORS,
} from './Catalog.js';
import { TEMPERAMENTS } from '../animals/SpeciesVariants.js';

/**
 * Schema — forma de un archivo de sistema solar (versión 1), derivada del
 * catálogo. Es un dialecto mínimo que entiende Validator.js:
 *
 *   { type: 'object', properties: {...}, required: [...] }   (claves desconocidas → aviso y se ignoran)
 *   { type: 'array', items, minItems, maxItems }
 *   { type: 'number', min, max, integer }
 *   { type: 'string', minLength, maxLength }
 *   { type: 'enum', values: [...] }
 *   { type: 'color' }                                         ("#rrggbb")
 *   { type: 'boolean' }
 *
 * `select(parent)` en una propiedad elige su esquema según el objeto que la
 * contiene (p. ej. los parámetros dependen del generador de terreno).
 * `description` va al prompt para creadores y a los mensajes de error.
 * También se puede exportar a JSON Schema estándar (toJsonSchema).
 */

const num = (min, max, description, extra = {}) => ({ type: 'number', min, max, description, ...extra });
const int = (min, max, description, extra = {}) => num(min, max, description, { integer: true, ...extra });
const str = (maxLength, description, extra = {}) => ({ type: 'string', minLength: 0, maxLength, description, ...extra });
const color = (description) => ({ type: 'color', description });
const bool = (description) => ({ type: 'boolean', description });
const enm = (values, description) => ({ type: 'enum', values: Object.keys(values), labels: values, description });
const obj = (properties, description, required = []) => ({ type: 'object', properties, required, description });
const arr = (items, maxItems, description, minItems = 0) => ({ type: 'array', items, minItems, maxItems, description });

const name = (what) => str(LIMITS.NAME_LENGTH, `Nombre ${what}.`, { minLength: 1 });

const labels = (table, key = 'label') => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v[key]]));

/** Parámetros de un generador de terreno. */
function generatorParams(id) {
  const g = TERRAIN_GENERATORS[id];
  const props = {};
  for (const [k, p] of Object.entries(g.params)) props[k] = num(p.min, p.max, `${p.description} Por defecto ${p.default}.`, { default: p.default });
  return obj(props, `Parámetros del generador "${id}" (todos opcionales).`);
}

const terrain = obj({
  generator: enm(labels(TERRAIN_GENERATORS), 'Tipo de relieve.'),
  params: {
    select: (parent) => (TERRAIN_GENERATORS[parent?.generator] ? generatorParams(parent.generator) : obj({}, 'Parámetros del generador.')),
  },
}, 'Relieve del cuerpo.');

const palette = obj({
  light: color('Tono claro (llanuras).'),
  mid: color('Tono medio.'),
  dark: color('Tono oscuro (zonas bajas, rocas).'),
  highlight: color('Brillos y polvo de las cumbres.'),
}, 'Paleta de 4 tonos de la que salen todos los colores del suelo si no se dan colores de bioma.');

const biome = (slot) => obj({
  name: name('de la zona'),
  temperature_c: num(-150, 150, 'Temperatura media en °C.'),
  relief: num(0, 3, 'Relieve propio de la zona (0 = llano, 1 = normal).'),
  roughness: num(0, 3, 'Rugosidad propia de la zona.'),
  grass: int(0, 800, 'Matas de hierba por trozo de 64 m (0 = sin hierba).'),
  ...(slot === 'high' ? { snow_height: num(0, 300, 'Altura (m) a partir de la que las cumbres se cubren de nieve o polvo.') } : {}),
  colors: obj({
    ground: color('Color principal del suelo.'),
    ground_alt: color('Color secundario del suelo (manchas).'),
    ...(slot === 'high'
      ? { snow: color('Color de las cumbres (nieve, escarcha, polvo…).'), ice: color('Color del hielo o de los brillos.') }
      : { accent: color('Color de acento (flores, piedras sueltas…).') }),
  }, 'Colores de la zona.'),
}, `Zona "${slot}": ${BIOME_SLOTS[slot].label}.`);

const biomes = obj({ low: biome('low'), mid: biome('mid'), high: biome('high') }, 'Las tres zonas del cuerpo, de abajo arriba.');

const flora = arr(obj({
  template: enm(labels(FLORA_TEMPLATES), 'Tipo de planta o roca.'),
  biome: enm(labels(BIOME_SLOTS), 'Zona en la que crece.'),
  density: num(0, 0.4, 'Probabilidad por celda de 4×4 m (0.01 = disperso, 0.25 = bosque denso).'),
  color: color('Color de las hojas (o de la roca / del mineral). Uno por tipo en todo el cuerpo.'),
  fruit_color: color('Color de la fruta (solo fruit_tree).'),
  size: num(0.3, 3, 'Tamaño (1 = normal, 2 = el doble). Uno por tipo en todo el cuerpo.'),
}, 'Una planta o roca en una zona.', ['template', 'biome', 'density']), LIMITS.FLORA, 'Flora y rocas. Si se omite: la del Jardín del Edén en cuerpos con aire; solo rocas y mineral en los demás. [] = nada.');

const fauna = arr(obj({
  template: enm(labels(FAUNA_TEMPLATES), 'Tipo de animal.'),
  herds: int(0, 30, 'Número de rebaños en toda la región.'),
  name: str(30, 'Nombre de la especie en singular (p. ej. "Ramoneador"). Si se pone, es una especie propia de este cuerpo.', { minLength: 1 }),
  size: num(0.3, 3, 'Tamaño (1 = el de la plantilla). Los grandes tienen más vida y golpean más fuerte.'),
  color: color('Color del cuerpo (la tripa y las patas salen de él).'),
  temperament: enm(Object.fromEntries(Object.entries(TEMPERAMENTS).map(([k, v]) => [k, v.label])), 'Carácter.'),
  biome: enm(labels(BIOME_SLOTS), 'Zona donde prefiere vivir.'),
}, 'Una especie animal (a partir de una plantilla).', ['template', 'herds']), LIMITS.FAUNA, 'Animales. Si se omite: los del Jardín del Edén en planetas con aire; ninguno en los demás. [] = ninguno.');

const lore = obj({
  life: str(LIMITS.LORE_LENGTH, 'Qué vida hay (lo cuenta la IA de la nave).'),
  atmosphere: str(LIMITS.LORE_LENGTH, 'Cómo es la atmósfera.'),
  surface: str(LIMITS.LORE_LENGTH, 'Cómo es la superficie.'),
  moons: str(LIMITS.LORE_LENGTH, 'Resumen de las lunas (solo planetas).'),
}, 'Textos que cuenta la IA de la nave. Si faltan, se generan a partir de los datos.');

/** Propiedades comunes de planetas y lunas. */
function bodyProperties(kind) {
  return {
    name: name(kind === 'PLANET' ? 'del planeta' : 'de la luna'),
    description: str(LIMITS.TEXT_LENGTH, 'Descripción libre (solo texto).'),
    size: enm(labels(SIZE_CATEGORIES), 'Categoría de tamaño: fija el lado de la región explorable (enano 0,5 km, pequeño 1 km, mediano 5 km, grande 10 km, enorme 20 km).'),
    radius_km: num(100, 10000, 'Radio del cuerpo visto desde el espacio (km).'),
    color: color('Color con el que se ve desde lejos. En una luna sin paleta también tiñe el suelo.'),
    physics: obj({
      gravity: num(0.05, 3, 'Gravedad en g (1 = la de la Tierra).'),
      breathable: bool('¿Hay aire respirable? Si no, hace falta el traje.'),
    }, 'Física del cuerpo.'),
    climate: obj({ temperature_c: num(-150, 150, 'Temperatura media de la zona baja en °C.') }, 'Clima.'),
    water: obj({
      sea: bool('¿Hay mar alrededor de la región?'),
      ponds: int(0, LIMITS.PONDS, 'Charcas de agua dulce en toda la región.'),
      sea_color: color('Color del mar.'),
      pond_color: color('Color de las charcas.'),
      swim: bool('¿Se puede nadar en el agua? (por defecto sí)'),
      dive: bool('¿Se puede bucear bajo el agua? (por defecto sí; bajo el agua no se respira sin traje)'),
      visibility_m: num(3, 120, 'Visibilidad bajo el agua en metros (agua turbia 5, cristalina 60).'),
    }, 'Agua (mar y charcas). Nadar y bucear son capacidades del motor: aquí solo se activan y ajustan.'),
    terrain,
    palette,
    surface_colors: obj({
      sand: color('Arena de la costa.'),
      seabed: color('Fondo del mar.'),
      rock: color('Roca de las pendientes.'),
    }, 'Colores comunes a todas las zonas.'),
    biomes,
    flora,
    fauna,
    lore,
  };
}

const moonOrbit = obj({
  distance: num(5, 60, 'Distancia al planeta en miles de km.'),
  period_hours: num(2, 2000, 'Horas que tarda en dar una vuelta al planeta.'),
}, 'Órbita alrededor del planeta.');

const moon = obj({
  ...bodyProperties('MOON'),
  orbit: moonOrbit,
  sky_size_deg: num(0.5, 20, 'Tamaño aparente en el cielo del planeta (grados).'),
}, 'Una luna (todas se pueden visitar). Solo "name" es obligatorio: el resto tiene valores por defecto (desierto de cráteres gris claro).', ['name']);

const planet = obj({
  ...bodyProperties('PLANET'),
  orbit: obj({
    distance: num(1, 10, 'Distancia a la estrella en unidades del juego (1 = cerca, 10 = lejos).'),
    period_hours: num(10, 100000, 'Horas que tarda en dar una vuelta a la estrella.'),
  }, 'Órbita alrededor de la estrella.'),
  moons: arr(moon, LIMITS.MOONS, 'Lunas del planeta (0 a 4).'),
}, 'Un planeta. Solo "name" es obligatorio.', ['name']);

export const SYSTEM_SCHEMA = obj({
  schema_version: str(10, `Versión del formato. Usa "${SCHEMA_VERSION}".`),
  name: name('del sistema solar'),
  description: str(LIMITS.TEXT_LENGTH, 'Descripción libre del sistema (solo texto).'),
  author: str(LIMITS.NAME_LENGTH, 'Quién lo ha creado.'),
  seed: int(0, 4294967295, 'Semilla numérica: la misma semilla da siempre el mismo sistema.'),
  star: obj({
    name: name('de la estrella'),
    type: enm(labels(STAR_TYPES), 'Tipo de estrella.'),
  }, 'La estrella del sistema.'),
  planets: arr(planet, LIMITS.PLANETS, 'Planetas (1 a 8). El primero es donde se empieza.', 1),
  meteors: obj({
    frequency: num(0, 1, 'Frecuencia de meteoritos (0 = ninguno, 1 = muchos).'),
    richness: num(0, 1, 'Cuánto mineral llevan.'),
  }, 'Meteoritos del sistema.'),
  unsupported_requests: arr(str(LIMITS.TEXT_LENGTH, 'Una idea que el motor aún no permite.'), LIMITS.UNSUPPORTED,
    'Ideas del creador que el formato no permite expresar. El juego las muestra y las ignora.'),
}, 'Un sistema solar para Mundo Cero.', ['name', 'planets']);

/** Esquema como JSON Schema estándar (draft 2020-12) para publicarlo. */
export function toJsonSchema(schema = SYSTEM_SCHEMA, root = true) {
  const out = {};
  if (root) {
    out.$schema = 'https://json-schema.org/draft/2020-12/schema';
    out.title = 'Sistema solar de Mundo Cero';
  }
  if (schema.select) return { description: 'Depende del generador elegido.', type: 'object' };
  if (schema.description) out.description = schema.description;
  switch (schema.type) {
    case 'object':
      out.type = 'object';
      out.additionalProperties = false;
      out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toJsonSchema(v, false)]));
      if (schema.required?.length) out.required = [...schema.required];
      break;
    case 'array':
      out.type = 'array';
      out.items = toJsonSchema(schema.items, false);
      if (schema.minItems) out.minItems = schema.minItems;
      out.maxItems = schema.maxItems;
      break;
    case 'number':
      out.type = schema.integer ? 'integer' : 'number';
      out.minimum = schema.min;
      out.maximum = schema.max;
      if (schema.default !== undefined) out.default = schema.default;
      break;
    case 'string':
      out.type = 'string';
      if (schema.minLength) out.minLength = schema.minLength;
      out.maxLength = schema.maxLength;
      break;
    case 'enum':
      out.enum = [...schema.values];
      break;
    case 'color':
      out.type = 'string';
      out.pattern = '^#[0-9a-fA-F]{6}$';
      break;
    case 'boolean':
      out.type = 'boolean';
      break;
  }
  return out;
}

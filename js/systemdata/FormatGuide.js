/**
 * FormatGuide — guía del formato de sistema solar en texto plano, para pegarla
 * en una conversación con Claude y pedirle un sistema nuevo. Se genera a partir
 * del esquema y del catálogo, así que siempre coincide con lo que acepta el juego.
 */
import { LIMITS, SCHEMA_VERSION, TERRAIN_GENERATORS } from './Catalog.js';
import { SYSTEM_SCHEMA } from './Schema.js';

export const GUIDE_EXAMPLE = {
  schema_version: SCHEMA_VERSION,
  name: 'Sistema Ejemplo',
  description: 'Dos planetas: uno verde con mar y otro desierto sin aire.',
  star: { name: 'Ejemplo', type: 'yellow_dwarf' },
  planets: [
    {
      name: 'Verdor', size: 'small',
      physics: { gravity: 1, breathable: true },
      terrain: { generator: 'archipelago', params: { land_fraction: 0.4 } },
      fauna: [{ template: 'deer', herds: 6, name: 'Saltarín', color: '#c08850' }],
      moons: [{ name: 'Gris' }],
    },
    {
      name: 'Ocre', size: 'medium', orbit: { distance: 3 },
      physics: { gravity: 0.7, breathable: false },
      water: { sea: false },
      terrain: { generator: 'dunes' },
      palette: { light: '#e0b070', mid: '#c09050', dark: '#806030', highlight: '#f0d8a0' },
    },
  ],
};

/** Texto completo de la guía. */
export function formatGuide() {
  const lines = [
    'Quiero que me crees un sistema solar para el juego Mundo Cero. Devuélveme SOLO un archivo JSON (sin comentarios) con este formato.',
    '',
    'Reglas:',
    `- Solo JSON. Tamaño máximo ${Math.round(LIMITS.FILE_BYTES / 1024)} KB. Pon "schema_version": "${SCHEMA_VERSION}".`,
    '- Usa solo las claves de esta lista; las desconocidas se ignoran. Nada de HTML, URLs, imágenes, scripts ni shaders: los textos son texto plano.',
    '- Si quiero algo que el formato no permite, no lo inventes: escríbelo en "unsupported_requests" (lista de textos).',
    `- Límites: ${LIMITS.PLANETS} planetas, ${LIMITS.MOONS} lunas por planeta, ${LIMITS.FLORA} entradas de flora y ${LIMITS.FAUNA} de fauna por cuerpo, nombres de ${LIMITS.NAME_LENGTH} caracteres.`,
    '- El primer planeta es donde empieza el jugador. Todas las lunas se pueden visitar. Los colores van como "#rrggbb".',
    '- Solo "name" (del sistema, de cada planeta y de cada luna) y "planets" son obligatorios: el resto tiene valores por defecto.',
    '',
    'Claves (ruta: tipo — qué es):',
  ];
  walk(SYSTEM_SCHEMA, '', lines);
  lines.push('', 'Parámetros de terreno según el generador (en terrain.params, todos opcionales):');
  for (const [id, g] of Object.entries(TERRAIN_GENERATORS)) {
    lines.push(`- ${id} (${g.label}): ${g.description}`);
    for (const [k, p] of Object.entries(g.params)) lines.push(`    · ${k}: número ${p.min}–${p.max}, por defecto ${p.default} — ${p.description}`);
  }
  lines.push('', 'Ejemplo mínimo:', JSON.stringify(GUIDE_EXAMPLE, null, 2));
  return lines.join('\n');
}

function walk(schema, path, out) {
  if (schema.select) return out.push(`- ${path}: objeto — depende del generador (ver abajo).`);
  if (schema.type === 'object') {
    if (path) out.push(`- ${path}: objeto — ${schema.description ?? ''}`);
    for (const [k, v] of Object.entries(schema.properties)) {
      const req = schema.required?.includes(k);
      const before = out.length;
      walk(v, path ? `${path}.${k}` : k, out);
      if (req) out[before] = out[before].replace(' — ', ' (obligatorio) — ');
    }
    return;
  }
  if (schema.type === 'array') {
    out.push(`- ${path}: lista de ${schema.minItems ? `${schema.minItems} a ` : 'hasta '}${schema.maxItems} — ${schema.description ?? ''}`);
    if (schema.items.type === 'object') walk(schema.items, `${path}[]`, out);
    else out.push(`- ${path}[]: ${typeText(schema.items)} — ${schema.items.description ?? ''}`);
    return;
  }
  out.push(`- ${path}: ${typeText(schema)} — ${schema.description ?? ''}`);
}

function typeText(s) {
  switch (s.type) {
    case 'number': return `${s.integer ? 'entero' : 'número'} ${s.min}–${s.max}`;
    case 'string': return `texto (hasta ${s.maxLength})`;
    case 'color': return 'color "#rrggbb"';
    case 'boolean': return 'true / false';
    case 'enum': return `uno de: ${s.values.map((v) => (s.labels?.[v] ? `${v} (${s.labels[v]})` : v)).join(', ')}`;
    default: return s.type;
  }
}

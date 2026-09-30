import { LIMITS } from './Catalog.js';

/**
 * Validator — comprueba un objeto contra un esquema de Schema.js y devuelve
 * una copia LIMPIA: solo las claves conocidas, con los tipos correctos.
 *
 *   - Errores (el archivo no se puede usar): tipo equivocado, valor fuera de
 *     rango, opción que no existe, falta un campo obligatorio, lista demasiado
 *     larga, texto demasiado largo. Cada uno con su ruta: planets[0].moons[1].orbit.distance
 *   - Avisos (el archivo se usa igual): claves desconocidas, que se ignoran y
 *     se listan para que el creador sepa qué no ha entrado.
 *
 * Nunca interpreta el contenido: los textos siguen siendo texto.
 * Devuelve { value, errors: [{path, message}], warnings: [{path, message}] }.
 */
export function validate(data, schema, { maxErrors = LIMITS.MAX_ERRORS } = {}) {
  const errors = [];
  const warnings = [];
  const ctx = {
    error(path, message) {
      if (errors.length < maxErrors) errors.push({ path, message });
    },
    warn(path, message) {
      if (warnings.length < maxErrors) warnings.push({ path, message });
    },
  };
  const value = check(data, schema, '', ctx, null);
  return { value, errors, warnings };
}

const typeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'una lista' : typeof v === 'object' ? 'un objeto' : typeof v === 'string' ? 'un texto' : typeof v === 'number' ? 'un número' : typeof v === 'boolean' ? 'verdadero/falso' : typeof v);
const show = (v) => (typeof v === 'string' ? `"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"` : JSON.stringify(v));
const join = (path, key) => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

function check(v, schema, path, ctx, parent) {
  if (schema.select) schema = schema.select(parent);
  const where = path || 'raíz';
  switch (schema.type) {
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        ctx.error(where, `Debería ser un objeto { … } y es ${typeName(v)}.`);
        return undefined;
      }
      const out = {};
      for (const key of Object.keys(v)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          const known = Object.keys(schema.properties);
          const similar = closest(key, known);
          ctx.warn(join(path, key), `Clave desconocida: se ignora.${similar ? ` ¿Querías decir "${similar}"?` : ''}`);
          continue;
        }
        const r = check(v[key], schema.properties[key], join(path, key), ctx, v);
        if (r !== undefined) out[key] = r;
      }
      for (const key of schema.required ?? []) {
        if (v[key] === undefined) ctx.error(join(path, key), 'Falta este campo obligatorio.');
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(v)) {
        ctx.error(where, `Debería ser una lista [ … ] y es ${typeName(v)}.`);
        return undefined;
      }
      if (v.length > schema.maxItems) {
        ctx.error(where, `Tiene ${v.length} elementos y el máximo es ${schema.maxItems}.`);
        return undefined;
      }
      if (v.length < (schema.minItems ?? 0)) {
        ctx.error(where, `Tiene ${v.length} elementos y el mínimo es ${schema.minItems}.`);
        return undefined;
      }
      const out = [];
      v.forEach((item, i) => {
        const r = check(item, schema.items, join(path, i), ctx, v);
        if (r !== undefined) out.push(r);
      });
      return out;
    }
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        ctx.error(where, `Debería ser un número y es ${typeName(v)}${typeof v === 'string' ? ` (${show(v)}: quita las comillas)` : ''}.`);
        return undefined;
      }
      if (schema.integer && !Number.isInteger(v)) {
        ctx.error(where, `Debería ser un número entero y es ${v}.`);
        return undefined;
      }
      if (v < schema.min || v > schema.max) {
        ctx.error(where, `Vale ${v} y tiene que estar entre ${schema.min} y ${schema.max}.`);
        return undefined;
      }
      return v;
    }
    case 'string': {
      if (typeof v !== 'string') {
        ctx.error(where, `Debería ser un texto entre comillas y es ${typeName(v)}.`);
        return undefined;
      }
      if (v.length > schema.maxLength) {
        ctx.error(where, `Tiene ${v.length} caracteres y el máximo es ${schema.maxLength}.`);
        return undefined;
      }
      if (v.trim().length < (schema.minLength ?? 0)) {
        ctx.error(where, 'No puede estar vacío.');
        return undefined;
      }
      return v;
    }
    case 'enum': {
      if (typeof v !== 'string' || !schema.values.includes(v)) {
        const lower = typeof v === 'string' ? schema.values.find((x) => x === v.toLowerCase().trim()) : null;
        ctx.error(where, `${show(v)} no es una opción válida. Opciones: ${schema.values.join(', ')}.${lower ? ` ¿Querías decir "${lower}"?` : ''}`);
        return undefined;
      }
      return v;
    }
    case 'color': {
      if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) {
        ctx.error(where, `${show(v)} no es un color válido. Usa el formato "#rrggbb", por ejemplo "#4a7a35".`);
        return undefined;
      }
      return v.toLowerCase();
    }
    case 'boolean': {
      if (typeof v !== 'boolean') {
        ctx.error(where, `Debería ser true o false (sin comillas) y es ${typeName(v)}.`);
        return undefined;
      }
      return v;
    }
    default:
      ctx.error(where, 'Tipo de esquema desconocido.');
      return undefined;
  }
}

/** La clave conocida más parecida (para sugerir "¿Querías decir…?"), o null. */
function closest(key, known) {
  const k = key.toLowerCase().replace(/-/g, '_');
  let best = null;
  let bestD = Math.max(1, Math.floor(k.length / 4)) + 1;
  for (const c of known) {
    const d = distance(k, c);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

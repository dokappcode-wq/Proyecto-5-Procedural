import { LIMITS } from './Catalog.js';

/**
 * SafeJson — lectura segura del texto de un archivo importado.
 *
 * Solo JSON: nunca se evalúa nada (ni eval, ni Function, ni import). Además:
 *   - tamaño máximo (LIMITS.FILE_BYTES);
 *   - se quita un bloque ```json … ``` alrededor (Claude suele añadirlo);
 *   - se descartan las claves __proto__, constructor y prototype;
 *   - profundidad y número de valores limitados (no se cuelga con datos extremos);
 *   - la raíz tiene que ser un objeto.
 *
 * Devuelve { data, errors: [{path, message}], warnings: [{path, message}] }.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseJsonSafely(text, limits = LIMITS) {
  const errors = [];
  const warnings = [];
  const fail = (message) => ({ data: null, errors: [...errors, { path: '', message }], warnings });

  if (typeof text !== 'string') return fail('El archivo no es texto.');
  const bytes = byteLength(text);
  if (bytes > limits.FILE_BYTES) {
    return fail(`El archivo ocupa ${Math.ceil(bytes / 1024)} KB y el máximo es ${Math.round(limits.FILE_BYTES / 1024)} KB.`);
  }
  let src = text.replace(/^﻿/, '').trim();
  const fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(src);
  if (fence) {
    src = fence[1].trim();
    warnings.push({ path: '', message: 'Se ha quitado el bloque ``` que rodeaba el JSON.' });
  }
  if (!src) return fail('El archivo está vacío.');
  if (src[0] !== '{') {
    return fail('El archivo tiene que empezar por "{": pega solo el JSON, sin texto antes ni después.');
  }

  // Anidamiento antes de parsear (el reviver de JSON.parse es recursivo).
  const depth = maxNesting(src);
  if (depth > limits.MAX_DEPTH) return fail(`Demasiado anidado: más de ${limits.MAX_DEPTH} niveles.`);

  let data;
  try {
    data = JSON.parse(src, function reviver(key, value) {
      if (FORBIDDEN_KEYS.has(key)) {
        warnings.push({ path: '', message: `Se ha ignorado la clave "${key}" (no está permitida).` });
        return undefined;
      }
      return value;
    });
  } catch (err) {
    return fail(`No es un JSON válido: ${describeJsonError(err, src)}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('La raíz del JSON tiene que ser un objeto { … }.');

  // Profundidad y tamaño (iterativo: una estructura muy profunda no desborda la pila).
  let nodes = 0;
  const stack = [[data, 1]];
  while (stack.length) {
    const [v, depth] = stack.pop();
    nodes++;
    if (nodes > limits.MAX_NODES) return fail(`Demasiados datos: más de ${limits.MAX_NODES} valores.`);
    if (depth > limits.MAX_DEPTH) return fail(`Demasiado anidado: más de ${limits.MAX_DEPTH} niveles.`);
    if (v && typeof v === 'object') for (const c of Object.values(v)) stack.push([c, depth + 1]);
  }
  return { data, errors, warnings };
}

/** Profundidad máxima de { y [ fuera de los textos. */
function maxNesting(src) {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') max = Math.max(max, ++depth);
    else if (c === '}' || c === ']') depth--;
  }
  return max;
}

function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length * 3; // cota superior
}

/** Convierte "…at position 123" en línea y columna. */
function describeJsonError(err, src) {
  const msg = String(err?.message ?? err);
  const m = /position (\d+)/.exec(msg);
  if (!m) return msg;
  const pos = Number(m[1]);
  const before = src.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  const near = src.slice(Math.max(0, pos - 15), pos + 15).replace(/\s+/g, ' ');
  return `error cerca de la línea ${line}, columna ${col} («${near}»). Revisa comas, comillas y llaves.`;
}

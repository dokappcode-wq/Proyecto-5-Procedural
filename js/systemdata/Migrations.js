import { SCHEMA_VERSION } from './Catalog.js';

/**
 * Migrations — lleva un archivo de una versión antigua del formato a la actual.
 *
 * Cada paso { from, to, up(data) } devuelve una copia transformada. Cuando el
 * formato cambie (2.0…), se añade aquí el paso desde la versión anterior y los
 * archivos viejos siguen funcionando.
 *
 * Devuelve { data, errors, warnings }.
 */
const STEPS = [
  // { from: '1.0', to: '1.1', up: (d) => ({ ...d, schema_version: '1.1' }) },
];

export function migrate(input) {
  const errors = [];
  const warnings = [];
  let data = input;
  let version = data.schema_version;
  if (version === undefined) {
    warnings.push({ path: 'schema_version', message: `Falta la versión del formato: se supone "${SCHEMA_VERSION}".` });
    version = SCHEMA_VERSION;
  }
  if (typeof version === 'number') version = Number.isInteger(version) ? `${version}.0` : String(version);
  if (typeof version !== 'string' || !/^\d+\.\d+$/.test(version)) {
    errors.push({ path: 'schema_version', message: `Versión del formato no válida: usa "${SCHEMA_VERSION}".` });
    return { data: null, errors, warnings };
  }
  const major = (v) => Number(v.split('.')[0]);
  if (major(version) > major(SCHEMA_VERSION)) {
    errors.push({ path: 'schema_version', message: `Este archivo es del formato ${version}, más nuevo que el de este juego (${SCHEMA_VERSION}). Actualiza el juego.` });
    return { data: null, errors, warnings };
  }
  if (compare(version, SCHEMA_VERSION) > 0) {
    warnings.push({ path: 'schema_version', message: `Formato ${version}: se lee como ${SCHEMA_VERSION}; lo que no se entienda se ignorará.` });
    version = SCHEMA_VERSION;
  }
  for (const step of STEPS) {
    if (step.from === version) {
      data = step.up(data);
      version = step.to;
    }
  }
  if (version !== SCHEMA_VERSION) {
    errors.push({ path: 'schema_version', message: `No se puede leer el formato ${version}.` });
    return { data: null, errors, warnings };
  }
  return { data: { ...data, schema_version: SCHEMA_VERSION }, errors, warnings };
}

function compare(a, b) {
  const [a1, a2] = a.split('.').map(Number);
  const [b1, b2] = b.split('.').map(Number);
  return a1 - b1 || a2 - b2;
}

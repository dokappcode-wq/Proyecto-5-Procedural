import { parseJsonSafely } from './SafeJson.js';

/**
 * SystemCatalog — la lista de sistemas solares a los que se puede saltar con el
 * nodo de velocidad-luz (systems/catalogo.json). Cada entrada apunta a un archivo
 * de systems/ que pasa por el mismo validador que cualquier sistema importado.
 *
 *   { "systems": [ { "id": "kappa", "file": "kappa", "name": "Sistema Kappa", "description": "…" } ] }
 *
 * Solo datos: nombres de archivo de la carpeta systems/ (sin rutas ni URLs).
 * Devuelve { entries, errors }; las entradas no válidas se ignoran con su error.
 */
export const CATALOG_LIMITS = Object.freeze({ ENTRIES: 500, NAME: 40, DESCRIPTION: 200 });
const FILE_RE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const ID_RE = /^[a-z0-9_-]{1,40}$/;

export function parseSystemCatalog(text) {
  const parsed = parseJsonSafely(text);
  if (parsed.errors.length) return { entries: [], errors: parsed.errors };
  const list = parsed.data.systems;
  if (!Array.isArray(list)) return { entries: [], errors: [{ path: 'systems', message: 'Falta la lista "systems".' }] };
  const entries = [];
  const errors = [];
  const seen = new Set();
  list.slice(0, CATALOG_LIMITS.ENTRIES).forEach((e, i) => {
    const path = `systems[${i}]`;
    if (!e || typeof e !== 'object') return errors.push({ path, message: 'No es un objeto.' });
    if (typeof e.id !== 'string' || !ID_RE.test(e.id)) return errors.push({ path: `${path}.id`, message: 'Identificador no válido (minúsculas, números y guiones).' });
    if (seen.has(e.id)) return errors.push({ path: `${path}.id`, message: `"${e.id}" está repetido.` });
    if (typeof e.file !== 'string' || !FILE_RE.test(e.file)) return errors.push({ path: `${path}.file`, message: 'Nombre de archivo no válido (sin extensión ni rutas).' });
    if (typeof e.name !== 'string' || !e.name.trim() || e.name.length > CATALOG_LIMITS.NAME) return errors.push({ path: `${path}.name`, message: 'Nombre no válido.' });
    const description = typeof e.description === 'string' ? e.description.slice(0, CATALOG_LIMITS.DESCRIPTION) : '';
    seen.add(e.id);
    entries.push({ id: e.id, file: e.file, name: e.name, description });
  });
  return { entries, errors };
}

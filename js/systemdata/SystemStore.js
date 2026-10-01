/**
 * SystemStore — sistemas solares importados, guardados en el navegador (IndexedDB).
 *
 * Se guarda el TEXTO original del archivo (como mucho LIMITS.FILE_BYTES) y unos
 * pocos datos para la lista (nombre, descripción, nº de planetas). Lo guardado no
 * se considera fiable: al jugarlo se vuelve a pasar entero por el lector seguro,
 * el validador y el compilador, igual que un archivo recién importado.
 *
 * Si IndexedDB no está disponible (modo privado, navegador antiguo) se usa una
 * memoria temporal: funciona durante la sesión pero no se conserva al recargar.
 */
import { LIMITS } from './Catalog.js';

export const STORE_LIMITS = Object.freeze({ SYSTEMS: 60 });
/** Identificador de un sistema importado: minúsculas, números y guiones. */
export const IMPORT_ID_RE = /^[a-z0-9-]{1,48}$/;
/** Prefijo de los sistemas importados en ?system= y en el catálogo de hiperespacio. */
export const IMPORT_PREFIX = 'import:';

const DB_NAME = 'mundo0';
const DB_VERSION = 1;
const STORE = 'systems';

/** "import:<id>" → id válido, o null. */
export function importIdFromParam(param) {
  if (typeof param !== 'string' || !param.startsWith(IMPORT_PREFIX)) return null;
  const id = param.slice(IMPORT_PREFIX.length);
  return IMPORT_ID_RE.test(id) ? id : null;
}

/** Identificador nuevo a partir del nombre: "Sistema Kappa" → "sistema-kappa-4f2a". */
export function makeSystemId(name, random = Math.random) {
  const slug = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'sistema';
  const tail = Math.floor(random() * 0x10000).toString(16).padStart(4, '0');
  return `${slug}-${tail}`;
}

/** Datos para la lista (siempre recortados y como texto). */
function summary(r) {
  return {
    id: r.id,
    name: String(r.name ?? '').slice(0, LIMITS.NAME_LENGTH) || 'Sin nombre',
    description: String(r.description ?? '').slice(0, LIMITS.TEXT_LENGTH),
    planets: Number.isFinite(r.planets) ? r.planets : 0,
    savedAt: Number.isFinite(r.savedAt) ? r.savedAt : 0,
  };
}

export class SystemStore {
  /** @param {{ indexedDB?: IDBFactory|null }} [opts] null = solo memoria (pruebas) */
  constructor({ indexedDB } = {}) {
    this._idb = indexedDB === undefined ? globalThis.indexedDB ?? null : indexedDB;
    this._mem = new Map();
    this._dbPromise = null;
    this.persistent = !!this._idb;
  }

  _db() {
    if (!this._idb) return Promise.resolve(null);
    if (!this._dbPromise) {
      this._dbPromise = new Promise((resolve) => {
        let req;
        try {
          req = this._idb.open(DB_NAME, DB_VERSION);
        } catch {
          return resolve(null);
        }
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      }).then((db) => {
        if (!db) this.persistent = false;
        return db;
      });
    }
    return this._dbPromise;
  }

  async _tx(mode, fn) {
    const db = await this._db();
    if (!db) return fn(null);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store)).then((r) => (result = r), reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('Error de IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('Operación cancelada'));
    });
  }

  /** Lista de sistemas guardados (el más reciente primero). */
  async list() {
    const all = await this._tx('readonly', (store) => (store ? request(store.getAll()) : [...this._mem.values()]));
    return (all ?? []).filter((r) => r && IMPORT_ID_RE.test(r.id)).map(summary).sort((a, b) => b.savedAt - a.savedAt);
  }

  /** Registro completo { id, name, description, planets, savedAt, text } o null. */
  async get(id) {
    if (!IMPORT_ID_RE.test(id)) return null;
    const r = await this._tx('readonly', (store) => (store ? request(store.get(id)) : this._mem.get(id) ?? null));
    if (!r || typeof r.text !== 'string' || r.text.length > LIMITS.FILE_BYTES) return null;
    return { ...summary(r), text: r.text };
  }

  /**
   * Guarda un sistema ya validado. `text` es el archivo original.
   * Devuelve el registro guardado (sin el texto).
   */
  async save({ name, description, planets, text }, { id } = {}) {
    if (typeof text !== 'string' || new Blob([text]).size > LIMITS.FILE_BYTES) throw new Error('El archivo es demasiado grande.');
    const existing = await this.list();
    if (!id && existing.length >= STORE_LIMITS.SYSTEMS) throw new Error(`Ya hay ${STORE_LIMITS.SYSTEMS} sistemas guardados: borra alguno antes.`);
    const used = new Set(existing.map((e) => e.id));
    let newId = id && IMPORT_ID_RE.test(id) ? id : makeSystemId(name);
    while (!id && used.has(newId)) newId = makeSystemId(name);
    const record = { ...summary({ id: newId, name, description, planets, savedAt: Date.now() }), text };
    await this._tx('readwrite', (store) => (store ? request(store.put(record)) : this._mem.set(newId, record)));
    return summary(record);
  }

  async remove(id) {
    if (!IMPORT_ID_RE.test(id)) return;
    await this._tx('readwrite', (store) => (store ? request(store.delete(id)) : this._mem.delete(id)));
  }
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

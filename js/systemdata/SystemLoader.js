import { parseJsonSafely } from './SafeJson.js';
import { migrate } from './Migrations.js';
import { validate } from './Validator.js';
import { SYSTEM_SCHEMA } from './Schema.js';
import { compileSystem } from './SystemCompiler.js';

/**
 * SystemLoader — la tubería completa para un sistema solar en JSON:
 *
 *   texto → SafeJson (solo JSON, límites) → Migrations (versión) →
 *   Validator (esquema, claves desconocidas) → SystemCompiler (perfiles del motor)
 *
 * Devuelve { ok, system, data, errors, warnings, unsupported }:
 *   - ok = false si hay algún error (el sistema no se puede usar);
 *   - warnings: claves ignoradas y avisos de compilación;
 *   - unsupported: ideas del creador que el motor aún no permite.
 * `seed` sustituye a la del archivo (la campaña usa una aleatoria por partida).
 */
export function loadSystem(input, { seed } = {}) {
  const warnings = [];
  const fail = (errors) => ({ ok: false, system: null, data: null, errors, warnings, unsupported: [] });

  let raw = input;
  if (typeof input === 'string') {
    const parsed = parseJsonSafely(input);
    warnings.push(...parsed.warnings);
    if (parsed.errors.length) return fail(parsed.errors);
    raw = parsed.data;
  } else if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail([{ path: '', message: 'No es un sistema solar.' }]);
  }

  const migrated = migrate(raw);
  warnings.push(...migrated.warnings);
  if (migrated.errors.length) return fail(migrated.errors);

  const checked = validate(migrated.data, SYSTEM_SCHEMA);
  warnings.push(...checked.warnings);
  if (checked.errors.length) return fail(checked.errors);

  const system = compileSystem(checked.value, { seed });
  warnings.push(...system.notes);
  return { ok: true, system, data: checked.value, errors: [], warnings, unsupported: system.unsupported };
}

/** Texto listo para pegar en el chat de Claude y que corrija el archivo. */
export function errorReport(result) {
  const lines = ['Mi archivo de sistema solar para Mundo Cero tiene estos errores. Corrígelos y devuélveme el JSON completo:'];
  for (const e of result.errors) lines.push(`- ${e.path || '(archivo)'}: ${e.message}`);
  return lines.join('\n');
}

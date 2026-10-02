/**
 * SpeciesVariants — especies de un sistema solar a partir de las plantillas del motor.
 *
 * Un archivo importado elige una plantilla (deer, goat, cow) y puede ajustar nombre,
 * tamaño, color, carácter y bioma preferido. El compilador deja esos ajustes en
 * FAUNA.VARIANTS[clave] = { BASE, NAME, SIZE, COLOR, TEMPERAMENT, BIOME }; aquí se
 * convierten en una definición completa (la de la plantilla con los cambios), que es
 * lo que usan los animales. Sin Three.js.
 */
export const TEMPERAMENTS = Object.freeze({
  calm: { label: 'Tranquilo: casi nunca huye ni ataca', weights: { FLEE: 0.2, CURIOUS: 0.3, NEUTRAL: 0.5 }, hit: { FLEE: 0.8, FIGHT: 0.2 } },
  shy: { label: 'Asustadizo: huye en cuanto te ve', weights: { FLEE: 0.8, CURIOUS: 0.05, NEUTRAL: 0.15 }, hit: { FLEE: 0.95, FIGHT: 0.05 } },
  curious: { label: 'Curioso: se acerca a mirarte', weights: { FLEE: 0.1, CURIOUS: 0.7, NEUTRAL: 0.2 }, hit: { FLEE: 0.6, FIGHT: 0.4 } },
  aggressive: { label: 'Bravo: si lo golpeas, casi siempre se defiende', weights: { FLEE: 0.1, CURIOUS: 0.4, NEUTRAL: 0.5 }, hit: { FLEE: 0.1, FIGHT: 0.9 } },
});

const BIOME_PREFERENCES = {
  low: { PLAINS: 1, FOREST: 0.3 },
  mid: { FOREST: 1, PLAINS: 0.3 },
  high: { FROZEN_MOUNTAINS: 1, FOREST: 0.3 },
  beach: { BEACH: 1, PLAINS: 0.4 },
  river: { RIVER: 1, PLAINS: 0.5, FOREST: 0.3 },
  mountain: { MOUNTAINS: 1, FOREST: 0.3 },
};

/**
 * Definición de la especie `key` en un cuerpo: la de GameConfig.ANIMALS.SPECIES o la
 * de una variante del sistema solar. @returns {{ base: string, def: object } | null}
 */
export function resolveSpecies(key, fauna, species) {
  const v = fauna?.VARIANTS?.[key];
  if (!v) return species[key] ? { base: key, def: species[key] } : null;
  const b = species[v.BASE];
  if (!b) return null;
  const size = v.SIZE ?? 1;
  const def = { ...b };
  if (v.NAME) {
    def.NAME = v.NAME;
    def.NAME_PLURAL = v.NAME_PLURAL ?? plural(v.NAME);
  }
  if (size !== 1) {
    def.SCALE = [b.SCALE[0] * size, b.SCALE[1] * size];
    def.HEALTH = Math.max(1, Math.round(b.HEALTH * Math.min(2.5, Math.max(0.5, size))));
    def.ATTACK_DAMAGE = Math.round(b.ATTACK_DAMAGE * size ** 0.7);
  }
  if (v.COLOR !== undefined) def.COLORS = { BODY: v.COLOR, BELLY: mix(v.COLOR, 0xffffff, 0.35), DARK: mix(v.COLOR, 0x000000, 0.55) };
  if (v.TEMPERAMENT && TEMPERAMENTS[v.TEMPERAMENT]) {
    def.TEMPERAMENT_WEIGHTS = { ...TEMPERAMENTS[v.TEMPERAMENT].weights };
    def.HIT_REACTION_WEIGHTS = { ...TEMPERAMENTS[v.TEMPERAMENT].hit };
  }
  if (v.BIOME && BIOME_PREFERENCES[v.BIOME]) def.BIOMES = { ...BIOME_PREFERENCES[v.BIOME] };
  return { base: v.BASE, def };
}

function plural(name) {
  if (/[sx]$/i.test(name)) return name; // "Saltarrocas" → "Saltarrocas"
  if (/[aeiouáéó]$/i.test(name)) return `${name}s`;
  if (/z$/i.test(name)) return `${name.slice(0, -1)}ces`;
  return `${name}es`;
}

function mix(a, b, t) {
  const ch = (c, s) => (c >> s) & 255;
  const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

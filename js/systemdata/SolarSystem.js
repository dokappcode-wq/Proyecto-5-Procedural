/**
 * SolarSystem — el sistema solar compilado (SystemCompiler) en tiempo de juego.
 *
 * Es lo que consultan los sistemas del juego en lugar de identificadores fijos:
 *   system.homeId            cuerpo donde se empieza (el primer planeta)
 *   system.home              su descripción ({ id, name, radiusKm, profile… })
 *   system.moons             lunas del planeta de inicio
 *   system.planets           todos los planetas (en orden)
 *   system.visitable         todos los planetas y todas las lunas: se puede ir a cualquiera
 *   system.profiles          id → perfil del motor (lo que antes era GameConfig.PLANETS)
 *   system.body(id), system.nameOf(id), system.isHome(id), system.isMoon(id),
 *   system.planetOf(id), system.moonsOf(planetId)
 */
export class SolarSystem {
  constructor(compiled) {
    Object.assign(this, compiled);
    this._byId = new Map(compiled.bodies.map((b) => [b.id, b]));
    this.profiles = Object.freeze(Object.fromEntries(compiled.bodies.map((b) => [b.id, b.profile])));
    this.home = this._byId.get(compiled.homeId);
    this.planets = compiled.bodies.filter((b) => b.kind === 'PLANET');
    this.moons = this.moonsOf(compiled.homeId);
    this.visitable = this.planets.flatMap((p) => [p, ...this.moonsOf(p.id)]);
  }

  body(id) {
    return this._byId.get(id) ?? null;
  }

  nameOf(id) {
    return this._byId.get(id)?.name ?? id;
  }

  isHome(id) {
    return id === this.homeId;
  }

  isMoon(id) {
    return this._byId.get(id)?.kind === 'MOON';
  }

  /** Lunas de un planeta. */
  moonsOf(planetId) {
    return this.bodies.filter((b) => b.parent === planetId);
  }

  /** Planeta al que pertenece un cuerpo (él mismo si es un planeta), o null. */
  planetOf(id) {
    const b = this._byId.get(id);
    if (!b) return null;
    return b.kind === 'PLANET' ? b.id : b.parent;
  }

  /**
   * Teclas de rumbo en el espacio: 1… los planetas, después las lunas del planeta
   * `near` (el más cercano a la nave) y la siguiente, el meteorito. Como mucho 9.
   * Con un solo planeta: 1 el planeta, 2… sus lunas.
   */
  autopilotTargets(near = this.homeId) {
    const list = [...this.planets, ...this.moonsOf(this.planetOf(near) ?? this.homeId)]
      .slice(0, 8)
      .map((b) => ({ id: b.id, name: b.name }));
    list.push({ id: 'METEOR', name: 'meteorito' });
    return list.map((t, i) => ({ ...t, key: String(i + 1) }));
  }
}

/**
 * Nombre con preposición en castellano: con("en", "El Jardín del Edén") →
 * "en el Jardín del Edén"; con("de", "El Jardín…") → "del Jardín…";
 * con("a", "El Jardín…") → "al Jardín…"; con("en", "Luna A") → "en la Luna A";
 * con("en", "Nerea") → "en Nerea".
 */
export function withPrep(prep, name) {
  if (/^Luna\b/.test(name ?? '')) name = `La ${name}`; // "la Luna A"
  const m = /^(El|La|Los|Las)\s+(.*)$/.exec(name ?? '');
  if (!m) return prep ? `${prep} ${name}` : name;
  const art = m[1].toLowerCase();
  if (art === 'el' && prep === 'de') return `del ${m[2]}`;
  if (art === 'el' && prep === 'a') return `al ${m[2]}`;
  return prep ? `${prep} ${art} ${m[2]}` : `${art} ${m[2]}`;
}

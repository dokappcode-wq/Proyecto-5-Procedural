/**
 * SolarSystem — el sistema solar compilado (SystemCompiler) en tiempo de juego.
 *
 * Es lo que consultan los sistemas del juego en lugar de identificadores fijos:
 *   system.homeId            cuerpo donde se empieza (el primer planeta)
 *   system.home              su descripción ({ id, name, radiusKm, profile… })
 *   system.moons             lunas del planeta de inicio (todas visitables)
 *   system.visitable         [planeta, ...lunas]: los cuerpos a los que se puede ir
 *   system.profiles          id → perfil del motor (lo que antes era GameConfig.PLANETS)
 *   system.body(id), system.nameOf(id), system.isHome(id), system.isMoon(id)
 *
 * Mientras no haya viaje entre planetas, lo visitable es el primer planeta y sus lunas.
 */
export class SolarSystem {
  constructor(compiled) {
    Object.assign(this, compiled);
    this._byId = new Map(compiled.bodies.map((b) => [b.id, b]));
    this.profiles = Object.freeze(Object.fromEntries(compiled.bodies.map((b) => [b.id, b.profile])));
    this.home = this._byId.get(compiled.homeId);
    this.moons = compiled.bodies.filter((b) => b.parent === compiled.homeId);
    this.visitable = [this.home, ...this.moons];
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

  /** Teclas de rumbo en el espacio: 1 el planeta, 2… las lunas y la siguiente, el meteorito. */
  autopilotTargets() {
    const list = this.visitable.map((b) => ({ id: b.id, name: b.name }));
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

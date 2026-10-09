import { GameEvents } from '../../core/GameEvents.js';

/**
 * PlaceTracker — en qué lugar con nombre está el jugador (región del mapa diseñado,
 * cueva y sala de la cueva) y avisa cuando cambia: PLACE_CHANGED { name, kind, first }.
 * La primera vez que se pisa un lugar, la interfaz muestra su nombre en grande.
 * Recuerda los lugares descubiertos (snapshot/restore para la partida guardada).
 */
const CHECK = 0.5;
const SWITCH_TIME = 1.2; // s dentro de una región nueva antes de cambiar (fronteras)

export class PlaceTracker {
  constructor({ world, player, events }) {
    this.name = 'placeTracker';
    this._world = world;
    this._player = player;
    this._events = events;
    this._t = 0;
    this.current = null;
    this._pending = null;
    this._since = 0;
    this.discovered = new Set();
    events.on(GameEvents.BODY_CHANGED, () => (this.current = null));
  }

  update(dt) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = CHECK;
    const w = this._world;
    if (!w.getRegionAt || !w.map) return;
    const p = this._player.position;
    let place = null;
    const cave = w.caves?.placeAt?.(p.x, p.y + 0.5, p.z);
    if (cave?.cave && w.inCave?.(p.x, p.y + 1, p.z)) place = cave.room ? { name: cave.room, kind: 'room', parent: cave.cave } : { name: cave.cave, kind: 'cave' };
    else {
      const r = w.getRegionAt(p.x, p.z);
      if (r) place = { name: r.name, kind: 'region' };
    }
    if (!place) return;
    const key = place.name;
    if (this.current === key) {
      this._pending = null;
      return;
    }
    // Las regiones esperan un poco (no parpadea al andar por la frontera); cuevas y salas, no.
    if (place.kind === 'region' && this.current) {
      if (this._pending !== key) {
        this._pending = key;
        this._since = 0;
        return;
      }
      this._since += CHECK;
      if (this._since < SWITCH_TIME) return;
    }
    this._pending = null;
    this.current = key;
    const first = !this.discovered.has(key);
    this.discovered.add(key);
    // La sala de una cueva que aún no se ha anunciado: primero la cueva.
    if (place.kind === 'room' && !this.discovered.has(place.parent)) {
      this.discovered.add(place.parent);
      this._events.emit(GameEvents.PLACE_CHANGED, { name: place.parent, kind: 'cave', first: true });
    }
    this._events.emit(GameEvents.PLACE_CHANGED, { ...place, first });
  }

  snapshot() {
    return { discovered: [...this.discovered] };
  }

  restore(d) {
    this.discovered = new Set((d?.discovered ?? []).filter((n) => typeof n === 'string' && n.length < 80).slice(0, 500));
  }
}

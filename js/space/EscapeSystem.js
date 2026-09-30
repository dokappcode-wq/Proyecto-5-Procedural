import { GameEvents } from '../core/GameEvents.js';

/**
 * EscapeSystem — cápsulas de escape de la nave ampliada.
 *
 * Desde la nave (en el espacio o posada en un cuerpo) llevan al jugador a
 * MUNDO 0 o a una luna, siempre que esté lo bastante cerca (POD_RANGE_KM, de
 * superficie a superficie; las lunas orbitan, así que a veces sí y a veces no).
 * La cápsula aterriza junto a la zona de aterrizaje del destino y la IA trae la
 * nave detrás (aterriza sola), para no quedarse sin ella.
 *
 * Tras el salto galáctico fallido la única salida es la evacuación de emergencia
 * a MUNDO 0: al llegar termina la demo (DEMO_END).
 */
const NAMES = { MUNDO_0: 'MUNDO 0', MOON_A: 'Luna A', MOON_B: 'Luna B' };

export class EscapeSystem {
  constructor({ config, events, worlds, ship, travel, controller, input, getBodies }) {
    this.name = 'escape';
    this._cfg = config;
    this._events = events;
    this._worlds = worlds;
    this._ship = ship;
    this._travel = travel;
    this._controller = controller;
    this._input = input;
    this._getBodies = getBodies; // () → [{ id, name, radiusKm, position }]
    this.launching = null;
  }

  get podsLeft() {
    return Math.max(0, this._cfg.PODS - this._ship.podsUsed);
  }

  /** Destinos posibles desde donde está la nave: [{ id, name, distanceKm, reachable, reason }]. */
  destinations() {
    const bodies = this._getBodies();
    const ship = this._ship;
    const emergency = ship.crippled;
    let from = null;
    let fromRadius = 0;
    if (ship.body === 'SPACE') {
      from = this._travel.nav.pos;
    } else {
      const b = bodies.find((x) => x.id === ship.body);
      from = b?.position ?? { x: 0, y: 0, z: 0 };
      fromRadius = b?.radiusKm ?? 0;
    }
    return bodies
      .filter((b) => b.id !== ship.body)
      .map((b) => {
        const d = Math.hypot(b.position.x - from.x, b.position.y - from.y, b.position.z - from.z) - b.radiusKm - fromRadius;
        let reachable = d <= this._cfg.POD_RANGE_KM;
        let reason = reachable ? null : 'Demasiado lejos';
        if (emergency) {
          reachable = b.id === 'MUNDO_0';
          reason = reachable ? null : 'Sin energía: solo rumbo de emergencia a MUNDO 0';
        } else if (!this.podsLeft) {
          reachable = false;
          reason = 'No quedan cápsulas';
        }
        return { id: b.id, name: NAMES[b.id] ?? b.name, distanceKm: Math.max(0, d), reachable, reason };
      });
  }

  launch(target) {
    if (this.launching) return false;
    const dest = this.destinations().find((d) => d.id === target);
    if (!dest?.reachable) {
      this._msg(dest?.reason ?? 'Destino no válido', 'danger');
      return false;
    }
    if (this._ship.piloting) this._ship.exitPilot();
    this.launching = { target, t: 0, emergency: this._ship.crippled };
    this._input.setBlocked('pod', true);
    this._events.emit(GameEvents.ESCAPE_POD_LAUNCH, { target, name: dest.name, emergency: this.launching.emergency, time: this._cfg.LAUNCH_TIME });
    return true;
  }

  update(dt) {
    if (!this.launching) return;
    this.launching.t += dt;
    if (this.launching.t >= this._cfg.LAUNCH_TIME) this._arrive();
  }

  _arrive() {
    const { target, emergency } = this.launching;
    this.launching = null;
    if (this._travel.state !== 'SURFACE') this._travel.abandonShip(target);
    else this._worlds.setActive(target);
    // La cápsula se posa a un lado de la zona de aterrizaje del destino.
    const world = this._worlds.get(target);
    const site = world.getLandingSite() ?? world.getSpawnPoint();
    const yaw = site.yaw ?? 0;
    this._controller.placeAt(site.x + Math.cos(yaw) * 22, site.z - Math.sin(yaw) * 22);
    if (!emergency) this._ship.podsUsed++;
    this._input.setBlocked('pod', false);
    this._events.emit(GameEvents.ESCAPE_POD_ARRIVED, { target, emergency });
    if (!emergency) {
      this._ship.relocateTo(target); // la IA trae la nave detrás
      this._msg(`Cápsula en ${NAMES[target]}. La nave ha llegado detrás y está en la zona de aterrizaje.`, 'biome');
    }
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}

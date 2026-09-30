import { GameEvents } from '../core/GameEvents.js';
import { withPrep } from '../systemdata/SolarSystem.js';

/**
 * ShipAI — la IA de a bordo que vive en el nodo de IA de la nave.
 *
 * - Tiene el nombre que le ponga el jugador (se recuerda en este navegador).
 * - Responde a temas (answer): el planeta, las lunas, el sistema, el estado de la
 *   nave, el soporte vital, dónde estamos y qué hacer ahora. Todo sale de datos
 *   vivos (configuración de los cuerpos, catálogo celeste, telemetría).
 * - Avisa por su cuenta de lo importante: batería baja, llegada a un cuerpo,
 *   salida al espacio, descompresión, límite del sistema, falta de aire…
 *
 * Emite AI_SAY { name, text, type } y guarda un historial corto para el panel.
 */
const DEFAULT_NAME = 'NOVA';
const STORAGE_KEY = 'mundo0.aiName';

export const AI_TOPICS = [
  { id: 'PLANET', label: '🌍 El planeta' },
  { id: 'MOONS', label: '🌗 Las lunas' },
  { id: 'SYSTEM', label: '🪐 El sistema' },
  { id: 'SHIP', label: '🚀 Estado de la nave' },
  { id: 'LIFE', label: '🫁 Soporte vital' },
  { id: 'HERE', label: '📍 ¿Dónde estamos?' },
  { id: 'ADVICE', label: '💡 ¿Qué hago ahora?' },
];

export class ShipAI {
  constructor({ events, system, sources, storage = safeStorage() }) {
    this.name = 'shipAI';
    this._events = events;
    this._system = system;
    this._src = sources; // { ship, lifeSupport, worlds, getCatalog, pickups, travel }
    this._storage = storage;
    this.aiName = sanitize(storage.get(STORAGE_KEY)) || DEFAULT_NAME;
    this.named = !!storage.get(STORAGE_KEY);
    this.log = [];
    this._cooldowns = {};
    this._flags = {};
    this._greetTimer = null;
    this._listen();
  }

  get systemName() {
    return this._system?.name ?? '';
  }

  get online() {
    return Object.values(this._src.ship.installed ?? {}).includes('AI_NODE');
  }

  setName(name) {
    const n = sanitize(name);
    if (!n) return false;
    const old = this.aiName;
    this.aiName = n;
    this.named = true;
    this._storage.set(STORAGE_KEY, n);
    this.say(old === n ? `Sigo siendo ${n}.` : `Entendido. A partir de ahora me llamo ${n}.`, 'ai');
    return true;
  }

  /** Mensaje de la IA (a la UI y al historial). */
  say(text, type = 'ai') {
    if (!this.online) return;
    this.log.push({ text, type });
    if (this.log.length > 40) this.log.shift();
    this._events.emit(GameEvents.AI_SAY, { name: this.aiName, text, type });
  }

  /** Respuesta a un tema del panel (varias líneas). */
  answer(topic) {
    const lines = this._answer(topic);
    for (const l of lines) this.say(l, 'ai');
    return lines;
  }

  _answer(topic) {
    const { ship, lifeSupport, worlds } = this._src;
    const sys = this._system;
    const home = sys.home.profile;
    const homeName = sys.home.name;
    const catalog = this._src.getCatalog?.();
    const km = (v) => `${Math.round(v).toLocaleString('es-ES')} km`;
    switch (topic) {
      case 'PLANET': {
        const d = home.DATA;
        return [`${homeName}.`, d.LIFE, d.ATMOSPHERE, d.SURFACE, d.MOONS].filter(Boolean);
      }
      case 'MOONS': {
        const out = [];
        if (!sys.moons.length) return [`${homeName} no tiene lunas.`];
        for (const { id } of sys.moons) {
          const p = sys.profiles[id];
          const b = catalog?.bodies.find((x) => x.id === id);
          const orbit = b ? ` Radio ${km(b.radiusKm)}, a ${km(b.distanceKm)} ${withPrep('de', homeName)}, órbita de ${Math.round(b.periodHours)} h.` : '';
          out.push(`${p.NAME}: ${p.DATA?.SURFACE ?? ''}${orbit}`);
          if (p.DATA?.LIFE) out.push(`${p.NAME}: ${p.DATA.LIFE}`);
        }
        return out;
      }
      case 'SYSTEM': {
        const n = sys.moons.length;
        const lunas = n === 1 ? 'una luna' : `${n} lunas`;
        const breathable = sys.visitable.filter((b) => b.profile.BREATHABLE).map((b) => withPrep('', b.name));
        return [
          `${sys.name}: ${withPrep('', homeName)}${n ? ` y ${lunas}` : ''}, alrededor de la estrella ${sys.star.name}.`,
          breathable.length
            ? `Con aire respirable: ${breathable.join(', ')}. El resto necesita traje.`
            : 'Ningún cuerpo tiene aire respirable: siempre con traje.',
          ship.hasSpaceNode
            ? 'Con el nodo espacial podemos viajar entre ellos. Más allá del sistema no hay ruta conocida…'
            : `Para salir al espacio necesitamos un nodo espacial: hay una señal ${withPrep('en', homeName)}.`,
        ];
      }
      case 'SHIP': {
        const t = ship.getTelemetry();
        const states = { LANDED: 'aterrizada', TAKING_OFF: 'despegando', FLYING: 'en vuelo', LANDING: 'aterrizando', SPACE: 'en el espacio' };
        const out = [
          `${ship.isExplorer ? 'Nave ampliada con nodo espacial' : 'Nave pequeña'} · ${states[t.flight] ?? t.flight} · batería ${pct(t.charge)}.`,
          `Compuerta ${t.hatch === 'OPEN' ? 'abierta' : 'cerrada'} · patas ${t.legs === 'DEPLOYED' ? 'fuera' : 'recogidas'}${t.altitude > 1 ? ` · altitud ${Math.round(t.altitude)} m` : ''}.`,
        ];
        if (ship.isExplorer) {
          const air = { PRESSURIZED: 'presurizada', DEPRESSURIZED: 'vacía (sin aire)', CYCLING: 'cambiando de presión' };
          out.push(`Cámara de descompresión ${air[t.airlock] ?? t.airlock}.`);
        }
        if (t.charge < 0.25) out.push('Recomiendo cambiar baterías en el puesto de carga cuanto antes.');
        return out;
      }
      case 'LIFE': {
        const s = lifeSupport.getState();
        const out = [s.breathable ? 'Aquí hay aire respirable.' : 'Aquí NO hay aire respirable.'];
        if (s.wearing) out.push(`Traje puesto: oxígeno ${pct(s.oxygen)}, batería ${pct(s.battery)}${s.powered ? '' : ' (APAGADO)'}.`);
        else out.push('No llevas el traje espacial: está en la taquilla del laboratorio (nave ampliada).');
        if (s.lungs < 1) out.push(`Aire en los pulmones: ${pct(s.lungs)}.`);
        return out;
      }
      case 'HERE': {
        const id = worlds.activeId;
        if (id === 'SPACE') {
          const nav = this._src.travel?.nav;
          const bodies = nav?.survey().bodies ?? [];
          return [`Estamos en el espacio, en el ${sys.name}.`, ...bodies.map((b) => `${b.name}: a ${km(Math.max(0, b.altitude))}.`)];
        }
        const p = worlds.profile(id);
        return [`Estamos ${withPrep('en', p?.NAME ?? id)}.`, p?.DATA?.ATMOSPHERE, p?.DATA?.SURFACE].filter(Boolean);
      }
      case 'ADVICE':
      default:
        return [this._advice()];
    }
  }

  _advice() {
    const { ship, lifeSupport, worlds, pickups } = this._src;
    const sys = this._system;
    const homeName = sys.home.name;
    const node = pickups?.get('SPACE_NODE');
    if (!ship.hasSpaceNode) {
      if (node && !node.taken) return `Hay una señal ${withPrep('en', homeName)}: es un nodo espacial. Usa el mapa de la señal y busca el haz de luz azul.`;
      return 'Llevas el nodo espacial: instálalo en una ranura libre de la nave (E sobre la ranura).';
    }
    if (ship.crippled) return `La nave está inutilizada. Ve a la sala de cápsulas de escape y evacúa ${withPrep('a', homeName)}.`;
    if (this._src.travel?.galacticNode) return `Con el nodo galáctico instalado, sal del sistema: más allá de ${this._zoneKm()} ${withPrep('de', homeName)} (Shift = impulso).`;
    const gnode = pickups?.get('GALACTIC_NODE');
    if (gnode && !gnode.taken) return `La señal galáctica está ${withPrep('en', worlds.profile(gnode.body)?.NAME ?? 'una luna')} (haz violeta, en el mapa).`;
    if (ship.batteries.ratio < 0.3) return 'La batería de la nave está baja: cambia baterías en el puesto de carga antes de volar lejos.';
    const keys = sys.autopilotTargets().filter((t) => t.id !== 'METEOR').map((t) => t.key);
    if (sys.isHome(worlds.activeId)) {
      return `Todo listo para el espacio: a los mandos, despega, sube por encima de 60 m y pulsa O.${keys.length > 1 ? ` Luego ${listOr(keys.slice(1))} fija rumbo a una luna.` : ''}`;
    }
    if (worlds.activeId === 'SPACE') return `Elige destino con ${listOr(keys)} y acelera con W. Cuando estés cerca, T para aterrizar.`;
    if (!lifeSupport.wearing) return 'Antes de salir, ponte el traje en la taquilla del laboratorio y descomprime la cámara con su panel.';
    const chest = pickups?.get('MOON_CHEST');
    if (chest && !chest.taken) return 'Hay un cofre de suministros junto a la zona de aterrizaje (haz amarillo): trae una burbuja de oxígeno.';
    return 'Despliega la burbuja de oxígeno y ponle una batería: dentro podrás respirar y construir estaciones.';
  }

  _zoneKm() {
    return `${(this._src.travel?.zoneRadiusKm ?? 65000).toLocaleString('es-ES')} km`;
  }

  // ---- Avisos automáticos ------------------------------------------------------------

  _listen() {
    const ev = this._events;
    const G = GameEvents;
    ev.on(G.GAME_STARTED, () => (this._greetTimer = 4));
    ev.on(G.SHIP_BATTERIES_CHANGED, ({ total, capacity }) => {
      const r = capacity > 0 ? total / capacity : 1;
      if (r > 0.6) this._flags.bat = 1;
      for (const [lvl, text] of [[0.5, 'Batería de la nave al 50 %.'], [0.25, 'Batería de la nave al 25 %: conviene cambiar baterías.'], [0.1, '¡Batería de la nave crítica (10 %)! Aterriza pronto.']]) {
        if (r <= lvl && (this._flags.bat ?? 1) > lvl) {
          this._flags.bat = lvl;
          this.say(text, lvl <= 0.25 ? 'ai-warn' : 'ai');
        }
      }
    });
    ev.on(G.SHIP_UPGRADED, () => this.say('Nodo espacial integrado. Nuevas salas: mandos, estar, laboratorio y máquinas, cápsulas de escape y cámara de descompresión. Ya podemos salir al espacio.'));
    ev.on(G.PICKUP_TAKEN, ({ id }) => {
      if (id === 'SPACE_NODE') this.say('Señal recuperada: es un nodo espacial en buen estado. Instálalo en una ranura libre de la nave.');
      if (id === 'MOON_CHEST') this.say('Suministros recogidos. La burbuja de oxígeno necesita una batería plank para funcionar.');
    });
    ev.on(G.SPACE_STATE_CHANGED, ({ state, previous }) => {
      if (state === 'SPACE' && previous === 'ASCENDING') {
        const keys = this._system.autopilotTargets().filter((t) => t.id !== 'METEOR').map((t) => `${t.key} (${t.name})`);
        this.say(`Fuera de la atmósfera. Fija rumbo con ${listOr(keys)}.`);
      }
    });
    ev.on(G.BODY_CHANGED, ({ id, previous, planet }) => {
      const sys = this._system;
      if (planet?.KIND === 'MOON') this.say(`Llegada ${withPrep('a', planet.NAME)}. ${planet.DATA?.SURFACE ?? ''} ${planet.DATA?.ATMOSPHERE ?? ''}`.trim(), 'ai-warn');
      else if (sys.isHome(id) && previous && !sys.isHome(previous)) this.say(`De vuelta ${withPrep('en', planet?.NAME ?? sys.home.name)}. ${planet?.DATA?.ATMOSPHERE ?? ''}`.trim());
    });
    ev.on(G.METEOR_SPAWNED, ({ distanceKm }) => {
      if (this._src.ship.crippled) return;
      const key = this._system.autopilotTargets().find((t) => t.id === 'METEOR').key;
      this.say(`Meteorito detectado a ${Math.round(distanceKm)} km, con cristales minerales. Pulsa ${key} a los mandos para acercarnos (no se puede aterrizar: habrá que bajar con el traje).`);
    });
    ev.on(G.SHIP_DECOMPRESSION, ({ ejected }) => {
      this.say(ejected ? '¡Descompresión explosiva! La cámara no estaba vacía antes de abrir la compuerta.' : 'Pérdida de presión en la cámara de descompresión.', 'ai-warn');
    });
    ev.on(G.SPACE_NAV_UPDATE, ({ zoneWarning }) => {
      if (zoneWarning && !this._flags.zone) this.say(`Advertencia: nos alejamos del ${this._system.name}.`, 'ai-warn');
      this._flags.zone = !!zoneWarning;
    });
    ev.on(G.LIFE_SUPPORT_CHANGED, (s) => {
      if (s.breathable || (s.powered && s.oxygen > 0)) {
        this._flags.noAir = false;
        return;
      }
      if (!this._flags.noAir && s.lungs < 0.8) {
        this._flags.noAir = true;
        this.say(s.wearing ? 'Tu traje no da oxígeno: vuelve a la nave o a una burbuja.' : 'No hay aire aquí y no llevas traje. Vuelve adentro.', 'ai-warn');
      }
    });
  }

  update(dt) {
    if (this._greetTimer === null) return;
    this._greetTimer -= dt;
    if (this._greetTimer > 0) return;
    this._greetTimer = null;
    this.say(this.named
      ? `Hola de nuevo. Soy ${this.aiName}, la IA de la nave. Háblame en la sala de controles (E sobre el nodo de IA).`
      : `Hola, soy la IA de la nave. Ponme un nombre en la sala de controles (E sobre el nodo de IA). De momento, llámame ${this.aiName}.`);
  }
}

const pct = (r) => `${Math.round(r * 100)} %`;
const listOr = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}`);

function sanitize(name) {
  return String(name ?? '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}

function safeStorage() {
  return {
    get(k) {
      try {
        return globalThis.localStorage?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        globalThis.localStorage?.setItem(k, v);
      } catch {
        /* sin almacenamiento: el nombre dura esta sesión */
      }
    },
  };
}

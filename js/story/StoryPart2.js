import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { toWorld as toShipWorld } from '../ship/ShipLayout.js';
import { buildResearchCenter } from './ResearchCenter.js';
import { buildDungeon } from './Dungeon.js';
import { BossLogic, BossView, BOSS } from './BossGolem.js';

/**
 * StoryPart2 — la segunda parte de la historia del Edén (sigue a StorySystem):
 *
 *   SHIP     tras el escáner de 24 h, Nova encuentra la nave y da el mapa. Al llegar, Nova
 *            entra y se conecta a su panel: dos propulsores destruidos, la placa de
 *            navegación frita y sin pilas mini-plack. Da la receta de la mesa de elaboración
 *            y marca el centro de investigación.
 *   LAB      la puerta del centro tiene contraseña: Nova la mete por el reloj. Dentro:
 *            laboratorio, dormitorio, taller (con una mesa de elaboración montada) y el búnker.
 *   DUNGEON  la trampilla del búnker baja a una cueva: cuesta, construcciones abandonadas
 *            y seis gólems; al fondo, la sala de las cascadas y el «Cofre N» (4 baterías).
 *   BOSS     al abrirlo caen rocas que tapan la salida y se levanta el gólem gigante.
 *   REPAIR   derrotado, se desploma, se abre el paso y deja 2 propulsores.
 *   ESCAPE   en la nave: propulsores, placa de navegación, baterías y nodo espacial →
 *            arreglada. Al salir al espacio: fin de la demo (y se puede seguir jugando).
 */
export const SHIP_DAMAGE = 'Dos propulsores destruidos y la placa de navegación frita: así no despega. (Hay que repararla en la parte de atrás.)';

export class StoryPart2 {
  constructor({ story, events, worlds, homeId, ship, shipAI, inventory, crafting, enemies, pickups, colliders, player, hotbar, health, creatures, installSpaceNode, items }) {
    Object.assign(this, { story, events, worlds, homeId, ship, shipAI, inventory, crafting, enemies, pickups, colliders, player, hotbar, health, items });
    this._installSpaceNode = installSpaceNode;
    this._t = 0;
    this.built = null;
    this.boss = null;
    this.bossActive = false;
    this._barrierK = 0;
    this._barrierT = 0;
    this._falling = [];
    this._hintT = 0;
    // El gólem gigante se golpea como cualquier criatura (su ojo y su cuerpo).
    creatures?.push({
      getAnimalsNear: (x, z, r) => this._bossTargets(x, z, r),
      hitAnimal: (t, damage) => this._hitBoss(t, damage),
    });
    events.on(GameEvents.WORLD_GENERATED, () => this._build());
    events.on(GameEvents.PLAYER_DIED, () => this._onDeath());
    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => {
      if (state === 'SPACE' && this.s.stage === 'ESCAPE') this._demoEnd();
    });
  }

  get s() {
    return this.story.state;
  }

  get _w() {
    return this.worlds.get(this.homeId);
  }

  _msg(text, type = 'info') {
    this.events.emit(GameEvents.UI_MESSAGE, { text, type });
  }

  _say(text, type = 'ai') {
    this._msg(`🤖 ${this.s.watchName}: ${text}`, type);
  }

  // ---- Partida nueva / cargada ----------------------------------------------------------

  /** Al empezar la campaña: la nave está averiada y sin baterías. */
  onNewGame() {
    this.ship.damaged = SHIP_DAMAGE;
    this.ship.batteries.slots = this.ship.batteries.slots.map(() => null);
  }

  onRestore() {
    const s = this.s;
    this.ship.damaged = s.shipRepaired ? null : SHIP_DAMAGE;
    if (s.diagnosed) this.crafting.unlock('WORKBENCH');
    if (s.novaDocked && !Object.values(this.ship.installed ?? {}).includes('AI_NODE')) this.ship.installTech('CONTROL_1', 'AI_NODE');
    // A mitad de la pelea: se retoma desde que se entra en la sala.
    if (s.stage === 'BOSS' && !s.bossDefeated) this._resetBoss();
    if (s.labOpened) this._openDoorNow();
    this._applySmoke();
  }

  // ---- Mundo ------------------------------------------------------------------------

  _build() {
    this._dispose();
    if (!this.story.enabled) return;
    const w = this._w;
    const root = this.worlds.rootOf(this.homeId);
    const b = (this.built = { root: new THREE.Group() });
    b.root.name = 'StoryPart2';
    root.add(b.root);
    const onHome = () => this.worlds.activeId === this.homeId;
    // Centro de investigación.
    const site = w.getSites('RESEARCH_CENTER')[0];
    if (site) {
      const lab = buildResearchCenter(site, w.getHeightAt(site.x, site.z), { textColor: '#6fe0ff' });
      b.root.add(lab.group);
      this.colliders.add('lab', lab.prims, { enabled: onHome });
      this.colliders.add('labDoor', [lab.doorPrim], { enabled: () => onHome() && !this.s.labOpened });
      b.lab = { ...lab, site };
    }
    // Mazmorra.
    const cave = w.caves?.dungeon;
    if (cave) {
      const d = buildDungeon(cave, this.items);
      b.root.add(d.group);
      this.colliders.add('barrier', [d.barrier.prim], { enabled: () => onHome() && this._barrierK > 0.5 });
      b.dungeon = { ...d, cave };
      // Seis gólems dormidos en las cámaras (despiertan al acercarse).
      const golems = this.enemies.storyGolems('dungeon', d.golemSpots, { leash: 22 });
      for (const g of golems) g.locked = false;
      // El gólem gigante.
      const a = d.arena;
      const bx = a.center.x + a.dir.x * a.len * 0.15;
      const bz = a.center.z + a.dir.z * a.len * 0.15;
      this.boss = new BossLogic({ x: bx, y: a.floor, z: bz, heading: Math.atan2(-a.dir.x, -a.dir.z) });
      this.bossView = new BossView(b.root, this.boss);
      this.colliders.add('boss', [{ x: bx, z: bz, r: 2.2, y0: a.floor - 1, y1: a.floor + 7, wall: true }], { enabled: () => onHome() && this.boss.state !== 'DORMANT' && !(this.boss.state === 'DEAD' && this.boss.death > 0.6) });
      this._stoneRng = new SeededRandom(deriveSeed(w.seed.value, 'bossStones'));
    }
    // Humo de los propulsores rotos de la nave.
    b.smoke = [0, 1].map(() => new Smoke(b.root));
    this._applySmoke();
  }

  _dispose() {
    if (!this.built) return;
    this.built.root.parent?.remove(this.built.root);
    for (const id of ['lab', 'labDoor', 'barrier', 'boss']) this.colliders.remove(id);
    this.built = null;
    this.boss = null;
    this.bossView = null;
  }

  _applySmoke() {
    for (const sm of this.built?.smoke ?? []) sm.active = !this.s.shipRepaired;
  }

  // ---- Objetivo, brújula, Nova ---------------------------------------------------------

  objective() {
    const s = this.s;
    switch (s.stage) {
      case 'SHIP': return 'Ve a la nave: en lo alto de las Montañas Heladas (sigue la brújula)';
      case 'LAB': return s.labOpened ? 'Explora el centro de investigación: el búnker baja a una cueva' : 'Ve al centro de investigación (sigue la brújula) y deja que Nova abra la puerta';
      case 'DUNGEON': return 'Baja por la cueva del búnker hasta el fondo (lleva antorchas)';
      case 'BOSS':
        return this.bossActive ? `¡Dispara al ojo azul del gólem gigante! (${Math.ceil(this.boss.health)}/${BOSS.HEALTH})` : 'Vuelve a la sala de las cascadas';
      case 'REPAIR': return `Repara la nave: ${this._requirements().text}`;
      case 'ESCAPE': return 'A los mandos: despega (T), sube y sal al espacio (O)';
      default: return '';
    }
  }

  markers() {
    const s = this.s;
    const out = [];
    const ship = this.ship.ship;
    const st = s.stage;
    if (['SHIP', 'REPAIR', 'ESCAPE'].includes(st) || (st === 'LAB' && !s.labOpened)) out.push({ id: 'ship', icon: '🚀', x: ship.x, z: ship.z, label: 'Nave' });
    if ((st === 'LAB' || st === 'DUNGEON') && this.built?.lab) out.push({ id: 'lab', icon: '🏢', x: this.built.lab.site.x, z: this.built.lab.site.z, label: 'Centro de investigación' });
    if ((st === 'DUNGEON' || st === 'BOSS') && this.built?.dungeon) {
      const a = this.built.dungeon.arena.center;
      out.push({ id: 'arena', icon: '💧', x: a.x, z: a.z, label: 'Sala de las cascadas' });
    }
    return out;
  }

  novaDocked() {
    return !!this.s.novaDocked;
  }

  novaBusy() {
    return !!this._novaGo;
  }

  remarks() {
    return ['Sigo conectada a tu reloj. Te oigo bien.', 'Esa cueva no me gusta nada.', 'Los propulsores primero, luego la placa. Y las baterías.'];
  }

  // ---- 1. La nave ------------------------------------------------------------------------

  onScanDone() {
    const s = this.s;
    if (s.stage !== 'SCAN') return;
    s.stage = 'SHIP';
    s.shipLocated = true;
    this.story._faceFor('HAPPY', 6);
    this.inventory.addItem('NODE_MAP', 1);
    this._say('¡La tengo! La nave está en lo alto de las Montañas Heladas. Te paso el mapa (📜, úsalo) y la marco en la brújula. Abrígate: allí arriba hace mucho frío.', 'pickup');
    this.story._autosave('la nave localizada');
  }

  _arriveShip() {
    const s = this.s;
    const story = this.story;
    const ship = this.ship.ship;
    s.shipReached = true;
    story._autosave('la nave');
    const nova = story.nova;
    const look = new THREE.Vector3(ship.x, ship.y + 3, ship.z);
    const cam = new THREE.Vector3();
    let a = Math.atan2(this.player.position.x - ship.x, this.player.position.z - ship.z);
    story._lock(true);
    story._ui.letterbox(true, 'La nave… o lo que queda de ella');
    const [dx, dz] = toShipWorld(ship, 0, -4);
    const panel = new THREE.Vector3(dx, ship.y + 3.6, dz);
    const [hx, hz] = toShipWorld(ship, 0, 9);
    const hatch = new THREE.Vector3(hx, ship.y + 2.5, hz);
    this._novaGo = true;
    story._sequence([
      { at: 0.5, run: () => this._say('Ahí está. Uf… peor de lo que pensaba. Voy a entrar a conectarme a su panel.') },
      { at: 2.0, run: () => nova && (nova.target.copy(hatch), nova.setFace('WORRIED')) },
      { at: 4.0, run: () => nova && nova.target.copy(panel) },
    ], {
      duration: 6.5,
      tick: (dt) => {
        a += dt * 0.25;
        cam.set(ship.x + Math.sin(a) * 20, ship.y + 8, ship.z + Math.cos(a) * 20);
        cam.y = Math.max(cam.y, this._w.getHeightAt(cam.x, cam.z) + 3); // que no se meta en la montaña
        story._cam.setCinematic(() => ({ pos: cam, look }), { speed: 3 });
        if (nova) nova.lookAt = nova.target.clone().add(new THREE.Vector3(0, 0, 0.1));
      },
      done: () => {
        this._novaGo = false;
        s.novaDocked = true;
        nova?.setVisible(false);
        if (!Object.values(this.ship.installed ?? {}).includes('AI_NODE')) this.ship.installTech('CONTROL_1', 'AI_NODE');
        story._cam.setCinematic(null, { speed: 2.5 });
        story._ui.letterbox(false);
        this._diagnosis();
      },
    });
  }

  _diagnosis() {
    const s = this.s;
    const N = `🤖 ${s.watchName} (nave)`;
    const color = 'var(--watch-color)';
    this.story._ui.dialog([
      { speaker: N, color, text: 'Conectada al panel. Diagnóstico completo… no es bonito.' },
      { speaker: N, color, text: 'Los dos propulsores están destruidos. La placa madre de navegación, frita. Y no quedan pilas mini-plack: la batería está vacía.' },
      { speaker: N, color, text: 'La placa de navegación se puede fabricar en una mesa de elaboración: te paso la receta de la mesa (5 hierro y 5 cobre refinados). La placa necesita cristal, hierro y cobre.' },
      { speaker: N, color, text: 'Los propulsores y las pilas… En la base de datos aparece un centro de investigación cerca de aquí. Te lo marco. Allí había repuestos y una mesa ya montada.' },
      { speaker: N, color, text: 'Yo me quedo en la nave. Te hablo por el reloj. ¡Suerte!' },
    ], () => {
      s.diagnosed = true;
      s.stage = 'LAB';
      this.crafting.unlock('WORKBENCH');
      this.story._lock(false);
      this._msg('📘 Receta nueva: Mesa de elaboración (Tab → Estaciones). 🏢 Centro de investigación marcado en la brújula.', 'pickup');
      this.story._autosave('diagnóstico de la nave');
    });
  }

  /** Lo que falta para reparar la nave. */
  _requirements() {
    const inv = this.inventory;
    const thr = Math.min(2, inv.getItemCount('THRUSTER'));
    const plate = Math.min(1, inv.getItemCount('NAV_PLATE'));
    const installed = this.ship.batteries.slots.filter((b) => b && b.charge > 0).length;
    const bat = Math.min(4, installed + inv.getItemCount('PLANK_BATTERY_SMALL'));
    const node = this.ship.isExplorer || inv.getItemCount('SPACE_NODE') > 0 ? 1 : 0;
    const ok = thr >= 2 && plate >= 1 && bat >= 4 && node >= 1;
    return { ok, text: `🔥 propulsores ${thr}/2 · 🧭 placa de navegación ${plate}/1 · 🔋 baterías ${bat}/4 · 🔷 nodo espacial ${node}/1`, thr, plate, bat, node };
  }

  _repair() {
    const r = this._requirements();
    if (!r.ok) {
      this._msg(`🔧 Aún falta: ${r.text}`, 'warning');
      return;
    }
    const inv = this.inventory;
    inv.removeItem('THRUSTER', 2);
    inv.removeItem('NAV_PLATE', 1);
    const bank = this.ship.batteries;
    for (let i = 0; i < bank.slots.length; i++) {
      if (bank.slots[i] && bank.slots[i].charge > 0) continue;
      if (!inv.hasItem('PLANK_BATTERY_SMALL', 1)) break;
      inv.removeItem('PLANK_BATTERY_SMALL', 1);
      bank.slots[i] = null;
      bank.insert(i, 'PLANK_BATTERY_SMALL');
    }
    if (!this.ship.isExplorer && inv.hasItem('SPACE_NODE', 1)) this._installSpaceNode?.();
    this.ship.damaged = null;
    this.s.shipRepaired = true;
    this.s.stage = 'ESCAPE';
    this._applySmoke();
    this._say('¡Propulsores montados, placa de navegación en línea, baterías cargadas y nodo espacial integrado! La nave está lista. A los mandos: despega con T, sube y pulsa O para salir al espacio.', 'pickup');
    this.story._autosave('la nave reparada');
  }

  _demoEnd() {
    const s = this.s;
    if (s.demoEnded) return;
    s.demoEnded = true;
    s.stage = 'POSTGAME';
    this.story._autosave('fin de la demo');
    setTimeout(() => this.story._ui.endScreen({
      title: '🚀 Fin de la demo',
      lines: [
        `Has escapado del Edén con ${s.watchName}. La nave Sample vuelve a volar.`,
        'Gracias por jugar a Mundo Cero.',
        'Puedes seguir jugando: el planeta, sus cuevas, los goblins y el espacio siguen ahí.',
      ],
      button: 'Seguir explorando',
    }, () => this._msg('🌌 Post-juego: todo sigue donde lo dejaste.', 'info')), 2500);
  }

  // ---- 2. El centro de investigación -----------------------------------------------------

  _keypad() {
    const s = this.s;
    const lab = this.built.lab;
    if (s.labOpened) return;
    if (!s.diagnosed) {
      lab.drawKeypad('ERR');
      this._msg('🔒 La puerta pide una contraseña. Alguien con acceso a la base de datos podría saberla…', 'warning');
      return;
    }
    this.story._autosave('el centro de investigación');
    this.story._lock(true);
    this._say('Conectando con la puerta a través de tu reloj… contraseña…');
    const code = '7319';
    const col = getComputedStyle(document.documentElement).getPropertyValue('--watch-color').trim() || '#4fb6ff';
    this.story._sequence(
      [...code].map((_, i) => ({ at: 0.6 + i * 0.5, run: () => lab.drawKeypad(code.slice(0, i + 1).padEnd(4, '·'), col) })).concat([
        { at: 2.9, run: () => lab.drawKeypad('OK', '#5fe08a') },
      ]),
      {
        duration: 4.4,
        tick: (dt, t) => {
          if (t > 3.0) lab.door.position.y = Math.min(lab.door.position.y + dt * 1.8, 4.2);
        },
        done: () => {
          s.labOpened = true;
          this.story._lock(false);
          this._say('¡Abierta! Busca piezas. Y ten cuidado: esto lleva años abandonado.', 'pickup');
        },
      },
    );
  }

  _openDoorNow() {
    if (!this.built?.lab) return;
    this.built.lab.door.position.y = 4.2;
    this.built.lab.drawKeypad('OK', '#5fe08a');
  }

  // ---- 3. La mazmorra, el cofre N y el gólem gigante -------------------------------------

  _inDungeon() {
    const p = this.player.position;
    const f = this._w?.caveFloorAt?.(p.x, p.z, p.y);
    return !!f && f.cave === this.built?.dungeon?.cave;
  }

  _inArena() {
    const d = this.built?.dungeon;
    if (!d) return false;
    const p = this.player.position;
    const a = d.arena;
    const rel = { x: p.x - a.center.x, z: p.z - a.center.z };
    const along = rel.x * a.dir.x + rel.z * a.dir.z;
    const across = rel.x * a.side.x + rel.z * a.side.z;
    return Math.abs(along) < a.len / 2 + 3 && Math.abs(across) < a.radius * 0.75 && Math.abs(p.y - a.floor) < 4;
  }

  _openChest() {
    const s = this.s;
    if (s.chestOpened) return;
    this.story._autosave('el cofre N');
    s.chestOpened = true;
    this.inventory.addItem('PLANK_BATTERY_SMALL', 4);
    this._msg('📦 Cofre N: ¡4 pilas mini-plack (baterías plank pequeñas)!', 'pickup');
    s.stage = 'BOSS';
    this._startBoss();
  }

  _startBoss() {
    const d = this.built.dungeon;
    const story = this.story;
    this.bossActive = true;
    this._barrierT = 0;
    this._barrierGoal = 1;
    story._lock(true);
    story._ui.letterbox(true, '¡Las rocas tapan la salida!');
    const g = d.barrier.at;
    const camPos = new THREE.Vector3(g.x + d.arena.dir.x * 9, g.y + 4, g.z + d.arena.dir.z * 9);
    const lookGate = new THREE.Vector3(g.x, g.y + 2, g.z);
    const c = d.arena.center;
    const camBoss = new THREE.Vector3(c.x - d.arena.dir.x * 16, c.y + 6, c.z - d.arena.dir.z * 16);
    const lookBoss = new THREE.Vector3(this.boss.x, c.y + 4.5, this.boss.z);
    story._cam.setCinematic(() => ({ pos: camPos, look: lookGate }), { speed: 4 });
    story._sequence([
      { at: 2.6, run: () => {
        story._ui.caption('El gólem gigante');
        this.boss.start();
        story._cam.setCinematic(() => ({ pos: camBoss, look: lookBoss }), { speed: 2 });
      } },
    ], {
      duration: 8,
      done: () => {
        story._cam.setCinematic(null, { speed: 2.5 });
        story._ui.letterbox(false);
        story._lock(false);
        if (!this.s.slingTaken) this._msg('🎯 ¡Dispárale al ojo azul! Junto a la entrada de la sala hay un tirachinas en el suelo; cada golpe suyo hace caer piedras.', 'warning');
        else this._msg('🎯 ¡Dispárale al ojo azul!', 'warning');
      },
    });
  }

  _bossTargets(x, z, r) {
    const B = this.boss;
    if (!B || !this.bossActive || !B.fighting) return [];
    const e = B.eye;
    const out = [];
    const eye = { id: 'bossEye', x: e.x, y: e.y - 0.8, z: e.z, aimY: e.y, aimRadius: BOSS.EYE_RADIUS, reach: 0.5, scale: 1, def: { NAME: 'Ojo del gólem gigante' }, health: B.health, maxHealth: B.maxHealth, boss: 'eye' };
    const body = { id: 'bossBody', x: B.x, y: B.y, z: B.z, aimY: B.y + 3, aimRadius: 2.0, reach: 1.6, scale: 1, def: { NAME: 'Gólem gigante', HEIGHT: 6.4 }, health: B.health, maxHealth: B.maxHealth, boss: 'body' };
    if (Math.hypot(e.x - x, e.z - z) <= r + 2) out.push(eye);
    if (Math.hypot(B.x - x, B.z - z) <= r + 3) out.push(body);
    return out;
  }

  _hitBoss(t, damage) {
    const B = this.boss;
    if (t.boss === 'eye') {
      const res = B.hitEye(damage);
      if (!res.ok) this._hint('🛡️ ¡Se tapa el ojo con la mano! Espera a que lo destape (y esquiva el manotazo).');
      for (const ev of res.events) this._bossEvent(ev);
    } else {
      this.events.emit(GameEvents.PLAYER_ACTION, { kind: 'hit' });
      this._hint('🪨 Su cuerpo es de roca. ¡Dispara al ojo azul! (arco o tirachinas)');
    }
    return { killed: false, drops: null };
  }

  _hint(text) {
    if (this._hintT > 0) return;
    this._hintT = 4;
    this._msg(text, 'warning');
  }

  _bossEvent(ev) {
    const B = this.boss;
    const d = this.built.dungeon;
    const a = d.arena;
    switch (ev.type) {
      case 'slam':
        this._dropStones();
        if (!this._slamHint) {
          this._slamHint = true;
          this._msg('🌊 ¡Onda! Sáltala (Espacio) o esquívala (toque de Shift).', 'warning');
        }
        break;
      case 'waveHit':
        this.events.emit(GameEvents.PLAYER_DAMAGED, { amount: BOSS.SLAM_DAMAGE, source: 'BOSS_WAVE', sourceName: 'la onda del gólem gigante', fromX: B.x, fromZ: B.z, attack: true });
        break;
      case 'slap':
        if (ev.hit) this.events.emit(GameEvents.PLAYER_DAMAGED, { amount: BOSS.SLAP_DAMAGE, source: 'BOSS_SLAP', sourceName: 'el manotazo del gólem gigante', fromX: B.x, fromZ: B.z, attack: true });
        break;
      case 'cover':
        this._msg('🖐️ ¡Se tapa el ojo y ataca con la otra mano! Aléjate o esquiva el manotazo.', 'warning');
        break;
      case 'uncover':
        this._msg('👁️ ¡Ha destapado el ojo!', 'info');
        break;
      case 'adds': {
        this._adds = (this._adds ?? 0) + 1;
        const spots = [-1, 1].map((k) => ({ x: a.center.x + a.side.x * k * a.radius * 0.6 + a.dir.x * (this._adds === 1 ? -4 : 4), z: a.center.z + a.side.z * k * a.radius * 0.6 + a.dir.z * (this._adds === 1 ? -4 : 4), y: a.floor }));
        const gs = this.enemies.storyGolems(`bossAdds${this._adds}`, spots, { leash: 30 });
        gs.forEach((g) => g.alert());
        this._msg('🪨 ¡El gólem gigante llama a otros gólems!', 'warning');
        break;
      }
      case 'dead':
        this._bossDead();
        break;
      default:
        break;
    }
  }

  _dropStones() {
    const a = this.built.dungeon.arena;
    const rng = this._stoneRng;
    const spots = [];
    for (let i = 0; i < 40 && spots.length < BOSS.STONES_PER_SLAM; i++) {
      const f = rng.range(-0.45, 0.45);
      const s = rng.range(-0.6, 0.6);
      const x = a.center.x + a.dir.x * a.len * f + a.side.x * a.radius * s;
      const z = a.center.z + a.dir.z * a.len * f + a.side.z * a.radius * s;
      if (Math.hypot(x - this.boss.x, z - this.boss.z) < 3.5) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 3.3)) continue;
      spots.push({ x, z });
    }
    const geo = (this._rockGeo ??= new THREE.IcosahedronGeometry(0.25, 0));
    const mat = (this._rockMat ??= new THREE.MeshLambertMaterial({ color: 0x8a857c, flatShading: true }));
    for (const p of spots) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, a.floor + 12 + Math.random() * 4, p.z);
      this.built.root.add(m);
      this._falling.push({ m, v: 0, x: p.x, z: p.z });
    }
  }

  _bossDead() {
    const story = this.story;
    const B = this.boss;
    const d = this.built.dungeon;
    story._lock(true);
    story._ui.letterbox(true, '¡El gólem gigante cae!');
    const c = d.arena.center;
    const cam = new THREE.Vector3(c.x - d.arena.dir.x * 14 + d.arena.side.x * 6, c.y + 5, c.z - d.arena.dir.z * 14 + d.arena.side.z * 6);
    const look = new THREE.Vector3(B.x, c.y + 3, B.z);
    story._cam.setCinematic(() => ({ pos: cam, look }), { speed: 3 });
    story._sequence([
      { at: 3.4, run: () => {
        this._barrierGoal = 0;
        story._ui.caption('Las rocas de la salida se apartan');
      } },
    ], {
      duration: 5.5,
      done: () => {
        this.bossActive = false;
        this.s.bossDefeated = true;
        this.s.stage = 'REPAIR';
        story._ui.bossBar(null, null);
        story._cam.setCinematic(null, { speed: 2.5 });
        story._ui.letterbox(false);
        story._lock(false);
        this.inventory.addItem('THRUSTER', 2);
        this._msg('🔥 ¡2 propulsores! El gólem gigante los guardaba en su pecho. Vuelve a la nave a repararla.', 'pickup');
        this._say('¿Lo has derrotado? ¡Increíble! Trae los propulsores, la placa de navegación y las baterías.', 'pickup');
        this.story._autosave('el gólem gigante derrotado');
      },
    });
  }

  _resetBoss() {
    if (!this.boss) return;
    this.boss.reset();
    this.bossActive = false;
    this._barrierGoal = 0;
    this._barrierK = 0;
    this.story._ui.bossBar(null, null);
    for (const e of this.enemies.enemies) if (e.story?.startsWith('bossAdds') && e.alive) e.removed = true;
    this._adds = 0;
  }

  _onDeath() {
    if (this.s.stage === 'BOSS' && !this.s.bossDefeated) {
      this._resetBoss();
      this._msg('💀 El gólem gigante vuelve a dormirse. Vuelve a la sala de las cascadas cuando estés listo.', 'warning');
    }
  }

  _takeSling() {
    const s = this.s;
    if (s.slingTaken) return;
    s.slingTaken = true;
    const P = this.player;
    const d = this.built.dungeon;
    const story = this.story;
    story._lock(true);
    P.crouch = true;
    const sp = d.sling;
    const cam = new THREE.Vector3(sp.x + d.arena.side.x * 2.6, sp.y + 1.6, sp.z + d.arena.side.z * 2.6);
    const look = new THREE.Vector3(sp.x, sp.y + 0.4, sp.z);
    story._cam.setCinematic(() => ({ pos: cam, look }), { speed: 5 });
    P.yaw = P.bodyYaw = Math.atan2(-(sp.x - P.position.x), -(sp.z - P.position.z));
    story._sequence([
      { at: 0.5, run: () => this.events.emit(GameEvents.PLAYER_ACTION, { kind: 'harvest' }) },
    ], {
      duration: 1.3,
      tick: (dt, t) => {
        const k = Math.min(1, t / 0.9);
        sp.mesh.position.set(sp.x + (P.position.x - sp.x) * k, sp.y + 0.12 + k * 1.1, sp.z + (P.position.z - sp.z) * k);
        sp.mesh.scale.setScalar(1 - k * 0.6);
      },
      done: () => {
        sp.mesh.visible = false;
        P.crouch = false;
        this.inventory.addItem('SLINGSHOT', 1);
        this.inventory.addItem('STONE', 5);
        const i = this.inventory.slots.findIndex((x) => x?.id === 'SLINGSHOT');
        if (i >= 0 && i < 9) this.hotbar.selectIndex(i);
        story._cam.setCinematic(null, { speed: 4 });
        story._lock(false);
        this._msg('🎯 ¡Tirachinas! Clic derecho mantenido apunta, clic izquierdo tensa y suelta para disparar piedras.', 'pickup');
      },
    });
  }

  // ---- Interacción --------------------------------------------------------------------------

  interactables(x, y, z, range) {
    const out = [];
    const b = this.built;
    const s = this.s;
    if (!b) return out;
    const near = (p, r = range + 1.5, dy = 3) => Math.hypot(p.x - x, p.z - z) < r && Math.abs((p.y ?? y) - y) < dy;
    // Nave: reparar (por detrás).
    if (this.ship.present && !s.shipRepaired && s.diagnosed) {
      const ship = this.ship.ship;
      const [rx, rz] = toShipWorld(ship, 0, 8.2);
      const rp = { x: rx, y: ship.y + 1.5, z: rz };
      if (near(rp, range + 3, 4)) out.push({ id: 'repair', ...rp, aimRadius: 2.2, reach: 2, label: '🔧 Nave averiada', action: 'Reparar', key: 'E' });
    }
    if (b.lab) {
      const k = b.lab.keypad;
      if (near(k)) out.push({ id: 'keypad', ...k, aimRadius: 0.5, reach: 0.6, label: '🔒 Teclado de la puerta', action: s.labOpened ? 'Abierta' : 'Introducir contraseña', key: 'E' });
      const wb = b.lab.workbench;
      if (near(wb)) out.push({ id: 'workbench', ...wb, aimRadius: 0.9, reach: 1, label: '🧰 Mesa de elaboración', action: 'Usar', key: 'E' });
      b.lab.notes.forEach((n, i) => {
        if (near(n, range + 1, 2)) out.push({ id: `note${i}`, ...n, aimRadius: 0.4, reach: 0.5, label: '📄 Nota', action: 'Leer', key: 'E' });
      });
    }
    if (b.dungeon) {
      const c = b.dungeon.chest;
      if (!s.chestOpened && near(c, range + 1.5, 3)) out.push({ id: 'chestN', x: c.x, y: c.y + 0.6, z: c.z, aimRadius: 0.9, reach: 0.9, label: '📦 Cofre N', action: 'Abrir', key: 'E' });
      const sp = b.dungeon.sling;
      if (!s.slingTaken && near(sp, range + 1.5, 3)) out.push({ id: 'sling', x: sp.x, y: sp.y + 0.2, z: sp.z, aimRadius: 0.7, reach: 0.6, label: '🪃 Tirachinas', action: 'Coger', key: 'E' });
    }
    return out;
  }

  interact(id) {
    if (id === 'repair') return this._repair();
    if (id === 'keypad') return this._keypad();
    if (id === 'workbench') return this.events.emit(GameEvents.CRAFT_STATION_OPEN, { station: 'WORKBENCH' });
    if (id === 'chestN') return this._openChest();
    if (id === 'sling') return this._takeSling();
    if (id.startsWith('note')) {
      const n = this.built.lab.notes[Number(id.slice(4))];
      if (n) this.story._ui.dialog([{ speaker: '📄 Nota', text: n.text }]);
    }
  }

  // ---- Bucle ---------------------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    this._hintT = Math.max(0, this._hintT - dt);
    const b = this.built;
    if (!b) return;
    const s = this.s;
    const p = this.player.position;
    const onHome = this.worlds.activeId === this.homeId;
    // Humo de la nave averiada.
    const ship = this.ship.ship;
    b.smoke.forEach((sm, i) => {
      const [x, z] = toShipWorld(ship, i ? 2.4 : -2.4, 7.4);
      sm.update(dt, x, ship.y + 3.7, z, onHome && this.ship.present && ship && Math.hypot(ship.x - p.x, ship.z - p.z) < 250);
    });
    // Llegar a la nave.
    if (s.stage === 'SHIP' && !s.shipReached && onHome && this.ship.present && Math.hypot(ship.x - p.x, ship.z - p.z) < 26 && !this.story._seq) this._arriveShip();
    // Luces del centro y de la mazmorra solo cerca (son caras).
    if (b.lab) {
      const near = Math.hypot(b.lab.site.x - p.x, b.lab.site.z - p.z) < 70;
      for (const l of b.lab.lights) l.visible = near;
      b.lab.panels[2].material.color.setHex(Math.sin(this._t * 23) > 0.6 ? 0x6f7a85 : 0xe9f4ff); // un panel parpadea
    }
    if (b.dungeon) {
      const d = b.dungeon;
      const inside = onHome && this._inDungeon();
      for (const l of d.lights) l.visible = inside;
      d.animate(this._t);
      // La sala de las cascadas tiene algo de luz propia (no es negra del todo).
      this.story.caveCap = inside && this._inArena() ? 0.45 : 1;
      if (inside && !s.dungeonEntered && (s.stage === 'LAB' || s.stage === 'DUNGEON')) {
        s.dungeonEntered = true;
        s.stage = 'DUNGEON';
        this.story._autosave('la mazmorra');
        this._say('Estás bajo tierra: la señal llega débil. Hay gólems dormidos por aquí… ve con cuidado.', 'warning');
      }
      if (s.stage === 'DUNGEON' && this._inArena() && !this._arenaHint) {
        this._arenaHint = true;
        this._msg('💧 Una sala enorme con cascadas… Al fondo, un cofre con una «N».', 'info');
      }
      // Volver a la sala tras morir en la pelea: se repite.
      if (s.stage === 'BOSS' && !this.bossActive && !s.bossDefeated && this._inArena() && !this.story._seq) this._startBoss();
      // Rocas de la salida.
      this._barrierT += dt;
      const goal = this._barrierGoal ?? 0;
      this._barrierK += Math.sign(goal - this._barrierK) * Math.min(Math.abs(goal - this._barrierK), dt / (goal ? 1.6 : 2.5));
      d.setBarrier(this._barrierK, goal ? this._barrierT : 2);
      // El jefe.
      if (this.boss) {
        if (this.bossActive) {
          const info = { x: p.x, y: p.y, z: p.z, alive: !this.health.dead, onGround: this.player.state.onGround, dodging: this.player.state.dodging > 0 };
          for (const ev of this.boss.update(dt, info)) this._bossEvent(ev);
          const note = this.boss.covered > 0 ? '🖐️ Ojo tapado' : this.boss.windup === 'SLAM' ? '¡Va a golpear el suelo!' : '';
          if (this.boss.fighting) this.story._ui.bossBar('GÓLEM GIGANTE', this.boss.health / BOSS.HEALTH, note);
        } else if (this.boss.state === 'DEAD') this.boss.update(dt, { x: p.x, y: p.y, z: p.z });
        this.bossView.root.visible = onHome && (inside || this._inArena() || this.bossActive);
        if (this.bossView.root.visible) this.bossView.update(dt, this._t);
        if (s.bossDefeated && this.boss.state !== 'DEAD') {
          this.boss.state = 'DEAD';
          this.boss.death = 1;
        }
      }
      // Piedras que caen del techo → bolsas en el suelo.
      this._falling = this._falling.filter((f) => {
        f.v += 18 * dt;
        f.m.position.y -= f.v * dt;
        f.m.rotation.x += dt * 5;
        if (f.m.position.y > d.arena.floor + 0.25) return true;
        b.root.remove(f.m);
        this.pickups.drop(this.homeId, f.x, f.z, 'STONE', 1, null, d.arena.floor);
        return false;
      });
    }
  }
}

/** Columna de humo negro (propulsores rotos). */
class Smoke {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.active = true;
    this._puffs = [];
    this._mat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.55, depthWrite: false });
    this._geo = new THREE.IcosahedronGeometry(1, 1);
    this._acc = 0;
  }

  update(dt, x, y, z, visible) {
    this.group.visible = visible && this.active;
    if (!this.group.visible) return;
    this._acc += dt;
    if (this._acc > 0.35 && this._puffs.length < 14) {
      this._acc = 0;
      const m = new THREE.Mesh(this._geo, this._mat.clone());
      m.position.set(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6);
      m.userData.t = 0;
      this.group.add(m);
      this._puffs.push(m);
    }
    this._puffs = this._puffs.filter((m) => {
      m.userData.t += dt;
      const t = m.userData.t;
      m.position.y += dt * 1.6;
      m.position.x += dt * 0.4;
      m.scale.setScalar(0.4 + t * 0.6);
      m.material.opacity = Math.max(0, 0.55 - t * 0.11);
      if (t < 5) return true;
      this.group.remove(m);
      m.material.dispose();
      return false;
    });
  }
}

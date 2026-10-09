import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { Enemy, EnemyState } from './Enemy.js';
import { createEnemyView, buildGoblinBase, mulberry } from './EnemyViews.js';

/**
 * EnemySystem — los enemigos del planeta de inicio.
 *
 * - Gólems dormidos (montones de piedras) en los sitios GOLEMS de WorldSites y en las
 *   cámaras de las cuevas. Despiertan al acercarse el jugador.
 * - Bases de goblins (sitios GOBLIN_BASE): un árbol grande con su casa, chozas,
 *   empalizada, hoguera y tótem, con 3–5 goblins. Limpia la base y aparece su botín.
 * - Equipos de exploración: 3–4 goblins y un jefe goblin (negro) que recorren el
 *   planeta de un punto a otro (lejos del jugador se mueven sin simularse).
 * - Slimes: salen de noche alrededor del jugador y se deshacen al amanecer.
 *
 * Mismo interfaz que AnimalSystem para golpear (getAnimalsNear / hitAnimal), así la
 * espada, el puño, el arco y el tirachinas sirven igual. Nada aparece a menos de
 * SAFE_RADIUS del inicio. Los muertos y las bases limpias se guardan con la partida.
 */
export class EnemySystem {
  constructor({ config, safeRadius = 0, scene, worlds, homeId, player, events, time, obstacles = null, pickups = null, isSheltered = () => false, fires = () => [], fireRadius = 9 }) {
    this.name = 'enemies';
    this._cfg = config;
    this._safe = safeRadius;
    this._worlds = worlds;
    this._homeId = homeId;
    this._player = player;
    this._events = events;
    this._time = time;
    this._obstacles = obstacles;
    this._pickups = pickups;
    this._isSheltered = isSheltered;
    this._fires = fires;       // hogueras: los slimes no se acercan
    this._fireRadius = fireRadius;
    this.root = new THREE.Group();
    this.root.name = 'enemies';
    scene.add(this.root);
    this.enemies = [];
    this.bases = [];
    this.teams = [];
    this._views = new Map();
    this._dead = new Set();
    this._cleared = new Set();
    this._slimeIn = 8;
    this._slimeSeq = 0;
    this._t = 0;
    this.activeCount = 0;
    this._playerInfo = { x: 0, y: 0, z: 0, alive: true };
    this.playerAlive = () => true;
    this._env = {
      cfg: config,
      player: this._playerInfo,
      groundAt: (x, z, y) => this._groundAt(x, z, y),
      isWalkable: (x, z, y) => this._isWalkable(x, z, y),
      resolveCollisions: (pos, r, y0, y1) => {
        const w = this._world;
        let hit = w?.resources?.resolveCollisions(pos, r) ?? false;
        if (this._obstacles?.resolveCollisions(pos, r, y0, y1)) hit = true;
        if (this._resolveStatic(pos, r, y0)) hit = true;
        return hit;
      },
      onAttack: (e) => this._attack(e),
    };
    events.on(GameEvents.WORLD_GENERATED, () => this.generate());
    events.on(GameEvents.PLAYER_RESPAWNED, () => {
      for (const e of this.enemies) if (e.hostile) e.state = EnemyState.RETURN;
    });
  }

  get _world() {
    return this._worlds.get(this._homeId);
  }

  // ---- Generación -------------------------------------------------------------------

  generate() {
    for (const v of this._views.values()) this.root.remove(v.root);
    this._views.clear();
    for (const b of this.bases) this.root.remove(b.group);
    this.enemies = [];
    this.bases = [];
    this.teams = [];
    const w = this._world;
    if (!w?.getSites) return;
    const seed = w.seed.sub.animal;
    const C = this._cfg;
    // Gólems dormidos en sus sitios.
    for (const site of w.getSites('GOLEMS')) {
      const rng = new SeededRandom(deriveSeed(seed, site.id));
      const group = { members: [] };
      const n = rng.int(C.GOLEMS_PER_SITE[0], C.GOLEMS_PER_SITE[1]);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.next();
        const x = site.x + Math.cos(a) * (n > 1 ? 2.5 : 0);
        const z = site.z + Math.sin(a) * (n > 1 ? 2.5 : 0);
        this._add('GOLEM', `${site.id}:${i}`, x, z, { dormant: true, group, home: { x, z, radius: 3, sleep: true }, rng });
      }
    }
    // Gólems en las cámaras de las cuevas.
    const chambers = [];
    for (const c of w.caves?.caves ?? []) {
      if (c.kind === 'DUNGEON') continue;
      c.nodes.forEach((nd, i) => nd.chamber && i > 6 && chambers.push({ c, nd, i }));
    }
    const crng = new SeededRandom(deriveSeed(seed, 'caveGolems'));
    for (let k = 0; k < C.CAVE_GOLEMS && chambers.length; k++) {
      const { c, nd, i } = chambers.splice(crng.int(0, chambers.length - 1), 1)[0];
      const g = this._add('GOLEM', `cave${c.id}:${i}`, nd.x, nd.z, { dormant: true, y: nd.floor, home: { x: nd.x, z: nd.z, radius: 3, sleep: true, leash: 30 }, rng: crng });
      g.cave = true;
    }
    // Bases de goblins.
    for (const site of w.getSites('GOBLIN_BASE')) this._createBase(site, seed);
    // Equipos de exploración.
    const trng = new SeededRandom(deriveSeed(seed, 'goblinTeams'));
    for (let t = 0; t < C.GOBLIN_TEAMS; t++) {
      const start = this._randomSpot(trng, 400);
      if (start) this._createTeam(`team${t}`, start, trng);
    }
    this._applySaved();
  }

  _add(type, id, x, z, { dormant = false, group = null, home = null, rng = null, y = null, scale = 1 } = {}) {
    const def = this._cfg.TYPES[type];
    const er = new SeededRandom(deriveSeed(this._world?.seed?.sub.animal ?? 1, id));
    const e = new Enemy({
      id, type, def, x, z, y: y ?? this._groundAt(x, z, null), home: home ?? { x, z, radius: 6 }, rng: er, dormant, group,
      scale: scale * (rng ? rng.range(0.92, 1.1) : 1),
    });
    group?.members.push(e);
    this.enemies.push(e);
    return e;
  }

  _createBase(site, seed) {
    const rng = new SeededRandom(deriveSeed(seed, site.id));
    const r = mulberry(site.seed >>> 0);
    const { group, colliders, fire } = buildGoblinBase(site, (x, z) => this._world.getHeightAt(x, z), r);
    group.visible = false;
    this.root.add(group);
    const base = { id: site.id, x: site.x, z: site.z, group, colliders, fire, members: [], cleared: false };
    const n = rng.int(this._cfg.GOBLINS_PER_BASE[0], this._cfg.GOBLINS_PER_BASE[1]);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(3, 9);
      const x = site.x + Math.cos(a) * d;
      const z = site.z + Math.sin(a) * d;
      this._add('GOBLIN', `${site.id}:${i}`, x, z, { group: base, home: { x: site.x, z: site.z, radius: 9, leash: 40 }, rng });
    }
    this.bases.push(base);
  }

  _createTeam(id, start, rng) {
    const C = this._cfg;
    const team = { id, home: { x: start.x, z: start.z, radius: 6, leash: 55 }, members: [], target: null, speed: 1.5 };
    const n = rng.int(C.TEAM_SIZE[0], C.TEAM_SIZE[1]);
    this._add('GOBLIN_BOSS', `${id}:boss`, start.x, start.z, { group: team, home: team.home, rng, scale: 1.15 });
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      this._add('GOBLIN', `${id}:${i}`, start.x + Math.cos(a) * 3, start.z + Math.sin(a) * 3, { group: team, home: team.home, rng });
    }
    team.rng = rng;
    this.teams.push(team);
  }

  /** Un punto caminable al azar, lejos del inicio. */
  _randomSpot(rng, minFromSpawn = this._safe) {
    const w = this._world;
    const b = w.getBounds();
    const sp = w.getSpawnPoint();
    for (let i = 0; i < 200; i++) {
      const x = rng.range(b.minX + 80, b.maxX - 80);
      const z = rng.range(b.minZ + 80, b.maxZ - 80);
      if (Math.hypot(x - sp.x, z - sp.z) < Math.max(this._safe, minFromSpawn)) continue;
      if (!this._isWalkable(x, z, null)) continue;
      const biome = w.getBiomeAt(x, z).id;
      if (biome === 'FROZEN_MOUNTAINS' || biome === 'BEACH') continue;
      return { x, z };
    }
    return null;
  }

  // ---- Mundo ------------------------------------------------------------------------

  _groundAt(x, z, y) {
    const w = this._world;
    if (y !== null && y !== undefined) {
      const c = w.caveFloorAt?.(x, z, y + 0.6);
      if (c && Math.abs(c.floor - y) < 2.5) return c.floor;
    }
    return w.getHeightAt(x, z);
  }

  _isWalkable(x, z, y) {
    const w = this._world;
    const b = w.getBounds();
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    if (y !== null && y !== undefined) {
      const c = w.caveFloorAt?.(x, z, y + 0.6);
      if (c && Math.abs(c.floor - y) < 2.5) return true;
      if (w.inCave?.(x, y + 1, z)) return false;
    }
    if (w.water?.isWater(x, z, 0.4)) return false;
    if (w.isCaveHole?.(x, z)) return false;
    const h = w.getHeightAt(x, z);
    if (h < w.seaLevel + 0.2) return false;
    const slope = (Math.abs(w.getHeightAt(x + 0.7, z) - w.getHeightAt(x - 0.7, z)) + Math.abs(w.getHeightAt(x, z + 0.7) - w.getHeightAt(x, z - 0.7))) / 1.4;
    return slope < 0.95;
  }

  /** Obstáculos fijos de las bases (para los enemigos). */
  _resolveStatic(pos, r, y0 = -Infinity) {
    let hit = false;
    for (const b of this.bases) {
      if (Math.abs(pos.x - b.x) > 20 || Math.abs(pos.z - b.z) > 20) continue;
      const gy = this._world.getHeightAt(b.x, b.z);
      for (const c of b.colliders) {
        if (y0 > gy + c.h + 2) continue;
        const dx = pos.x - c.x;
        const dz = pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const min = c.r + r;
        if (d >= min || d < 1e-6) continue;
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Obstáculos para el jugador: las bases y los enemigos despiertos (no se les
   * atraviesa).
   */
  resolveCollisions(pos, r, y0 = -Infinity, y1 = Infinity) {
    if (!this.enabled) return false;
    let hit = this._resolveStatic(pos, r, y0);
    for (const e of this.enemies) {
      if (!e.hittable || Math.abs(pos.x - e.x) > 3 || Math.abs(pos.z - e.z) > 3) continue;
      if (y1 < e.y || y0 > e.y + e.def.HEIGHT * e.scale) continue;
      const dx = pos.x - e.x;
      const dz = pos.z - e.z;
      const d = Math.hypot(dx, dz);
      const min = e.def.RADIUS * e.scale + r;
      if (d >= min || d < 1e-6) continue;
      pos.x = e.x + (dx / d) * min;
      pos.z = e.z + (dz / d) * min;
      hit = true;
    }
    return hit;
  }

  _attack(e) {
    this._events.emit(GameEvents.PLAYER_DAMAGED, {
      amount: e.def.DAMAGE,
      source: `ENEMY_${e.type}`,
      sourceName: e.def.NAME,
      fromX: e.x,
      fromZ: e.z,
      attack: true,
    });
    this._events.emit(GameEvents.ENEMY_ATTACKED, { enemy: e });
  }

  // ---- Bucle ------------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    const onHome = this._worlds.activeId === this._homeId && this.enemies.length + this.bases.length > 0;
    this.enabled = onHome;
    this.root.visible = onHome;
    if (!onHome) return;
    const p = this._player.position;
    const info = this._playerInfo;
    info.x = p.x;
    info.y = p.y;
    info.z = p.z;
    info.alive = this.playerAlive() && !this._isSheltered();
    const R = this._cfg.ACTIVE_RADIUS;
    this._moveTeams(dt, p);
    this._spawnSlimes(dt, p);

    let active = 0;
    for (const e of this.enemies) {
      if (e.removed) continue;
      const near = Math.abs(e.x - p.x) < R && Math.abs(e.z - p.z) < R && Math.hypot(e.x - p.x, e.z - p.z) < R;
      let view = this._views.get(e.id);
      if (!near) {
        if (view) view.root.visible = false;
        continue;
      }
      if (e.type === 'SLIME' && !e.melting && !this._time.isNight && e.alive) this._melt(e);
      e.update(dt, this._env);
      if (e.type === 'SLIME' && e.alive) this._keepFromFire(e);
      if (!view) {
        view = createEnemyView(e);
        this._views.set(e.id, view);
        this.root.add(view.root);
      }
      view.root.visible = true;
      view.root.position.set(e.x, e.y, e.z);
      view.root.rotation.y = e.heading;
      view.update(e, this._t, dt);
      view.bar.set(e.health / e.maxHealth, e.hittable && e.health < e.maxHealth);
      active++;
    }
    this._separate();
    // Quitar los que ya han terminado de morir.
    for (const e of this.enemies) {
      if (!e.removed) continue;
      const v = this._views.get(e.id);
      if (v) {
        this.root.remove(v.root);
        this._views.delete(e.id);
      }
    }
    this.enemies = this.enemies.filter((e) => !e.removed);
    this.activeCount = active;
    for (const b of this.bases) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      b.group.visible = d < 260;
      if (b.group.visible) {
        const f = b.fire.userData.flames;
        f.scale.set(1 + Math.sin(this._t * 9) * 0.1, 1 + Math.sin(this._t * 13 + 1) * 0.18, 1 + Math.cos(this._t * 8) * 0.1);
      }
    }
  }

  /** Que no se monten unos encima de otros. */
  _separate() {
    const list = this.enemies.filter((e) => e.hittable && this._views.get(e.id)?.root.visible);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = (a.def.RADIUS * a.scale + b.def.RADIUS * b.scale) * 1.1;
        if (d >= min || d < 1e-4) continue;
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.z -= (dz / d) * push;
        b.x += (dx / d) * push;
        b.z += (dz / d) * push;
      }
    }
  }

  _moveTeams(dt, p) {
    for (const team of this.teams) {
      const alive = team.members.filter((m) => m.alive);
      if (!alive.length) continue;
      if (alive.some((m) => m.hostile || m.state === EnemyState.RETURN)) continue;
      if (!team.target || Math.hypot(team.target.x - team.home.x, team.target.z - team.home.z) < 3) {
        const a = team.rng.range(0, Math.PI * 2);
        const d = team.rng.range(150, 420);
        const t = { x: team.home.x + Math.cos(a) * d, z: team.home.z + Math.sin(a) * d };
        const sp = this._world.getSpawnPoint();
        team.target = this._isWalkable(t.x, t.z, null) && Math.hypot(t.x - sp.x, t.z - sp.z) > this._safe + 30 ? t : null;
        continue;
      }
      const dx = team.target.x - team.home.x;
      const dz = team.target.z - team.home.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, team.speed * dt);
      const nx = team.home.x + (dx / d) * step;
      const nz = team.home.z + (dz / d) * step;
      if (!this._isWalkable(nx, nz, null)) {
        team.target = null;
        continue;
      }
      const mx = nx - team.home.x;
      const mz = nz - team.home.z;
      team.home.x = nx;
      team.home.z = nz;
      // Lejos del jugador no se simulan: se mueven con el grupo.
      const far = Math.hypot(nx - p.x, nz - p.z) > this._cfg.ACTIVE_RADIUS + 10;
      for (const m of alive) {
        if (far) {
          m.x += mx;
          m.z += mz;
          m.y = this._world.getHeightAt(m.x, m.z);
        } else if (m.state === EnemyState.IDLE) {
          // Cerca: siguen al grupo andando.
          m.timer = Math.min(m.timer, 0.5);
        }
      }
    }
  }

  /** Un slime no entra en el círculo de luz de una hoguera: se queda en el borde. */
  _keepFromFire(e) {
    const R = this._fireRadius;
    for (const f of this._fires()) {
      const dx = e.x - f.x;
      const dz = e.z - f.z;
      const d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-3) continue;
      e.x = f.x + (dx / d) * R;
      e.z = f.z + (dz / d) * R;
    }
  }

  _spawnSlimes(dt, p) {
    const S = this._cfg.SLIMES;
    if (!this._time.isNight) return;
    this._slimeIn -= dt;
    if (this._slimeIn > 0) return;
    const rng = this._slimeRng ??= new SeededRandom(deriveSeed(this._world.seed.sub.animal, 'slimes'));
    this._slimeIn = rng.range(S.EVERY[0], S.EVERY[1]);
    const w = this._world;
    const sp = w.getSpawnPoint();
    if (Math.hypot(p.x - sp.x, p.z - sp.z) < this._safe) return; // cerca del inicio, nada
    if (w.inCave?.(p.x, p.y + 1, p.z) || this._isSheltered()) return;
    if (this._fires().some((f) => Math.hypot(f.x - p.x, f.z - p.z) < this._fireRadius * 2)) return; // junto a una hoguera no salen
    const count = this.enemies.filter((e) => e.type === 'SLIME' && e.alive).length;
    if (count >= S.MAX) return;
    for (let i = 0; i < 8; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(S.DISTANCE[0], S.DISTANCE[1]);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      if (Math.hypot(x - sp.x, z - sp.z) < this._safe || !this._isWalkable(x, z, null)) continue;
      const e = this._add('SLIME', `slime${++this._slimeSeq}`, x, z, { home: { x, z, radius: 8, leash: 80 }, rng });
      e.state = EnemyState.CHASE;
      return;
    }
  }

  _melt(e) {
    e.melting = true;
    e.state = EnemyState.DEAD;
    e.timer = 0;
  }

  // ---- Interfaz de criatura (InteractionSystem, CombatSystem) -------------------------

  getAnimalsNear(x, z, radius) {
    if (!this.enabled) return [];
    return this.enemies.filter((e) => e.hittable && Math.abs(e.x - x) <= radius && Math.abs(e.z - z) <= radius && Math.hypot(e.x - x, e.z - z) <= radius);
  }

  hitAnimal(e, damage, fromX, fromZ) {
    if (!e?.hittable) return { killed: false, drops: null };
    const { killed } = e.takeHit(damage, fromX, fromZ);
    this._events.emit(GameEvents.ANIMAL_HIT, { animal: e, killed, enemy: true });
    if (!killed) return { killed: false, drops: null };
    const drops = e.rollDrops();
    if (e.type !== 'SLIME' && !e.id.startsWith('admin')) this._dead.add(e.id);
    this._events.emit(GameEvents.ENEMY_KILLED, { enemy: e, drops });
    this._checkBase(e.group);
    return { killed: true, drops };
  }

  _checkBase(base) {
    if (!base || !this.bases.includes(base) || base.cleared) return;
    if (base.members.some((m) => m.alive)) return;
    base.cleared = true;
    this._cleared.add(base.id);
    // Botín de la base: una bolsa junto al árbol.
    if (this._pickups) {
      const rng = new SeededRandom(deriveSeed(this._world.seed.sub.animal, `${base.id}:loot`));
      for (const [item, [a, b]] of Object.entries(this._cfg.BASE_LOOT)) {
        this._pickups.drop(this._homeId, base.x + 2, base.z + 2, item, rng.int(a, b));
      }
    }
    this._events.emit(GameEvents.UI_MESSAGE, { text: '🏴 ¡Base goblin despejada! Su botín está junto al árbol.', type: 'pickup' });
  }

  // ---- Guardar --------------------------------------------------------------------------

  snapshot() {
    return { dead: [...this._dead], cleared: [...this._cleared] };
  }

  restore(d) {
    this._dead = new Set((d?.dead ?? []).filter((v) => typeof v === 'string'));
    this._cleared = new Set((d?.cleared ?? []).filter((v) => typeof v === 'string'));
    this._applySaved();
  }

  _applySaved() {
    for (const e of this.enemies) if (this._dead.has(e.id)) e.removed = true;
    for (const b of this.bases) if (this._cleared.has(b.id)) b.cleared = true;
  }

  // ---- Historia ----------------------------------------------------------------------------

  /**
   * Gólems de la historia (guardianes del nodo, mazmorra…): dormidos y "bloqueados"
   * (no despiertan al acercarse) hasta que la historia los llama con alert().
   * Devuelve los vivos (los ya derrotados no vuelven).
   */
  storyGolems(tag, spots, { leash = 30, y = null, type = 'GOLEM' } = {}) {
    const out = [];
    spots.forEach((s, i) => {
      const id = `story:${tag}:${i}`;
      if (this._dead.has(id)) return;
      let e = this.enemies.find((m) => m.id === id && !m.removed);
      if (!e) {
        e = this._add(type, id, s.x, s.z, { dormant: type === 'GOLEM', y: s.y ?? y, home: { x: s.x, z: s.z, radius: 4, leash } });
        e.story = tag;
      }
      e.locked = true;
      out.push(e);
    });
    return out;
  }

  /** Vuelve a dormir a los gólems vivos de un grupo de la historia (p. ej. al morir el jugador). */
  resetStoryGolems(tag) {
    for (const e of this.enemies) {
      if (e.story !== tag || !e.alive) continue;
      e.state = EnemyState.DORMANT;
      e.assemble = 0;
      e.locked = true;
      e.health = e.maxHealth;
      e.x = e.home.x;
      e.z = e.home.z;
    }
  }

  // ---- Depuración ------------------------------------------------------------------------

  /** Crea un enemigo junto al jugador (Admin). */
  spawnNear(type, distance = 8) {
    const p = this._player.position;
    const a = this._player.yaw;
    const x = p.x - Math.sin(a) * distance;
    const z = p.z - Math.cos(a) * distance;
    const e = this._add(type, `admin${++this._slimeSeq}`, x, z, { home: { x, z, radius: 6, leash: 60 }, dormant: type === 'GOLEM', y: p.y });
    if (type !== 'GOLEM') e.state = EnemyState.CHASE;
    return e;
  }

  nearest(kind, x, z) {
    const list = kind === 'BASE' ? this.bases.filter((b) => !b.cleared) : kind === 'TEAM' ? this.teams.filter((t) => t.members.some((m) => m.alive)).map((t) => t.home) : this.enemies.filter((e) => e.type === kind && e.alive && !e.cave);
    let best = null;
    for (const it of list) {
      const d = Math.hypot(it.x - x, it.z - z);
      if (!best || d < best.d) best = { it, d };
    }
    return best?.it ?? null;
  }
}

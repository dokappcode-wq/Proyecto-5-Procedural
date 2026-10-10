import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * FishingSystem — pesca con caña (P4).
 *
 *   1. Con la caña en la mano, clic dcho mirando al agua (hasta RANGE m): se lanza el corcho.
 *   2. Espera (BITE_TIME). Cuando pica, el corcho se hunde: hay BITE_WINDOW s para hacer clic.
 *   3. Minijuego: una barra vertical con el pez, que sube y baja a su aire, y una zona verde
 *      que sube mientras se mantiene el clic y cae al soltarlo. Con el pez dentro de la zona
 *      se llena la captura (CATCH_TIME s); fuera, se vacía (ESCAPE_TIME). Llena: pescado.
 *   Clic dcho otra vez recoge el sedal. Alejarse más de MAX_DISTANCE lo rompe.
 *
 * Lo que sale depende del agua (río, lago o mar) y de su peso (FISHING.CATCHES); cuanto
 * más difícil (LEVEL), más nervioso es el pez y más pequeña la zona.
 */
export const FishState = Object.freeze({ IDLE: 'IDLE', CAST: 'CAST', WAIT: 'WAIT', BITE: 'BITE', REEL: 'REEL' });

export class FishingSystem {
  constructor({ config, items, input, hotbar, inventory, player, camera, world, scene, events, isHome = () => true, random = Math.random, ui = null, perk = () => 0 }) {
    this.name = 'fishing';
    this._cfg = config;
    this._items = items;
    this._input = input;
    this._hotbar = hotbar;
    this._inv = inventory;
    this._player = player;
    this._camera = camera;
    this._world = world;
    this._events = events;
    this._isHome = isHome;
    this._random = random;
    this._ui = ui;
    this._perk = perk; // habilidad «Pesca» (P8): zona más grande
    this.state = FishState.IDLE;
    this._t = 0;
    this._spot = null;      // { x, y, z, where }
    this._from = null;      // dónde estaba el jugador al lanzar
    this._catch = null;     // lo que ha picado
    this.game = { fish: 0.5, fishV: 0, zone: 0.3, zoneV: 0, size: 0.3, progress: 0.3 };
    // Corcho y sedal.
    this._bobber = new THREE.Group();
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8342a }));
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
    stick.position.y = 0.1;
    this._bobber.add(red, white, stick);
    this._bobber.visible = false;
    this._lineGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 12), 3));
    this._line = new THREE.Line(this._lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.8 }));
    this._line.frustumCulled = false;
    this._line.visible = false;
    scene.add(this._bobber, this._line);
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._tip = new THREE.Vector3();
  }

  /** Con la caña en la mano, el clic dcho es de la pesca. */
  get capturesUse() {
    return this._items[this._hotbar.selectedId]?.USE === 'FISH';
  }

  /** Pescando, el clic no golpea. */
  get busy() {
    return this.state !== FishState.IDLE;
  }

  update(dt) {
    this._t += dt;
    const holding = this.capturesUse;
    const input = this._input;
    if (this.state !== FishState.IDLE) {
      // Cambiar de objeto, nadar o alejarse: se acaba.
      const p = this._player.position;
      if (!holding || this._player.state.isSwimming) return this._stop(null);
      if (Math.hypot(p.x - this._from.x, p.z - this._from.z) > this._cfg.MAX_DISTANCE) return this._stop('🎣 Te has alejado demasiado: se ha soltado el sedal.');
    }
    if (holding && !input.blocked && input.wasPressed('USE')) {
      if (this.state === FishState.IDLE) this._cast();
      else this._stop('🎣 Recoges el sedal.');
    }
    switch (this.state) {
      case FishState.CAST:
        this._timer -= dt;
        if (this._timer <= 0) this._toWait();
        break;
      case FishState.WAIT:
        this._timer -= dt;
        if (this._timer <= 0) {
          this.state = FishState.BITE;
          this._timer = this._cfg.BITE_WINDOW;
          this._catch = this._pick(this._spot.where);
          this._emit();
        }
        break;
      case FishState.BITE:
        this._timer -= dt;
        if (!input.blocked && input.wasPressed('ATTACK')) this._startReel();
        else if (this._timer <= 0) {
          this._say('🐟 Se ha escapado: cuando pique (el corcho se hunde), haz clic enseguida.');
          this._toWait();
        }
        break;
      case FishState.REEL:
        this._reel(dt, !input.blocked && input.isDown('ATTACK'));
        break;
      default:
        break;
    }
    this._draw(dt);
    this._ui?.update(this);
  }

  // ---- Lanzar ----------------------------------------------------------------------

  /** Punto de agua al que se mira (o null): { x, y, z, where: RIVER | LAKE | SEA }. */
  findWater() {
    const cam = this._camera;
    cam.updateMatrixWorld();
    const o = this._v.setFromMatrixPosition(cam.matrixWorld);
    cam.getWorldDirection(this._dir);
    const w = this._world;
    const p = new THREE.Vector3();
    for (let d = 1; d <= this._cfg.RANGE + 4; d += 0.4) {
      p.copy(o).addScaledVector(this._dir, d);
      const ground = w.getHeightAt(p.x, p.z);
      const water = this.waterAt(p.x, p.z, ground);
      if (water && p.y <= water.level + 0.3) {
        const flat = Math.hypot(p.x - this._player.position.x, p.z - this._player.position.z);
        if (flat > this._cfg.RANGE) return null;
        return { x: p.x, y: water.level, z: p.z, where: water.where };
      }
      if (p.y < ground) return null; // da en tierra
    }
    return null;
  }

  /** Agua en (x, z) con su nivel y tipo, o null. */
  waterAt(x, z, ground = this._world.getHeightAt(x, z)) {
    const w = this._world;
    const fresh = w.map?.waterAt?.(x, z) ?? w.water?.getPondAt?.(x, z)?.level ?? null;
    if (fresh !== null && fresh !== undefined && fresh > ground + 0.15) {
      const lake = (w.water?.ponds ?? []).some((pd) => Math.hypot(pd.x - x, pd.z - z) <= pd.radius * 1.1);
      return { level: fresh, where: !w.map || lake ? 'LAKE' : 'RIVER' };
    }
    const sea = w.seaLevel;
    if (Number.isFinite(sea) && ground < sea - 0.3 && w.hasSea !== false) return { level: sea, where: 'SEA' };
    return null;
  }

  _cast() {
    if (this._player.state.isSwimming) return this._say('🎣 Nadando no se puede pescar.');
    const spot = this.findWater();
    if (!spot) return this._say(`🎣 Mira al agua (a menos de ${this._cfg.RANGE} m) para lanzar.`);
    this._spot = spot;
    this._from = { x: this._player.position.x, z: this._player.position.z };
    this.state = FishState.CAST;
    this._timer = 0.6;
    this._castT = 0;
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'shoot', weapon: 'FISHING_ROD' });
    this._emit();
  }

  _toWait() {
    this.state = FishState.WAIT;
    const [a, b] = this._cfg.BITE_TIME;
    this._timer = a + this._random() * (b - a);
    this._catch = null;
    this._emit();
  }

  /** Qué pica: al azar por peso entre lo que vive en ese agua. */
  _pick(where) {
    const list = this._cfg.CATCHES.filter((c) => c.WHERE.includes(where));
    const total = list.reduce((s, c) => s + c.WEIGHT, 0);
    let r = this._random() * total;
    for (const c of list) {
      r -= c.WEIGHT;
      if (r <= 0) return c;
    }
    return list[list.length - 1];
  }

  // ---- Minijuego -------------------------------------------------------------------

  _startReel() {
    const lvl = this._catch.LEVEL;
    this.state = FishState.REEL;
    this.game = { fish: 0.5, fishV: 0, target: 0.5, zone: 0.35, zoneV: 0, size: Math.min(0.6, (0.34 - lvl * 0.14) * (1 + this._perk('ANGLER'))), progress: 0.3, level: lvl, retarget: 0 };
    this._emit();
  }

  /** Un paso del minijuego (también lo usan los tests). */
  _reel(dt, holding) {
    const g = this.game;
    // El pez busca un sitio nuevo de vez en cuando (más a menudo y más lejos si es difícil).
    g.retarget -= dt;
    if (g.retarget <= 0) {
      g.retarget = (1.4 - g.level) * (0.5 + this._random());
      g.target = Math.min(0.95, Math.max(0.05, g.fish + (this._random() - 0.5) * (0.4 + g.level * 0.8)));
    }
    g.fishV += ((g.target - g.fish) * (3 + g.level * 9) - g.fishV * 3) * dt;
    g.fish = Math.min(1, Math.max(0, g.fish + g.fishV * dt));
    // La zona sube mientras se mantiene el clic y cae al soltar (rebota un poco abajo).
    g.zoneV += (holding ? 2.6 : -2.2) * dt;
    g.zoneV *= Math.exp(-1.2 * dt);
    g.zone += g.zoneV * dt;
    const top = 1 - g.size;
    if (g.zone < 0) {
      g.zone = 0;
      g.zoneV = Math.abs(g.zoneV) * 0.25;
    } else if (g.zone > top) {
      g.zone = top;
      g.zoneV = 0;
    }
    const inside = g.fish >= g.zone && g.fish <= g.zone + g.size;
    g.inside = inside;
    g.progress += inside ? dt / this._cfg.CATCH_TIME : -dt / this._cfg.ESCAPE_TIME;
    if (g.progress >= 1) this._caught();
    else if (g.progress <= 0) this._stop(`🐟 ¡Se ha escapado ${this._catch.NAME.replace(/^¡|!$/g, '')}!`);
  }

  _caught() {
    const c = this._catch;
    const def = this._items[c.ITEM];
    this._inv.addItem(c.ITEM, 1);
    const idx = this._hotbar.selectedIndex;
    if (idx != null) this._inv.wearSlot(idx, 1);
    this._events.emit(GameEvents.FISH_CAUGHT, { item: c.ITEM, name: c.NAME, where: this._spot.where });
    this._say(`🎣 ¡Has sacado ${c.NAME.replace(/^¡|!$/g, '')}! (${def.ICON} ${def.NAME})`, 'pickup');
    this._stop(null);
  }

  _stop(text) {
    if (text) this._say(text);
    this.state = FishState.IDLE;
    this._spot = null;
    this._catch = null;
    this._bobber.visible = false;
    this._line.visible = false;
    this._emit();
    this._ui?.update(this);
  }

  // ---- Dibujo ------------------------------------------------------------------------

  _draw(dt) {
    const active = this.state !== FishState.IDLE && this._spot;
    this._bobber.visible = !!active;
    this._line.visible = !!active;
    if (!active) return;
    // Punta de la caña: delante y por encima de la mano.
    const p = this._player.position;
    const yaw = this._player.yaw;
    this._tip.set(p.x - Math.sin(yaw) * 1.1 + Math.cos(yaw) * 0.25, p.y + 2.1, p.z - Math.cos(yaw) * 1.1 - Math.sin(yaw) * 0.25);
    const s = this._spot;
    let bx = s.x;
    let by = s.y;
    let bz = s.z;
    if (this.state === FishState.CAST) {
      // Vuela en arco de la punta al agua.
      this._castT += dt;
      const k = Math.min(1, this._castT / 0.6);
      bx = this._tip.x + (s.x - this._tip.x) * k;
      bz = this._tip.z + (s.z - this._tip.z) * k;
      by = this._tip.y + (s.y - this._tip.y) * k + Math.sin(k * Math.PI) * 1.2;
    } else if (this.state === FishState.BITE) {
      by -= 0.09 + Math.sin(this._t * 30) * 0.03; // se hunde y tiembla
    } else if (this.state === FishState.REEL) {
      by -= 0.05;
      bx += Math.sin(this._t * 7) * 0.12 * (this.game.level + 0.3);
      bz += Math.cos(this._t * 5) * 0.12 * (this.game.level + 0.3);
    } else {
      by += Math.sin(this._t * 2.2) * 0.02; // flota
    }
    this._bobber.position.set(bx, by, bz);
    // Sedal: curva colgando de la punta al corcho.
    const pos = this._lineGeo.attributes.position;
    const n = pos.count;
    const sag = this.state === FishState.REEL ? 0.05 : 0.5;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      pos.setXYZ(i, this._tip.x + (bx - this._tip.x) * k, this._tip.y + (by + 0.12 - this._tip.y) * k - Math.sin(k * Math.PI) * sag, this._tip.z + (bz - this._tip.z) * k);
    }
    pos.needsUpdate = true;
  }

  _emit() {
    this._events.emit(GameEvents.FISHING_STATE, { state: this.state, where: this._spot?.where ?? null });
  }

  _say(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return false;
  }
}

/**
 * Interfaz del minijuego: barra vertical con la zona y el pez, y la barra de captura.
 * Solo DOM con textContent (sin HTML de fuera).
 */
export class FishingUI {
  constructor(container) {
    this.root = document.createElement('div');
    this.root.id = 'fishing-ui';
    this.root.className = 'hidden';
    this.hint = document.createElement('div');
    this.hint.className = 'fish-hint';
    this.bar = document.createElement('div');
    this.bar.className = 'fish-bar';
    this.zone = document.createElement('div');
    this.zone.className = 'fish-zone';
    this.fish = document.createElement('div');
    this.fish.className = 'fish-icon';
    this.fish.textContent = '🐟';
    this.meter = document.createElement('div');
    this.meter.className = 'fish-meter';
    this.fill = document.createElement('div');
    this.fill.className = 'fish-fill';
    this.meter.append(this.fill);
    this.bar.append(this.zone, this.fish);
    const row = document.createElement('div');
    row.className = 'fish-row';
    row.append(this.bar, this.meter);
    this.root.append(this.hint, row);
    container.append(this.root);
    this._last = '';
  }

  update(f) {
    const reel = f.state === FishState.REEL;
    const text = f.state === FishState.CAST ? '🎣 Lanzando…'
      : f.state === FishState.WAIT ? '🎣 Esperando a que pique… (clic dcho: recoger)'
        : f.state === FishState.BITE ? '❗ ¡PICA! ¡Haz clic!'
          : reel ? 'Mantén el clic para subir la zona verde · el pez dentro' : '';
    if (text !== this._last) {
      this._last = text;
      this.hint.textContent = text;
      this.root.classList.toggle('hidden', !text);
      this.root.classList.toggle('bite', f.state === FishState.BITE);
    }
    this.bar.style.display = reel ? '' : 'none';
    this.meter.style.display = reel ? '' : 'none';
    if (!reel) return;
    const g = f.game;
    this.zone.style.bottom = `${g.zone * 100}%`;
    this.zone.style.height = `${g.size * 100}%`;
    this.zone.classList.toggle('on', !!g.inside);
    this.fish.style.bottom = `calc(${g.fish * 100}% - 10px)`;
    this.fill.style.height = `${Math.max(0, Math.min(1, g.progress)) * 100}%`;
  }
}

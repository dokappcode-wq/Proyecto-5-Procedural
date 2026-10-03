import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { buildItemModel } from '../render/ItemModels.js';

/**
 * CombatSystem — escudo y armas a distancia (el golpe cuerpo a cuerpo lo hace
 * InteractionSystem con el daño del arma seleccionada).
 *
 * - Escudo (ranura OFFHAND): con el clic derecho mantenido se bloquea. Bloqueando
 *   no se puede atacar y se camina más despacio. Un ataque de frente no hace daño
 *   y gasta 1 de aguante del escudo (blockHit, lo llama el filtro de daño).
 * - Tirachinas y arco (ITEMS.*.RANGED): clic derecho mantenido = apuntar (zoom en
 *   1ª persona; cámara al hombro en 3ª). Clic izquierdo mantenido = tensar; al
 *   soltar se dispara (más tensado = más lejos y, con el arco, más daño). Cada
 *   disparo gasta munición (piedras / flechas) y 1 de aguante del arma. X cambia
 *   el tipo de flecha.
 * - Proyectiles con gravedad: dan a las criaturas (`creatures`: misma interfaz que
 *   AnimalSystem: getAnimalsNear, hitAnimal) o se clavan en el suelo.
 */
const GRAVITY = 9.8;

export class CombatSystem {
  constructor({ input, items, inventory, hotbar, equipment, player, controller, camera, cameraSystem, held, scene, world, events, power = () => 1, creatures = [] }) {
    this.name = 'combat';
    this._input = input;
    this._items = items;
    this._inv = inventory;
    this._hotbar = hotbar;
    this._eq = equipment;
    this._player = player;
    this._controller = controller;
    this._camera = camera;
    this._camSys = cameraSystem;
    this._held = held;
    this._world = world;
    this._events = events;
    this._power = power;
    this.creatures = creatures;
    this.blocking = false;
    this.aiming = false;
    this.pull = 0;          // 0..1 tensado
    this._drawing = false;
    this._ammoChoice = {};  // arma → índice de munición elegida
    this._projectiles = [];
    this._group = new THREE.Group();
    this._group.name = 'Projectiles';
    scene.add(this._group);
    this._stoneGeo = new THREE.DodecahedronGeometry(0.06, 0);
    this._stoneMat = new THREE.MeshLambertMaterial({ color: 0x8d8f93, flatShading: true });
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._eye = new THREE.Vector3();
    this._hud = document.getElementById?.('ammo-hint') ?? null;
    this._hudText = null;
  }

  /** Lo seleccionado en la barra: { id, def } */
  _selected() {
    const id = this._hotbar.selectedId;
    return { id, def: id ? this._items[id] : null };
  }

  get shieldId() {
    return this._eq.slots.OFFHAND ?? null;
  }

  /** Con lo seleccionado, ¿el clic derecho bloquea con el escudo? (puño, arma, herramienta) */
  get canBlock() {
    const { def } = this._selected();
    return !!this.shieldId && !def?.RANGED && (!def || !def.USE || def.USE === 'EQUIP' && !!def.SHIELD);
  }

  /** Arco o tirachinas en la mano. */
  get ranged() {
    return this._selected().def?.RANGED ?? null;
  }

  /** El clic derecho es de este sistema (no "usar" el objeto). */
  get capturesUse() {
    return !!this.ranged || this.canBlock;
  }

  /** El clic izquierdo no golpea (bloqueando o con un arma a distancia). */
  get suppressAttack() {
    return this.blocking || !!this.ranged;
  }

  /** Munición elegida para el arma (y cuánta queda). @returns {{ id, count } | null} */
  ammo(weaponId = this._selected().id) {
    const R = this._items[weaponId]?.RANGED;
    if (!R) return null;
    const types = R.AMMO.filter((a) => this._inv.getItemCount(a) > 0);
    if (!types.length) return { id: R.AMMO[0], count: 0 };
    const want = R.AMMO[this._ammoChoice[weaponId] ?? 0];
    const id = types.includes(want) ? want : types[0];
    return { id, count: this._inv.getItemCount(id) };
  }

  /** X: siguiente tipo de munición que se lleve. */
  cycleAmmo() {
    const { id, def } = this._selected();
    const R = def?.RANGED;
    if (!R || R.AMMO.length < 2) return;
    const start = this._ammoChoice[id] ?? 0;
    for (let k = 1; k <= R.AMMO.length; k++) {
      const i = (start + k) % R.AMMO.length;
      if (this._inv.getItemCount(R.AMMO[i]) > 0) {
        this._ammoChoice[id] = i;
        const a = this._items[R.AMMO[i]];
        this._events.emit(GameEvents.UI_MESSAGE, { text: `${a.ICON} ${a.NAME} (${a.AMMO?.DAMAGE ?? '?'} de daño)`, type: 'info' });
        return;
      }
    }
    this._events.emit(GameEvents.UI_MESSAGE, { text: 'No llevas otro tipo de flecha.', type: 'info' });
  }

  /**
   * Filtro de daño: si se bloquea y el golpe viene de delante, lo para el escudo.
   * @returns {boolean} true si lo ha parado
   */
  blockHit(d) {
    if (!this.blocking || d.fromX === undefined) return false;
    const p = this._player.position;
    const dx = d.fromX - p.x;
    const dz = d.fromZ - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(this._player.yaw);
    const fz = -Math.cos(this._player.yaw);
    if ((dx * fx + dz * fz) / len < 0.2) return false; // por detrás o de lado: no
    this._eq.wearSlot('OFFHAND', 1);
    this._events.emit(GameEvents.PLAYER_BLOCKED, { amount: d.amount });
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'block' });
    return true;
  }

  update(dt) {
    const input = this._input;
    const ranged = this.ranged;
    const busy = input.blocked || this._player.state.isSwimming || this._player.state.isClimbing;

    // Escudo.
    this.blocking = !busy && this.canBlock && input.isDown('USE');

    // Arco / tirachinas.
    this.aiming = !busy && !!ranged && input.isDown('USE');
    if (ranged && input.wasPressed('AMMO_NEXT')) this.cycleAmmo();
    if (ranged && !busy) {
      const ammo = this.ammo();
      if (input.isDown('ATTACK')) {
        if (!this._drawing && input.wasPressed('ATTACK') && !ammo.count) {
          const a = this._items[ammo.id];
          this._events.emit(GameEvents.UI_MESSAGE, { text: `Sin munición: necesitas ${a.ICON} ${a.NAME.toLowerCase()}.`, type: 'warning' });
        }
        if (ammo.count > 0) {
          this._drawing = true;
          this.pull = Math.min(1, this.pull + dt / (ranged.DRAW_TIME ?? 0.6));
        }
      } else if (this._drawing) {
        if (this.pull >= 0.2) this._fire(ranged, ammo);
        this._drawing = false;
        this.pull = 0;
      }
    } else {
      this._drawing = false;
      this.pull = 0;
    }

    // Presentación: cámara, manos, cuerpo y velocidad.
    this._camSys.setAim(this.aiming || this._drawing);
    this._held.setPose(this.blocking ? 'block' : this.aiming || this._drawing ? 'aim' : 'idle', this.pull);
    this._player.model.setCombatPose?.(this.blocking ? 'block' : this.aiming || this._drawing ? 'aim' : null);
    if (this.aiming || this._drawing || this.blocking) this._player.bodyYaw = this._player.yaw;
    this._controller.combatSpeed = this.blocking ? 0.5 : this.aiming || this._drawing ? 0.6 : 1;
    this._updateHud(ranged);

    this._updateProjectiles(dt);
  }

  _fire(R, ammo) {
    const weaponId = this._hotbar.selectedId;
    const idx = this._hotbar.selectedIndex;
    if (!this._inv.removeItem(ammo.id, 1)) return;
    this._inv.wearSlot(idx, 1);
    // Dirección: desde los ojos hacia el punto al que apunta el centro de la pantalla.
    this._camera.updateMatrixWorld();
    this._camera.getWorldDirection(this._dir);
    const camPos = new THREE.Vector3().setFromMatrixPosition(this._camera.matrixWorld);
    const target = camPos.clone().addScaledVector(this._dir, 90);
    this._player.getEyePosition(this._eye);
    const origin = this._eye.clone().addScaledVector(this._dir, 0.5);
    origin.y -= 0.15;
    const dir = target.sub(origin).normalize();
    const pull = this.pull;
    const speed = R.SPEED * (0.35 + 0.65 * pull);
    const ammoDef = this._items[ammo.id];
    const base = R.DAMAGE ?? ammoDef.AMMO?.DAMAGE ?? 5;
    const damage = base * (R.DAMAGE ? 1 : 0.4 + 0.6 * pull) * this._power();
    let mesh;
    if (ammoDef.MODEL?.TYPE === 'arrow') {
      mesh = buildItemModel(ammo.id, this._items).group;
    } else {
      mesh = new THREE.Mesh(this._stoneGeo, this._stoneMat);
    }
    mesh.position.copy(origin);
    this._group.add(mesh);
    this._projectiles.push({
      mesh, pos: origin.clone(), vel: dir.multiplyScalar(speed), damage, life: 8, stuck: 0,
      arrow: ammoDef.MODEL?.TYPE === 'arrow', gravity: ammoDef.MODEL?.TYPE === 'arrow' ? GRAVITY * 0.55 : GRAVITY,
      from: { x: this._player.position.x, z: this._player.position.z },
    });
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'shoot', weapon: weaponId });
  }

  _updateProjectiles(dt) {
    const up = new THREE.Vector3(0, 1, 0);
    for (const p of this._projectiles) {
      p.life -= dt;
      if (p.stuck) continue;
      const steps = Math.max(1, Math.ceil((p.vel.length() * dt) / 0.4));
      const h = dt / steps;
      for (let s = 0; s < steps && !p.stuck && p.life > 0; s++) {
        p.vel.y -= p.gravity * h;
        p.pos.addScaledVector(p.vel, h);
        // ¿Criatura?
        const hit = this._hitCreature(p);
        if (hit) {
          p.life = 0;
          break;
        }
        // ¿Suelo?
        const ground = this._world.getHeightAt(p.pos.x, p.pos.z);
        if (p.pos.y <= ground) {
          p.pos.y = ground + 0.02;
          p.stuck = 1;
          p.life = p.arrow ? 20 : 0.4;
          this._events.emit(GameEvents.PROJECTILE_HIT, { x: p.pos.x, y: p.pos.y, z: p.pos.z });
        }
      }
      p.mesh.position.copy(p.pos);
      if (p.arrow && !p.stuck) p.mesh.quaternion.setFromUnitVectors(up, this._v.copy(p.vel).normalize());
      else if (!p.arrow) p.mesh.rotation.x += dt * 12;
    }
    this._projectiles = this._projectiles.filter((p) => {
      if (p.life > 0) return true;
      this._group.remove(p.mesh);
      if (!p.arrow) p.mesh.geometry !== this._stoneGeo && p.mesh.geometry.dispose();
      return false;
    });
  }

  _hitCreature(p) {
    for (const source of this.creatures) {
      for (const a of source.getAnimalsNear(p.pos.x, p.pos.z, 4)) {
        const r = (a.aimRadius ?? 0.75 * (a.scale ?? 1)) + 0.15;
        const cy = a.aimY ?? a.y + 0.8 * (a.scale ?? 1);
        // Enemigos (con HEIGHT): cuenta todo el cuerpo, de los pies a la cabeza.
        const body = !!a.def?.HEIGHT && p.pos.y > a.y - 0.2 && p.pos.y < a.y + a.def.HEIGHT * a.scale && Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < r;
        if (!body && Math.hypot(a.x - p.pos.x, cy - p.pos.y, a.z - p.pos.z) > r) continue;
        const { killed, drops } = source.hitAnimal(a, p.damage, p.from.x, p.from.z);
        if (killed && drops) for (const [item, n] of Object.entries(drops)) this._inv.addItem(item, n);
        this._events.emit(GameEvents.PROJECTILE_HIT, { x: p.pos.x, y: p.pos.y, z: p.pos.z, target: a, killed });
        return true;
      }
    }
    return false;
  }

  _updateHud(ranged) {
    if (!this._hud) return;
    let text = '';
    if (ranged) {
      const a = this.ammo();
      const def = this._items[a.id];
      const multi = this._selected().def.RANGED.AMMO.length > 1;
      text = `${def.ICON} ${def.NAME} ×${a.count}${multi ? ' · X cambiar' : ''}${this._drawing ? ` · ${'▮'.repeat(Math.round(this.pull * 8))}${'▯'.repeat(8 - Math.round(this.pull * 8))}` : ''}`;
    } else if (this.blocking) {
      const max = this._items[this.shieldId]?.DURABILITY;
      text = `🛡️ Bloqueando${max ? ` · ${Math.ceil(this._eq.dur.OFFHAND ?? max)}/${max}` : ''}`;
    }
    if (text === this._hudText) return;
    this._hudText = text;
    this._hud.textContent = text;
    this._hud.classList.toggle('hidden', !text);
  }
}

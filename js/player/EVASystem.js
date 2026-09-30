import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * EVASystem — paseo espacial: el jugador fuera de la nave en el espacio.
 *
 * Toma el relevo de PlayerController y CameraSystem (que suponen "arriba" = +Y):
 *   - ingravidez: el jetpack de gas del traje empuja hacia donde miras (W/S),
 *     a los lados (A/D) y arriba/abajo (Espacio/C); Shift, más empuje. El
 *     estabilizador del traje frena poco a poco. Sin gas ni batería, a la deriva.
 *   - cerca de un meteorito su gravedad atrae hacia el centro; "arriba" pasa a
 *     ser la vertical de la superficie y se camina alrededor de él (W/A/S/D,
 *     Espacio salta).
 * La cámara (1ª o 3ª persona, V) usa esa vertical. Al volver a pisar la nave
 * (rampa, cámara de descompresión, techo) el control vuelve a ser el normal.
 */
const Y = new THREE.Vector3(0, 1, 0);

export class EVASystem {
  constructor({ config, input, look, player, controller, cameraSystem, camera, ship, meteors, worlds, lifeSupport, events }) {
    this.name = 'eva';
    this._cfg = config;
    this._input = input;
    this._look = look;
    this._player = player;
    this._controller = controller;
    this._cameraSystem = cameraSystem;
    this._camera = camera;
    this._ship = ship;
    this._meteors = meteors;
    this._worlds = worlds;
    this._life = lifeSupport;
    this._events = events;
    this.active = false;
    this.onGround = false;
    this.up = new THREE.Vector3(0, 1, 0);
    this.heading = new THREE.Vector3(0, 0, -1);
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.gravity = null; // meteorito que atrae (o null)
    this._pos = new THREE.Vector3();
    this._prev = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._t2 = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._dead = false;
    events.on(GameEvents.PLAYER_DIED, () => (this._dead = true));
    events.on(GameEvents.PLAYER_RESPAWNED, () => {
      this._dead = false;
      if (this.active) this._exit();
    });
  }

  update(dt) {
    const inSpace = this._worlds.activeId === 'SPACE';
    if (!this.active) {
      if (!inSpace || this._dead || this._ship.piloting || this._ship.isAboard(this._player.position)) return;
      this._enter();
    }
    if (!inSpace) {
      this._exit();
      return;
    }
    this._controller.enabled = false;
    this._cameraSystem.enabled = false;
    if (!this._dead) this._move(dt);
    this._view();
    if (this._canBoard()) this._exit();
  }

  _enter() {
    const p = this._player;
    this.active = true;
    this.up.copy(Y);
    this.heading.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    this.pitch = p.pitch;
    this.velocity.copy(p.velocity);
    this.onGround = false;
    this._leftRamp = false;
    this._events.emit(GameEvents.EVA_CHANGED, { active: true });
    this._msg(this._life.wearing
      ? 'Paseo espacial: [W/S] jetpack adelante/atrás · [A/D] lados · [Espacio/C] subir/bajar · [Shift] más empuje. Vuelve por la rampa.'
      : '¡Estás en el vacío sin traje!', this._life.wearing ? 'biome' : 'danger');
  }

  _exit() {
    const p = this._player;
    this.active = false;
    this.gravity = null;
    const h = this._t.copy(this.heading).setY(0);
    const yaw = h.lengthSq() > 1e-6 ? Math.atan2(-h.x, -h.z) : p.yaw;
    p.yaw = yaw;
    p.bodyYaw = yaw;
    p.pitch = 0;
    p.velocity.set(0, 0, 0);
    p.model.root.quaternion.identity();
    p.model.root.rotation.set(0, yaw, 0);
    this._camera.up.copy(Y);
    this._controller.enabled = true;
    this._cameraSystem.enabled = true;
    this._events.emit(GameEvents.EVA_CHANGED, { active: false });
  }

  /** ¿Pisa la nave (rampa, suelo, techo)? Entonces vuelve el control normal. */
  _canBoard() {
    const s = this._ship;
    const p = this._player.position;
    if (!s.present) return false;
    // Asidero: cerca del pie de la rampa abierta, el jugador se agarra y sube a ella.
    if (s.ship.hatch > 0.95) {
      const L = s.layout;
      const end = L.rampEnd(s.ship);
      const z = end.z - 0.4;
      const [wx, wz] = L.toWorld(s.ship, 0, z);
      const top = s.ship.y + L.DIM.FLOOR - (z - L.HATCH.HINGE_Z) * Math.tan(end.angle);
      const d = Math.hypot(p.x - wx, p.y - top, p.z - wz);
      if (d > 5) this._leftRamp = true; // solo al volver (no nada más salir)
      if (this._leftRamp && d < 2.5) {
        p.set(wx, top + 0.05, wz);
        this.up.copy(Y);
        return true;
      }
    }
    if (this.up.y < 0.9 || !s.isAboard(p)) return false;
    const floor = s.surfaceAt(p.x, p.z, p.y + 0.6);
    return floor !== null && p.y - floor < 1.2 && p.y - floor > -0.6;
  }

  _move(dt) {
    const c = this._cfg;
    const input = this._input;
    const pos = this._pos.copy(this._player.position);
    this._prev.copy(pos);
    // Mirar.
    const m = input.getMouseDelta();
    const sens = this._look.sensitivity;
    this.heading.applyAxisAngle(this.up, -m.x * sens);
    this.pitch = THREE.MathUtils.clamp(this.pitch - m.y * sens * (this._look.invertY ? -1 : 1), -1.45, 1.45);
    if (input.wasPressed('TOGGLE_CAMERA')) this._cameraSystem.toggleMode();

    // Vertical: la del meteorito que atrae o, sin él, poco a poco la de la nave.
    const g = this._meteors.gravityAt(pos);
    this.gravity = g;
    const target = g ? g.dir : Y;
    const rate = g ? (g.height < 4 ? 10 : 3) : 1.2;
    this.up.lerp(target, 1 - Math.exp(-rate * dt)).normalize();
    this.heading.addScaledVector(this.up, -this.heading.dot(this.up));
    if (this.heading.lengthSq() < 1e-6) this.heading.set(1, 0, 0).addScaledVector(this.up, -this.up.x);
    this.heading.normalize();
    const right = this._t.copy(this.heading).cross(this.up).normalize();
    const look = this._t2.copy(this.heading).multiplyScalar(Math.cos(this.pitch)).addScaledVector(this.up, Math.sin(this.pitch));

    const axis = (a, b) => (input.isDown(a) ? 1 : 0) - (input.isDown(b) ? 1 : 0);
    const f = axis('FORWARD', 'BACKWARD');
    const s = axis('RIGHT', 'LEFT');
    const v = axis('JUMP', 'DESCEND');
    const boost = input.isDown('RUN');
    const jet = this._life.wearing && this._life.powered && this._life.gas > 0;
    const vel = this.velocity;

    if (g && this.onGround) {
      // Caminar sobre el meteorito.
      const walk = new THREE.Vector3().addScaledVector(this.heading, f).addScaledVector(right, s);
      if (walk.lengthSq() > 1) walk.normalize();
      vel.copy(walk.multiplyScalar(c.WALK_SPEED * (boost ? 1.5 : 1)));
      if (input.wasPressed('JUMP')) {
        vel.addScaledVector(this.up, c.JUMP);
        this.onGround = false;
      }
    } else {
      const thrust = new THREE.Vector3().addScaledVector(look, f).addScaledVector(right, s).addScaledVector(this.up, v);
      if (thrust.lengthSq() > 0 && jet) {
        thrust.normalize().multiplyScalar(c.THRUST * (boost ? c.BOOST : 1) * dt);
        vel.add(thrust);
        this._life.useGas(dt * (boost ? c.BOOST : 1));
      } else if (jet) {
        vel.multiplyScalar(Math.exp(-c.DAMPING * dt)); // estabilizador del traje
      }
      if (g) vel.addScaledVector(g.dir, -g.gravity * dt);
      if (vel.length() > c.MAX_SPEED) vel.setLength(c.MAX_SPEED);
    }
    pos.addScaledVector(vel, dt);

    // Superficie del meteorito.
    const g2 = this._meteors.gravityAt(pos);
    if (g2 && g2.height <= 0.02) {
      pos.copy(g2.center).addScaledVector(g2.dir, g2.surface);
      const vr = vel.dot(g2.dir);
      if (vr < 0) vel.addScaledVector(g2.dir, -vr);
      if (!this.onGround && vr < -0.5) this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'land' });
      this.onGround = true;
    } else if (g2 && this.onGround && g2.height < 0.6 && vel.dot(g2.dir) <= 0.01) {
      pos.copy(g2.center).addScaledVector(g2.dir, g2.surface); // pegado al suelo al caminar
    } else {
      this.onGround = false;
    }

    // La nave: no atravesar el casco (paredes y suelos).
    const sh = this._ship;
    if (sh.present) {
      sh.resolveCollisions(pos, 0.35, pos.y + 0.3, pos.y + 1.7);
      // Rampa, suelo o techo de la nave bajo los pies: se pisa (y se vuelve a bordo).
      const floor = sh.surfaceAt(pos.x, pos.z, pos.y + 0.5);
      if (floor !== null && floor > pos.y - 0.1 && this._prev.y >= floor - 0.08 && vel.y <= 0.5) {
        pos.y = floor;
        if (vel.y < 0) vel.y = 0;
      } else if (sh.blocksAt(pos.x, pos.z, 0.3, pos.y + 0.5, pos.y + 1.7)) {
        pos.copy(this._prev); // el casco a la altura del cuerpo: no se atraviesa
        vel.multiplyScalar(-0.2);
      }
    }

    const p = this._player;
    p.position.copy(pos);
    p.velocity.copy(vel);
    p.state.onGround = this.onGround;
    p.state.isMoving = vel.lengthSq() > 0.2;
    p.state.isRunning = false;
    p.pitch = this.pitch;
  }

  /** Cuerpo y cámara orientados con la vertical local. */
  _view() {
    const p = this._player;
    const up = this.up;
    const back = this._t.copy(this.heading).negate();
    const right = this._t2.copy(up).cross(back).normalize();
    this._m.makeBasis(right, up, back);
    p.model.root.position.copy(p.position);
    p.model.root.quaternion.setFromRotationMatrix(this._m);
    p.yaw = p.bodyYaw = 0;

    const cam = this._camera;
    const look = new THREE.Vector3().copy(this.heading).multiplyScalar(Math.cos(this.pitch)).addScaledVector(up, Math.sin(this.pitch));
    const eye = new THREE.Vector3().copy(p.position).addScaledVector(up, 1.62);
    cam.up.copy(up);
    if (this._cameraSystem.mode === 'FIRST_PERSON') {
      cam.position.copy(eye);
    } else {
      cam.position.copy(eye).addScaledVector(look, -this._cfg.CAMERA_DISTANCE).addScaledVector(up, 0.8);
    }
    cam.lookAt(eye.addScaledVector(look, 2));
  }

  /** Distancia a la nave (m) para el HUD. */
  distanceToShip() {
    const s = this._ship.ship;
    return Math.hypot(this._player.position.x - s.x, this._player.position.y - (s.y + 3), this._player.position.z - s.z);
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}

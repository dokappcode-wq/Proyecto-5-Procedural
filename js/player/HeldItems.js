import * as THREE from 'three';
import { buildItemModel, flickerTorch } from '../render/ItemModels.js';

/**
 * HeldItems — lo que el jugador lleva en las manos.
 *
 * - 3ª persona: el modelo del objeto seleccionado en la barra va en la mano derecha
 *   del personaje (el escudo, en la izquierda).
 * - 1ª persona: "vista de manos": un brazo derecho (con el objeto) abajo a la
 *   derecha de la pantalla, que se balancea al andar y golpea al actuar. Se dibuja
 *   en una escena aparte encima del mundo (RenderContext.addOverlay), así no se mete
 *   dentro de las paredes ni de los árboles.
 *
 * Solo presentación: el objeto seleccionado, el escudo y la pose (bloquear, apuntar)
 * se los dicen otros sistemas.
 */
export class HeldItems {
  constructor({ player, camera, render, items, lighting }) {
    this.name = 'heldItems';
    this._player = player;
    this._model = player.model;
    this._camera = camera;
    this._items = items;
    this._lighting = lighting;
    this._t = 0;
    this._swing = 0;       // 0..1 animación de golpe en 1ª persona
    this._swingDur = 0.32;
    this._bob = 0;
    this.firstPerson = false;
    this.pose = 'idle';    // 'idle' | 'block' | 'aim'
    this._poseK = { block: 0, aim: 0 };
    this._aimPull = 0;     // 0..1 tensado del arco / tirachinas

    // ---- 3ª persona: anclajes en las manos del personaje ----
    this._rightAnchor = new THREE.Group();
    this._leftAnchor = new THREE.Group();
    if (this._model.rightHand) {
      this._rightAnchor.position.set(0, -0.06, -0.01);
      this._model.rightHand.add(this._rightAnchor);
      this._leftAnchor.position.set(-0.02, -0.05, -0.06);
      this._model.leftHand.add(this._leftAnchor);
    } else {
      this._rightAnchor.position.set(0, -0.6, -0.02);
      this._model.rightArm.add(this._rightAnchor);
      this._leftAnchor.position.set(-0.04, -0.5, -0.1);
      this._model.leftArm.add(this._leftAnchor);
    }

    // ---- 1ª persona: escena superpuesta con su luz ----
    this.overlay = new THREE.Scene();
    this._hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1);
    this._sun = new THREE.DirectionalLight(0xffffff, 1);
    this.overlay.add(this._hemi, this._sun, this._sun.target);
    this._rig = new THREE.Group();
    this.overlay.add(this._rig);
    // Brazos: el pivote está en la mano (abajo a un lado) y el antebrazo con la manga
    // sale hacia atrás y abajo, fuera de la pantalla. El objeto sale de la mano hacia arriba.
    this._armMat = new THREE.MeshLambertMaterial({ color: 0xe0ac86, flatShading: true });
    this._sleeveMat = new THREE.MeshLambertMaterial({ color: 0xe0ac86, flatShading: true });
    this._armMat.color.set(this._model.handColor ?? 0xe0ac86);
    this._sleeveMat.color.set(this._model.sleeveColor ?? 0xe0ac86);
    this._armPivot = new THREE.Group();
    this._rig.add(this._armPivot);
    this._armPivot.add(fpArm(1, this._armMat, this._sleeveMat));
    this._fpRight = new THREE.Group();
    this._armPivot.add(this._fpRight);
    // Mano izquierda (escudo; tensar el tirachinas o el arco).
    this._leftPivot = new THREE.Group();
    this._rig.add(this._leftPivot);
    this._fpLeft = new THREE.Group();
    this._leftPivot.add(this._fpLeft);
    this._leftHand = fpArm(-1, this._armMat, this._sleeveMat);
    this._leftHand.visible = false;
    this._leftPivot.add(this._leftHand);
    this._sway = { x: 0, y: 0 };
    this._lastYaw = null;
    this._lastPitch = 0;

    this._rightId = null;
    this._leftId = null;
    this._models = { tp: null, fp: null, tpLeft: null, fpLeft: null };
    render.addOverlay?.(this.overlay, camera, () => this.firstPerson && this._rig.visible);
  }

  /** Objeto en la mano derecha (el seleccionado en la barra) y en la izquierda (escudo). */
  setHeld(rightId, leftId = null) {
    if (rightId !== this._rightId) {
      this._rightId = rightId;
      this._swap('tp', this._rightAnchor, rightId, 'right3');
      this._swap('fp', this._fpRight, rightId, 'right1');
    }
    if (leftId !== this._leftId) {
      this._leftId = leftId;
      this._swap('tpLeft', this._leftAnchor, leftId, 'left3');
      this._swap('fpLeft', this._fpLeft, leftId, 'left1');
    }
  }

  /** Color de las manos (piel o guantes). */
  setHandColor(color) {
    this._armMat.color.set(color);
  }

  /** Color de las mangas (piel sin ropa, o la chaqueta). */
  setSleeveColor(color) {
    this._sleeveMat.color.set(color);
  }

  /** Golpe / acción: animación del brazo en 1ª persona (en 3ª la hace PlayerModel). */
  playAction(duration = 0.32) {
    this._swing = 1;
    this._swingDur = duration;
  }

  /** Vista en 1ª persona (con el cuerpo oculto) o no. */
  setFirstPerson(on) {
    this.firstPerson = on;
  }

  /** Pose de las manos: 'idle', 'block' (escudo delante) o 'aim' (arco / tirachinas tensado). */
  setPose(pose, pull = 0) {
    this.pose = pose;
    this._aimPull = pull;
  }

  update(dt) {
    this._t += dt;
    const p = this._player;
    // El rig sigue a la cámara.
    this._camera.updateMatrixWorld();
    this._rig.position.setFromMatrixPosition(this._camera.matrixWorld);
    this._rig.quaternion.setFromRotationMatrix(this._camera.matrixWorld);
    // Luz parecida a la del mundo (día, noche, cueva).
    const L = this._lighting;
    if (L) {
      this._hemi.intensity = L.hemi.intensity;
      this._hemi.color.copy(L.hemi.color);
      this._hemi.groundColor.copy(L.hemi.groundColor);
      this._sun.intensity = L.sun.intensity;
      this._sun.color.copy(L.sun.color);
      this._sun.position.copy(this._rig.position).addScaledVector(L.sunDirection, 10);
      this._sun.target.position.copy(this._rig.position);
    }
    for (const m of [this._models.tp, this._models.fp]) flickerTorch(m, this._t);
    if (this._models.fp?.light) this._models.fp.light.intensity *= 0.6;

    // Balanceo al andar (y respirar quieto).
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (p.state.onGround && speed > 0.5) this._bob += dt * (5 + speed * 1.2);
    const bobK = Math.min(1, speed / 6) * (p.state.onGround ? 1 : 0.2);
    const bx = Math.sin(this._bob) * 0.02 * bobK;
    const by = -Math.abs(Math.cos(this._bob)) * 0.026 * bobK + Math.sin(this._t * 1.8) * 0.004;
    // Inercia al mover la vista: las manos se quedan un poco atrás.
    if (this._lastYaw === null) this._lastYaw = p.yaw;
    const dyaw = wrapAngle(p.yaw - this._lastYaw);
    const dpitch = p.pitch - this._lastPitch;
    this._lastYaw = p.yaw;
    this._lastPitch = p.pitch;
    const k = Math.min(1, dt * 8);
    this._sway.x += (Math.max(-0.05, Math.min(0.05, dyaw * 0.6)) - this._sway.x) * k;
    this._sway.y += (Math.max(-0.04, Math.min(0.04, -dpitch * 0.6)) - this._sway.y) * k;

    // Poses (suaves).
    for (const key of ['block', 'aim']) this._poseK[key] += ((this.pose === key ? 1 : 0) - this._poseK[key]) * Math.min(1, dt * 12);
    const block = this._poseK.block;
    const aim = this._poseK.aim;
    const fp = this._models.fp;
    const ranged = fp && (fp.kind === 'slingshot' || fp.kind === 'bow');

    // Golpe: con herramienta, toma impulso (arriba) y descarga hacia abajo; con el puño,
    // un directo hacia delante que vuelve.
    let lift = 0;
    let chop = 0;
    let jab = 0;
    if (this._swing > 0) {
      this._swing = Math.max(0, this._swing - dt / this._swingDur);
      const u = 1 - this._swing;
      const tool = fp && fp.kind !== 'item';
      if (tool) {
        if (u < 0.28) lift = smooth(u / 0.28);
        else if (u < 0.55) {
          lift = 1 - smooth((u - 0.28) / 0.27);
          chop = smooth((u - 0.28) / 0.27);
        } else chop = 1 - smooth((u - 0.55) / 0.45);
      } else {
        jab = u < 0.35 ? smooth(u / 0.35) : 1 - smooth((u - 0.35) / 0.65);
      }
    }
    const a = this._armPivot;
    const empty = !fp ? 1 : 0;
    a.position.set(
      0.3 - empty * 0.05 + bx - this._sway.x - aim * (ranged ? 0.3 : 0.24) - jab * 0.08,
      -0.3 + empty * 0.05 + by - this._sway.y - block * 0.1 + lift * 0.08 - chop * 0.12 + aim * (ranged ? 0.1 : 0),
      -0.5 - jab * 0.3 + aim * 0.04,
    );
    a.rotation.set(lift * 0.55 - chop * 1.25 + aim * 0.08, -aim * (ranged ? 0.05 : 0.25) + jab * 0.2, -jab * 0.25 + lift * 0.1);

    // Izquierda: con escudo, delante; con tirachinas o arco al apuntar, tensa la goma o
    // la cuerda hacia la cara (cuanto más tensa, más cerca).
    const l = this._leftPivot;
    const pullHand = ranged && aim > 0.05;
    this._leftHand.visible = !!this._leftId || pullHand;
    if (pullHand) {
      const pull = this._aimPull;
      l.position.set(-0.02 + bx * 0.5 - this._sway.x, -0.2 + by - this._sway.y + 0.05 * aim, -0.42 + pull * 0.2 - (1 - aim) * 0.2);
      l.rotation.set(0.25, 0.4, -0.6);
    } else {
      l.position.set(-0.36 + bx - this._sway.x + block * 0.2, -0.34 + by - this._sway.y + block * 0.16, -0.55 + block * 0.08);
      l.rotation.set(block * 0.1, block * 0.3, 0);
    }

    // Arco: la cuerda se tensa; tirachinas: la badana se estira.
    const string = fp?.group.getObjectByName('string');
    if (string) string.position.z = 0.22 + this._aimPull * 0.18;
    const pouch = fp?.group.getObjectByName('pouch');
    if (pouch) pouch.position.z = 0.06 + this._aimPull * 0.22;
    const bands = fp?.group.getObjectByName('bands');
    if (bands) bands.scale.z = 1 + this._aimPull * 3.67;
  }

  _swap(slot, parent, itemId, where) {
    const old = this._models[slot];
    if (old) parent.remove(old.group);
    const m = itemId ? buildItemModel(itemId, this._items) : null;
    this._models[slot] = m;
    if (!m) return;
    placeModel(m, where);
    if (where.endsWith('1')) m.group.traverse((o) => (o.castShadow = false));
    parent.add(m.group);
  }
}

/** Cómo se sujeta cada tipo de objeto en cada mano y vista. */
function placeModel(m, where) {
  const g = m.group;
  g.position.set(0, 0, 0);
  g.rotation.set(0, 0, 0);
  g.scale.setScalar(1);
  if (where === 'right3') {
    g.scale.setScalar(1.3); // un poco más grande que en la realidad: que se lea desde la cámara
    // Brazo colgando: el mango apunta hacia delante (−Z) y el filo hacia abajo.
    if (m.kind === 'bow') g.rotation.set(0, 0, 0);
    else if (m.kind === 'torch') g.rotation.set(-1.2, 0, 0);
    else g.rotation.set(-0.75, 0, 0.25); // inclinado hacia delante y hacia fuera: se ve por encima del hombro
  } else if (where === 'left3') {
    if (m.kind === 'shield') g.position.set(-0.08, 0.02, 0.08);
    g.rotation.set(0, Math.PI / 2, 0);
  } else if (where === 'right1') {
    // Vista en 1ª persona: el mango sale de la mano hacia arriba, inclinado hacia dentro y adelante.
    g.scale.setScalar(0.62);
    if (m.kind === 'bow') {
      // Arco vertical, casi de canto (se ve la curva), a la izquierda de la mano.
      g.scale.setScalar(0.5);
      g.rotation.set(0, 0.45, 0.12);
      g.position.set(-0.12, 0.08, -0.05);
    } else if (m.kind === 'slingshot') {
      g.rotation.set(-0.25, 0, 0.1);
    } else if (m.kind === 'torch') {
      g.rotation.set(-0.2, 0, 0.2);
    } else {
      g.rotation.set(-0.42, 0.3, 0.32);
    }
  } else if (where === 'left1') {
    g.scale.setScalar(0.45);
    g.rotation.set(0, 0.35, 0);
    g.position.set(-0.05, -0.04, 0);
  }
}

/**
 * Brazo en 1ª persona: mano (palma, dedos doblados como agarrando un mango que sube
 * en +Y, pulgar) y antebrazo con manga, que va hacia atrás y abajo (+Z, −Y).
 * side: 1 derecha, −1 izquierda (en la izquierda, el reloj).
 */
function fpArm(side, skinMat, sleeveMat) {
  const g = new THREE.Group();
  const add = (geo, mat, [x, y, z], [sx, sy, sz] = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(...rot);
    g.add(m);
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Palma y dorso.
  add(new THREE.IcosahedronGeometry(1, 1), skinMat, [side * 0.012, -0.005, 0.012], [0.042, 0.052, 0.034]);
  // Cuatro dedos curvados alrededor del mango (por delante, −Z) y el pulgar por el otro lado.
  const finger = new THREE.CapsuleGeometry(0.0105, 0.04, 2, 6);
  finger.rotateZ(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const y = 0.032 - i * 0.021;
    add(finger, skinMat, [side * -0.004, y, -0.027], [1, 1, 1], [0, side * 0.35, 0]);
    add(new THREE.IcosahedronGeometry(0.012, 0), skinMat, [side * -0.03, y, -0.012]);
  }
  add(new THREE.CapsuleGeometry(0.012, 0.035, 2, 6), skinMat, [side * 0.03, 0.035, -0.022], [1, 1, 1], [0.5, 0, side * -0.55]);
  // Antebrazo (cónico) y manga.
  const fore = new THREE.CylinderGeometry(0.036, 0.046, 0.46, 9);
  fore.rotateX(Math.PI / 2 - 0.45);
  add(fore, skinMat, [side * 0.035, -0.105, 0.21]);
  const sleeve = new THREE.CylinderGeometry(0.058, 0.066, 0.3, 9);
  sleeve.rotateX(Math.PI / 2 - 0.45);
  add(sleeve, sleeveMat, [side * 0.04, -0.17, 0.36]);
  add(new THREE.TorusGeometry(0.056, 0.012, 5, 10), sleeveMat, [side * 0.038, -0.11, 0.235], [1, 1, 1], [-0.45, 0, 0]);
  if (side < 0) {
    // Reloj en la muñeca izquierda.
    add(new THREE.CylinderGeometry(0.044, 0.044, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0x2b3440 }), [side * 0.02, -0.055, 0.1], [1, 1, 1], [Math.PI / 2 - 0.45, 0, 0]);
    add(box, new THREE.MeshBasicMaterial({ color: 0x4fe0ff }), [side * 0.02, -0.025, 0.088], [0.045, 0.004, 0.035], [-0.45, 0, 0]);
  }
  return g;
}

function smooth(v) {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return c * c * (3 - 2 * c);
}

function wrapAngle(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

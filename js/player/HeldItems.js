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
    this._rightAnchor.position.set(0, -0.6, -0.02);
    this._model.rightArm.add(this._rightAnchor);
    this._leftAnchor = new THREE.Group();
    this._leftAnchor.position.set(-0.04, -0.5, -0.1);
    this._model.leftArm.add(this._leftAnchor);

    // ---- 1ª persona: escena superpuesta con su luz ----
    this.overlay = new THREE.Scene();
    this._hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1);
    this._sun = new THREE.DirectionalLight(0xffffff, 1);
    this.overlay.add(this._hemi, this._sun, this._sun.target);
    this._rig = new THREE.Group();
    this.overlay.add(this._rig);
    // Mano derecha: el pivote está en la mano (abajo a la derecha) y el antebrazo sale
    // hacia atrás y abajo, fuera de la pantalla. El objeto sale de la mano hacia arriba.
    this._armPivot = new THREE.Group();
    this._rig.add(this._armPivot);
    this._armMat = new THREE.MeshLambertMaterial({ color: 0xe0ac86 });
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.5), this._armMat);
    fore.position.set(0.05, -0.12, 0.24);
    fore.rotation.x = -0.45;
    this._armPivot.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.11), this._armMat);
    this._armPivot.add(hand);
    this._fpRight = new THREE.Group();
    this._armPivot.add(this._fpRight);
    // Mano izquierda (escudo, arco): la misma idea, a la izquierda.
    this._leftPivot = new THREE.Group();
    this._rig.add(this._leftPivot);
    this._fpLeft = new THREE.Group();
    this._leftPivot.add(this._fpLeft);
    const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.11), this._armMat);
    const lfore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.5), this._armMat);
    lfore.position.set(-0.05, -0.12, 0.24);
    lfore.rotation.x = -0.45;
    this._leftHand = new THREE.Group();
    this._leftHand.add(lhand, lfore);
    this._leftHand.visible = false;
    this._leftPivot.add(this._leftHand);

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
      this._leftHand.visible = !!leftId;
    }
  }

  /** Color de las manos (piel o guantes). */
  setHandColor(color) {
    this._armMat.color.set(color);
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

    // Balanceo al andar.
    const speed = Math.hypot(p.velocity.x, p.velocity.z);
    if (p.state.onGround && speed > 0.5) this._bob += dt * (5 + speed * 1.2);
    const bobK = Math.min(1, speed / 6) * (p.state.onGround ? 1 : 0.2);
    const bx = Math.sin(this._bob) * 0.018 * bobK;
    const by = -Math.abs(Math.cos(this._bob)) * 0.022 * bobK;

    // Poses (suaves).
    for (const k of ['block', 'aim']) this._poseK[k] += ((this.pose === k ? 1 : 0) - this._poseK[k]) * Math.min(1, dt * 12);
    const block = this._poseK.block;
    const aim = this._poseK.aim;

    // Golpe: el brazo se lanza hacia delante y abajo (arco de tala o puñetazo).
    let sx = 0;
    let sz = 0;
    if (this._swing > 0) {
      this._swing = Math.max(0, this._swing - dt / this._swingDur);
      const u = 1 - this._swing;
      const k = Math.sin(u * Math.PI);
      const tool = this._models.fp && this._models.fp.kind !== 'item';
      sx = tool ? -k * 1.1 : 0;   // con herramienta: tajo hacia abajo
      sz = tool ? 0 : k * 0.28;   // puño: estocada hacia delante
    }
    const a = this._armPivot;
    const empty = !this._models.fp ? 1 : 0; // puño: algo más arriba y hacia dentro
    a.position.set(0.3 - empty * 0.04 + bx - aim * 0.24, -0.3 + empty * 0.06 + by - block * 0.1 + sx * 0.06, -0.5 - sz + aim * 0.06);
    a.rotation.set(sx * 1.0 + aim * 0.1, -aim * 0.25, 0);

    const l = this._leftPivot;
    l.position.set(-0.36 + bx + block * 0.2 + aim * 0.26, -0.34 + by + block * 0.16 + aim * 0.22, -0.55 + block * 0.08);
    l.rotation.set(block * 0.1, block * 0.3, 0);

    // Arco: la cuerda se tensa al apuntar.
    const string = this._models.fp?.group.getObjectByName('string');
    if (string) string.position.z = 0.22 + this._aimPull * 0.18;
    const pouch = this._models.fp?.group.getObjectByName('pouch');
    if (pouch) pouch.position.z = 0.06 + this._aimPull * 0.22;
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

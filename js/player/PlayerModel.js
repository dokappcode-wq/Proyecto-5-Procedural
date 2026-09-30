import * as THREE from 'three';

/**
 * PlayerModel — representación visual del personaje (humanoide de bloques).
 *
 * Solo presentación: recibe el estado ya calculado y anima extremidades.
 * La parte frontal mira hacia -Z local, que coincide con la convención de
 * "adelante" de Three.js, de modo que rotation.y = yaw alinea cuerpo y vista.
 *
 * Alturas (m): piernas 0–0.8, torso 0.8–1.4, cabeza 1.4–1.8.
 */
export class PlayerModel {
  constructor({ colors }) {
    this.root = new THREE.Group();
    this.root.name = 'PlayerModel';

    const box = new THREE.BoxGeometry(1, 1, 1); // compartida por todas las piezas
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const skin = mat(colors.SKIN);
    const shirt = mat(colors.SHIRT);
    const pants = mat(colors.PANTS);
    const boots = mat(colors.BOOTS);
    const hair = mat(colors.HAIR);
    const eye = mat(0x1d1d24);

    const part = (material, sx, sy, sz, x, y, z, parent) => {
      const m = new THREE.Mesh(box, material);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };

    // Piernas: pivote en la cadera para animar la zancada.
    this.leftLeg = this._pivot(-0.12, 0.8, 0);
    this.rightLeg = this._pivot(0.12, 0.8, 0);
    for (const leg of [this.leftLeg, this.rightLeg]) {
      part(pants, 0.22, 0.62, 0.26, 0, -0.31, 0, leg);
      part(boots, 0.24, 0.18, 0.3, 0, -0.71, -0.02, leg);
    }

    // Torso
    this.torso = part(shirt, 0.5, 0.6, 0.28, 0, 1.1, 0, this.root);

    // Brazos: pivote en el hombro.
    this.leftArm = this._pivot(-0.34, 1.36, 0);
    this.rightArm = this._pivot(0.34, 1.36, 0);
    for (const arm of [this.leftArm, this.rightArm]) {
      part(shirt, 0.18, 0.3, 0.2, 0, -0.12, 0, arm);
      part(skin, 0.16, 0.34, 0.18, 0, -0.42, 0, arm);
    }

    // Cabeza: pivote en el cuello para mirar arriba/abajo.
    this.head = this._pivot(0, 1.4, 0);
    part(skin, 0.4, 0.4, 0.4, 0, 0.2, 0, this.head);
    part(hair, 0.42, 0.1, 0.42, 0, 0.42, 0.0, this.head);
    part(hair, 0.42, 0.26, 0.08, 0, 0.3, 0.18, this.head);
    part(eye, 0.07, 0.07, 0.02, -0.09, 0.24, -0.205, this.head);
    part(eye, 0.07, 0.07, 0.02, 0.09, 0.24, -0.205, this.head);

    this._walkPhase = 0;
    this._swing = 0;
    this._actionTime = 0; // >0 durante la animación de golpear/recoger
  }

  /** Animación corta del brazo derecho (golpear, recoger). */
  playAction(duration = 0.32) {
    this._actionTime = duration;
    this._actionDuration = duration;
  }

  _pivot(x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    this.root.add(g);
    return g;
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  /**
   * @param {number} dt
   * @param {{horizontalSpeed:number, maxSpeed:number, onGround:boolean, headPitch:number, headYaw:number}} s
   */
  animate(dt, s) {
    const moveFactor = Math.min(s.horizontalSpeed / s.maxSpeed, 1);
    const targetSwing = s.onGround ? moveFactor * 0.9 : 0.25;
    this._swing += (targetSwing - this._swing) * Math.min(1, dt * 10);
    this._walkPhase += dt * (4 + s.horizontalSpeed * 1.6) * (moveFactor > 0.05 ? 1 : 0);

    const swing = Math.sin(this._walkPhase) * this._swing;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    if (s.onGround) {
      this.leftArm.rotation.x = -swing * 0.8;
      this.rightArm.rotation.x = swing * 0.8;
      this.leftArm.rotation.z = this.rightArm.rotation.z = 0;
    } else {
      // En el aire: brazos ligeramente abiertos.
      this.leftArm.rotation.x = this.rightArm.rotation.x = -0.4;
      this.leftArm.rotation.z = -0.35;
      this.rightArm.rotation.z = 0.35;
    }

    // Golpe/recogida: el brazo derecho se lanza hacia delante.
    if (this._actionTime > 0) {
      this._actionTime = Math.max(0, this._actionTime - dt);
      const t = 1 - this._actionTime / this._actionDuration;
      this.rightArm.rotation.x = Math.sin(t * Math.PI) * 1.7; // frente = -Z
      this.rightArm.rotation.z = 0;
    }

    // Leve rebote del torso al caminar.
    this.torso.position.y = 1.1 + Math.abs(Math.cos(this._walkPhase)) * 0.03 * moveFactor;

    this.head.rotation.order = 'YXZ';
    this.head.rotation.y = s.headYaw;
    this.head.rotation.x = s.headPitch;
  }
}

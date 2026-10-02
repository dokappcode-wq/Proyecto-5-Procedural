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
    // Sin ropa, torso, piernas y pies son piel (la ropa los tiñe: setOutfit).
    const shirt = mat(colors.SHIRT ?? colors.SKIN);
    this._shirt = shirt;
    this._shirtColor = colors.SHIRT ?? colors.SKIN;
    const pants = mat(colors.PANTS ?? colors.SKIN);
    const boots = mat(colors.BOOTS ?? colors.SKIN);
    this._boots = boots;
    this._bootsColor = colors.BOOTS ?? colors.SKIN;
    this._skinColor = colors.SKIN;
    const hands = mat(colors.SKIN); // antebrazos y manos (guantes)
    this._hands = hands;
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
      part(hands, 0.16, 0.34, 0.18, 0, -0.42, 0, arm);
    }

    // Reloj de pulsera en la muñeca izquierda (Tab: la cámara se acerca a él).
    // La esfera mira a -Z local: al levantar el brazo hacia delante queda hacia arriba.
    const strap = mat(colors.WATCH ?? 0x2b3440);
    this._watchParts = [
      part(strap, 0.185, 0.07, 0.205, 0, -0.5, 0, this.leftArm),
      part(strap, 0.13, 0.1, 0.03, 0, -0.5, -0.11, this.leftArm),
    ];
    // Pantalla: textura de lienzo con la hora (setWatchText).
    this._watchCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this._watchColor = new THREE.Color(colors.WATCH_SCREEN ?? 0x4fe0ff);
    if (this._watchCanvas) {
      this._watchCanvas.width = 128;
      this._watchCanvas.height = 96;
      this._watchTex = new THREE.CanvasTexture(this._watchCanvas);
      this._watchTex.colorSpace = THREE.SRGBColorSpace;
      // La cara de la esfera queda girada 180° al levantar el brazo: se compensa.
      this._watchTex.center.set(0.5, 0.5);
      this._watchTex.rotation = Math.PI;
    }
    this._watchScreenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this._watchTex ?? null });
    this.watch = part(this._watchScreenMat, 0.1, 0.075, 0.012, 0, -0.5, -0.127, this.leftArm);
    this.setWatchText('--:--');
    this.watch.castShadow = false;
    this._watchParts.push(this.watch);

    // Hojas que tapan pecho y entrepierna (se empieza desnudo).
    const leafGeo = makeLeafGeometry();
    const leafMat = new THREE.MeshLambertMaterial({ color: colors.LEAF ?? 0x4f9a3a, side: THREE.DoubleSide });
    const leaf = (x, y, z, size, rotZ) => {
      const m = new THREE.Mesh(leafGeo, leafMat);
      m.position.set(x, y, z);
      m.scale.setScalar(size);
      m.rotation.z = rotZ;
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    this._chestLeaves = [leaf(-0.12, 1.24, -0.146, 0.15, 0.5), leaf(0.12, 1.24, -0.146, 0.15, -0.5)];
    this._groinLeaf = leaf(0, 0.8, -0.146, 0.2, Math.PI);

    // Cabeza: pivote en el cuello para mirar arriba/abajo.
    this.head = this._pivot(0, 1.4, 0);
    part(skin, 0.4, 0.4, 0.4, 0, 0.2, 0, this.head);
    part(hair, 0.42, 0.1, 0.42, 0, 0.42, 0.0, this.head);
    part(hair, 0.42, 0.26, 0.08, 0, 0.3, 0.18, this.head);
    part(eye, 0.07, 0.07, 0.02, -0.09, 0.24, -0.205, this.head);
    part(eye, 0.07, 0.07, 0.02, 0.09, 0.24, -0.205, this.head);
    // Gorro (oculto sin él).
    this._capMat = mat(0x7a4a24);
    this._cap = new THREE.Group();
    part(this._capMat, 0.46, 0.14, 0.46, 0, 0.44, 0, this._cap);
    part(this._capMat, 0.46, 0.04, 0.16, 0, 0.38, -0.27, this._cap); // visera
    this._cap.visible = false;
    this.head.add(this._cap);

    // Traje espacial: casco transparente, mochila con el jetpack (ocultos sin traje).
    this._pants = pants;
    this._pantsColor = colors.PANTS;
    this.suitParts = new THREE.Group();
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    );
    helmet.position.set(0, 0.22, 0);
    this.head.add(helmet);
    this._helmet = helmet;
    const tank = mat(0xd8dde3);
    part(tank, 0.4, 0.5, 0.16, 0, 1.12, 0.24, this.suitParts);
    part(mat(0x3a4450), 0.1, 0.12, 0.1, -0.12, 0.8, 0.26, this.suitParts);
    part(mat(0x3a4450), 0.1, 0.12, 0.1, 0.12, 0.8, 0.26, this.suitParts);
    this.root.add(this.suitParts);
    this._wrist = 0;          // 0..1: levantar el brazo izquierdo para mirar el reloj
    this._wristTarget = 0;
    this.setSuit(false);

    this._walkPhase = 0;
    this._swing = 0;
    this._actionTime = 0; // >0 durante la animación de golpear/recoger
  }

  /** Traje espacial: blanco, con casco y mochila de oxígeno/jetpack (tapa la ropa). */
  setSuit(on) {
    this._suit = on;
    this._helmet.visible = on;
    this.suitParts.visible = on;
    this._applyOutfit();
  }

  /**
   * Ropa puesta: { HEAD, CHEST, LEGS, FEET, HANDS } → color de cada prenda (o null).
   * Cada pieza del cuerpo toma el color de su prenda.
   */
  setOutfit(colors) {
    this._outfit = { ...colors };
    this._applyOutfit();
  }

  _applyOutfit() {
    const o = this._outfit ?? {};
    const suit = this._suit;
    this._shirt.color.set(suit ? 0xeef1f4 : o.CHEST ?? this._shirtColor);
    this._pants.color.set(suit ? 0xdfe3e8 : o.LEGS ?? this._pantsColor);
    this._boots.color.set(suit ? 0xc9ced4 : o.FEET ?? this._bootsColor);
    this._hands.color.set(suit ? 0xdfe3e8 : o.HANDS ?? this._skinColor);
    this._cap.visible = !suit && o.HEAD != null;
    if (o.HEAD != null) this._capMat.color.set(o.HEAD);
    // Las hojas solo tapan lo que no tapa la ropa.
    for (const l of this._chestLeaves) l.visible = !suit && o.CHEST == null;
    this._groinLeaf.visible = !suit && o.LEGS == null;
  }

  /** Color actual de las manos (piel o guantes). */
  get handColor() {
    return this._hands.color.getHex();
  }

  /** Hora en la pantalla del reloj (solo se redibuja si cambia). */
  /** El reloj solo se ve en la muñeca cuando se lleva (se coge en la cápsula). */
  setWatchVisible(visible) {
    for (const m of this._watchParts) m.visible = visible;
  }

  setWatchText(text) {
    if (!this._watchCanvas || text === this._watchText) return;
    this._watchText = text;
    const c = this._watchCanvas.getContext('2d');
    const w = this._watchCanvas.width;
    const h = this._watchCanvas.height;
    c.fillStyle = '#04121e';
    c.fillRect(0, 0, w, h);
    const hex = `#${this._watchColor.getHexString()}`;
    c.strokeStyle = hex;
    c.globalAlpha = 0.35;
    c.lineWidth = 2;
    for (let y = 10; y < h; y += 10) {
      c.beginPath();
      c.moveTo(6, y);
      c.lineTo(w - 6, y);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.lineWidth = 4;
    c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = hex;
    c.font = 'bold 40px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
    this._watchTex.needsUpdate = true;
  }

  /** Levantar la muñeca izquierda para mirar el reloj (menú de Tab / I). */
  setWristPose(on) {
    this._wristTarget = on ? 1 : 0;
  }

  /** La cabeza se oculta cuando la cámara está pegada a ella (vista del reloj). */
  setHeadVisible(visible) {
    this.head.visible = visible;
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

    // Escalando: brazos arriba alternándose (y piernas), como trepando.
    if (s.climbing) {
      if (s.climbMoving) this._climbPhase = (this._climbPhase ?? 0) + dt * 7;
      const c = Math.sin(this._climbPhase ?? 0);
      this.leftArm.rotation.x = 2.5 + c * 0.45;
      this.rightArm.rotation.x = 2.5 - c * 0.45;
      this.leftArm.rotation.z = this.rightArm.rotation.z = 0;
      this.leftLeg.rotation.x = 0.4 - c * 0.35;
      this.rightLeg.rotation.x = 0.4 + c * 0.35;
    }

    // Golpe/recogida: el brazo derecho se lanza hacia delante.
    if (this._actionTime > 0) {
      this._actionTime = Math.max(0, this._actionTime - dt);
      const t = 1 - this._actionTime / this._actionDuration;
      this.rightArm.rotation.x = Math.sin(t * Math.PI) * 1.7; // frente = -Z
      this.rightArm.rotation.z = 0;
    }

    // Mirar el reloj: el brazo izquierdo sube hacia delante y cruza hacia el centro.
    this._wrist += (this._wristTarget - this._wrist) * Math.min(1, dt * 9);
    if (this._wrist > 0.001) {
      const w = this._wrist * this._wrist * (3 - 2 * this._wrist);
      const a = this.leftArm.rotation;
      a.x += (1.38 - a.x) * w;
      a.y += (-0.35 - a.y) * w;
      a.z += (0.62 - a.z) * w;
    } else {
      this.leftArm.rotation.y = 0;
    }

    // Leve rebote del torso al caminar.
    this.torso.position.y = 1.1 + Math.abs(Math.cos(this._walkPhase)) * 0.03 * moveFactor;

    // Agachado (o esquivando): el cuerpo baja y las piernas se doblan hacia delante.
    const c = Math.max(s.crouch ?? 0, s.dodging ? 0.55 : 0);
    const drop = -0.4 * c;
    this.torso.position.y += drop;
    this.torso.rotation.x = -0.25 * c;
    this.leftArm.position.y = this.rightArm.position.y = 1.36 + drop;
    this.head.position.y = 1.4 + drop;
    this.leftLeg.position.y = this.rightLeg.position.y = 0.8 + drop;
    if (c > 0.01) {
      this.leftLeg.rotation.x += (1.05 - this.leftLeg.rotation.x) * c;
      this.rightLeg.rotation.x += (0.75 - this.rightLeg.rotation.x) * c;
    }

    this.head.rotation.order = 'YXZ';
    this.head.rotation.y = s.headYaw;
    this.head.rotation.x = s.headPitch;
  }
}

/** Hoja (contorno puntiagudo con nervio), plana en el plano XY y con la punta hacia +Y. */
function makeLeafGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.5);
  shape.quadraticCurveTo(0.55, -0.2, 0.32, 0.25);
  shape.quadraticCurveTo(0.15, 0.48, 0, 0.62);
  shape.quadraticCurveTo(-0.15, 0.48, -0.32, 0.25);
  shape.quadraticCurveTo(-0.55, -0.2, 0, -0.5);
  return new THREE.ShapeGeometry(shape, 6);
}

import * as THREE from 'three';

/**
 * PlayerModel — el protagonista (explorador low-poly, como en la hoja de diseño:
 * pelo castaño con flequillo, chaqueta con cuello, bufanda roja, mochila con el
 * saco enrollado, pantalón y botas). Empieza sin ropa, con hojas; cada prenda tiñe
 * su parte del cuerpo (setOutfit) y con la chaqueta aparecen la bufanda y la mochila.
 *
 * Solo presentación: recibe el estado ya calculado y anima el esqueleto.
 * La parte frontal mira hacia −Z local (convención de Three.js): rotation.y = yaw.
 *
 * Esqueleto (alturas en m): pelvis 0,92 → piernas (cadera, rodilla, tobillo) y
 * torso → hombros (hombro, codo, mano) y cuello → cabeza (≈1,82 arriba del todo).
 * Campos que usan otros sistemas: root, leftArm/rightArm (hombros), leftHand/rightHand,
 * head, torso, watch.
 */
const HIP_Y = 0.92;
const THIGH = 0.42;
const SHIN = 0.42;
const UPPER_ARM = 0.27;
const FOREARM = 0.25;

export class PlayerModel {
  constructor({ colors }) {
    this.root = new THREE.Group();
    this.root.name = 'PlayerModel';
    const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
    this._skinColor = colors.SKIN;
    this._shirtColor = colors.SHIRT ?? colors.SKIN;
    this._pantsColor = colors.PANTS ?? colors.SKIN;
    this._bootsColor = colors.BOOTS ?? colors.SKIN;
    const skin = (this._skin = mat(colors.SKIN));
    const shirt = (this._shirt = mat(this._shirtColor));
    const pants = (this._pants = mat(this._pantsColor));
    const boots = (this._boots = mat(this._bootsColor));
    const hands = (this._hands = mat(colors.SKIN)); // manos (o guantes)
    const hair = mat(colors.HAIR);
    const hairDark = mat(new THREE.Color(colors.HAIR).multiplyScalar(0.7).getHex());
    const white = mat(0xf4f1ea);
    const pupil = mat(0x2a1d14);
    const mouth = mat(0x8a4a3a);
    const sole = (this._sole = mat(0x3a2a20));
    this._accent = mat(0x4a3322); // cinturón y correas
    const parts = [];
    const mesh = (geo, material, parent, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1], rot = null) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      if (rot) m.rotation.set(...rot);
      m.castShadow = true;
      parent.add(m);
      parts.push(m);
      return m;
    };
    const group = (parent, [x, y, z]) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    // Geometrías compartidas.
    const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 8);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const ball = new THREE.IcosahedronGeometry(1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);

    // ---- Pelvis (sube y baja al agacharse) → piernas y torso.
    const pelvis = (this.pelvis = group(this.root, [0, HIP_Y, 0]));
    mesh(cyl, pants, pelvis, [0, 0.03, 0], [0.18, 0.17, 0.13]);
    this._belt = mesh(cyl, this._accent, pelvis, [0, 0.1, 0], [0.175, 0.04, 0.125]);
    this._buckle = mesh(box, mat(0xc9a64a), pelvis, [0, 0.1, -0.125], [0.05, 0.035, 0.01]);
    const leg = (s) => {
      const hip = group(pelvis, [s * 0.1, -0.02, 0]);
      mesh(capsule(0.088, THIGH + 0.04 - 0.176), pants, hip, [0, -THIGH / 2, 0]);
      const knee = group(hip, [0, -THIGH, 0]);
      mesh(capsule(0.074, SHIN + 0.02 - 0.148), pants, knee, [0, -SHIN / 2 + 0.01, 0]);
      const ankle = group(knee, [0, -SHIN + 0.025, 0]);
      // Bota: caña, empeine y suela.
      mesh(cyl, boots, ankle, [0, 0.03, 0], [0.072, 0.12, 0.08]);
      mesh(box, boots, ankle, [0, -0.025, -0.05], [0.12, 0.08, 0.2]);
      mesh(box, sole, ankle, [0, -0.07, -0.05], [0.13, 0.025, 0.215]);
      return { hip, knee, ankle };
    };
    this._legL = leg(-1);
    this._legR = leg(1);
    this.leftLeg = this._legL.hip;
    this.rightLeg = this._legR.hip;

    // ---- Torso (se inclina y gira al andar).
    const torso = (this.torso = group(pelvis, [0, 0.1, 0]));
    this._chest = group(torso, [0, 0, 0]);
    const chestGeo = new THREE.CylinderGeometry(0.215, 0.17, 0.42, 10);
    mesh(chestGeo, shirt, this._chest, [0, 0.21, 0], [1, 1, 0.68]);
    mesh(ball, shirt, this._chest, [0, 0.4, 0], [0.24, 0.075, 0.15]); // hombros redondeados
    // Chaqueta: cuello, cremallera y bolsillos (solo con la prenda del pecho).
    const jacket = (this._jacket = new THREE.Group());
    this._chest.add(jacket);
    this._jacketMat = mat(0x5e6a3e);
    mesh(new THREE.TorusGeometry(0.1, 0.035, 5, 10), this._jacketMat, jacket, [0, 0.45, 0], [1, 1, 0.85], [Math.PI / 2, 0, 0]);
    mesh(box, this._accent, jacket, [0, 0.2, -0.142], [0.018, 0.36, 0.01]);
    for (const s of [-1, 1]) mesh(box, this._jacketMat, jacket, [s * 0.09, 0.12, -0.13], [0.08, 0.07, 0.02]);
    // Bufanda roja (con la chaqueta).
    const scarfMat = mat(0xb8342a);
    this._scarf = new THREE.Group();
    this._chest.add(this._scarf);
    mesh(new THREE.TorusGeometry(0.095, 0.04, 6, 12), scarfMat, this._scarf, [0, 0.47, 0], [1, 1, 0.9], [Math.PI / 2, 0, 0]);
    this._scarfTail = mesh(box, scarfMat, this._scarf, [0.06, 0.32, -0.12], [0.07, 0.22, 0.025], [0.15, 0, 0.12]);
    // Mochila con el saco enrollado (con la chaqueta).
    const packMat = mat(0x6b4a2e);
    this._pack = new THREE.Group();
    this._chest.add(this._pack);
    mesh(box, packMat, this._pack, [0, 0.22, 0.17], [0.3, 0.36, 0.14]);
    mesh(box, mat(0x5a3d25), this._pack, [0, 0.13, 0.25], [0.24, 0.14, 0.04]); // bolsillo
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 10), mat(0x5e6b3a), this._pack, [0, 0.45, 0.17], [1, 1, 1], [0, 0, Math.PI / 2]);
    for (const s of [-1, 1]) {
      mesh(box, this._accent, this._pack, [s * 0.1, 0.27, -0.005], [0.035, 0.36, 0.3]); // correas por los hombros
    }
    // Hojas (sin ropa).
    const leafGeo = makeLeafGeometry();
    const leafMat = new THREE.MeshLambertMaterial({ color: colors.LEAF ?? 0x4f9a3a, side: THREE.DoubleSide });
    const leaf = (parent, x, y, z, size, rotZ) => {
      const m = new THREE.Mesh(leafGeo, leafMat);
      m.position.set(x, y, z);
      m.scale.setScalar(size);
      m.rotation.z = rotZ;
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    this._chestLeaves = [leaf(this._chest, -0.085, 0.3, -0.138, 0.13, 0.5), leaf(this._chest, 0.085, 0.3, -0.138, 0.13, -0.5)];
    this._groinLeaf = leaf(pelvis, 0, 0.0, -0.125, 0.17, Math.PI);

    // ---- Brazos: hombro → codo → mano (manopla con pulgar).
    const arm = (s) => {
      const shoulder = group(this._chest, [s * 0.255, 0.38, 0]);
      mesh(capsule(0.066, UPPER_ARM + 0.05 - 0.132), shirt, shoulder, [0, -UPPER_ARM / 2 + 0.01, 0]);
      const elbow = group(shoulder, [0, -UPPER_ARM, 0]);
      const fore = mesh(capsule(0.058, FOREARM + 0.04 - 0.116), shirt, elbow, [0, -FOREARM / 2 + 0.01, 0]);
      const cuff = mesh(cyl, hands, elbow, [0, -FOREARM + 0.04, 0], [0.05, 0.05, 0.05]);
      const hand = group(elbow, [0, -FOREARM - 0.02, 0]);
      mesh(box, hands, hand, [0, -0.03, 0], [0.085, 0.1, 0.06]);
      mesh(box, hands, hand, [0, -0.09, -0.012], [0.08, 0.045, 0.05], [0.4, 0, 0]); // dedos doblados
      mesh(box, hands, hand, [-s * 0.045, -0.035, -0.03], [0.03, 0.06, 0.03], [0.3, 0, s * 0.4]); // pulgar
      return { shoulder, elbow, hand, fore, cuff };
    };
    this._armL = arm(-1);
    this._armR = arm(1);
    this.leftArm = this._armL.shoulder;
    this.rightArm = this._armR.shoulder;
    this.leftHand = this._armL.hand;
    this.rightHand = this._armR.hand;
    this._forearms = [this._armL.fore, this._armR.fore];

    // Reloj en la muñeca izquierda (la esfera mira a −Z: al levantar el brazo, hacia arriba).
    const strap = mat(colors.WATCH ?? 0x2b3440);
    const wrist = this._armL.elbow;
    const wy = -FOREARM + 0.07;
    this._watchParts = [
      mesh(cyl, strap, wrist, [0, wy, 0], [0.058, 0.04, 0.058]),
      mesh(box, strap, wrist, [0, wy, -0.055], [0.075, 0.06, 0.02]),
    ];
    this._watchCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    this._watchColor = new THREE.Color(colors.WATCH_SCREEN ?? 0x4fe0ff);
    if (this._watchCanvas) {
      this._watchCanvas.width = 128;
      this._watchCanvas.height = 96;
      this._watchTex = new THREE.CanvasTexture(this._watchCanvas);
      this._watchTex.colorSpace = THREE.SRGBColorSpace;
      this._watchTex.center.set(0.5, 0.5);
      this._watchTex.rotation = Math.PI;
    }
    this._watchScreenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this._watchTex ?? null });
    this.watch = mesh(box, this._watchScreenMat, wrist, [0, wy, -0.066], [0.06, 0.045, 0.004]);
    this.watch.castShadow = false;
    this._watchParts.push(this.watch);
    this.setWatchText('--:--');

    // ---- Cuello y cabeza (algo grande: estilo de la hoja de diseño).
    mesh(cyl, skin, this._chest, [0, 0.47, 0], [0.055, 0.08, 0.055]);
    const head = (this.head = group(this._chest, [0, 0.5, 0]));
    mesh(ball, skin, head, [0, 0.14, 0], [0.135, 0.155, 0.14]);
    mesh(ball, skin, head, [0, 0.07, -0.03], [0.1, 0.07, 0.1]); // mandíbula
    for (const s of [-1, 1]) mesh(ball, skin, head, [s * 0.135, 0.13, 0.01], [0.025, 0.04, 0.025]); // orejas
    mesh(ball, skin, head, [0, 0.11, -0.142], [0.022, 0.03, 0.025]); // nariz
    this._eyes = [];
    for (const s of [-1, 1]) {
      const e = group(head, [s * 0.05, 0.155, -0.128]);
      mesh(ball, white, e, [0, 0, 0], [0.026, 0.03, 0.012]);
      mesh(ball, pupil, e, [0, -0.003, -0.008], [0.014, 0.018, 0.008]);
      mesh(box, hairDark, head, [s * 0.052, 0.198, -0.13], [0.055, 0.012, 0.01], [0, 0, s * -0.12]); // ceja
      this._eyes.push(e);
    }
    mesh(box, mouth, head, [0, 0.065, -0.13], [0.04, 0.008, 0.008]);
    // Pelo: casquete, nuca y flequillo de mechones.
    mesh(ball, hair, head, [0, 0.2, 0.012], [0.145, 0.115, 0.15]);
    mesh(ball, hair, head, [0, 0.13, 0.065], [0.14, 0.12, 0.1]);
    for (let i = 0; i < 5; i++) {
      const x = -0.1 + i * 0.05;
      mesh(new THREE.ConeGeometry(0.035, 0.1, 4), hair, head, [x, 0.215, -0.115], [1, 1, 0.6], [Math.PI * 0.62, 0, (i - 2) * 0.18]);
    }
    mesh(new THREE.ConeGeometry(0.04, 0.12, 4), hair, head, [0.02, 0.32, 0.02], [1, 1, 1], [-0.4, 0, -0.3]); // remolino
    // Gorro (prenda de la cabeza).
    this._capMat = mat(0x7a4a24);
    this._cap = new THREE.Group();
    mesh(new THREE.SphereGeometry(0.158, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this._capMat, this._cap, [0, 0.19, 0.01]);
    mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12, 1, false, Math.PI * 0.75, Math.PI * 1.5), this._capMat, this._cap, [0, 0.19, -0.03]); // visera
    this._cap.visible = false;
    head.add(this._cap);

    // ---- Traje espacial: casco transparente y mochila de oxígeno/jetpack.
    this.suitParts = new THREE.Group();
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
    );
    helmet.position.set(0, 0.15, 0);
    head.add(helmet);
    this._helmet = helmet;
    const tank = mat(0xd8dde3);
    mesh(box, tank, this.suitParts, [0, 0.24, 0.19], [0.32, 0.4, 0.14]);
    mesh(cyl, mat(0x3a4450), this.suitParts, [-0.09, 0.02, 0.2], [0.04, 0.1, 0.04]);
    mesh(cyl, mat(0x3a4450), this.suitParts, [0.09, 0.02, 0.2], [0.04, 0.1, 0.04]);
    this._chest.add(this.suitParts);

    this._parts = parts;
    this._wrist = 0;
    this._wristTarget = 0;
    this._outfit = {};
    this.setSuit(false);
    this._walkPhase = 0;
    this._swing = 0;
    this._actionTime = 0;
    this._t = 0;
    this._blink = 2;
    this._air = 0;
    this._land = 0;
  }

  /** Traje espacial: blanco, con casco y mochila de oxígeno/jetpack (tapa la ropa). */
  setSuit(on) {
    this._suit = on;
    this._helmet.visible = on;
    this.suitParts.visible = on;
    this._applyOutfit();
  }

  /** Ropa puesta: { HEAD, CHEST, LEGS, FEET, HANDS } → color de cada prenda (o null). */
  setOutfit(colors) {
    this._outfit = { ...colors };
    this._applyOutfit();
  }

  _applyOutfit() {
    const o = this._outfit ?? {};
    const suit = this._suit;
    const chest = suit ? 0xeef1f4 : o.CHEST ?? this._shirtColor;
    this._shirt.color.set(chest);
    this._jacketMat.color.set(new THREE.Color(chest).multiplyScalar(0.82));
    this._pants.color.set(suit ? 0xdfe3e8 : o.LEGS ?? this._pantsColor);
    this._boots.color.set(suit ? 0xc9ced4 : o.FEET ?? this._bootsColor);
    this._hands.color.set(suit ? 0xdfe3e8 : o.HANDS ?? this._skinColor);
    this._sole.color.set(o.FEET != null || suit ? 0x3a2a20 : this._skinColor);
    this._cap.visible = !suit && o.HEAD != null;
    if (o.HEAD != null) this._capMat.color.set(o.HEAD);
    const clothed = !suit && o.CHEST != null;
    this._jacket.visible = clothed;
    this._scarf.visible = clothed;
    this._pack.visible = clothed;
    this._belt.visible = this._buckle.visible = suit || o.LEGS != null;
    for (const l of this._chestLeaves) l.visible = !suit && o.CHEST == null;
    this._groinLeaf.visible = !suit && o.LEGS == null;
  }

  /** Color actual de las manos (piel o guantes). */
  get handColor() {
    return this._hands.color.getHex();
  }

  /** Color de las mangas (piel sin ropa, o la chaqueta). */
  get sleeveColor() {
    return this._shirt.color.getHex();
  }

  /** El reloj solo se ve en la muñeca cuando se lleva (se coge en la cápsula). */
  setWatchVisible(visible) {
    for (const m of this._watchParts) m.visible = visible;
  }

  /** Color de la pantalla del reloj (el que elige el jugador). */
  setWatchColor(hex) {
    this._watchColor.set(hex);
    const t = this._watchText;
    this._watchText = null;
    this.setWatchText(t ?? '--:--');
  }

  /** Hora en la pantalla del reloj (solo se redibuja si cambia). */
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

  /** Pose de combate: 'aim' (arco/tirachinas), 'block' (escudo delante) o null. */
  setCombatPose(pose) {
    this._combatPose = pose;
  }

  /** La cabeza se oculta cuando la cámara está pegada a ella (vista del reloj). */
  setHeadVisible(visible) {
    this.head.visible = visible;
  }

  /**
   * Qué lleva en cada mano ('sword' | 'tool' | 'torch' | 'bow' | 'slingshot' | 'item' | null;
   * izquierda: 'shield' | null): cambia la pose de reposo y el golpe.
   */
  setHeldKind(right, left = null) {
    this._heldR = right ?? null;
    this._heldL = left ?? null;
  }

  /**
   * Acción corta: según lo que hace (kind) y lo que lleva en la mano, un tajo en
   * diagonal (espada), un golpe de arriba abajo (hacha, pico), un directo (puño),
   * agacharse a coger, beber, soltar la goma o la cuerda, o empujar con el escudo.
   */
  playAction(kind = 'hit', duration = null) {
    const name = actionName(kind, this._heldR);
    const anim = ACTIONS[name];
    if (!anim) return;
    this._action = anim;
    this._actionDuration = duration ?? anim.duration;
    this._actionTime = this._actionDuration;
  }

  setVisible(visible) {
    this._wantVisible = visible;
    this.root.visible = visible && !this.hidden;
  }

  /** Oculto a la fuerza (escenas de la historia: aún dentro de la cápsula). */
  setHidden(hidden) {
    this.hidden = hidden;
    this.root.visible = (this._wantVisible ?? true) && !hidden;
  }

  /** Pose de reposo del brazo según lo que se lleva (se suma al balanceo de andar). */
  _holdPose(t) {
    const R = this._armR;
    const L = this._armL;
    switch (this._heldR) {
      case 'sword':
      case 'tool':
        R.shoulder.rotation.x = R.shoulder.rotation.x * 0.5 + 0.12;
        R.elbow.rotation.x = 0.7 + Math.sin(t * 1.3) * 0.03;
        R.shoulder.rotation.z = 0.14;
        R.hand.rotation.x = -0.55; // muñeca: el arma apunta al frente y algo abajo
        break;
      case 'torch':
        R.shoulder.rotation.set(0.55 + R.shoulder.rotation.x * 0.15, 0, 0.18);
        R.elbow.rotation.x = 1.05;
        break;
      case 'bow':
      case 'slingshot':
      case 'crossbow':
        R.elbow.rotation.x = 0.45;
        break;
      default:
        break;
    }
    if (this._heldL === 'shield' && this._combatPose !== 'block') {
      L.shoulder.rotation.set(0.35 + L.shoulder.rotation.x * 0.2, 0.15, -0.12);
      L.elbow.rotation.x = 1.35;
    }
  }

  /** Mezcla las poses clave de una acción (u: 0…1) con la pose actual. */
  _applyAction(anim, u) {
    this._actionDrop = 0;
    const keys = anim.keys;
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].t) i++;
    const a = keys[i];
    const b = keys[i + 1];
    const k = smooth01((u - a.t) / Math.max(1e-4, b.t - a.t));
    const v = (name) => {
      const x = a[name];
      const y = b[name];
      if (x === undefined && y === undefined) return undefined;
      const xx = x ?? y;
      const yy = y ?? x;
      return Array.isArray(xx) ? xx.map((n, j) => n + (yy[j] - n) * k) : xx + (yy - xx) * k;
    };
    // Entra y sale suave.
    const w = smooth01(Math.min(1, u / 0.1)) * smooth01(Math.min(1, (1 - u) / 0.22));
    const mix = (obj, prop, val) => {
      if (val === undefined) return;
      obj[prop] += (val - obj[prop]) * w;
    };
    const rot = (o, val) => {
      if (!val) return;
      mix(o.rotation, 'x', val[0]);
      mix(o.rotation, 'y', val[1]);
      mix(o.rotation, 'z', val[2]);
    };
    rot(this._armR.shoulder, v('rs'));
    mix(this._armR.elbow.rotation, 'x', v('re'));
    mix(this._armR.hand.rotation, 'x', v('rw'));
    rot(this._armL.shoulder, v('ls'));
    mix(this._armL.elbow.rotation, 'x', v('le'));
    const tp = v('tp');
    const ty = v('ty');
    if (tp !== undefined) this.torso.rotation.x += (tp - this.torso.rotation.x) * w;
    if (ty !== undefined) this.torso.rotation.y += (ty - this.torso.rotation.y) * w;
    const kn = v('kn');
    if (kn !== undefined) {
      for (const L of [this._legL, this._legR]) {
        L.hip.rotation.x += (kn - L.hip.rotation.x) * w;
        L.knee.rotation.x += (-kn * 2 - L.knee.rotation.x) * w;
        L.ankle.rotation.x += (kn - L.ankle.rotation.x) * w;
      }
      this._actionDrop = (THIGH + SHIN) * (1 - Math.cos(kn)) * w;
    }
    const step = v('step');
    if (step !== undefined) {
      this._legL.hip.rotation.x += (step - this._legL.hip.rotation.x) * w;
      this._legR.hip.rotation.x += (-step * 0.6 - this._legR.hip.rotation.x) * w;
    }
    this._actionHead = (v('hd') ?? 0) * w;
  }

  _swim(dt, s) {
    this._swimK = Math.min(1, (this._swimK ?? 0) + dt * 4);
    const k = this._swimK;
    const moving = s.horizontalSpeed > 0.4;
    this._swimPh = (this._swimPh ?? 0) + dt * (moving ? 3.2 : 2.2);
    const p = this._swimPh;
    const R = this._armR;
    const L = this._armL;
    const lerp = (o, prop, val) => (o[prop] += (val - o[prop]) * k);
    if (moving) {
      // Braza: brazos delante, se abren y vuelven al pecho; patada de rana.
      const open = Math.max(0, Math.sin(p));
      const pull = Math.max(0, -Math.sin(p));
      for (const [A, side] of [[L, -1], [R, 1]]) {
        lerp(A.shoulder.rotation, 'x', 2.5 - pull * 0.9);
        lerp(A.shoulder.rotation, 'z', side * (0.15 + open * 0.9));
        lerp(A.shoulder.rotation, 'y', 0);
        lerp(A.elbow.rotation, 'x', 0.1 + pull * 1.3);
      }
      for (const [Lg, side] of [[this._legL, -1], [this._legR, 1]]) {
        lerp(Lg.hip.rotation, 'x', -0.35 + pull * 0.6);
        lerp(Lg.hip.rotation, 'z', side * -pull * 0.35);
        lerp(Lg.knee.rotation, 'x', -pull * 1.4);
      }
      lerp(this.pelvis.rotation, 'x', -1.15); // boca abajo
      lerp(this.torso.rotation, 'x', -0.1);
      this._swimLift = 0.5 * k; // el cuerpo, tumbado a flor de agua
    } else {
      // Flotando: brazos que reman a los lados y piernas que pedalean.
      for (const [A, side] of [[L, -1], [R, 1]]) {
        lerp(A.shoulder.rotation, 'x', 0.4 + Math.sin(p) * 0.25);
        lerp(A.shoulder.rotation, 'z', side * (0.9 + Math.sin(p * 2) * 0.2));
        lerp(A.elbow.rotation, 'x', 0.5);
      }
      for (const [Lg, ph] of [[this._legL, 0], [this._legR, Math.PI]]) {
        lerp(Lg.hip.rotation, 'x', 0.35 + Math.sin(p + ph) * 0.35);
        lerp(Lg.knee.rotation, 'x', -0.5 - Math.max(0, Math.cos(p + ph)) * 0.6);
      }
      lerp(this.pelvis.rotation, 'x', 0.1);
      this._swimLift = 0;
    }
  }

  /**
   * @param {number} dt
   * @param {{ horizontalSpeed, maxSpeed, onGround, headPitch, headYaw, climbing?, climbMoving?, crouch?, dodging?, swimming? }} s
   */
  animate(dt, s) {
    this._t += dt;
    const t = this._t;
    const moveFactor = Math.min(s.horizontalSpeed / Math.max(0.1, s.maxSpeed), 1);
    const running = s.horizontalSpeed > 5.2;
    const target = s.onGround ? moveFactor : 0;
    this._swing += (target - this._swing) * Math.min(1, dt * 10);
    if (moveFactor > 0.05) this._walkPhase += dt * (4.2 + s.horizontalSpeed * 1.35);
    const ph = this._walkPhase;
    const A = this._swing * (running ? 0.85 : 0.6);
    const sinP = Math.sin(ph);
    // Aterrizaje: un pequeño rebote al tocar el suelo.
    if (!s.onGround) this._air += dt;
    else {
      if (this._air > 0.35) this._land = 1;
      this._air = 0;
    }
    this._land = Math.max(0, this._land - dt * 5);

    // ---- Piernas: zancada con rodilla y pie que acompaña.
    const legPose = (L, phase) => {
      const sw = Math.sin(phase) * A;
      const kneeBend = Math.max(0, -Math.cos(phase)) * A * 1.5 + 0.06 * this._swing;
      L.hip.rotation.set(sw, 0, 0);
      L.knee.rotation.set(-kneeBend, 0, 0);
      L.ankle.rotation.set(-(sw - kneeBend) * 0.5, 0, 0);
    };
    legPose(this._legL, ph);
    legPose(this._legR, ph + Math.PI);
    // ---- Brazos: balanceo opuesto con el codo algo doblado.
    const armPose = (Ar, phase, side) => {
      const sw = -Math.sin(phase) * A * 0.9;
      Ar.shoulder.rotation.set(sw, 0, side * (0.08 + 0.04 * Math.sin(t * 1.4)));
      Ar.elbow.rotation.set(0.25 + Math.max(0, sw) * 0.8 + (running ? 0.7 : 0), 0, 0);
      Ar.hand.rotation.set(0, 0, 0); // (la muñeca la giran la pose del arma y las acciones)
    };
    armPose(this._armL, ph, -1);
    armPose(this._armR, ph + Math.PI, 1);
    // ---- Cuerpo: rebote, giro de hombros, inclinación al correr, respiración.
    const bob = Math.abs(Math.cos(ph)) * 0.035 * this._swing;
    let pelvisY = HIP_Y - 0.02 * this._swing + bob - this._land * 0.08;
    this.pelvis.rotation.set(0, Math.sin(ph) * 0.1 * this._swing, 0);
    // (el frente es −Z: inclinarse hacia delante es girar en X negativo)
    this.torso.rotation.set(-(running ? 0.16 : 0.04) * this._swing, -Math.sin(ph) * 0.16 * this._swing, 0);
    const breathe = 1 + Math.sin(t * 2.1) * 0.012 * (1 - this._swing);
    this._chest.scale.set(1, breathe, 1);
    this._scarfTail.rotation.x = 0.15 + this._swing * 0.5 + Math.sin(t * 6) * 0.05 * this._swing;

    // ---- En el aire: piernas recogidas y brazos abiertos.
    if (!s.onGround && !s.climbing && !s.swimming) {
      const k = Math.min(1, this._air * 4);
      this._legL.hip.rotation.x = 0.55 * k;
      this._legL.knee.rotation.x = -0.9 * k;
      this._legR.hip.rotation.x = -0.15 * k;
      this._legR.knee.rotation.x = -0.4 * k;
      this._armL.shoulder.rotation.set(0.5 * k, 0, -0.55 * k);
      this._armR.shoulder.rotation.set(0.3 * k, 0, 0.55 * k);
      this._armL.elbow.rotation.x = this._armR.elbow.rotation.x = 0.6 * k;
    }

    // ---- Escalando: brazos arriba alternándose, piernas empujando.
    if (s.climbing) {
      if (s.climbMoving) this._climbPhase = (this._climbPhase ?? 0) + dt * 7;
      const c = Math.sin(this._climbPhase ?? 0);
      this._armL.shoulder.rotation.set(2.6 + c * 0.4, 0, -0.15);
      this._armR.shoulder.rotation.set(2.6 - c * 0.4, 0, 0.15);
      this._armL.elbow.rotation.x = 0.4 - c * 0.3;
      this._armR.elbow.rotation.x = 0.4 + c * 0.3;
      this._legL.hip.rotation.x = 0.5 - c * 0.4;
      this._legR.hip.rotation.x = 0.5 + c * 0.4;
      this._legL.knee.rotation.x = -0.8 + c * 0.3;
      this._legR.knee.rotation.x = -0.8 - c * 0.3;
      this.torso.rotation.set(-0.15, 0, 0);
    }

    // ---- Nadando: braza (moviéndose) o pataleo para flotar (quieto).
    if (s.swimming) this._swim(dt, s);
    else {
      this._swimK = Math.max(0, (this._swimK ?? 0) - dt * 4);
      this._swimLift = 0;
    }

    // ---- Lo que lleva en la mano cambia cómo cuelga el brazo.
    this._holdPose(t);

    // ---- Acción (golpe, coger, beber…): poses clave encima de lo demás.
    if (this._actionTime > 0 && this._action) {
      this._actionTime = Math.max(0, this._actionTime - dt);
      const u = 1 - this._actionTime / this._actionDuration;
      this._applyAction(this._action, u);
    }

    // ---- Mirar el reloj: el brazo izquierdo sube por delante con el codo doblado.
    this._wrist += (this._wristTarget - this._wrist) * Math.min(1, dt * 9);
    if (this._wrist > 0.001) {
      const w = this._wrist * this._wrist * (3 - 2 * this._wrist);
      const a = this._armL.shoulder.rotation;
      a.x += (1.05 - a.x) * w;
      a.y += (-0.2 - a.y) * w;
      a.z += (0.35 - a.z) * w;
      this._armL.elbow.rotation.x += (1.25 - this._armL.elbow.rotation.x) * w;
      this._armL.hand.rotation.z = -0.9 * w;
    }

    // ---- Combate: apuntar (tirachinas/arco al frente, la derecha tensa junto a la cara)
    // o bloquear (escudo delante del pecho).
    if (this._combatPose === 'aim') {
      const p = s.headPitch;
      this._armL.shoulder.rotation.set(1.5 + p, -0.15, 0);
      this._armL.elbow.rotation.x = 0.05;
      this._armR.shoulder.rotation.set(1.35 + p, 0.55, 0);
      this._armR.elbow.rotation.x = 1.6;
      this.torso.rotation.y = 0.25;
    } else if (this._combatPose === 'block') {
      this._armL.shoulder.rotation.set(1.1, 0.5, 0);
      this._armL.elbow.rotation.x = 1.2;
    }

    // ---- Agachado (o esquivando): caderas abajo, rodillas dobladas y el pie en el suelo.
    const c = Math.max(s.crouch ?? 0, s.dodging ? 0.6 : 0);
    if (c > 0.01) {
      const th = 0.95 * c;
      for (const L of [this._legL, this._legR]) {
        L.hip.rotation.x = L.hip.rotation.x * (1 - c) + th;
        L.knee.rotation.x = L.knee.rotation.x * (1 - c) - th * 2;
        L.ankle.rotation.x = th;
      }
      pelvisY -= (THIGH + SHIN) * (1 - Math.cos(th));
      this.torso.rotation.x -= 0.35 * c;
    }
    this.pelvis.position.y = pelvisY - (this._actionTime > 0 ? this._actionDrop ?? 0 : 0) + (this._swimLift ?? 0);
    if (!(this._actionTime > 0)) this._actionHead = 0;

    // ---- Cabeza: mira hacia donde mira la cámara (compensando el giro del torso).
    this.head.rotation.order = 'YXZ';
    this.head.rotation.y = s.headYaw - this.torso.rotation.y - this.pelvis.rotation.y;
    this.head.rotation.x = s.headPitch - this.torso.rotation.x * 0.7 - this.pelvis.rotation.x * 0.85 + (this._actionHead ?? 0);
    // Parpadeo.
    this._blink -= dt;
    if (this._blink < 0) this._blink = 2.5 + Math.random() * 2.5;
    const closed = this._blink < 0.12 ? 0.15 : 1;
    for (const e of this._eyes) e.scale.y = closed;
  }
}

// ---- Acciones: poses clave (t de 0 a 1). rs/ls hombro [x, y, z], re/le codo, rw muñeca, tp/ty
// torso (inclinación: negativa hacia delante; giro), kn rodillas (agacharse), step paso adelante, hd cabeza. ----
const ACTIONS = {
  // Puño: recoge el brazo junto al pecho y lanza un directo con giro de hombros.
  punch: { duration: 0.32, keys: [
    { t: 0, rs: [0.3, 0, 0.1], re: 1.7, ty: -0.25 },
    { t: 0.28, rs: [0.2, 0, 0.15], re: 2.0, ty: -0.4, ls: [0.6, 0, -0.1], le: 1.6 },
    { t: 0.5, rs: [1.5, 0.15, 0], re: 0.05, ty: 0.45, step: 0.3 },
    { t: 1, rs: [0.4, 0, 0.1], re: 1.2, ty: 0 },
  ] },
  // Espada: sube por encima del hombro derecho y corta en diagonal hacia la izquierda.
  slash: { duration: 0.42, keys: [
    { t: 0, rs: [0.6, 0, 0.3], re: 0.8, rw: -0.5, ty: 0 },
    { t: 0.32, rs: [2.7, -0.3, 0.7], re: 1.4, rw: 0.5, ty: -0.55, tp: 0.1, ls: [0.5, 0, -0.3], le: 0.9 },
    { t: 0.58, rs: [0.9, 0.6, -0.6], re: 0.15, rw: -1.2, ty: 0.6, tp: -0.25, step: 0.35 },
    { t: 1, rs: [0.5, 0, 0.15], re: 0.7, rw: -0.5, ty: 0, tp: -0.04 },
  ] },
  // Hacha y pico: por encima de la cabeza y de arriba abajo, doblándose.
  chop: { duration: 0.42, keys: [
    { t: 0, rs: [0.6, 0, 0.15], re: 0.8, rw: -0.5, tp: -0.04 },
    { t: 0.35, rs: [3.0, 0, 0.15], re: 1.3, rw: 0.6, tp: 0.2, ty: -0.2, ls: [2.6, 0, -0.1], le: 1.2 },
    { t: 0.6, rs: [0.75, 0, 0.05], re: 0.1, rw: -1.35, tp: -0.45, ty: 0.1, ls: [0.9, 0, 0.1], le: 0.3, kn: 0.25 },
    { t: 1, rs: [0.5, 0, 0.12], re: 0.7, rw: -0.5, tp: -0.04, ty: 0 },
  ] },
  // Coger algo del suelo o colocar: se agacha y alarga la mano.
  reach: { duration: 0.45, keys: [
    { t: 0, rs: [0.2, 0, 0.1], re: 0.3 },
    { t: 0.45, rs: [0.9, 0, 0.05], re: 0.2, tp: -0.75, kn: 0.6, hd: -0.25, ls: [0.3, 0, -0.2], le: 0.6 },
    { t: 1, rs: [0.2, 0, 0.1], re: 0.3, tp: -0.04, kn: 0 },
  ] },
  // Beber: la mano a la boca y la cabeza atrás.
  drink: { duration: 0.6, keys: [
    { t: 0, rs: [0.2, 0, 0.1], re: 0.3 },
    { t: 0.35, rs: [1.0, -0.5, 0.1], re: 2.2, hd: 0.35 },
    { t: 0.75, rs: [1.0, -0.5, 0.1], re: 2.2, hd: 0.4 },
    { t: 1, rs: [0.2, 0, 0.1], re: 0.3, hd: 0 },
  ] },
  // Soltar la goma o la cuerda: la mano que tensaba sale hacia atrás.
  release: { duration: 0.28, keys: [
    { t: 0, rs: [1.35, 0.55, 0], re: 1.6 },
    { t: 0.3, rs: [1.2, 0.9, 0.2], re: 0.5, ty: 0.3 },
    { t: 1, rs: [0.6, 0.3, 0.1], re: 0.8, ty: 0.1 },
  ] },
  // Bloquear: el escudo sale hacia delante de golpe.
  block: { duration: 0.3, keys: [
    { t: 0, ls: [1.1, 0.5, 0], le: 1.2 },
    { t: 0.35, ls: [1.4, 0.3, 0], le: 0.7, tp: 0.1 },
    { t: 1, ls: [1.1, 0.5, 0], le: 1.2 },
  ] },
};

function actionName(kind, held) {
  if (kind === 'harvest' || kind === 'place') return 'reach';
  if (kind === 'drink') return 'drink';
  if (kind === 'shoot') return 'release';
  if (kind === 'block') return 'block';
  if (kind === 'land') return null;
  if (held === 'sword' || held === 'torch') return 'slash';
  if (held === 'tool') return 'chop';
  return 'punch';
}

function smooth01(v) {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return c * c * (3 - 2 * c);
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

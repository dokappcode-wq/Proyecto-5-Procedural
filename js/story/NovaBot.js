import * as THREE from 'three';

/**
 * NovaBot — el robot de la IA: una bola con una pantalla en la que un círculo brillante
 * (del color del reloj) hace de cara, y dos propulsores a los lados como orejas.
 *
 * Expresiones (setFace):
 *   NORMAL  el círculo completo
 *   HAPPY   una U (sonrisa)
 *   WORRIED una S tumbada (línea ondulada)
 *   ANGRY   una V
 *   SAD     una sonrisa invertida (∩)
 *   SCAN    el círculo girando a trozos
 *
 * Flota: se mueve hacia un objetivo con suavidad, se balancea y mira hacia donde se le
 * diga. El escaneo dibuja una lámina de luz que barre al jugador de arriba abajo.
 */
export class NovaBot {
  constructor({ scene, color = '#4fb6ff' }) {
    this.group = new THREE.Group();
    this.group.name = 'NovaBot';
    this._color = new THREE.Color(color);
    this.face = 'NORMAL';
    this._t = 0;
    this.position = this.group.position;
    this.target = new THREE.Vector3();
    this.lookAt = null;
    this.speed = 4;

    const shell = new THREE.MeshStandardMaterial({ color: 0xf2f5f8, roughness: 0.45, metalness: 0.12, emissive: 0x1a1f24 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.3, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), shell);
    body.castShadow = true;
    this.group.add(body);
    // Pantalla (cara) al frente (+Z).
    const screen = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), dark);
    screen.position.z = 0.3;
    this.group.add(screen);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.018, 8, 32), new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.7, roughness: 0.3 }));
    rim.position.z = 0.302;
    this.group.add(rim);
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._canvas.height = 128;
    this._tex = new THREE.CanvasTexture(this._canvas);
    this._tex.colorSpace = THREE.SRGBColorSpace;
    this._faceMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.21, 32),
      new THREE.MeshBasicMaterial({ map: this._tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this._faceMesh.position.z = 0.305;
    this.group.add(this._faceMesh);
    // Propulsores-oreja.
    this._flames = [];
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.36, 0.06, 0);
      ear.rotation.z = s * -0.25;
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.26, 12), shell);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 12), dark);
      ring.position.y = -0.12;
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.22, 10),
        new THREE.MeshBasicMaterial({ color: this._color.clone(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      flame.rotation.x = Math.PI;
      flame.position.y = -0.25;
      ear.add(pod, ring, flame);
      this.group.add(ear);
      this._flames.push(flame);
    }
    this._light = new THREE.PointLight(this._color.clone(), 0.9, 5, 2);
    this._light.position.z = 0.4;
    this.group.add(this._light);
    // Escáner.
    this._scan = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.03, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: this._color.clone(), transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this._scan.visible = false;
    scene.add(this.group);
    this._scanParent = scene;
    scene.add(this._scan);
    this._drawFace();
  }

  setColor(hex) {
    this._color.set(hex);
    for (const f of this._flames) f.material.color.copy(this._color);
    this._light.color.copy(this._color);
    this._scan.material.color.copy(this._color);
    this._drawFace();
  }

  setFace(face) {
    if (face === this.face) return;
    this.face = face;
    this._drawFace();
  }

  setVisible(v) {
    this.group.visible = v;
    if (!v) this._scan.visible = false;
  }

  /** Barrido del escáner sobre un punto (los pies del jugador) durante `seconds`. */
  scan(at, seconds = 3) {
    this._scanAt = at;
    this._scanT = seconds;
    this._scanDur = seconds;
  }

  update(dt) {
    this._t += dt;
    const t = this._t;
    const p = this.group.position;
    // Ir hacia el objetivo (suave) con balanceo.
    const d = this._tmp ??= new THREE.Vector3();
    d.copy(this.target).sub(p);
    const len = d.length();
    if (len > 0.01) p.addScaledVector(d, Math.min(1, dt * Math.min(this.speed, 1.5 + len)));
    this.group.position.y += Math.sin(t * 2.4) * 0.0025;
    // Mirar.
    if (this.lookAt) {
      const yaw = Math.atan2(this.lookAt.x - p.x, this.lookAt.z - p.z);
      let dy = yaw - this.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.group.rotation.y += dy * Math.min(1, dt * 5);
      const pitch = Math.atan2(this.lookAt.y - p.y, Math.hypot(this.lookAt.x - p.x, this.lookAt.z - p.z));
      this.group.rotation.x += (-pitch * 0.6 - this.group.rotation.x) * Math.min(1, dt * 4);
    }
    this.group.rotation.z = Math.sin(t * 1.7) * 0.06;
    for (const [i, f] of this._flames.entries()) {
      const k = 0.85 + Math.sin(t * 31 + i * 2) * 0.12 + Math.sin(t * 17 + i) * 0.08;
      f.scale.set(1, k, 1);
    }
    if (this.face === 'SCAN') this._drawFace();
    // Escáner.
    if (this._scanT > 0) {
      this._scanT -= dt;
      const u = 1 - this._scanT / this._scanDur;
      const y = this._scanAt.y + 1.9 * (0.5 + 0.5 * Math.cos(u * Math.PI * 4));
      this._scan.visible = this._scanT > 0;
      this._scan.position.set(this._scanAt.x, y, this._scanAt.z);
      this._scan.material.opacity = 0.35 + Math.sin(t * 20) * 0.1;
    }
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this._scan.parent?.remove(this._scan);
  }

  _drawFace() {
    const c = this._canvas.getContext('2d');
    const W = 128;
    c.clearRect(0, 0, W, W);
    const col = `#${this._color.getHexString()}`;
    c.strokeStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 14;
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.beginPath();
    const cx = 64;
    const cy = 64;
    switch (this.face) {
      case 'HAPPY':
        c.arc(cx, cy - 12, 34, 0.15 * Math.PI, 0.85 * Math.PI);
        break;
      case 'SAD':
        c.arc(cx, cy + 30, 34, 1.15 * Math.PI, 1.85 * Math.PI);
        break;
      case 'ANGRY':
        c.moveTo(cx - 36, cy - 22);
        c.lineTo(cx, cy + 22);
        c.lineTo(cx + 36, cy - 22);
        break;
      case 'WORRIED':
        for (let i = 0; i <= 40; i++) {
          const x = cx - 40 + i * 2;
          const y = cy + Math.sin((i / 40) * Math.PI * 2) * 14;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        break;
      case 'SCAN': {
        const a = this._t * 6;
        for (let k = 0; k < 3; k++) {
          c.moveTo(cx + Math.cos(a + k * 2.1) * 40, cy + Math.sin(a + k * 2.1) * 40);
          c.arc(cx, cy, 40, a + k * 2.1, a + k * 2.1 + 1.1);
        }
        break;
      }
      default:
        c.arc(cx, cy, 40, 0, Math.PI * 2);
    }
    c.stroke();
    this._tex.needsUpdate = true;
  }
}

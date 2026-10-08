import * as THREE from 'three';

/**
 * AnimalRenderer — dibuja todos los animales de una especie con unas pocas
 * InstancedMesh (cuerpo, cabeza, cola, muslos y cañas de las patas): unas pocas
 * llamadas de dibujo por especie, sea cual sea el número de animales.
 *
 * Animación por instancia (sin esqueleto, con matrices):
 *   - Andar: patas en diagonal, la caña se dobla al adelantar la pata.
 *   - Galope (huyendo, atacando): las delanteras juntas y las traseras juntas, el
 *     cuerpo se mece y la zancada es más larga.
 *   - Cabeza: baja hasta el suelo al pastar, se levanta al alertarse y cabecea al andar.
 *   - Cola: se mueve sola; levantada al galopar.
 * Color por instancia: destello rojo al recibir un golpe. Al morir, cae de lado.
 *
 * Modelo (buildModel de cada especie): { body, leg, shin?, head?, tail?, hips,
 * thigh (largo del muslo), neck ([x, y, z] pivote de la cabeza), tailAt }.
 */
const WHITE = new THREE.Color(1, 1, 1);
const HIT = new THREE.Color(1.8, 0.55, 0.5);
export class AnimalRenderer {
  constructor({ scene, model, maxInstances, material }) {
    this._hips = model.hips;
    this._max = maxInstances;
    this._thigh = model.thigh ?? 0.4;
    this._neck = model.neck ?? null;
    this._tailAt = model.tailAt ?? null;
    const legs = model.hips.length;
    const make = (data, count) => {
      const m = new THREE.InstancedMesh(toGeometry(data), material, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // las instancias se mueven por todo el mundo
      m.count = 0;
      for (let i = 0; i < count; i++) m.setColorAt(i, WHITE);
      scene.add(m);
      return m;
    };
    this.body = make(model.body, maxInstances);
    this.legs = make(model.leg, maxInstances * legs);
    this.shins = model.shin ? make(model.shin, maxInstances * legs) : null;
    this.head = model.head && this._neck ? make(model.head, maxInstances) : null;
    this.tail = model.tail && this._tailAt ? make(model.tail, maxInstances) : null;
    this._meshes = [this.body, this.legs, this.shins, this.head, this.tail].filter(Boolean);
    this._color = new THREE.Color();
    this._root = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    this._leg = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._t = 0;
  }

  /** @param {import('./Animal.js').Animal[]} animals visibles (≤ maxInstances) */
  update(animals, dt = 1 / 60) {
    this._t += dt;
    const n = Math.min(animals.length, this._max);
    const legsN = this._hips.length;
    for (let i = 0; i < n; i++) {
      const a = animals[i];
      const moving = Math.min(1, a.speed / 1.5);
      const gallop = Math.min(1, Math.max(0, (a.speed - 2.4) / 1.4));
      const ph = a.gaitPhase;
      const dying = a.deathProgress;
      const fall = Math.min(1, dying * 2.2);
      // Cuerpo: rebote al paso, se mece al galopar.
      const bob = Math.abs(Math.sin(ph)) * (0.035 + gallop * 0.05) * moving * a.scale;
      const rock = Math.sin(ph) * 0.08 * gallop;
      this._e.set(rock, a.heading, fall * fall * (Math.PI / 2));
      this._root.compose(
        this._p.set(a.x, a.y + bob - dying * 0.25 * a.scale, a.z),
        this._q.setFromEuler(this._e),
        this._s.setScalar(a.scale),
      );
      this.body.setMatrixAt(i, this._root);
      const color = a.hitFlash > 0 ? this._color.copy(WHITE).lerp(HIT, Math.min(1, a.hitFlash / 0.15)) : WHITE;
      this.body.setColorAt(i, color);

      // Patas: muslo (cadera) y caña (rodilla). 0 del. izq. · 1 del. der. · 2 tras. izq. · 3 tras. der.
      const amp = (0.5 + gallop * 0.35) * moving;
      this._hips.forEach(([hx, hy, hz], li) => {
        const front = li < 2;
        let p;
        if (gallop > 0.5) p = ph + (front ? 0 : Math.PI * 0.85) + (li % 2) * 0.35; // galope
        else p = ph + (li === 0 || li === 3 ? 0 : Math.PI); // paso: en diagonal
        const swing = Math.sin(p) * amp;
        // Al adelantar la pata, la caña se dobla (las delanteras hacia atrás, las traseras al revés).
        const bend = Math.max(0, Math.cos(p)) * (0.5 + gallop * 0.5) * moving;
        this._leg.makeRotationX(-swing).setPosition(hx, hy, hz);
        this._tmp.multiplyMatrices(this._root, this._leg);
        const k = i * legsN + li;
        this.legs.setMatrixAt(k, this._tmp);
        this.legs.setColorAt(k, color);
        if (this.shins) {
          this._m2.makeRotationX(front ? bend : -bend * 0.8).setPosition(0, -this._thigh, 0);
          this._leg.multiplyMatrices(this._tmp, this._m2);
          this.shins.setMatrixAt(k, this._leg);
          this.shins.setColorAt(k, color);
        }
      });

      // Cabeza: pasta (abajo), alerta (arriba), cabecea al andar.
      if (this.head) {
        const st = a.state;
        const alert = st === 'ALERT' || st === 'CURIOUS' ? 1 : 0;
        const nod = Math.sin(ph * 2) * 0.08 * moving * (1 - gallop) - gallop * 0.25;
        const pitch = a.graze * 1.05 - alert * 0.3 + nod - rock;
        const yaw = st === 'IDLE' && a.graze < 0.3 ? Math.sin(this._t * 0.6 + a.x) * 0.35 : 0;
        const [nx, ny, nz] = this._neck;
        this._e.set(pitch, yaw, 0);
        this._leg.compose(this._p.set(nx, ny, nz), this._q.setFromEuler(this._e), this._s.set(1, 1, 1));
        this._tmp.multiplyMatrices(this._root, this._leg);
        this.head.setMatrixAt(i, this._tmp);
        this.head.setColorAt(i, color);
      }
      // Cola: se balancea sola; levantada al galopar.
      if (this.tail) {
        const [tx, ty, tz] = this._tailAt;
        const swish = Math.sin(this._t * 3 + a.z * 3) * 0.35 * (1 - gallop * 0.6);
        this._e.set(0.2 + gallop * 0.9, 0, swish);
        this._leg.compose(this._p.set(tx, ty, tz), this._q.setFromEuler(this._e), this._s.set(1, 1, 1));
        this._tmp.multiplyMatrices(this._root, this._leg);
        this.tail.setMatrixAt(i, this._tmp);
        this.tail.setColorAt(i, color);
      }
    }
    this.body.count = n;
    if (this.head) this.head.count = n;
    if (this.tail) this.tail.count = n;
    this.legs.count = n * legsN;
    if (this.shins) this.shins.count = n * legsN;
    for (const m of this._meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }

  setVisible(v) {
    for (const m of this._meshes) m.visible = v;
  }
}

function toGeometry({ positions, colors }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

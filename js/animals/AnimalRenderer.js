import * as THREE from 'three';

/**
 * AnimalRenderer — dibuja todos los animales de una especie con DOS
 * InstancedMesh (cuerpo + patas): 2 llamadas de dibujo por especie, sea cual
 * sea el número de animales. Las patas se animan por instancia (zancada).
 * Color por instancia: destello rojo al recibir un golpe. Al morir, el animal
 * cae de lado y se hunde ligeramente.
 */
const WHITE = new THREE.Color(1, 1, 1);
const HIT = new THREE.Color(1.8, 0.55, 0.5);
export class AnimalRenderer {
  constructor({ scene, model, maxInstances, material }) {
    this._hips = model.hips;
    this._max = maxInstances;

    this.body = new THREE.InstancedMesh(toGeometry(model.body), material, maxInstances);
    this.legs = new THREE.InstancedMesh(toGeometry(model.leg), material, maxInstances * model.hips.length);
    for (const m of [this.body, this.legs]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // las instancias se mueven por todo el mundo
      m.count = 0;
      scene.add(m);
    }
    // Crea el atributo de color por instancia (multiplica el color por vértice).
    for (let i = 0; i < maxInstances; i++) this.body.setColorAt(i, WHITE);
    for (let i = 0; i < maxInstances * model.hips.length; i++) this.legs.setColorAt(i, WHITE);
    this._color = new THREE.Color();

    this._root = new THREE.Matrix4();
    this._tmp = new THREE.Matrix4();
    this._leg = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  /** @param {import('./Animal.js').Animal[]} animals visibles (≤ maxInstances) */
  update(animals) {
    const n = Math.min(animals.length, this._max);
    for (let i = 0; i < n; i++) {
      const a = animals[i];
      const moving = Math.min(1, a.speed / 1.5);
      const bob = Math.abs(Math.sin(a.gaitPhase)) * 0.04 * moving;
      const dying = a.deathProgress;
      const fall = Math.min(1, dying * 2.2);
      this._e.set(a.graze * 0.18, a.heading, fall * fall * (Math.PI / 2));
      this._root.compose(
        this._p.set(a.x, a.y + bob - dying * 0.25 * a.scale, a.z),
        this._q.setFromEuler(this._e),
        this._s.setScalar(a.scale),
      );
      this.body.setMatrixAt(i, this._root);
      const color = a.hitFlash > 0 ? this._color.copy(WHITE).lerp(HIT, Math.min(1, a.hitFlash / 0.15)) : WHITE;
      this.body.setColorAt(i, color);

      // Patas: diagonales en fase (delantera izq. + trasera der.).
      const swing = Math.sin(a.gaitPhase) * 0.55 * moving;
      this._hips.forEach(([hx, hy, hz], li) => {
        const phase = li === 0 || li === 3 ? swing : -swing;
        this._leg.makeRotationX(phase).setPosition(hx, hy, hz);
        this._tmp.multiplyMatrices(this._root, this._leg);
        this.legs.setMatrixAt(i * this._hips.length + li, this._tmp);
        this.legs.setColorAt(i * this._hips.length + li, color);
      });
    }
    this.body.count = n;
    this.legs.count = n * this._hips.length;
    this.body.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.body.instanceColor.needsUpdate = true;
    this.legs.instanceColor.needsUpdate = true;
  }

  setVisible(v) {
    this.body.visible = this.legs.visible = v;
  }
}

function toGeometry({ positions, colors }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

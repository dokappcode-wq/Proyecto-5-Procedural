import * as THREE from 'three';

/**
 * PartsBuilder — compone una geometría low-poly a partir de piezas simples
 * (cajas, conos, icosaedros...) con color por vértice.
 *
 * Resultado: arrays no indexados { positions, colors } listos para fusionar
 * muchas copias en una sola malla (una llamada de dibujo) o para usarlos como
 * geometría de un InstancedMesh. Sin normales: los materiales usan flatShading.
 */
export class PartsBuilder {
  constructor() {
    this._positions = [];
    this._colors = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /**
   * @param {THREE.BufferGeometry} geometry  pieza base (se convierte a no indexada)
   * @param {object} o { position:[x,y,z], rotation:[x,y,z], scale:[x,y,z]|number, color, jitter?:(i, v)=>void }
   */
  add(geometry, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, color = 0xffffff, jitter } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute('position');
    const sc = Array.isArray(scale) ? scale : [scale, scale, scale];
    this._m.compose(
      this._p.set(...position),
      this._q.setFromEuler(this._e.set(...rotation)),
      this._s.set(...sc),
    );
    this._c.set(color);
    for (let i = 0; i < pos.count; i++) {
      this._v.fromBufferAttribute(pos, i);
      jitter?.(i, this._v);
      this._v.applyMatrix4(this._m);
      this._positions.push(this._v.x, this._v.y, this._v.z);
      this._colors.push(this._c.r, this._c.g, this._c.b);
    }
    if (g !== geometry) g.dispose();
    return this;
  }

  build() {
    return { positions: new Float32Array(this._positions), colors: new Float32Array(this._colors) };
  }

  toGeometry() {
    const { positions, colors } = this.build();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals(); // por si algún material no usa flatShading
    geo.computeBoundingSphere();
    return geo;
  }
}

import * as THREE from 'three';

/**
 * Rocks — pedruscos irregulares low-poly (los gólems, los escombros): un icosaedro
 * con los vértices desplazados por un ruido que solo depende de la posición del
 * vértice (así las caras que comparten vértice siguen pegadas) y algo aplanado por
 * los lados, como bloques tallados por el tiempo.
 */
export function boulderGeo(seed, detail = 1, rough = 0.2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = hash3(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100) + seed * 131);
    v.multiplyScalar(1 + (h - 0.5) * rough * 2);
    v.x = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.85);
    v.z = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.85);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Unas cuantas variantes ya hechas (compartidas). */
let _set = null;
export function boulderSet() {
  return (_set ??= [0, 1, 2, 3, 4, 5].map((k) => boulderGeo(k + 1, 1, 0.22)));
}

export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

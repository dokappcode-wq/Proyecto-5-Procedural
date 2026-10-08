import * as THREE from 'three';

/**
 * AnimalParts — piezas comunes de los modelos de animales (geometrías compartidas y
 * atajos para PartsBuilder): bolas facetadas, cilindros, conos y una pata con muslo
 * (cadera → rodilla) y caña (rodilla → pezuña) por separado, que AnimalRenderer anima.
 */
export const G = {
  ball: new THREE.IcosahedronGeometry(1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  taper: new THREE.CylinderGeometry(0.75, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 6),
};

/** Pieza alargada de a a b (cilindro), de radio r. */
export function limb(b, a, c, r, color, geo = G.cyl) {
  const dx = c[0] - a[0];
  const dy = c[1] - a[1];
  const dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  // Orientar el eje Y del cilindro de a hacia c.
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(geo, { position: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2], rotation: [e.x, e.y, e.z], scale: [r, len, r], color });
}

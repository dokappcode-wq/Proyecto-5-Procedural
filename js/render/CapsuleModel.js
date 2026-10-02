import * as THREE from 'three';

/**
 * CapsuleModel — cápsula de salvamento low-poly (unos 2,4 m de alto y 2,5 m de ancho).
 *
 * La misma pieza se usa en el menú de inicio (en órbita, intacta) y en el planeta
 * (estrellada: quemada, con la compuerta arrancada y el interior iluminado).
 *
 *   Origen: centro del escudo térmico. +Y: hacia la punta. La compuerta mira a +Z.
 *
 * @param {object} [o]
 * @param {boolean} [o.crashed] versión estrellada
 * @returns {{ group: THREE.Group, beacon: THREE.Mesh, window: THREE.Mesh, hatchSpot: THREE.Vector3, interiorLight: THREE.PointLight|null }}
 */
export function buildCapsule({ crashed = false } = {}) {
  const g = new THREE.Group();
  g.name = crashed ? 'CrashedCapsule' : 'Capsule';
  const k = crashed ? 0.8 : 1; // chamuscada tras la reentrada
  // En órbita (menú): material físico. En el planeta: Lambert, como el resto del mundo.
  const std = (color, extra = {}) => {
    const c = new THREE.Color(color).multiplyScalar(extra.dim ?? k);
    return crashed
      ? new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...strip(extra) })
      : new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.25, flatShading: true, ...strip(extra) });
  };

  // Casco: perfil de revolución (escudo → cono → túnel de la punta).
  const profile = [
    [1.24, 0.12], [1.18, 0.42], [0.98, 0.95], [0.74, 1.6], [0.6, 1.8], [0.5, 1.86],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 14), std(0xdfe4e8, { side: THREE.DoubleSide }));
  g.add(hull);
  // Tapa de la punta y túnel de acoplamiento.
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.34, 12), std(0x6d747c));
  top.position.y = 2.0;
  g.add(top);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.06, 12), std(0x4b5157));
  cap.position.y = 2.2;
  g.add(cap);

  // Escudo térmico (abajo): marrón oscuro, más negro si ha ardido.
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.3, 16, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38),
    std(crashed ? 0x231914 : 0x4a3a30, { dim: 1 }),
  );
  shield.scale.y = 0.45;
  shield.position.y = 0.42;
  g.add(shield);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.07, 6, 18), std(crashed ? 0x2b231e : 0x5c4c40, { dim: 1 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.12;
  g.add(rim);

  // Franjas naranjas de salvamento.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.135, 1.19, 0.16, 14, 1, true), std(0xe8742a, { side: THREE.DoubleSide }));
  band.position.y = 0.52;
  g.add(band);
  const band2 = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.7, 0.1, 14, 1, true), std(0xe8742a, { side: THREE.DoubleSide }));
  band2.position.y = 1.7;
  g.add(band2);

  // Propulsores de maniobra (4) y antena.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.12), std(0x3e444a));
    t.position.set(Math.sin(a) * 0.8, 1.42, Math.cos(a) * 0.8);
    t.rotation.y = a;
    g.add(t);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4), std(0x9aa3ab));
  antenna.position.set(0.18, 2.55, 0);
  antenna.rotation.z = crashed ? 0.9 : 0;
  g.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b2f }),
  );
  beacon.position.set(-0.22, 2.25, 0);
  g.add(beacon);

  // Ventanilla (lado opuesto a la compuerta) con cristal azulado.
  const win = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0x0d2233, emissive: 0x2b7fb8, emissiveIntensity: crashed ? 0.5 : 0.9, roughness: 0.15, metalness: 0.6 }),
  );
  placeOnCone(win, Math.PI, 1.15);
  g.add(win);

  // Compuerta (+Z): cerrada en órbita; arrancada en el suelo, con el interior a la vista.
  const hatchSpot = new THREE.Vector3();
  let interiorLight = null;
  if (!crashed) {
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.05), std(0xc9cfd4));
    placeOnCone(hatch, 0, 1.05);
    g.add(hatch);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.05), std(0x3e444a));
    placeOnCone(handle, 0, 0.92, 0.04);
    g.add(handle);
  } else {
    // Hueco oscuro de la compuerta y luz cálida dentro.
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.82), new THREE.MeshBasicMaterial({ color: 0x120d0a }));
    placeOnCone(hole, 0, 1.05, 0.012);
    g.add(hole);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 4, 4), std(0x4b5157, { dim: 1 }));
    placeOnCone(frame, 0, 1.05, 0.02);
    frame.rotateZ(Math.PI / 4);
    frame.scale.set(1.05, 1.3, 1);
    g.add(frame);
    interiorLight = new THREE.PointLight(0xffb070, 1.2, 4, 2);
    interiorLight.position.set(0, 1.0, 0.25);
    g.add(interiorLight);
    // Punto de la compuerta donde descansa el reloj (borde inferior del hueco).
    const p = coneSurface(0, 0.72, 0.12);
    hatchSpot.copy(p);
  }

  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { group: g, beacon, window: win, hatchSpot, interiorLight };
}

/** Puerta arrancada de la cápsula (queda tirada en el suelo junto a ella). */
export function buildCapsuleHatch() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.7, metalness: 0.2, flatShading: true });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.78), m);
  g.add(plate);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: 0x33383d, flatShading: true }));
  handle.position.set(0, 0.04, -0.2);
  g.add(handle);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

// Radio del casco a la altura y (mismo perfil que la geometría de revolución).
function hullRadius(y) {
  const pts = [[1.24, 0.12], [1.18, 0.42], [0.98, 0.95], [0.74, 1.6], [0.6, 1.8]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i];
    const [r1, y1] = pts[i + 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return pts[pts.length - 1][0];
}

/** Punto de la superficie del cono en el ángulo `a` (0 = +Z) y altura y, separado `out` m. */
function coneSurface(a, y, out = 0) {
  const r = hullRadius(y) + out;
  return new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
}

/** Coloca una pieza plana sobre el cono, mirando hacia fuera e inclinada con la pared. */
function placeOnCone(mesh, a, y, out = 0.015) {
  mesh.position.copy(coneSurface(a, y, out));
  const slope = Math.atan2(hullRadius(y - 0.1) - hullRadius(y + 0.1), 0.2);
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(a);
  mesh.rotateX(-slope);
}

function strip(extra) {
  const { dim, ...rest } = extra;
  return rest;
}

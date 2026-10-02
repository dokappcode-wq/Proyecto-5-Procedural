import * as THREE from 'three';
import { buildCapsule, buildCapsuleHatch } from '../render/CapsuleModel.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';

/**
 * CrashSite — la cápsula de salvamento estrellada junto al punto de inicio.
 *
 * - Cápsula volcada y medio enterrada, con la compuerta arrancada (tirada al lado),
 *   tierra quemada, un surco de tierra detrás y humo (y llamas al principio).
 * - En la compuerta está el reloj de pulsera: brilla, tiene un haz de luz y un
 *   letrero flotante. Se coge con E (es un "provider" de InteractionSystem).
 * - La cápsula es un obstáculo sólido (interfaz de estructuras: resolveCollisions,
 *   blocksAt…), solo en su cuerpo.
 *
 * Se coloca con `place(world)` al generarse el mundo (según la seed) dentro del
 * grupo de ese cuerpo, así que solo se ve en él.
 */
export class CrashSite {
  /**
   * @param {object} p
   * @param {Function} p.rootOf     (bodyId) → Group de la escena de ese cuerpo
   * @param {string} p.bodyId       cuerpo donde está (el planeta de inicio)
   * @param {Function} p.activeBody () → id del cuerpo activo
   * @param {boolean} p.withWatch   ¿está el reloj en la cápsula?
   * @param {Function} p.onTakeWatch al coger el reloj
   */
  constructor({ rootOf, bodyId, activeBody, withWatch = true, onTakeWatch = () => {} }) {
    this.name = 'crashSite';
    this._rootOf = rootOf;
    this.bodyId = bodyId;
    this._activeBody = activeBody;
    this.watchTaken = !withWatch;
    this._onTakeWatch = onTakeWatch;
    this.group = null;
    this.position = null;   // { x, z } del centro de la cápsula
    this._circles = [];     // obstáculos { x, z, r, top }
    this._smoke = null;
    this._t = 0;
  }

  /** Coloca la cápsula junto al inicio de `world` (determinista con la seed del mundo). */
  place(world) {
    this.dispose();
    const spawn = world.getSpawnPoint();
    const rng = new SeededRandom(deriveSeed(world.seed.value, 'crashSite'));
    // Delante del jugador (que aparece mirando hacia ella) a unos 5 m.
    const a = rng.range(0, Math.PI * 2);
    const toPod = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); // del jugador a la cápsula
    const cx = spawn.x + toPod.x * 6;
    const cz = spawn.z + toPod.z * 6;
    const ground = world.getHeightAt(cx, cz);
    this.position = { x: cx, z: cz };
    this.facing = { x: -toPod.x, z: -toPod.z }; // de la cápsula al jugador

    const root = new THREE.Group();
    root.name = 'CrashSite';
    const cap = buildCapsule({ crashed: true });
    const pod = cap.group;
    // Tumbada de lado (el eje, hacia un costado visto desde el jugador) y con la compuerta
    // mirando al jugador y un poco al cielo.
    const tilt = THREE.MathUtils.degToRad(72);
    const sideDir = new THREE.Vector3(toPod.z, 0, -toPod.x);
    const axis = sideDir.clone().multiplyScalar(Math.sin(tilt)).setY(Math.cos(tilt)).normalize();
    const toPlayer = new THREE.Vector3(-toPod.x, 0, -toPod.z);
    const hatchDir = toPlayer.clone().add(new THREE.Vector3(0, 0.55, 0));
    const zAxis = hatchDir.addScaledVector(axis, -hatchDir.dot(axis)).normalize();
    const xAxis = new THREE.Vector3().crossVectors(axis, zAxis).normalize();
    pod.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, axis, zAxis));
    const S = 1.35; // algo más grande que la de la escena del menú: que se vea bien en el suelo
    pod.scale.setScalar(S);
    // Se hunde hasta que el borde del escudo queda bajo tierra.
    let minY = Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      v.set(Math.cos(t) * 1.24, 0.12, Math.sin(t) * 1.24).multiplyScalar(S).applyQuaternion(pod.quaternion);
      minY = Math.min(minY, v.y);
    }
    pod.position.set(cx, ground - minY - 0.4, cz);
    root.add(pod);
    this._pod = pod;
    this._interior = cap.interiorLight;

    // Obstáculos: círculos a lo largo del eje (en planta).
    this._circles = [];
    for (const [t, r] of [[0.35, 1.25], [1.1, 1.0], [1.8, 0.7]]) {
      const p = pod.position.clone().addScaledVector(axis, t * S);
      this._circles.push({ x: p.x, z: p.z, r: r * S, top: p.y + r * S * 0.9 });
    }

    // Tierra quemada, surco y terrones (sobre el terreno).
    root.add(scorchDecal(world, cx, cz, 4.8, rng));
    const clodMat = new THREE.MeshLambertMaterial({ color: 0x4a3524, flatShading: true });
    const clodGeo = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 9; i++) {
      const d = 3 + i * 1.05 + rng.range(-0.3, 0.3);
      const side = (i % 2 ? 1 : -1) * rng.range(0.9, 1.6);
      const x = cx - sideDir.x * d + toPod.x * side;
      const z = cz - sideDir.z * d + toPod.z * side;
      const m = new THREE.Mesh(clodGeo, clodMat);
      const s = rng.range(0.35, 0.7) * (1 - i * 0.06);
      m.scale.set(s * 1.4, s * 0.55, s);
      m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      m.position.set(x, world.getHeightAt(x, z) + s * 0.15, z);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    }

    // La compuerta arrancada, tirada al lado.
    const hatch = buildCapsuleHatch();
    const hx = cx - sideDir.x * 2.4 + toPlayer.x * 1.9;
    const hz = cz - sideDir.z * 2.4 + toPlayer.z * 1.9;
    hatch.position.set(hx, world.getHeightAt(hx, hz) + 0.05, hz);
    hatch.rotation.set(0.12, rng.range(0, Math.PI * 2), -0.08);
    root.add(hatch);

    // El reloj, en el borde de la compuerta.
    this._watch = buildWatchBeacon();
    const spot = cap.hatchSpot.clone().multiplyScalar(S).applyQuaternion(pod.quaternion).add(pod.position);
    this._watch.group.position.copy(spot);
    this._watch.group.lookAt(spot.x + toPlayer.x, spot.y + 0.4, spot.z + toPlayer.z);
    this._watch.group.visible = !this.watchTaken;
    root.add(this._watch.group);
    this.watchSpot = spot;

    this._smoke = buildSmoke(pod.position.clone().addScaledVector(axis, 0.3 * S));
    root.add(this._smoke.group);

    this.group = root;
    this._rootOf(this.bodyId)?.add(root);
    this._t = 0;
  }

  /**
   * Dirección (yaw del jugador) al empezar: hacia la cápsula, algo girado para que
   * en tercera persona el cuerpo no la tape (queda a la izquierda de la pantalla).
   */
  get spawnYaw() {
    if (!this.facing) return 0;
    return Math.atan2(this.facing.x, this.facing.z) - 0.38; // yaw=0 mira a −Z; mirar hacia −facing
  }

  dispose() {
    if (!this.group) return;
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) for (const m of [].concat(o.material)) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
    this.group = null;
  }

  update(dt) {
    if (!this.group) return;
    this._t += dt;
    const t = this._t;
    // Humo (más flojo con el tiempo) y llamas solo al principio.
    this._smoke.update(dt, Math.max(0.35, 1 - t / 240), Math.max(0, 1 - t / 120));
    if (this._interior) this._interior.intensity = 1 + Math.sin(t * 17) * 0.15 + Math.sin(t * 7.3) * 0.2;
    if (!this.watchTaken) this._watch.update(t, this._playerDist?.() ?? Infinity);
  }

  /** Distancia del jugador al reloj (el letrero flotante se apaga de cerca: ya sale el aviso de E). */
  setPlayer(player) {
    this._playerDist = () => (this.watchSpot ? Math.hypot(player.position.x - this.watchSpot.x, player.position.z - this.watchSpot.z) : Infinity);
  }

  // ---- Interacción (provider) ------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    if (this.watchTaken || !this.group || this._activeBody() !== this.bodyId) return [];
    const s = this.watchSpot;
    if (Math.hypot(s.x - x, s.z - z) > range + 2) return [];
    return [{ id: 'watch', x: s.x, y: s.y, z: s.z, aimRadius: 0.75, reach: 0.9, label: '⌚ Tu reloj de pulsera', action: 'Coger', key: 'E' }];
  }

  interact(id) {
    if (id !== 'watch' || this.watchTaken) return;
    this.watchTaken = true;
    this._watch.group.visible = false;
    this._onTakeWatch();
  }

  // ---- Obstáculo (interfaz de estructuras) -----------------------------------

  _here() {
    return !!this.group && this._activeBody() === this.bodyId;
  }

  surfaceAt() {
    return null;
  }

  ceilingAt() {
    return Infinity;
  }

  raycastDistance() {
    return null;
  }

  blocksAt(x, z, r, y0 = -Infinity, y1 = Infinity) {
    if (!this._here()) return false;
    return this._circles.some((c) => y0 < c.top && Math.hypot(x - c.x, z - c.z) < c.r + r);
  }

  resolveCollisions(pos, r, y0 = -Infinity) {
    if (!this._here()) return false;
    let hit = false;
    for (const c of this._circles) {
      if (y0 >= c.top) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d >= min) continue;
      const k = d > 1e-6 ? (min - d) / d : 0;
      pos.x += d > 1e-6 ? dx * k : min;
      pos.z += dz * k;
      hit = true;
    }
    return hit;
  }
}

// ---- Piezas ---------------------------------------------------------------------

/** Mancha de tierra quemada que sigue el terreno (disco irregular, bordes difuminados). */
function scorchDecal(world, cx, cz, radius, rng) {
  const rings = 6;
  const seg = 20;
  const wobble = Array.from({ length: seg }, () => rng.range(0.75, 1.15));
  const pos = [];
  const col = [];
  const idx = [];
  pos.push(cx, world.getHeightAt(cx, cz) + 0.05, cz);
  col.push(0.08, 0.06, 0.05, 0.92);
  for (let i = 1; i <= rings; i++) {
    const f = i / rings;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const r = radius * f * (f > 0.5 ? wobble[j] : 1);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      pos.push(x, world.getHeightAt(x, z) + 0.05, z);
      col.push(0.1 + f * 0.12, 0.08 + f * 0.08, 0.06 + f * 0.05, 0.92 * (1 - f ** 2.2));
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = 1 + (i - 1) * seg + j;
      const b = 1 + (i - 1) * seg + ((j + 1) % seg);
      const c = 1 + i * seg + j;
      const d = 1 + i * seg + ((j + 1) % seg);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** El reloj tirado en la compuerta: grande, brillante, con haz de luz y letrero. */
function buildWatchBeacon() {
  const g = new THREE.Group();
  g.name = 'WatchPickup';
  const inner = new THREE.Group();
  inner.scale.setScalar(2.2);
  g.add(inner);
  const strap = new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.5, metalness: 0.3 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 16), strap);
  band.scale.set(1, 1, 1.6);
  inner.add(band);
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.085, 0.03),
    new THREE.MeshStandardMaterial({ color: 0x0b1a22, emissive: 0x4fe0ff, emissiveIntensity: 1.6, roughness: 0.2 }),
  );
  face.position.set(0, 0.09, 0);
  face.rotation.x = -Math.PI / 2;
  inner.add(face);

  const glowTex = radialTexture('rgba(130,240,255,1)', 'rgba(79,224,255,0)');
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ff2ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(1.2);
  g.add(glow);
  const light = new THREE.PointLight(0x4fe0ff, 2.4, 7, 2);
  light.position.y = 0.3;
  g.add(light);
  // Haz de luz vertical (se ve desde lejos) y letrero flotante.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.16, 7, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7feaff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = 3.6;
  g.add(beam);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(), depthTest: false, depthWrite: false, transparent: true }));
  label.scale.set(1.9, 0.62, 1);
  label.renderOrder = 10;
  g.add(label);
  // Que el letrero y el brillo no sigan la orientación del reloj.
  const update = (t, dist = Infinity) => {
    label.material.opacity = Math.min(1, Math.max(0, (dist - 3) / 2));
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    glow.scale.setScalar(1.0 + pulse * 0.6);
    glow.material.opacity = 0.55 + pulse * 0.45;
    light.intensity = 1.6 + pulse * 1.8;
    beam.material.opacity = 0.18 + pulse * 0.16;
    inner.rotation.y = Math.sin(t * 0.8) * 0.25;
    label.position.set(0, 1.25 + Math.sin(t * 2.4) * 0.08, 0);
  };
  update(0);
  return { group: g, update };
}

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 124;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(8,20,28,0.78)';
  roundRect(x, 6, 6, 372, 90, 18);
  x.fill();
  x.strokeStyle = 'rgba(79,224,255,0.95)';
  x.lineWidth = 4;
  x.stroke();
  x.beginPath();
  x.moveTo(176, 96);
  x.lineTo(192, 118);
  x.lineTo(208, 96);
  x.closePath();
  x.fillStyle = 'rgba(79,224,255,0.95)';
  x.fill();
  x.fillStyle = '#e9fbff';
  x.font = 'bold 40px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('⌚ TU RELOJ  ·  E', 192, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t);
  x.arcTo(l + w, t, l + w, t + h, r);
  x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r);
  x.arcTo(l, t, l + w, t, r);
  x.closePath();
}

/** Columna de humo (sprites que suben, crecen y se desvanecen) y llamas en el escudo. */
function buildSmoke(origin) {
  const group = new THREE.Group();
  const smokeTex = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
  const fireTex = radialTexture('rgba(255,220,140,1)', 'rgba(255,90,20,0)');
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x8e8a86, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false;
    group.add(s);
    puffs.push({ s, age: Math.random() * 6, life: 6 + Math.random() * 3, x: 0, z: 0 });
  }
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fireTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    f.position.set(origin.x + (Math.random() - 0.5) * 1.2, origin.y + 0.2, origin.z + (Math.random() - 0.5) * 1.2);
    group.add(f);
    flames.push(f);
  }
  const fireLight = new THREE.PointLight(0xff7a2a, 2, 9, 2);
  fireLight.position.set(origin.x, origin.y + 0.8, origin.z);
  group.add(fireLight);
  let t = 0;
  const update = (dt, strength, fire) => {
    t += dt;
    for (const p of puffs) {
      p.age += dt;
      if (p.age > p.life) {
        p.age = 0;
        p.x = (Math.random() - 0.5) * 0.8;
        p.z = (Math.random() - 0.5) * 0.8;
      }
      const u = p.age / p.life;
      p.s.visible = true;
      p.s.position.set(origin.x + p.x + u * 1.6, origin.y + 1 + u * 9, origin.z + p.z + u * 0.8);
      p.s.scale.setScalar(0.7 + u * 2.6);
      p.s.material.opacity = Math.sin(Math.min(1, u * 1.3) * Math.PI) * 0.32 * strength;
    }
    flames.forEach((f, i) => {
      const k = 0.6 + 0.4 * Math.sin(t * (9 + i * 2.3) + i);
      f.visible = fire > 0.02;
      f.scale.setScalar((0.5 + k * 0.5) * (0.4 + fire * 0.8));
      f.material.opacity = fire * (0.6 + 0.4 * k);
    });
    fireLight.intensity = fire * (1.5 + Math.sin(t * 13) * 0.5);
  };
  return { group, update };
}

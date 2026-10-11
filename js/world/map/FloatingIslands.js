import * as THREE from 'three';
import { PartsBuilder } from '../../render/PartsBuilder.js';
import { SeededRandom, hashString } from '../../core/SeededRandom.js';

/**
 * FloatingIslands — islas que flotan sobre el mapa diseñado (meta.floatingIslands), como en las
 * láminas de referencia: cima de hierba con árboles, panza de roca en estratos que acaba en punta,
 * lianas colgando, piedras sueltas alrededor y, en algunas, un arroyo que cae por el borde y se
 * deshace en bruma antes de llegar al suelo.
 *
 * Son decorado: el horneado las pone a `alt` metros sobre lo más alto que tienen debajo (y), así
 * que no llevan colisiones. Se mecen muy despacio (cada una a su ritmo).
 *
 * Datos de cada isla: { id, name, x, z, y, r, trees?, fall? } — fall: ángulo (rad, en el plano
 * x–z) del borde por el que cae su cascada.
 */
const G = {
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const ROCK = { dark: new THREE.Color(0x5f564d), light: new THREE.Color(0x9a8f80), warm: new THREE.Color(0x8a6e55) };
const DIRT = new THREE.Color(0x6b4a30);
const GRASS = [new THREE.Color(0x6ab443), new THREE.Color(0x5ba03a), new THREE.Color(0x7cc251)];
const LEAVES = [0x4f9a35, 0x5fae3f, 0x3f8a2e, 0x6dbb48];
const WATER = 0x5ccfe0;

/** Contorno de la cima: radio en el ángulo a (lobulado, distinto en cada isla). */
function outlineOf(isl, rng) {
  const ph = [rng.next() * 6.28, rng.next() * 6.28, rng.next() * 6.28];
  return (a) => isl.r * (1 + 0.13 * Math.sin(2 * a + ph[0]) + 0.08 * Math.sin(3 * a + ph[1]) + 0.05 * Math.sin(5 * a + ph[2]));
}

/** Altura de la cima (relativa) a una fracción del radio: un poco abombada. */
const topY = (rel) => (rel < 0.55 ? 0.9 - (rel / 0.55) * 0.3 : 0.6 * (1 - (rel - 0.55) / 0.45));

/**
 * Geometría del cuerpo de una isla (cima, borde de tierra y panza de roca), en coordenadas
 * locales (la cima a y ≈ 0), con color por vértice. Triángulos hacia fuera.
 */
export function buildIslandBody(isl) {
  const rng = new SeededRandom(hashString(`island:${isl.id}`));
  const R = outlineOf(isl, rng);
  const seg = Math.min(30, 14 + Math.round(isl.r));
  const depth = isl.r * (1.3 + rng.next() * 0.6);
  const tip = { x: (rng.next() - 0.5) * isl.r * 0.5, z: (rng.next() - 0.5) * isl.r * 0.5 };
  const K = 6;
  const tmp = new THREE.Color();
  // Anillos de arriba abajo: { pts: [[x, y, z]...], col: (x, y, z, t) => Color }.
  const rings = [];
  const ring = (fn) => {
    const pts = [];
    for (let j = 0; j <= seg; j++) {
      const a = ((j % seg) / seg) * Math.PI * 2;
      pts.push(fn(a, j % seg));
    }
    return pts;
  };
  const jit = Array.from({ length: (K + 3) * seg }, () => rng.next() - 0.5);
  rings.push({ pts: ring(() => [0, topY(0), 0]), grass: true });
  rings.push({ pts: ring((a, j) => [Math.cos(a) * R(a) * 0.55, topY(0.55) + jit[j] * 0.1, Math.sin(a) * R(a) * 0.55]), grass: true });
  rings.push({ pts: ring((a) => [Math.cos(a) * R(a), 0, Math.sin(a) * R(a)]), grass: true });
  rings.push({ pts: ring((a, j) => [Math.cos(a) * R(a) * 1.04, -0.8 + jit[seg + j] * 0.3, Math.sin(a) * R(a) * 1.04]), lip: true });
  for (let k = 1; k <= K; k++) {
    const t = k / K;
    const y = -0.8 - depth * Math.pow(t, 1.15);
    rings.push({
      t,
      pts: ring((a, j) => {
        const s = Math.pow(1 - t, 0.75) * (1 + jit[(k + 1) * seg + j] * 0.42) * (k === K ? 0 : 1);
        return [tip.x * t + Math.cos(a) * R(a) * s, y + jit[(k + 2) * seg + j] * depth * 0.06 * (k === K ? 0 : 1), tip.z * t + Math.sin(a) * R(a) * s];
      }),
    });
  }
  const pos = [];
  const col = [];
  const colorAt = (p, rg) => {
    if (rg.grass) {
      tmp.copy(GRASS[Math.floor(rng.next() * GRASS.length)]);
      tmp.multiplyScalar(0.92 + rng.next() * 0.16);
    } else if (rg.lip) {
      tmp.copy(DIRT).lerp(GRASS[0], 0.35 + rng.next() * 0.2);
    } else {
      // Estratos (bandas horizontales) y más oscura hacia la punta.
      const band = Math.sin(p[1] * 1.1 + Math.sin(p[0] * 0.3 + p[2] * 0.2) * 1.5) * 0.5 + 0.5;
      tmp.copy(ROCK.dark).lerp(ROCK.light, band).lerp(ROCK.warm, rng.next() * 0.3);
      if (rg.t < 0.25) tmp.lerp(DIRT, 0.5 * (1 - rg.t / 0.25));
      tmp.multiplyScalar(1 - 0.35 * rg.t);
    }
    col.push(tmp.r, tmp.g, tmp.b);
  };
  const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
  const tri = (p, q, s, rg) => {
    for (const v of [p, q, s]) {
      pos.push(v[0], v[1], v[2]);
      colorAt(v, rg);
    }
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i].pts;
    const B = rings[i + 1].pts;
    const rg = rings[i + 1];
    for (let j = 0; j < seg; j++) {
      if (!same(A[j], A[j + 1])) tri(A[j], A[j + 1], B[j], rg);
      if (!same(B[j], B[j + 1])) tri(A[j + 1], B[j + 1], B[j], rg);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, outline: R, depth, rng };
}

/** Árboles, matas, piedras, lianas y rocas sueltas de una isla (PartsBuilder, local). */
function buildIslandProps(isl, outline, depth, rng, fallAngle) {
  const P = new PartsBuilder();
  const spot = (minRel, maxRel) => {
    for (let tries = 0; tries < 12; tries++) {
      const a = rng.next() * Math.PI * 2;
      const rel = minRel + rng.next() * (maxRel - minRel);
      // Lejos del arroyo.
      if (fallAngle !== null && Math.abs(Math.atan2(Math.sin(a - fallAngle), Math.cos(a - fallAngle))) < 0.45) continue;
      const r = outline(a) * rel;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: topY(rel) - 0.1 };
    }
    return null;
  };
  for (let i = 0; i < (isl.trees ?? 0); i++) {
    const s = spot(0.1, 0.65);
    if (!s) continue;
    const h = 3.5 + rng.next() * 3;
    P.add(G.cyl6, { position: [s.x, s.y + h / 2, s.z], scale: [0.5, h, 0.5], color: 0x6b4a30 });
    const n = 2 + Math.floor(rng.next() * 2);
    for (let k = 0; k < n; k++) {
      const sz = 3.2 - k * 0.7 + rng.next() * 0.6;
      P.add(G.ico, {
        position: [s.x + (rng.next() - 0.5) * 0.8, s.y + h + k * 1.3 - 0.3, s.z + (rng.next() - 0.5) * 0.8],
        scale: [sz, sz * 0.8, sz], color: LEAVES[Math.floor(rng.next() * LEAVES.length)],
      });
    }
  }
  for (let i = 0; i < 3 + Math.floor(isl.r / 4); i++) {
    const s = spot(0.2, 0.9);
    if (!s) continue;
    if (rng.next() < 0.6) P.add(G.ico0, { position: [s.x, s.y + 0.3, s.z], scale: 0.9 + rng.next() * 0.8, color: LEAVES[Math.floor(rng.next() * LEAVES.length)] });
    else P.add(G.dodeca, { position: [s.x, s.y + 0.2, s.z], scale: 0.6 + rng.next() * 0.9, color: 0x9a9286 });
  }
  // Lianas que cuelgan del borde.
  for (let i = 0; i < 3 + Math.floor(isl.r / 5); i++) {
    const a = rng.next() * Math.PI * 2;
    const r = outline(a) * 1.02;
    const len = 2 + rng.next() * 4;
    P.add(G.box, { position: [Math.cos(a) * r, -0.6 - len / 2, Math.sin(a) * r], rotation: [0, -a, 0], scale: [0.18, len, 0.18], color: 0x3f7a2c });
  }
  // Salientes de roca en la panza (rompen la silueta de cono).
  for (let i = 0; i < 3 + Math.floor(isl.r / 5); i++) {
    const a = rng.next() * Math.PI * 2;
    const t = 0.15 + rng.next() * 0.4;
    const r = outline(a) * Math.pow(1 - t, 0.75) * 0.9;
    const s = isl.r * (0.14 + rng.next() * 0.12);
    P.add(G.dodeca, {
      position: [Math.cos(a) * r, -0.8 - depth * t, Math.sin(a) * r], rotation: [rng.next(), rng.next() * 3, rng.next()],
      scale: [s, s * (1.4 + rng.next()), s], color: rng.next() < 0.5 ? 0x7a6f63 : 0x8f8273,
    });
  }
  // Rocas sueltas que flotan junto a la isla.
  for (let i = 0; i < 2 + Math.floor(rng.next() * 3); i++) {
    const a = rng.next() * Math.PI * 2;
    const r = outline(a) * (1.3 + rng.next() * 0.5);
    const s = 1 + rng.next() * isl.r * 0.12;
    const y = -depth * (0.15 + rng.next() * 0.4);
    P.add(G.dodeca, { position: [Math.cos(a) * r, y, Math.sin(a) * r], scale: [s, s * 1.3, s], rotation: [rng.next(), rng.next() * 3, rng.next()], color: 0x7d7368 });
    P.add(G.ico0, { position: [Math.cos(a) * r, y + s * 0.62, Math.sin(a) * r], scale: [s * 0.9, s * 0.25, s * 0.9], color: GRASS[1].getHex() });
  }
  return P.toGeometry();
}

/** Textura de chorros para la cascada (se desplaza hacia abajo). Sin DOM. */
function fallTexture() {
  const W = 16;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  const rng = new SeededRandom(hashString('island-fall'));
  const colB = Array.from({ length: W }, () => 0.75 + rng.next() * 0.25);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const streak = 0.8 + 0.2 * Math.sin((y / H) * Math.PI * 2 * (2 + (x % 3)) + x * 1.7);
      const v = Math.min(1, colB[x] * streak + 0.1);
      const k = (y * W + x) * 4;
      data[k] = 255 * v;
      data[k + 1] = 255 * v;
      data[k + 2] = 255;
      data[k + 3] = 255 * (0.65 + 0.35 * streak * colB[x]);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Cinta de la cascada: sale del borde (ángulo a, radio r0), se curva un poco hacia fuera y cae
 * `len` metros; se ensancha y se vuelve transparente en la mitad de abajo (bruma).
 */
export function buildFallRibbon(a, r0, len, width = 2.4) {
  const n = 14;
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const out = r0 + 0.4 + 2.2 * Math.sqrt(t) + t * 2;
    const y = 0.15 - len * t;
    const w = width * (1 + t * 1.6) / 2;
    const alpha = t < 0.45 ? 0.9 : 0.9 * Math.max(0, 1 - (t - 0.45) / 0.55) ** 1.5;
    for (const s of [-1, 1]) {
      pos.push(ux * out - uz * w * s, y, uz * out + ux * w * s);
      col.push(1, 1, 1, alpha);
      uv.push(s < 0 ? 0 : 1, (len * t) / 8);
    }
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Arroyo sobre la cima: del centro al borde por el que cae. */
function buildStream(a, outline) {
  const P = new PartsBuilder();
  const r1 = outline(a);
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const t0 = 0.15 + (i / steps) * 0.87;
    const t1 = 0.15 + ((i + 1) / steps) * 0.87;
    const tm = (t0 + t1) / 2;
    const wob = Math.sin(i * 1.9) * 0.6;
    const cx = Math.cos(a) * r1 * tm - Math.sin(a) * wob;
    const cz = Math.sin(a) * r1 * tm + Math.cos(a) * wob;
    P.add(G.box, { position: [cx, topY(Math.min(1, tm)) + 0.08, cz], rotation: [0, -a, 0], scale: [(t1 - t0) * r1 + 0.6, 0.12, 1.3 + tm * 0.5], color: WATER });
  }
  return P.toGeometry();
}

export class FloatingIslands {
  /**
   * @param {{ map: MapData, root: THREE.Object3D, isEnabled?: () => boolean }} opts
   */
  constructor({ map, root, isEnabled = () => true }) {
    this.name = 'floatingIslands';
    this._enabled = isEnabled;
    this._t = 0;
    this.group = new THREE.Group();
    this.group.name = 'FloatingIslands';
    root.add(this.group);
    this.islands = [];
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a5a66, emissiveIntensity: 0.35 });
    this._fallTex = null;
    this._mist = [];
    for (const isl of map.meta.floatingIslands ?? []) {
      const g = new THREE.Group();
      g.name = `isla:${isl.id}`;
      g.position.set(isl.x, isl.y, isl.z);
      const { geo, outline, depth, rng } = buildIslandBody(isl);
      const fallAngle = Number.isFinite(isl.fall) ? isl.fall : null;
      const body = new THREE.Mesh(geo, rockMat);
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const props = new THREE.Mesh(buildIslandProps(isl, outline, depth, rng, fallAngle), rockMat);
      props.castShadow = true;
      g.add(props);
      if (fallAngle !== null) {
        g.add(new THREE.Mesh(buildStream(fallAngle, outline), waterMat));
        const r0 = outline(fallAngle);
        const fx = isl.x + Math.cos(fallAngle) * r0;
        const fz = isl.z + Math.sin(fallAngle) * r0;
        const below = Math.max(map.heightAt(fx, fz), map.waterAt?.(fx, fz) ?? -Infinity);
        // La cascada se deshace antes de llegar al suelo.
        const len = Math.max(12, Math.min(90, (isl.y - below) * 0.7));
        if (!this._fallTex) this._fallTex = fallTexture();
        const mat = new THREE.MeshBasicMaterial({
          map: this._fallTex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xd9f6ff, fog: true,
        });
        const ribbon = new THREE.Mesh(buildFallRibbon(fallAngle, r0, len, 1.6 + isl.r * 0.06), mat);
        ribbon.renderOrder = 2;
        g.add(ribbon);
        // Bruma donde se deshace.
        for (let k = 0; k < 4; k++) {
          const m = new THREE.Mesh(G.ico, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.1, depthWrite: false, fog: true }));
          const out = r0 + 4.5 + rng.next() * 2;
          m.position.set(Math.cos(fallAngle) * out + (rng.next() - 0.5) * 3, -len * (0.55 + k * 0.1), Math.sin(fallAngle) * out + (rng.next() - 0.5) * 3);
          const sz = 5 + rng.next() * 3;
          m.scale.set(sz, sz * 0.6, sz);
          m.renderOrder = 3;
          g.add(m);
          this._mist.push({ mesh: m, ph: rng.next() * 6, base: sz });
        }
      }
      this.group.add(g);
      this.islands.push({ data: isl, group: g, ph: rng.next() * Math.PI * 2, speed: 0.18 + rng.next() * 0.1 });
    }
  }

  update(dt) {
    if (!this._enabled() || !this.islands.length) return;
    this._t += dt;
    const t = this._t;
    for (const it of this.islands) {
      it.group.position.y = it.data.y + Math.sin(t * it.speed + it.ph) * 0.8;
      it.group.rotation.y = Math.sin(t * 0.04 + it.ph) * 0.04;
    }
    if (this._fallTex) this._fallTex.offset.y = (this._fallTex.offset.y + dt * 0.9) % 1;
    for (const m of this._mist) {
      const k = m.base * (1 + 0.12 * Math.sin(t * 0.6 + m.ph));
      m.mesh.scale.set(k, k * 0.6, k);
    }
  }
}

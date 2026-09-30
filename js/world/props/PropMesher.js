import * as THREE from 'three';
import { PartsBuilder } from '../../render/PartsBuilder.js';
import { SeededRandom } from '../../core/SeededRandom.js';

/**
 * PropMesher — geometría de los recursos del mundo en estilo low-poly.
 *
 * Plantillas (se crean una vez): árbol, pino, manzano, roca, arbusto y mata
 * de hierba, con varias variantes. Por chunk, todos los nodos se FUSIONAN en
 * una sola malla (una llamada de dibujo), transformando cada plantilla con la
 * posición/rotación/escala/tono del nodo. La hierba va en otra malla, sin
 * sombras y a doble cara.
 */
export class PropMesher {
  constructor({ colors }) {
    this._colors = colors;
    this._templates = this._buildTemplates(colors);
  }

  /** @returns {{ props: THREE.BufferGeometry|null, grass: THREE.BufferGeometry|null }} */
  build(chunk) {
    const nodes = chunk.nodes.filter((n) => !n.removed);
    const props = this._merge(
      nodes.map((n) => ({
        template: this._pick(n.type === 'APPLE_TREE' && n.depleted ? 'APPLE_TREE_EMPTY' : n.type, n.variant),
        x: n.x,
        y: n.y - (n.type === 'ROCK' ? 0.25 * n.scale : 0.12),
        z: n.z,
        scale: n.scale,
        rotation: n.rotation,
        tint: n.tint,
      })),
    );
    const grass = this._merge(
      chunk.grass.map((g) => ({ template: this._templates.GRASS[0], ...g, y: g.y - 0.05 })),
    );
    return { props, grass };
  }

  _pick(type, variant) {
    const list = this._templates[type];
    return list[variant % list.length];
  }

  _merge(items) {
    if (!items.length) return null;
    let total = 0;
    for (const it of items) total += it.template.positions.length;
    const positions = new Float32Array(total);
    const colors = new Float32Array(total);
    const jitter = this._colors.COLOR_JITTER;

    let o = 0;
    for (const it of items) {
      const { positions: tp, colors: tc } = it.template;
      const cos = Math.cos(it.rotation);
      const sin = Math.sin(it.rotation);
      const s = it.scale;
      const shade = 1 + (it.tint - 0.5) * jitter * 2;
      for (let i = 0; i < tp.length; i += 3) {
        const lx = tp[i] * s;
        const ly = tp[i + 1] * s;
        const lz = tp[i + 2] * s;
        positions[o + i] = it.x + lx * cos + lz * sin;
        positions[o + i + 1] = it.y + ly;
        positions[o + i + 2] = it.z - lx * sin + lz * cos;
        colors[o + i] = tc[i] * shade;
        colors[o + i + 1] = tc[i + 1] * shade;
        colors[o + i + 2] = tc[i + 2] * shade;
      }
      o += tp.length;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  // ---- Plantillas ------------------------------------------------------------

  _buildTemplates(C) {
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const trunk = new THREE.CylinderGeometry(0.7, 1, 1, 5);
    const cone = new THREE.ConeGeometry(1, 1, 6);
    const octa = new THREE.OctahedronGeometry(1, 0);
    const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

    // Deformación determinista de icosaedros (formas menos regulares).
    const lumpy = (seed, amount) => {
      const rng = new SeededRandom(seed);
      const offsets = Array.from({ length: 12 }, () => 1 + (rng.next() - 0.5) * amount);
      return (i, v) => {
        // El mismo vértice original comparte factor aunque esté repetido en varias caras.
        const k = offsets[Math.abs(Math.round(v.x * 7 + v.y * 13 + v.z * 17)) % 12];
        v.multiplyScalar(k);
      };
    };

    const tree = (variant) => {
      const b = new PartsBuilder();
      const h = 2.2 + variant * 0.3;
      b.add(trunk, { position: [0, h / 2, 0], scale: [0.22, h, 0.22], color: C.TRUNK });
      const leaves = variant === 1 ? C.LEAVES_ALT : C.LEAVES;
      b.add(ico, { position: [0, h + 1.0, 0], scale: [1.6, 1.35, 1.6], color: leaves, jitter: lumpy(10 + variant, 0.3) });
      b.add(ico, { position: [0.8, h + 0.5, 0.35], scale: 1.05, color: shade(leaves, 0.9), jitter: lumpy(20 + variant, 0.3) });
      b.add(ico, { position: [-0.55, h + 1.7, -0.4], scale: 0.95, color: shade(leaves, 1.08), jitter: lumpy(30 + variant, 0.3) });
      return b.build();
    };

    const pine = (variant) => {
      const b = new PartsBuilder();
      b.add(trunk, { position: [0, 0.7, 0], scale: [0.2, 1.4, 0.2], color: C.TRUNK });
      const tiers = 3 + (variant % 2);
      for (let t = 0; t < tiers; t++) {
        const r = 1.55 - t * (1.1 / tiers);
        b.add(cone, {
          position: [0, 1.6 + t * 1.05, 0],
          rotation: [0, t * 0.5, 0],
          scale: [r, 1.9 - t * 0.2, r],
          color: shade(C.PINE_LEAVES, 1 + t * 0.06),
        });
      }
      return b.build();
    };

    const appleTree = (variant, withApples = true) => {
      const b = new PartsBuilder();
      b.add(trunk, { position: [0, 0.9, 0], scale: [0.2, 1.8, 0.2], color: C.TRUNK });
      b.add(ico, { position: [0, 2.7, 0], scale: [1.5, 1.2, 1.5], color: C.APPLE_LEAVES, jitter: lumpy(40 + variant, 0.25) });
      b.add(ico, { position: [0.6, 2.3, -0.5], scale: 0.9, color: shade(C.APPLE_LEAVES, 0.92), jitter: lumpy(50 + variant, 0.25) });
      if (!withApples) return b.build();
      // Manzanas sobre la copa (fijas por variante).
      const rng = new SeededRandom(60 + variant);
      for (let i = 0; i < 8; i++) {
        const a = rng.next() * Math.PI * 2;
        const y = 2.1 + rng.next() * 1.1;
        const r = 1.35 - Math.abs(y - 2.7) * 0.5;
        b.add(octa, { position: [Math.cos(a) * r, y, Math.sin(a) * r], scale: 0.14, color: C.APPLE });
      }
      return b.build();
    };

    const rock = (variant) => {
      const b = new PartsBuilder();
      b.add(ico, { position: [0, 0.35, 0], scale: [0.9, 0.62, 0.8], color: C.ROCK, jitter: lumpy(70 + variant, 0.45) });
      if (variant === 2) {
        b.add(ico, { position: [0.7, 0.2, 0.3], scale: 0.4, color: shade(C.ROCK, 0.9), jitter: lumpy(80, 0.4) });
      }
      return b.build();
    };

    const bush = (variant) => {
      const b = new PartsBuilder();
      b.add(ico, { position: [0, 0.4, 0], scale: [0.7, 0.55, 0.7], color: C.BUSH, jitter: lumpy(90 + variant, 0.3) });
      b.add(ico, { position: [0.45, 0.3, 0.15], scale: 0.42, color: shade(C.BUSH, 1.1), jitter: lumpy(95 + variant, 0.3) });
      return b.build();
    };

    const grassTuft = () => {
      const b = new PartsBuilder();
      const blade = new THREE.BufferGeometry();
      blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0, 1, 0], 3));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add(blade, {
          position: [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12],
          rotation: [Math.cos(a) * 0.35, a, Math.sin(a) * 0.35],
          scale: [1, 0.35 + (i % 3) * 0.1, 1],
          color: i % 2 ? C.GRASS : C.GRASS_TIP,
        });
      }
      return b.build();
    };

    return {
      TREE: [tree(0), tree(1), tree(2)],
      PINE: [pine(0), pine(1)],
      APPLE_TREE: [appleTree(0), appleTree(1)],
      APPLE_TREE_EMPTY: [appleTree(0, false), appleTree(1, false)],
      ROCK: [rock(0), rock(1), rock(2)],
      BUSH: [bush(0), bush(1)],
      GRASS: [grassTuft()],
    };
  }
}

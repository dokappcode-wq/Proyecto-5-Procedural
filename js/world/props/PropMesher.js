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
        template: this._pick(n.depleted && this._templates[`${n.type}_EMPTY`] ? `${n.type}_EMPTY` : n.type, n.variant),
        x: n.x,
        y: n.y - (n.type === 'ROCK' || n.type === 'MINERAL_ROCK' ? 0.25 * n.scale : n.type === 'COBWEB' || n.cave || n.type === 'MUSHROOM' || n.type === 'BIRD_NEST' || n.type === 'CLAY_DEPOSIT' || n.type === 'WILD_FLOWERS' || n.type.startsWith('WILD_') ? 0 : 0.12),
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

  /** Geometría suelta de un nodo (en su origen, sin girar ni escalar): el árbol que cae al talarlo. */
  nodeGeometry(n) {
    return this._merge([{ template: this._pick(n.type, n.variant), x: 0, y: 0, z: 0, scale: 1, rotation: 0, tint: n.tint }]);
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

    // Telaraña: radios y anillos finos en el plano XY local (radio 1, centro en el origen).
    const cobweb = () => {
      const b = new PartsBuilder();
      const box = new THREE.BoxGeometry(1, 1, 1);
      const white = C.COBWEB ?? 0xe9eef2;
      const spokes = 8;
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        b.add(box, { position: [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0], rotation: [0, 0, a], scale: [1, 0.05, 0.03], color: white });
      }
      for (const r of [0.22, 0.42, 0.62, 0.82]) {
        for (let i = 0; i < spokes; i++) {
          const a = ((i + 0.5) / spokes) * Math.PI * 2;
          const len = 2 * r * Math.sin(Math.PI / spokes);
          b.add(box, { position: [Math.cos(a) * r, Math.sin(a) * r, 0], rotation: [0, 0, a + Math.PI / 2], scale: [len, 0.04, 0.025], color: white });
        }
      }
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

    // Veta de mineral: roca con cristales que brillan (se mina en lunas y meteoritos).
    const mineralRock = (variant) => {
      const b = new PartsBuilder();
      b.add(ico, { position: [0, 0.35, 0], scale: [0.85, 0.6, 0.8], color: shade(C.ROCK, 0.8), jitter: lumpy(120 + variant, 0.4) });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + variant;
        b.add(octa, {
          position: [Math.cos(a) * 0.4, 0.55 + (i % 2) * 0.15, Math.sin(a) * 0.35],
          rotation: [Math.cos(a) * 0.5, a, Math.sin(a) * 0.5],
          scale: [0.13, 0.4 + (i % 3) * 0.12, 0.13],
          color: i % 2 ? C.MINERAL : shade(C.MINERAL, 1.25),
        });
      }
      return b.build();
    };

    const stemBox = new THREE.BoxGeometry(1, 1, 1);
    // Arbusto (con E da fibra; recién arrancado queda más ralo y bajo).
    const bush = (variant, full = true) => {
      const b = new PartsBuilder();
      const k = full ? 1 : 0.62;
      b.add(ico, { position: [0, 0.4 * k, 0], scale: [0.7 * k, 0.55 * k, 0.7 * k], color: full ? C.BUSH : shade(C.BUSH, 0.8), jitter: lumpy(90 + variant, 0.3) });
      b.add(ico, { position: [0.45 * k, 0.3 * k, 0.15], scale: 0.42 * k, color: shade(C.BUSH, full ? 1.1 : 0.9), jitter: lumpy(95 + variant, 0.3) });
      if (!full) for (let i = 0; i < 4; i++) b.add(ico, { position: [Math.cos(i * 1.6) * 0.3, 0.06, Math.sin(i * 1.6) * 0.3], scale: [0.03, 0.12, 0.03], color: 0x6b5232 });
      return b.build();
    };

    // P5: arcilla (barro rojizo húmedo, a ras de suelo, con grietas).
    const clay = (variant) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(700 + variant);
      b.add(ico, { position: [0, 0.02, 0], scale: [0.95, 0.12, 0.8], color: 0xa86a4a, jitter: lumpy(710 + variant, 0.35) });
      for (let i = 0; i < 4; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = 0.2 + rng.next() * 0.35;
        b.add(ico, { position: [Math.cos(a) * r, 0.08, Math.sin(a) * r], scale: [0.2, 0.1, 0.17], color: i % 2 ? 0xb97a55 : 0x94593c, jitter: lumpy(720 + i, 0.3) });
      }
      for (let i = 0; i < 3; i++) b.add(stemBox, { position: [(rng.next() - 0.5) * 0.6, 0.1, (rng.next() - 0.5) * 0.5], rotation: [0, rng.next() * 3, 0], scale: [0.4, 0.008, 0.015], color: 0x5e3826 });
      return b.build();
    };
    // P5: flores silvestres (un corro de tallos con flores de colores).
    const FLOWER_COLORS = [[0xf2f2f2, 0xffd84a, 0xd84a9a], [0xa66cff, 0xffffff, 0xff6a4a], [0xffe25a, 0xff8ac0, 0x6aa8ff]];
    const wildFlowers = (variant, bloom = true) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(800 + variant);
      const cols = FLOWER_COLORS[variant % FLOWER_COLORS.length];
      for (let i = 0; i < 12; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.next() * 0.38;
        const h = 0.18 + rng.next() * 0.22;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        b.add(stemBox, { position: [x, h / 2, z], rotation: [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15], scale: [0.015, h, 0.015], color: 0x4f8a3a });
        if (bloom) {
          const c = cols[i % cols.length];
          b.add(octa, { position: [x, h + 0.02, z], rotation: [0, rng.next() * 3, 0], scale: [0.07, 0.03, 0.07], color: c });
          b.add(ico, { position: [x, h + 0.04, z], scale: 0.02, color: 0xffe066 });
        }
      }
      b.add(ico, { position: [0, 0.03, 0], scale: [0.4, 0.05, 0.4], color: shade(C.BUSH, 1.15), jitter: lumpy(820 + variant, 0.3) });
      return b.build();
    };
    // P4: hortalizas silvestres (mata de zanahoria con la raíz asomando, patatera con flores,
    // calabaza con su guía de hojas).
    const wildVeg = (kind, variant) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(1000 + variant + kind.length * 31);
      if (kind === 'CARROT' || kind === 'POTATO') {
        for (let p = 0; p < 3; p++) {
          const px = (rng.next() - 0.5) * 0.5;
          const pz = (rng.next() - 0.5) * 0.5;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + rng.next();
            b.add(kind === 'CARROT' ? cone : ico, {
              position: [px + Math.cos(a) * 0.05, 0.14, pz + Math.sin(a) * 0.05],
              rotation: [Math.cos(a) * 0.5, a, Math.sin(a) * 0.5],
              scale: kind === 'CARROT' ? [0.05, 0.28, 0.02] : [0.09, 0.07, 0.09],
              color: kind === 'CARROT' ? 0x5aa83a : 0x4f9a3a,
            });
          }
          if (kind === 'CARROT') b.add(cone, { position: [px, 0.02, pz], rotation: [Math.PI, 0, 0], scale: [0.05, 0.08, 0.05], color: 0xec7a24 });
          else b.add(ico, { position: [px, 0.24, pz], scale: 0.03, color: p % 2 ? 0xf2f2f2 : 0xc9a0e8 });
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + rng.next();
          b.add(ico, { position: [Math.cos(a) * 0.4, 0.06, Math.sin(a) * 0.4], scale: [0.22, 0.04, 0.22], color: 0x4f8f32 });
        }
        b.add(ico, { position: [0.1, 0.2, 0], scale: [0.3, 0.22, 0.3], color: 0xe8862a, jitter: lumpy(1100 + variant, 0.1) });
        b.add(stemBox, { position: [0.1, 0.43, 0], scale: [0.03, 0.08, 0.03], color: 0x5a6e2a });
      }
      return b.build();
    };
    // P5: drusa de cristal (cristales violetas que brillan; la luz la pone el juego).
    const crystalCluster = (variant) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(900 + variant);
      b.add(ico, { position: [0, 0.12, 0], scale: [0.6, 0.25, 0.55], color: C.CAVE_ROCK ?? shade(C.ROCK, 0.7), jitter: lumpy(910 + variant, 0.4) });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + rng.next() * 0.5;
        const r = i === 0 ? 0 : 0.12 + rng.next() * 0.22;
        const tilt = i === 0 ? 0 : 0.35 + rng.next() * 0.35;
        const h = i === 0 ? 0.9 : 0.35 + rng.next() * 0.45;
        b.add(octa, {
          position: [Math.cos(a) * r, 0.18 + h * 0.4, Math.sin(a) * r],
          rotation: [Math.sin(a) * tilt, a, -Math.cos(a) * tilt],
          scale: [0.08 + rng.next() * 0.04, h * 0.5, 0.08 + rng.next() * 0.04], // octaedro de radio 1: mide 2·escala
          color: i % 3 === 0 ? 0xd9c2ff : i % 3 === 1 ? 0xb48cff : 0x8f6ae8,
        });
      }
      return b.build();
    };

    // Vetas de las cuevas: roca oscura con trozos o cristales del mineral.
    const ore = (variant, color, kind) => {
      const b = new PartsBuilder();
      b.add(ico, { position: [0, 0.32, 0], scale: [0.8, 0.58, 0.75], color: C.CAVE_ROCK ?? shade(C.ROCK, 0.75), jitter: lumpy(160 + variant, 0.4) });
      const n = kind === 'crystal' ? 6 : 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + variant * 0.7;
        if (kind === 'crystal') {
          b.add(octa, {
            position: [Math.cos(a) * 0.35, 0.55 + (i % 2) * 0.12, Math.sin(a) * 0.3],
            rotation: [Math.cos(a) * 0.45, a, Math.sin(a) * 0.45],
            scale: [0.1, 0.32 + (i % 3) * 0.1, 0.1],
            color: i % 2 ? color : shade(color, 1.2),
          });
        } else {
          b.add(ico, {
            position: [Math.cos(a) * 0.42, 0.3 + (i % 3) * 0.14, Math.sin(a) * 0.38],
            scale: 0.13 + (i % 2) * 0.05,
            color: i % 2 ? color : shade(color, 0.85),
            jitter: lumpy(170 + i, 0.3),
          });
        }
      }
      return b.build();
    };

    // Flor luminosa de las cuevas: tallo, hojas y un bulbo que brilla (la luz la pone el juego).
    const glowFlower = (variant) => {
      const b = new PartsBuilder();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + variant;
        b.add(stemBox, { position: [Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08], rotation: [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], scale: [0.03, 0.5, 0.03], color: C.GLOW_STEM ?? 0x3f8f6a });
        b.add(octa, { position: [Math.cos(a) * 0.14, 0.52, Math.sin(a) * 0.14], scale: [0.12, 0.16, 0.12], color: i % 2 ? C.GLOW ?? 0x8dffd8 : shade(C.GLOW ?? 0x8dffd8, 1.15) });
      }
      b.add(octa, { position: [0, 0.12, 0], rotation: [0, 0.4, 0], scale: [0.28, 0.06, 0.28], color: C.GLOW_STEM ?? 0x3f8f6a });
      return b.build();
    };

    // Montón de arena de la playa (E: recoger arena).
    const sandPile = (variant) => {
      const b = new PartsBuilder();
      b.add(ico, { position: [0, 0.05, 0], scale: [0.85, 0.28, 0.75], color: C.SAND, jitter: lumpy(140 + variant, 0.35) });
      b.add(ico, { position: [0.35, 0.03, 0.2], scale: [0.4, 0.16, 0.35], color: shade(C.SAND, 0.92), jitter: lumpy(150 + variant, 0.3) });
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

    // Zarzal de bayas (con fruto o ya recogido).
    const berryBush = (variant, ripe = true) => {
      const b = new PartsBuilder();
      const leaf = shade(C.BUSH, 0.85);
      b.add(ico, { position: [0, 0.45, 0], scale: [0.75, 0.55, 0.75], color: leaf, jitter: lumpy(300 + variant, 0.35) });
      b.add(ico, { position: [0.42, 0.32, -0.2], scale: 0.45, color: shade(leaf, 1.1), jitter: lumpy(310 + variant, 0.3) });
      b.add(ico, { position: [-0.38, 0.3, 0.25], scale: 0.42, color: shade(leaf, 0.95), jitter: lumpy(320 + variant, 0.3) });
      if (ripe) {
        const rng = new SeededRandom(330 + variant);
        for (let i = 0; i < 16; i++) {
          const a = rng.next() * Math.PI * 2;
          const y = 0.25 + rng.next() * 0.55;
          const r = 0.55 + rng.next() * 0.3;
          b.add(ico, { position: [Math.cos(a) * r, y, Math.sin(a) * r], scale: 0.075, color: i % 3 ? (C.BERRY ?? 0xc0253a) : (C.BERRY_ALT ?? 0x5a2a7a) });
        }
      }
      return b.build();
    };
    // Setas: un corro de tres a cinco, sombrero rojo con motas o pardo.
    const mushrooms = (variant) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(400 + variant);
      const cap = variant === 1 ? 0xb5763a : 0xc8352c;
      const n = 3 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = i ? 0.12 + rng.next() * 0.22 : 0;
        const h = 0.12 + rng.next() * 0.16;
        const s = 0.07 + rng.next() * 0.08;
        b.add(trunk, { position: [Math.cos(a) * r, h / 2, Math.sin(a) * r], scale: [s * 0.45, h, s * 0.45], color: 0xeee6d2 });
        b.add(cone, { position: [Math.cos(a) * r, h + s * 0.25, Math.sin(a) * r], scale: [s * 1.5, s * 0.8, s * 1.5], color: cap });
        if (variant !== 1) b.add(ico, { position: [Math.cos(a) * r + s * 0.4, h + s * 0.45, Math.sin(a) * r], scale: s * 0.18, color: 0xffffff });
      }
      return b.build();
    };
    // Trigo silvestre: un manojo de tallos dorados con espigas.
    const stem = new THREE.BoxGeometry(1, 1, 1);
    const wheat = (variant) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(500 + variant);
      for (let i = 0; i < 14; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.next() * 0.35;
        const h = 0.7 + rng.next() * 0.45;
        const lean = [Math.cos(a) * 0.15, 0, Math.sin(a) * 0.15];
        b.add(stem, { position: [Math.cos(a) * r, h / 2, Math.sin(a) * r], rotation: lean, scale: [0.025, h, 0.025], color: 0xc7b36a });
        b.add(octa, { position: [Math.cos(a) * r + lean[0] * h * 0.5, h + 0.08, Math.sin(a) * r + lean[2] * h * 0.5], rotation: lean, scale: [0.04, 0.12, 0.04], color: i % 2 ? 0xe2c873 : 0xd4b25a });
      }
      return b.build();
    };
    // Nido en el suelo (al pie de los árboles), con o sin huevos.
    const nest = (variant, eggs = true) => {
      const b = new PartsBuilder();
      const rng = new SeededRandom(600 + variant);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        b.add(stem, { position: [Math.cos(a) * 0.22, 0.07 + (i % 2) * 0.03, Math.sin(a) * 0.22], rotation: [rng.next() * 0.4, -a, rng.next() * 0.3], scale: [0.03, 0.03, 0.2], color: i % 3 ? 0x8a6a42 : 0x6e5232 });
      }
      b.add(cone, { position: [0, 0.05, 0], rotation: [Math.PI, 0, 0], scale: [0.2, 0.08, 0.2], color: 0x6e5232 });
      if (eggs) for (let i = 0; i < 3; i++) b.add(ico, { position: [Math.cos(i * 2.1) * 0.07, 0.12, Math.sin(i * 2.1) * 0.07], scale: [0.055, 0.07, 0.055], color: i === 1 ? 0xd8e8f0 : 0xf1ead8 });
      return b.build();
    };

    return {
      BERRY_BUSH: [berryBush(0), berryBush(1)],
      BERRY_BUSH_EMPTY: [berryBush(0, false), berryBush(1, false)],
      MUSHROOM: [mushrooms(0), mushrooms(1), mushrooms(2)],
      WILD_WHEAT: [wheat(0), wheat(1)],
      BIRD_NEST: [nest(0), nest(1)],
      BIRD_NEST_EMPTY: [nest(0, false), nest(1, false)],
      COBWEB: [cobweb()],
      TREE: [tree(0), tree(1), tree(2)],
      PINE: [pine(0), pine(1)],
      APPLE_TREE: [appleTree(0), appleTree(1)],
      APPLE_TREE_EMPTY: [appleTree(0, false), appleTree(1, false)],
      ROCK: [rock(0), rock(1), rock(2)],
      MINERAL_ROCK: [mineralRock(0), mineralRock(1)],
      BUSH: [bush(0), bush(1)],
      BUSH_EMPTY: [bush(0, false), bush(1, false)],
      CLAY_DEPOSIT: [clay(0), clay(1)],
      WILD_CARROT: [wildVeg('CARROT', 0), wildVeg('CARROT', 1)],
      WILD_POTATO: [wildVeg('POTATO', 0), wildVeg('POTATO', 1)],
      WILD_PUMPKIN: [wildVeg('PUMPKIN', 0), wildVeg('PUMPKIN', 1)],
      WILD_FLOWERS: [wildFlowers(0), wildFlowers(1), wildFlowers(2)],
      WILD_FLOWERS_EMPTY: [wildFlowers(0, false), wildFlowers(1, false), wildFlowers(2, false)],
      GOLD_ORE: [ore(0, C.GOLD ?? 0xf2c230, 'chunks'), ore(1, C.GOLD ?? 0xf2c230, 'chunks')],
      CRYSTAL_CLUSTER: [crystalCluster(0), crystalCluster(1)],
      SAND_PILE: [sandPile(0), sandPile(1)],
      COAL_ORE: [ore(0, C.COAL ?? 0x26282b, 'chunks'), ore(1, C.COAL ?? 0x26282b, 'chunks')],
      COPPER_ORE: [ore(0, C.COPPER ?? 0xd0803e, 'chunks'), ore(1, C.COPPER ?? 0xd0803e, 'chunks')],
      IRON_ORE: [ore(0, C.IRON ?? 0xc9b8a4, 'chunks'), ore(1, C.IRON ?? 0xc9b8a4, 'chunks')],
      DIAMOND_ORE: [ore(0, C.DIAMOND ?? 0xbff6ff, 'crystal'), ore(1, C.DIAMOND ?? 0xbff6ff, 'crystal')],
      GLOW_FLOWER: [glowFlower(0), glowFlower(1)],
      GRASS: [grassTuft()],
    };
  }
}

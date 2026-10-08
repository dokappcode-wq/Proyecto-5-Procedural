import * as THREE from 'three';
import { hash2D } from '../core/SeededRandom.js';

/**
 * CaveMesher — geometría de las cuevas de CaveSystem: un tubo de roca por cueva,
 * visto desde dentro (material BackSide), con el suelo aplanado (el mismo que usa la
 * física: centro − 0,7·r) y las paredes irregulares.
 *
 * En la boca, la parte del tubo que quedaría por encima del terreno se aplasta
 * contra el suelo: queda un agujero (el terreno de ahí no se dibuja, TerrainMesher)
 * por el que se ve bajar el túnel. Unas rocas tapan el borde del agujero.
 */
const RING = 18;

/*
 * El mar es un plano a nivel del mar que cruza las cuevas que bajan de esa cota. Para
 * que no se vea dentro: las cuevas se dibujan las primeras (renderOrder −1) y marcan
 * el stencil con 1; el terreno, después, lo vuelve a 0 donde queda delante. Lo que hay
 * dentro de la cueva (menas, antorchas, el jugador) no lo toca, así que conserva el 1.
 * El mar (transparente, se dibuja al final) solo donde no hay un 1.
 */
const CAVE_STENCIL = 1;

/** El material escribe `ref` en el stencil donde queda delante (terreno 0, cuevas 1). */
export function markStencil(material, ref) {
  material.stencilWrite = true;
  material.stencilRef = ref;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
  return material;
}

/** El material (el mar) no se dibuja encima de una cueva. */
export function hideOverCaves(material) {
  material.stencilWrite = true; // activa la prueba de stencil
  material.stencilRef = CAVE_STENCIL;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
  return material;
}

export function buildCaveMeshes(caves, heightAt, colors = {}) {
  const group = new THREE.Group();
  group.name = 'Caves';
  const material = markStencil(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.BackSide }), CAVE_STENCIL);
  const rimMat = new THREE.MeshLambertMaterial({ color: colors.ROCK ?? 0x7d7a75, flatShading: true });
  const rimGeo = new THREE.IcosahedronGeometry(1, 0);
  for (const cave of caves) {
    const mesh = new THREE.Mesh(caveGeometry(cave, heightAt, colors), material);
    mesh.receiveShadow = true;
    mesh.renderOrder = -1; // antes que el terreno (stencil del mar, arriba)
    mesh.name = `cave_${cave.id}`;
    group.add(mesh);
    // Rocas alrededor de la boca.
    const n0 = cave.nodes[0];
    const n1 = cave.nodes[1];
    const h = Math.atan2(n1.z - n0.z, n1.x - n0.x);
    for (let k = 0; k < 9; k++) {
      const a = h + Math.PI * 0.35 + (k / 8) * Math.PI * 1.3; // por los lados y detrás, no delante de la rampa
      const rr = n0.r * (1.05 + 0.25 * hash2D(cave.id, k, 1));
      const x = n0.x + Math.cos(a) * rr;
      const z = n0.z + Math.sin(a) * rr;
      const rock = new THREE.Mesh(rimGeo, rimMat);
      const s = 0.5 + hash2D(cave.id, k, 2) * 0.6;
      rock.scale.set(s * 1.3, s * 0.7, s);
      rock.rotation.set(hash2D(cave.id, k, 3) * 3, hash2D(cave.id, k, 4) * 3, 0);
      rock.position.set(x, heightAt(x, z) + s * 0.15, z);
      rock.castShadow = rock.receiveShadow = true;
      group.add(rock);
    }
  }
  return group;
}

function caveGeometry(cave, heightAt, colors) {
  const nodes = cave.nodes;
  // Anillos en cada nodo y a mitad de cada tramo.
  const rings = [];
  for (let i = 0; i < nodes.length; i++) {
    rings.push({ ...nodes[i], i });
    if (i < nodes.length - 1) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const r = (a.r + b.r) / 2;
      const floor = (a.floor + b.floor) / 2;
      rings.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r, w: ((a.w ?? 1) + (b.w ?? 1)) / 2, floor, y: floor + 0.7 * r, i: i + 0.5 });
    }
  }
  const rock = new THREE.Color(colors.CAVE_ROCK ?? 0x6b665f);
  const floorCol = new THREE.Color(colors.CAVE_FLOOR ?? 0x4f473e);
  const tmp = new THREE.Color();
  const pos = [];
  const col = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3();
  const S = new THREE.Vector3();
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k];
    const prev = rings[Math.max(0, k - 1)];
    const next = rings[Math.min(rings.length - 1, k + 1)];
    // Secciones verticales (no inclinadas con la cuesta): así el suelo dibujado está
    // justo a la altura del suelo de la física (centro − 0,7·r) también en las rampas.
    T.set(next.x - prev.x, 0, next.z - prev.z).normalize();
    S.crossVectors(T, up).normalize();
    const mouth = ring.i <= 4;
    for (let j = 0; j < RING; j++) {
      const a = (j / RING) * Math.PI * 2;
      // Relieve: poco en la mitad de abajo (las paredes que se tocan al andar coinciden
      // con la colisión), más en el techo.
      const low = Math.sin(a) < 0;
      const jit = low ? 0.96 + 0.08 * hash2D(cave.id * 131 + 7, k, j) : 1 + 0.12 * hash2D(cave.id * 131 + 7, k, j);
      const rx = ring.r * (ring.w ?? 1) * jit; // w: salas más anchas que altas
      let v = Math.sin(a) * ring.r * jit * (low ? 1 : 0.85); // techo algo aplastado (roca encima)
      const isFloor = v < -0.7 * ring.r;
      if (isFloor) v = -0.7 * ring.r + (hash2D(cave.id, k * 3, j) - 0.5) * 0.06;
      const x = ring.x + S.x * Math.cos(a) * rx;
      const z = ring.z + S.z * Math.cos(a) * rx;
      let y = ring.y + v;
      if (mouth) {
        const g = heightAt(x, z);
        if (y > g - 0.05) y = g - 0.05; // lo que asoma se queda a ras del suelo: el agujero
      }
      pos.push(x, y, z);
      const shade = 0.82 + 0.3 * hash2D(cave.id * 17 + 3, k, j);
      tmp.copy(isFloor ? floorCol : rock).multiplyScalar(shade);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < RING; j++) {
      const a = k * RING + j;
      const b = k * RING + ((j + 1) % RING);
      const c = (k + 1) * RING + j;
      const d = (k + 1) * RING + ((j + 1) % RING);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Fondo cerrado.
  const last = rings[rings.length - 1];
  const center = pos.length / 3;
  pos.push(last.x, last.y, last.z);
  col.push(rock.r * 0.7, rock.g * 0.7, rock.b * 0.7);
  const base = (rings.length - 1) * RING;
  for (let j = 0; j < RING; j++) idx.push(base + j, center, base + ((j + 1) % RING));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

import * as THREE from 'three';
import { SURFACE } from './MapLegend.js';

/**
 * Piezas del mundo cuando el cuerpo tiene un mapa diseñado (MapData) en lugar de
 * relieve procedural. Tienen la misma interfaz que TerrainGenerator y WaterSystem,
 * así el resto del juego no nota la diferencia.
 */

/** Relieve: las alturas y los biomas salen del mapa. */
export class AuthoredTerrain {
  constructor(map) {
    this.map = map;
    this._s = { height: 0, mountain: 0, coast: 0, hills: 0, river: 0, beach: 0, fresh: false, biomes: {} };
  }

  setPads() {}

  setWater() {}

  heightAt(x, z) {
    return this.map.heightAt(x, z);
  }

  sample(x, z) {
    const M = this.map;
    const s = this._s;
    s.height = M.heightAt(x, z);
    const w = M.biomeWeightsAt(x, z, s.biomes);
    const fresh = M.waterAt(x, z);
    s.fresh = fresh !== null;
    s.mountain = w.FROZEN_MOUNTAINS;
    s.hills = w.MOUNTAINS;
    s.beach = w.BEACH;
    s.river = w.RIVER;
    s.coast = !s.fresh && s.height < -0.4 ? 1 : 0;
    return s;
  }
}

/**
 * Agua dulce del mapa: ríos (con su pendiente y sus cascadas), lagos, pozas y termas.
 * `ponds` son los lagos (para descubrirlos y para el Admin).
 */
export class AuthoredWater {
  constructor(map) {
    this.map = map;
    this.authored = true;
    this.ponds = (map.meta.lakes ?? []).filter((l) => !l.ice).map((l, i) => {
      let x = 0;
      let z = 0;
      for (const p of l.points) {
        x += p.x;
        z += p.z;
      }
      x /= l.points.length;
      z /= l.points.length;
      let r = 0;
      for (const p of l.points) r += Math.hypot(p.x - x, p.z - z);
      return { id: l.id ?? i, name: l.name, x, z, radius: r / l.points.length, level: l.level, hot: !!l.hot, depth: 1 };
    });
  }

  generate() {
    return this.ponds;
  }

  carve(x, z, h) {
    return h;
  }

  /** Agua dulce en (x, z) (con margen): { level, … } o null. */
  getPondAt(x, z, margin = 0) {
    const lv = this._levelNear(x, z, margin);
    return lv === null ? null : { id: 'fresh', x, z, radius: margin, level: lv };
  }

  /** Lago más cercano (distancia a la orilla, 0 dentro). */
  nearestPond(x, z) {
    let best = null;
    for (const p of this.ponds) {
      const d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.radius);
      if (!best || d < best.distance) best = { pond: p, distance: d };
    }
    // Un río cercano también cuenta como agua (para descubrirla).
    const lv = this._levelNear(x, z, 6);
    if (lv !== null && (!best || best.distance > 0)) return { pond: { id: `river:${Math.round(x / 200)},${Math.round(z / 200)}`, x, z, radius: 6, level: lv, river: true }, distance: 0 };
    return best;
  }

  isWater(x, z, margin = 0) {
    return this._levelNear(x, z, margin) !== null;
  }

  shoreFactor() {
    return 0;
  }

  _levelNear(x, z, margin) {
    const M = this.map;
    const at = (px, pz) => {
      const lv = M.waterAt(px, pz);
      return lv !== null && M.heightAt(px, pz) < lv ? lv : null;
    };
    let lv = at(x, z);
    if (lv !== null || margin <= 0) return lv;
    for (let a = 0; a < 8; a++) {
      lv = at(x + Math.cos((a / 8) * Math.PI * 2) * margin, z + Math.sin((a / 8) * Math.PI * 2) * margin);
      if (lv !== null) return lv;
    }
    return null;
  }
}

/**
 * Lámina de agua dulce de un chunk: una cuadrícula a la altura del agua donde la hay.
 * Las cascadas salen solas: el agua baja de golpe entre dos celdas (casi en vertical).
 * Vértices: posición, color (espuma en las cascadas y en la orilla) y la dirección
 * de la corriente (para animarla).
 */
export function buildWaterGeometry(map, x0, z0, size, cell) {
  const n = Math.round(size / cell);
  const N = n + 1;
  const levels = new Float32Array(N * N);
  const has = new Uint8Array(N * N);
  let any = false;
  for (let l = 0; l < N; l++) {
    for (let k = 0; k < N; k++) {
      const lv = map.waterAt(x0 + k * cell, z0 + l * cell);
      if (lv !== null && map.surfaceAt(x0 + k * cell, z0 + l * cell) !== SURFACE.ICE) {
        levels[l * N + k] = lv;
        has[l * N + k] = 1;
        any = true;
      }
    }
  }
  if (!any) return null;
  // Las esquinas sin agua de una celda con agua toman el nivel de sus vecinas (la orilla
  // queda bajo el terreno y no se ve el borde de la lámina).
  const lv = levels.slice();
  for (let l = 0; l < N; l++) {
    for (let k = 0; k < N; k++) {
      const i = l * N + k;
      if (has[i]) continue;
      let s = 0;
      let c = 0;
      for (let dl = -1; dl <= 1; dl++) {
        for (let dk = -1; dk <= 1; dk++) {
          const kk = k + dk;
          const ll = l + dl;
          if (kk < 0 || ll < 0 || kk >= N || ll >= N || !has[ll * N + kk]) continue;
          s += levels[ll * N + kk];
          c++;
        }
      }
      if (c) lv[i] = s / c;
    }
  }
  const pos = [];
  const col = [];
  const flow = [];
  const idx = [];
  const vmap = new Int32Array(N * N).fill(-1);
  const vert = (k, l) => {
    const i = l * N + k;
    if (vmap[i] >= 0) return vmap[i];
    const x = x0 + k * cell;
    const z = z0 + l * cell;
    const y = lv[i];
    // Corriente: hacia donde baja el agua.
    const gx = (lv[l * N + Math.min(N - 1, k + 1)] - lv[l * N + Math.max(0, k - 1)]);
    const gz = (lv[Math.min(N - 1, l + 1) * N + k] - lv[Math.max(0, l - 1) * N + k]);
    const steep = Math.min(1, Math.hypot(gx, gz) / 3);
    const depth = y - map.heightAt(x, z);
    const foam = Math.max(steep, 1 - Math.min(1, depth / 0.5));
    pos.push(x, y + 0.02, z);
    col.push(foam, steep, Math.min(1, Math.max(0, depth / 3)));
    const gl = Math.hypot(gx, gz) || 1;
    flow.push(-gx / gl * Math.min(1, gl * 4), -gz / gl * Math.min(1, gl * 4));
    vmap[i] = pos.length / 3 - 1;
    return vmap[i];
  };
  for (let l = 0; l < n; l++) {
    for (let k = 0; k < n; k++) {
      const a = l * N + k;
      if (!has[a] && !has[a + 1] && !has[a + N] && !has[a + N + 1]) continue;
      const va = vert(k, l);
      const vb = vert(k, l + 1);
      const vd = vert(k + 1, l);
      const vc = vert(k + 1, l + 1);
      idx.push(va, vb, vd, vb, vc, vd);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Material del agua dulce: azul con transparencia según la profundidad, ondas que
 * corren con la corriente y espuma blanca en las cascadas y las orillas.
 */
export function createFreshWaterMaterial(baseColor) {
  const mat = new THREE.MeshPhongMaterial({
    color: baseColor, specular: 0xcfe8ff, shininess: 90, transparent: true, opacity: 0.86, vertexColors: false, side: THREE.DoubleSide, depthWrite: false,
  });
  mat.userData.time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 color;\nattribute vec2 flow;\nvarying vec3 vW;\nvarying vec3 vWater;\nvarying vec2 vFlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = color;\nvFlow = flow;\nvW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
varying vec3 vW;
varying vec3 vWater;
varying vec2 vFlow;
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 p = vW.xz * 0.35 - vFlow * uTime * 1.6;
  float e = 0.08;
  float h0 = wn(p) + 0.5 * wn(p * 2.3 + uTime * 0.2);
  float hx = wn(p + vec2(e, 0.0)) + 0.5 * wn((p + vec2(e, 0.0)) * 2.3 + uTime * 0.2);
  float hz = wn(p + vec2(0.0, e)) + 0.5 * wn((p + vec2(0.0, e)) * 2.3 + uTime * 0.2);
  vec3 bump = vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * 0.12;
  normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float foamN = wn(vW.xz * 1.7 - vFlow * uTime * 3.0 + vec2(0.0, uTime * 2.0 * vWater.g));
  float foam = clamp(vWater.r * (0.55 + 0.6 * foamN), 0.0, 1.0);
  vec3 shallow = diffuseColor.rgb * 1.35 + vec3(0.05, 0.12, 0.1);
  diffuseColor.rgb = mix(shallow, diffuseColor.rgb, vWater.b);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), foam);
  diffuseColor.a = mix(0.55, opacity, vWater.b) + foam * 0.4;
}`);
  };
  return mat;
}

import * as THREE from 'three';
import { SURFACE } from './MapLegend.js';

/**
 * FarTerrain — toda la isla en baja resolución (16 m entre vértices), para ver a lo lejos
 * las montañas, los bosques y los lagos más allá de los chunks detallados. Cerca de la
 * cámara se hunde (ahí manda el terreno de verdad).
 */
const FAR_COLORS = {
  [SURFACE.SNOW]: 0xeef3f8, [SURFACE.ICE]: 0xc4e2f2, [SURFACE.SAND]: 0xdccb93, [SURFACE.WET_SAND]: 0xb9a676,
  [SURFACE.ROCK]: 0x8a857c, [SURFACE.SCREE]: 0x97917f, [SURFACE.CLIFF]: 0x77726a, [SURFACE.GRASS_DRY]: 0xb7a75e,
  [SURFACE.MARSH]: 0x6b874a, [SURFACE.MUD]: 0x6b5a44, [SURFACE.SEABED]: 0xbca978, [SURFACE.ALPINE]: 0x86955f,
  [SURFACE.PINE_FLOOR]: 0x5f6a3c, [SURFACE.FOREST_FLOOR]: 0x4d6a33, [SURFACE.PATH]: 0xab8c64, [SURFACE.PAVED]: 0xa29e94,
  [SURFACE.TRAVERTINE]: 0xe0d9c4, [SURFACE.HEATH]: 0x8a7a72,
};
const DEFAULT = 0x7aab4a;
const FOREST = new THREE.Color(0x2f5a2a);
const WATER = new THREE.Color(0x3a7fa8);

export function buildFarTerrain(map, { step = 8, nearRadius = 235 } = {}) {
  const n = Math.floor((map.n - 1) / step) + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -map.half + i * step * map.cell;
      const z = -map.half + j * step * map.cell;
      let h = map.heightAt(x, z);
      const k = (j * n + i) * 3;
      const lv = map.waterAt(x, z);
      if (lv !== null && lv > h && map.surfaceAt(x, z) !== SURFACE.ICE) {
        h = lv;
        c.copy(WATER);
      } else {
        c.set(FAR_COLORS[map.surfaceAt(x, z)] ?? DEFAULT);
        const f = map.floraInfo(x, z);
        if (f.type && f.density > 0.3 && (f.type <= 3 || f.type === 12)) c.lerp(FOREST, Math.min(0.75, f.density * 0.8));
      }
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx[t++] = a; idx[t++] = a + n; idx[t++] = a + 1;
      idx[t++] = a + n; idx[t++] = a + n + 1; idx[t++] = a + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const uR = { value: nearRadius };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNear = uR;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uNear;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float d = distance(wp.xz, cameraPosition.xz);
  transformed.y -= 60.0 * (1.0 - smoothstep(uNear, uNear + 30.0, d));
}`);
  };
  mat.customProgramCacheKey = () => 'farTerrain1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'FarTerrain';
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

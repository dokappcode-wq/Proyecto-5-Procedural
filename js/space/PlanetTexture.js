import { SimplexNoise } from '../world/noise/SimplexNoise.js';

/**
 * Texturas del planeta visto desde el espacio (Fase 13), en canvas equirectangulares.
 *
 * El área jugable del planeta es una isla pequeña de un planeta mucho mayor: el mapa
 * real (PlanetMapRenderer) se pega en el ecuador, en longitud 0, y alrededor el
 * resto del planeta se inventa con ruido de la seed (continentes, desiertos,
 * bosques, montañas y casquetes polares). Esas tierras no se pueden visitar.
 *
 * El ruido es 2D, así que cada punto de la esfera se muestrea en tres proyecciones
 * y se promedian: no hay costura en el meridiano 180°.
 */
const ISLAND_HALF_DEG = 14; // media anchura (en grados) de la isla del planeta en la textura

export function createPlanetTextures({ width, seed, mapCanvas, planet }) {
  const w = width;
  const h = width / 2;
  const noise = new SimplexNoise(seed);
  const n3 = (x, y, z, f) =>
    (noise.fbm(x * f + 17, y * f, { frequency: 1, octaves: 4 }) +
      noise.fbm(y * f - 41, z * f + 3, { frequency: 1, octaves: 4 }) +
      noise.fbm(z * f + 5, x * f - 29, { frequency: 1, octaves: 4 })) / 3;

  const surface = document.createElement('canvas');
  surface.width = w;
  surface.height = h;
  const ctx = surface.getContext('2d');
  const img = ctx.createImageData(w, h);
  // Sin mar (lunas, planetas secos), las zonas bajas son llanuras oscuras en vez de océano.
  const sea = rgb(planet.HAS_SEA === false ? planet.COLORS.SEABED : planet.COLORS.SEA);
  const deep = [sea[0] * 0.45, sea[1] * 0.55, sea[2] * 0.75];
  const B = planet.BIOMES;
  const plains = rgb(B.PLAINS.COLORS.GROUND);
  const forest = rgb(B.FOREST.COLORS.GROUND);
  const rock = rgb(B.FROZEN_MOUNTAINS.COLORS.GROUND);
  const snow = rgb(B.FROZEN_MOUNTAINS.COLORS.SNOW);
  const sand = rgb(planet.COLORS.SAND);
  const desert = [0.78, 0.66, 0.42];

  for (let j = 0; j < h; j++) {
    const lat = (0.5 - (j + 0.5) / h) * Math.PI; // +π/2 arriba
    const cl = Math.cos(lat);
    const y = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = ((i + 0.5) / w - 0.5) * Math.PI * 2; // 0 en el centro de la textura
      const x = cl * Math.cos(lon);
      const z = cl * Math.sin(lon);
      let c = n3(x, y, z, 1.4) + 0.02;
      // Mar abierto alrededor de la isla (se pega después).
      const dLon = Math.abs(lon) * (180 / Math.PI);
      const dLat = Math.abs(lat) * (180 / Math.PI);
      const island = Math.max(dLon, dLat) / (ISLAND_HALF_DEG * 1.8);
      if (island < 1) c -= (1 - island) * 0.5;
      const detail = n3(x, y, z, 6);
      const polar = Math.abs(lat) / (Math.PI / 2);
      let col;
      if (c < 0.02) {
        col = mix(sea, deep, Math.min(1, -c * 3));
      } else if (c < 0.05) {
        col = sand;
      } else {
        const dry = 1 - Math.abs(lat) / 0.6; // desiertos cerca del ecuador
        col = mix(plains, forest, smooth(0.0, 0.25, detail + 0.1));
        if (dry > 0 && detail < -0.05) col = mix(col, desert, Math.min(1, dry * 1.4));
        if (c > 0.28) col = mix(col, rock, smooth(0.28, 0.4, c));
        if (c > 0.38) col = mix(col, snow, smooth(0.38, 0.48, c));
      }
      // Casquetes polares.
      if (polar > 0.78 + detail * 0.08) col = mix(col, snow, smooth(0.78, 0.9, polar + detail * 0.08));
      const k = (j * w + i) * 4;
      img.data[k] = col[0] * 255;
      img.data[k + 1] = col[1] * 255;
      img.data[k + 2] = col[2] * 255;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Isla del planeta (el mapa real) en el ecuador, longitud 0.
  if (mapCanvas) {
    const pxPerDeg = w / 360;
    const size = ISLAND_HALF_DEG * 2 * pxPerDeg;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(mapCanvas, w / 2 - size / 2, h / 2 - size / 2, size, size);
    ctx.restore();
  }

  // Nubes (canal alfa).
  const cw = w / 2;
  const ch = h / 2;
  const clouds = document.createElement('canvas');
  clouds.width = cw;
  clouds.height = ch;
  const cctx = clouds.getContext('2d');
  const cimg = cctx.createImageData(cw, ch);
  for (let j = 0; j < ch; j++) {
    const lat = (0.5 - (j + 0.5) / ch) * Math.PI;
    const cl = Math.cos(lat);
    const y = Math.sin(lat);
    for (let i = 0; i < cw; i++) {
      const lon = ((i + 0.5) / cw - 0.5) * Math.PI * 2;
      const v = n3(cl * Math.cos(lon) + 9, y, cl * Math.sin(lon), 3.2);
      const a = smooth(0.02, 0.28, v);
      const k = (j * cw + i) * 4;
      cimg.data[k] = cimg.data[k + 1] = cimg.data[k + 2] = 255;
      cimg.data[k + 3] = a * 210;
    }
  }
  cctx.putImageData(cimg, 0, 0);

  return { surface, clouds, islandHalfDeg: ISLAND_HALF_DEG };
}

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

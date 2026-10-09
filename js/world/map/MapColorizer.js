import * as THREE from 'three';
import { SimplexNoise } from '../noise/SimplexNoise.js';
import { hash2D } from '../../core/SeededRandom.js';
import { clamp01, smoothstep } from '../../core/MathUtils.js';
import { SURFACE } from './MapLegend.js';

/**
 * Color del terreno de un mapa diseñado, por vértice, a partir del tipo de suelo:
 * cada suelo tiene dos tonos que se reparten en manchas, más motas finas; las paredes
 * empinadas son roca con estratos; las hondonadas, algo más oscuras.
 * Firma igual que BiomeColorizer: colorize(ctx, out) con ctx.surface.
 */
const PALETTE = {
  [SURFACE.GRASS]: [0x7aab4a, 0x92b955, 0x6a9a40],
  [SURFACE.GRASS_LUSH]: [0x5a9a3c, 0x6cad47, 0x4f8c36],
  [SURFACE.FLOWERS]: [0x84b350, 0x98bf5c, 0xc9c27a],
  [SURFACE.GRASS_DRY]: [0xbfae62, 0xa89c56, 0xd2c27a],
  [SURFACE.FOREST_FLOOR]: [0x4d6a33, 0x655535, 0x3f5a2c],
  [SURFACE.PINE_FLOOR]: [0x6f5c3b, 0x5a6239, 0x7d6842],
  [SURFACE.ALPINE]: [0x8c9b62, 0x7a895a, 0x9aa070],
  [SURFACE.DIRT]: [0x86684a, 0x957555, 0x76593e],
  [SURFACE.PATH]: [0xb39268, 0xa38360, 0xc2a57a],
  [SURFACE.SCORCHED]: [0x3b312a, 0x4b3c2f, 0x2d2622],
  [SURFACE.ROCK]: [0x8a857c, 0x77736b, 0x9a958a],
  [SURFACE.SCREE]: [0x9b958a, 0x878276, 0xaaa497],
  [SURFACE.CLIFF]: [0x7b756b, 0x6a655d, 0x8d877b],
  [SURFACE.SAND]: [0xe4d39c, 0xd8c58a, 0xece0b4],
  [SURFACE.WET_SAND]: [0xbba776, 0xae9a6a, 0xc6b484],
  [SURFACE.MUD]: [0x6b5a44, 0x5d4e3b, 0x7a684f],
  [SURFACE.GRAVEL]: [0x8f8676, 0x9e9584, 0x7f7768],
  [SURFACE.SNOW]: [0xf3f7fc, 0xe4ecf6, 0xffffff],
  [SURFACE.ICE]: [0xbfe0f2, 0xa8d2ea, 0xd6ecf8],
  [SURFACE.PAVED]: [0xaaa69c, 0x928e85, 0xb8b4a8],
  [SURFACE.MARSH]: [0x6e8a4a, 0x5b6f3e, 0x7d9655],
  [SURFACE.TRAVERTINE]: [0xe7e1cd, 0xd9cfb3, 0xf1ece0],
  [SURFACE.SEABED]: [0xc4b27c, 0xb3a272, 0xd1c08c],
  [SURFACE.HEATH]: [0x8d7a80, 0x7f8a55, 0x9a7f90],
  [SURFACE.MOSS]: [0x4f8b3b, 0x417c33, 0x5c9944],
};
const ROCK_LIKE = new Set([SURFACE.ROCK, SURFACE.SCREE, SURFACE.CLIFF, SURFACE.SNOW, SURFACE.ICE, SURFACE.PAVED, SURFACE.TRAVERTINE]);

export function createMapColorizer({ seed = 1 } = {}) {
  const pal = {};
  for (const [k, v] of Object.entries(PALETTE)) pal[k] = v.map((hex) => new THREE.Color(hex));
  const rockA = new THREE.Color(0x7d776d);
  const rockB = new THREE.Color(0x645f57);
  const rockC = new THREE.Color(0x938c80);
  const snow = pal[SURFACE.SNOW][0];
  const patches = new SimplexNoise(seed + 11);
  const fine = new SimplexNoise(seed + 23);
  const strata = new SimplexNoise(seed + 37);
  const tmp = new THREE.Color();

  return function colorize(ctx, out) {
    const { x, z, height, normalY, concavity } = ctx;
    const s = ctx.surface ?? SURFACE.GRASS;
    const p = pal[s] ?? pal[SURFACE.GRASS];
    const patch = smoothstep(-0.45, 0.45, patches.noise2D(x / 38, z / 38) * 0.7 + patches.noise2D(x / 11, z / 11) * 0.3);
    const speck = fine.noise2D(x * 0.37, z * 0.37);
    out.copy(p[0]).lerp(p[1], patch);
    if (speck > 0.35) out.lerp(p[2], (speck - 0.35) * 1.1);

    // Paredes empinadas: roca con estratos horizontales (salvo nieve y hielo en llano).
    const steep = smoothstep(0.8, 0.62, normalY);
    if (steep > 0 && s !== SURFACE.ICE) {
      const band = Math.sin(height * 1.7 + strata.noise2D(x / 25, z / 25) * 3) * 0.5 + 0.5;
      tmp.copy(rockA).lerp(rockB, band * 0.8).lerp(rockC, smoothstep(0.6, 1, strata.noise2D(x / 7, height / 3)) * 0.6);
      out.lerp(tmp, ROCK_LIKE.has(s) && s !== SURFACE.SNOW ? steep * 0.6 : steep);
    }
    // Nieve que se queda en los rellanos de la roca.
    if (s === SURFACE.CLIFF && normalY > 0.7 && height > 90) out.lerp(snow, 0.5);

    // Hondonadas más oscuras, crestas un poco más claras.
    const ao = 1 - clamp01(concavity * 0.9) * 0.32 + clamp01(-concavity * 0.9) * 0.06;
    const j = 1 + (hash2D(seed, Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.06;
    out.multiplyScalar(ao * j);
  };
}

import * as THREE from 'three';
import { SimplexNoise } from './noise/SimplexNoise.js';
import { hash2D, deriveSeed } from '../core/SeededRandom.js';
import { clamp01, smoothstep } from '../core/MathUtils.js';

/**
 * Colorea el terreno por vértice a partir de los pesos de bioma.
 *
 * Firma: colorize(ctx, outColor), con
 *   ctx = { x, z, height, normalY, concavity, shore, weights: { PLAINS, FOREST, FROZEN_MOUNTAINS, [BEACH, RIVER, MOUNTAINS] } }
 *
 * Capas:
 *   1. Color de cada bioma con manchas (ruido de baja frecuencia).
 *   2. Mezcla ponderada por los pesos de bioma → transiciones suaves.
 *   3. Montañas: roca → nieve según altura y pendiente, placas de hielo en zonas llanas.
 *   4. Roca en pendientes fuertes, arena en la orilla, fondo marino, barro en charcas.
 *   5. Oclusión aproximada: hondonadas más oscuras, crestas algo más claras.
 *   6. Pequeña variación determinista por vértice.
 */
export function createBiomeColorizer({ planet, seaLevel, seed }) {
  const C = planet.COLORS;
  const B = planet.BIOMES;
  const col = (hex) => new THREE.Color(hex);

  const plains = { a: col(B.PLAINS.COLORS.GROUND), b: col(B.PLAINS.COLORS.GROUND_ALT), accent: col(B.PLAINS.COLORS.ACCENT) };
  const forest = { a: col(B.FOREST.COLORS.GROUND), b: col(B.FOREST.COLORS.GROUND_ALT), accent: col(B.FOREST.COLORS.ACCENT) };
  const mount = {
    a: col(B.FROZEN_MOUNTAINS.COLORS.GROUND),
    b: col(B.FROZEN_MOUNTAINS.COLORS.GROUND_ALT),
    snow: col(B.FROZEN_MOUNTAINS.COLORS.SNOW),
    ice: col(B.FROZEN_MOUNTAINS.COLORS.ICE),
    snowStart: B.FROZEN_MOUNTAINS.SNOW_START_HEIGHT,
    snowMinNormalY: B.FROZEN_MOUNTAINS.SNOW_MIN_NORMAL_Y,
  };
  // Biomas opcionales (playa, río, montaña baja): suelo con manchas y acento, como la explanada.
  const extras = ['BEACH', 'RIVER', 'MOUNTAINS'].filter((id) => B[id]).map((id) => ({
    id, a: col(B[id].COLORS.GROUND), b: col(B[id].COLORS.GROUND_ALT), accent: col(B[id].COLORS.ACCENT), c: new THREE.Color(),
  }));
  const sand = col(C.SAND);
  const seabed = col(C.SEABED);
  const rock = col(C.LOWLAND_ROCK);
  const mud = col(planet.WATER.MUD_COLOR);

  const patches = new SimplexNoise(deriveSeed(seed, 'colorPatches'));
  const fine = new SimplexNoise(deriveSeed(seed, 'colorFine'));
  const cP = new THREE.Color();
  const cF = new THREE.Color();
  const cM = new THREE.Color();

  return function colorize(ctx, out) {
    const { x, z, height, normalY, concavity, shore, weights } = ctx;
    const f = C.PATCH_FREQUENCY;
    const patch = smoothstep(-0.35, 0.35, patches.noise2D(x * f, z * f));
    const speck = fine.noise2D(x * 0.21, z * 0.21);

    // 1-2. Color de cada bioma y mezcla por pesos.
    cP.copy(plains.a).lerp(plains.b, patch);
    if (speck > 0.55) cP.lerp(plains.accent, (speck - 0.55) * 1.6); // flores/hierba seca dispersa

    cF.copy(forest.a).lerp(forest.b, patch);
    if (speck > 0.5) cF.lerp(forest.accent, (speck - 0.5) * 0.9); // musgo y hojarasca

    // 3. Montaña: roca → nieve/hielo.
    cM.copy(mount.a).lerp(mount.b, patch);
    const snowLine = mount.snowStart + (patch - 0.5) * 12;
    const snowy = smoothstep(snowLine - 4, snowLine + 4, height) * smoothstep(mount.snowMinNormalY, mount.snowMinNormalY + 0.2, normalY);
    cM.lerp(mount.snow, snowy);
    if (snowy > 0.6 && normalY > 0.9 && speck > 0.15) cM.lerp(mount.ice, 0.75); // placas de hielo en rellanos

    const wP = weights.PLAINS;
    const wF = weights.FOREST;
    const wM = weights.FROZEN_MOUNTAINS;
    out.setRGB(
      cP.r * wP + cF.r * wF + cM.r * wM,
      cP.g * wP + cF.g * wF + cM.g * wM,
      cP.b * wP + cF.b * wF + cM.b * wM,
    );
    let wRock = wM;
    for (const e of extras) {
      const w = weights[e.id] ?? 0;
      if (w <= 0) continue;
      e.c.copy(e.a).lerp(e.b, e.id === 'MOUNTAINS' ? smoothstep(0.75, 0.95, normalY) * patch : patch);
      if (speck > 0.5) e.c.lerp(e.accent, (speck - 0.5) * 1.2);
      out.r += e.c.r * w;
      out.g += e.c.g * w;
      out.b += e.c.b * w;
      if (e.id === 'MOUNTAINS') wRock += w * 0.6; // la montaña baja ya es de roca y hierba
    }

    // 4. Roca en pendientes fuertes (fuera de la nieve), orilla y fondo marino.
    //    (en las montañas la roca propia ya está en su color de bioma).
    const steep = smoothstep(C.ROCK_SLOPE_NORMAL_Y, C.ROCK_SLOPE_NORMAL_Y - 0.15, normalY) * (1 - wRock);
    out.lerp(rock, steep);
    if (height < seaLevel - 0.3) out.copy(seabed);
    else out.lerp(sand, smoothstep(seaLevel + C.SAND_HEIGHT, seaLevel + C.SAND_HEIGHT * 0.4, height));
    if (shore > 0) out.lerp(mud, shore * 0.85);

    // 5. Oclusión aproximada por curvatura (concavity > 0 = hondonada).
    const shade = 1 - clamp01(concavity * C.AO_STRENGTH) * 0.45 + clamp01(-concavity * C.AO_STRENGTH) * 0.08;

    // 6. Variación por vértice.
    const j = 1 + (hash2D(seed, Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.07;
    out.multiplyScalar(shade * j);
  };
}

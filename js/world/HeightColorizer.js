import * as THREE from 'three';
import { hash2D } from '../core/SeededRandom.js';

/**
 * Coloreado provisional del terreno (FASE 2): solo por altura y pendiente.
 * En la FASE 3, BiomeSystem proporcionará un colorizer por bioma con la misma
 * firma: (x, z, height, normalY, outColor) → void.
 */
export function createHeightColorizer({ colors, seaLevel, seed }) {
  const sand = new THREE.Color(colors.SAND);
  const grass = new THREE.Color(colors.GRASS);
  const grassDark = new THREE.Color(colors.GRASS_DARK);
  const rock = new THREE.Color(colors.ROCK);
  const snow = new THREE.Color(colors.SNOW);
  const seabed = new THREE.Color(colors.SEABED);
  const tmp = new THREE.Color();

  return function colorize(x, z, height, normalY, out) {
    if (height < seaLevel - 0.5) {
      out.copy(seabed);
    } else if (height < seaLevel + colors.SAND_HEIGHT) {
      out.copy(sand);
    } else {
      // Hierba con variación suave según altura.
      const t = Math.min(1, Math.max(0, (height - seaLevel) / colors.ROCK_HEIGHT));
      out.copy(grass).lerp(grassDark, t);
      // Roca en pendientes fuertes y a gran altura.
      const steep = smoothstep01((colors.ROCK_SLOPE_NORMAL_Y - normalY) / 0.12);
      const high = smoothstep01((height - colors.ROCK_HEIGHT) / 12);
      out.lerp(rock, Math.max(steep, high));
      // Nieve en cotas altas y superficies poco inclinadas.
      const snowy = smoothstep01((height - colors.SNOW_HEIGHT) / 8) * smoothstep01((normalY - 0.6) / 0.15);
      out.lerp(snow, snowy);
    }
    // Variación por vértice determinista (rompe la uniformidad).
    const j = (hash2D(seed, Math.round(x), Math.round(z)) - 0.5) * 0.08;
    out.add(tmp.setRGB(j, j, j));
  };
}

function smoothstep01(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

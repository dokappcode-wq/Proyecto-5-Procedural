import * as THREE from 'three';

/**
 * Wind — viento en la vegetación (P7). Uniforms compartidos por los materiales de los
 * recursos (árboles, arbustos…) y la hierba de todos los mundos; WeatherSystem los mueve.
 * Cada vértice lleva `sway` (m por encima de la base de su planta; 0 en rocas y menas):
 * cuanto más alto, más se mece.
 */
export const WIND = {
  time: { value: 0 },
  strength: { value: 0.2 },                      // 0..1
  dir: { value: new THREE.Vector2(0.8, 0.6) },   // dirección horizontal (normalizada)
};

/** Hace que un material se meza con el viento (amp: cuánto, la hierba más que los árboles). */
export function applyWind(material, amp = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND.time;
    shader.uniforms.uWind = WIND.strength;
    shader.uniforms.uWindDir = WIND.dir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float sway;\nuniform float uWindTime;\nuniform float uWind;\nuniform vec2 uWindDir;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float swayK = pow(max(sway, 0.0), 1.35) * ${(0.03 * amp).toFixed(4)};
        float phase = position.x * 0.13 + position.z * 0.11;
        float gust = sin(uWindTime * 1.6 + phase) * 0.65 + sin(uWindTime * 3.9 + phase * 2.3) * 0.25 + 0.35;
        transformed.xz += uWindDir * gust * uWind * swayK;`);
  };
  material.customProgramCacheKey = () => `wind${amp}`;
  return material;
}

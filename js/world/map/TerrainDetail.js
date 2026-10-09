/**
 * Detalle fino del terreno de los mapas diseñados, en el shader (no cuesta geometría):
 *   - grano y manchas de color a varias escalas (la hierba, la tierra, la roca no son lisas);
 *   - relieve fino en la luz (la normal se perturba con ruido: terrones, piedrecitas);
 *   - en las paredes empinadas, estratos horizontales y grietas;
 *   - destellos suaves en la nieve.
 * Se añade a un MeshLambertMaterial existente (mantiene luces, sombras y niebla).
 */
export function enhanceTerrainMaterial(material) {
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(position, 1.0)).xyz;\nvTN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTW;
varying vec3 vTN;
float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }
float tf(vec2 p){ return tn(p) * 0.5 + tn(p * 2.03 + 17.1) * 0.3 + tn(p * 4.11 + 3.7) * 0.2; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float steep = 1.0 - smoothstep(0.62, 0.82, vTN.y);
  // Manchas grandes y grano fino.
  float big = tf(vTW.xz * 0.045);
  float grain = tf(vTW.xz * 1.7);
  float speck = tn(vTW.xz * 6.0);
  diffuseColor.rgb *= 0.9 + big * 0.18;
  diffuseColor.rgb *= 0.93 + grain * 0.14 - step(0.86, speck) * 0.08 * (1.0 - steep);
  // Estratos y grietas en la roca empinada.
  float strata = sin(vTW.y * 2.6 + tf(vTW.xz * 0.12) * 5.0) * 0.5 + 0.5;
  float crack = smoothstep(0.035, 0.0, abs(tn(vec2(vTW.x + vTW.z, vTW.y) * 0.9) - 0.5));
  diffuseColor.rgb *= mix(1.0, 0.82 + strata * 0.22 - crack * 0.25, steep);
  // Nieve: destellos.
  float bright = dot(diffuseColor.rgb, vec3(0.33));
  if (bright > 0.82) diffuseColor.rgb += step(0.985, th(floor(vTW.xz * 9.0))) * 0.25;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // Relieve fino: gradiente de un ruido en el mundo (más marcado en la roca).
  float steep = 1.0 - smoothstep(0.62, 0.82, vTN.y);
  vec2 p = vTW.xz * 1.1;
  float e = 0.15;
  float h0 = tf(p);
  float hx = tf(p + vec2(e, 0.0));
  float hz = tf(p + vec2(0.0, e));
  vec3 bumpW = vec3(-(hx - h0), 0.0, -(hz - h0)) / e * (0.18 + steep * 0.35);
  normal = normalize(normal + (viewMatrix * vec4(bumpW, 0.0)).xyz);
}`);
  };
  material.customProgramCacheKey = () => 'terrainDetail1';
  return material;
}

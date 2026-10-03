/**
 * LabLayout — planta del centro de investigación (sin Three.js): dónde están la puerta,
 * el teclado y la trampilla del búnker, y hacia dónde baja la mazmorra. La usan el
 * generador del mundo (para excavar la mazmorra) y ResearchCenter (para construirlo).
 */
export const LAB = { W: 26, D: 18, H: 3.4, CORR: 1.6, WALL: 0.3, HATCH: { x: 4.2, z: -4.2 } };

/** De coordenadas locales del edificio (+z = fachada) a coordenadas del mundo. */
export function toWorldLab(site, lx, lz) {
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c };
}

export function labLayout(site) {
  return {
    hatch: toWorldLab(site, LAB.HATCH.x, LAB.HATCH.z),
    // La mazmorra baja hacia el fondo de la sala del búnker (+x local): rumbo (cos h, sin h).
    heading: -site.yaw,
    door: toWorldLab(site, 0, LAB.D / 2 + 0.8),
    keypad: toWorldLab(site, 1.6, LAB.D / 2 + 0.35),
  };
}

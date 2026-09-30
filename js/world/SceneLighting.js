import * as THREE from 'three';

/**
 * SceneLighting — luz ambiente (hemisférica) + sol direccional con sombras.
 *
 * La sombra del sol se centra en un punto de interés (el jugador) para que un
 * shadow map pequeño dé buena calidad en un mundo grande.
 *
 * En la Fase 11, TimeSystem controlará la dirección/color/intensidad a través
 * de `setSun()` y `setAmbient()`; este módulo no calcula la hora.
 */
export class SceneLighting {
  constructor({ scene, renderConfig }) {
    this.name = 'lighting';
    this._sunOffset = new THREE.Vector3(0.45, 0.8, 0.35).normalize().multiplyScalar(80);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6b3a, 1.1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    this.sun.castShadow = renderConfig.SHADOWS;
    const half = renderConfig.SHADOW_AREA / 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 200 });
    this.sun.shadow.mapSize.set(renderConfig.SHADOW_MAP_SIZE, renderConfig.SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this._focus = new THREE.Vector3();
  }

  /** Vector (por referencia) que debe quedar dentro del área de sombras: normalmente el jugador. */
  follow(position) {
    this._focus = position;
  }

  /** @param {THREE.Vector3} direction dirección HACIA el sol (normalizada) */
  setSun({ direction, color, intensity } = {}) {
    if (direction) this._sunOffset.copy(direction).normalize().multiplyScalar(80);
    if (color !== undefined) this.sun.color.set(color);
    if (intensity !== undefined) this.sun.intensity = intensity;
  }

  setAmbient({ skyColor, groundColor, intensity } = {}) {
    if (skyColor !== undefined) this.hemi.color.set(skyColor);
    if (groundColor !== undefined) this.hemi.groundColor.set(groundColor);
    if (intensity !== undefined) this.hemi.intensity = intensity;
  }

  update() {
    // Ajuste a la rejilla de texels para evitar el "parpadeo" de sombras al moverse.
    const snap = 0.5;
    const fx = Math.round(this._focus.x / snap) * snap;
    const fz = Math.round(this._focus.z / snap) * snap;
    this.sun.target.position.set(fx, this._focus.y, fz);
    this.sun.position.set(fx, this._focus.y, fz).add(this._sunOffset);
  }
}

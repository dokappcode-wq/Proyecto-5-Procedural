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
  constructor({ scene, renderConfig, config }) {
    this.name = 'lighting';
    const d = config.SUN_DIRECTION;
    this.sunDirection = new THREE.Vector3(d.x, d.y, d.z).normalize();
    this._sunDistance = 120;

    this.hemi = new THREE.HemisphereLight(config.HEMI_SKY_COLOR, config.HEMI_GROUND_COLOR, config.HEMI_INTENSITY);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(config.SUN_COLOR, config.SUN_INTENSITY);
    this.sun.castShadow = renderConfig.SHADOWS;
    const half = renderConfig.SHADOW_AREA / 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 300 });
    this.sun.shadow.mapSize.set(renderConfig.SHADOW_MAP_SIZE, renderConfig.SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
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
    if (direction) this.sunDirection.copy(direction).normalize();
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
    this.sun.position.set(fx, this._focus.y, fz).addScaledVector(this.sunDirection, this._sunDistance);
  }
}

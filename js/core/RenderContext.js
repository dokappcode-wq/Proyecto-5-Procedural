import * as THREE from 'three';

/**
 * RenderContext — posee el renderer WebGL, la escena y la cámara.
 *
 * Solo gestiona recursos de render y el redimensionado. No sabe nada del
 * juego: la posición de la cámara la decide CameraSystem, la iluminación el
 * mundo (y, más adelante, TimeSystem / CelestialSystem).
 *
 * Preparado para varias escenas: la Fase 13 (espacio) podrá alternar
 * `activeScene` sin crear un segundo renderer.
 */
export class RenderContext {
  constructor({ config, container }) {
    this._cfg = config;

    this.renderer = new THREE.WebGLRenderer({ antialias: config.ANTIALIAS });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.MAX_PIXEL_RATIO));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = config.SHADOWS;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(config.SKY_COLOR);
    this.scene.fog = new THREE.Fog(config.SKY_COLOR, config.FOG_NEAR, config.FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(
      config.FOV,
      window.innerWidth / window.innerHeight,
      config.NEAR,
      config.FAR,
    );
    this.scene.add(this.camera);

    this.activeScene = this.scene;

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  get domElement() {
    return this.renderer.domElement;
  }

  render() {
    this.renderer.render(this.activeScene, this.camera);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

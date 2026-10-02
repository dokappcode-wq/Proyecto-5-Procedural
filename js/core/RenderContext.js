import * as THREE from 'three';

/**
 * RenderContext — posee el renderer WebGL, la escena y la cámara.
 *
 * Solo gestiona recursos de render y el redimensionado. No sabe nada del
 * juego: la posición de la cámara la decide CameraSystem, la iluminación
 * SceneLighting y el cielo SkyDome (con la hora de TimeSystem / AtmosphereSystem).
 *
 * Varias escenas con un solo renderer: el espacio (Fase 13) cambia
 * `activeScene` y `activeCamera` (setActive) y vuelve a la superficie igual.
 */
export class RenderContext {
  constructor({ config, skyConfig, container }) {
    this._cfg = config;

    this.renderer = new THREE.WebGLRenderer({ antialias: config.ANTIALIAS, stencil: true }); // stencil: el mar no se dibuja dentro de las cuevas (CaveMesher)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.MAX_PIXEL_RATIO));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping; // conserva tono y saturación
    this.renderer.toneMappingExposure = config.TONE_MAPPING_EXPOSURE;
    this.renderer.shadowMap.enabled = config.SHADOWS;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // suavizado vía light.shadow.radius
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Fondo de respaldo; el cielo real lo dibuja SkyDome. La niebla usa el color del horizonte.
    this.scene.background = new THREE.Color(skyConfig.HORIZON_COLOR);
    this.scene.fog = new THREE.Fog(skyConfig.HORIZON_COLOR, config.FOG_NEAR, config.FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(
      config.FOV,
      window.innerWidth / window.innerHeight,
      config.NEAR,
      config.FAR,
    );
    this.scene.add(this.camera);

    this.activeScene = this.scene;
    this.activeCamera = this.camera;
    this._cameras = [this.camera]; // todas se ajustan al redimensionar

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  get domElement() {
    return this.renderer.domElement;
  }

  /** Registra otra cámara (se ajusta al redimensionar la ventana). */
  addCamera(camera) {
    this._cameras.push(camera);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  /** Escena y cámara que se dibujan (null = la superficie). */
  setActive(scene = null, camera = null) {
    this.activeScene = scene ?? this.scene;
    this.activeCamera = camera ?? this.camera;
  }

  /**
   * Escena que se dibuja ENCIMA de la superficie (sin profundidad compartida): las
   * manos en 1ª persona. `visible()` decide en cada frame si se dibuja.
   */
  addOverlay(scene, camera, visible = () => true) {
    (this._overlays ??= []).push({ scene, camera, visible });
  }

  render() {
    this.renderer.render(this.activeScene, this.activeCamera);
    if (!this._overlays || this.activeScene !== this.scene) return;
    for (const o of this._overlays) {
      if (!o.visible()) continue;
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(o.scene, o.camera);
      this.renderer.autoClear = true;
    }
  }

  _onResize() {
    for (const cam of this._cameras) {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

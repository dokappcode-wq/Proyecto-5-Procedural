import * as THREE from 'three';

/**
 * SkyDome — cielo con degradado (cenit → horizonte → suelo) y disco solar.
 *
 * Es una esfera centrada siempre en la cámara, sin niebla ni escritura de
 * profundidad. El color del horizonte coincide con el de la niebla, de modo
 * que el terreno lejano se funde con el cielo.
 *
 * AtmosphereSystem (Fase 11) cambia colores, dirección y color del sol y la
 * cantidad de estrellas con `setColors()`, `setSunDirection()`, `setSunColor()`
 * y `setStars()`; CelestialSystem dibuja las lunas delante de este fondo.
 */
export class SkyDome {
  constructor({ scene, camera, config, radius }) {
    this.name = 'sky';
    this._camera = camera;

    this.uniforms = {
      zenithColor: { value: new THREE.Color(config.ZENITH_COLOR) },
      horizonColor: { value: new THREE.Color(config.HORIZON_COLOR) },
      groundColor: { value: new THREE.Color(config.GROUND_COLOR) },
      sunColor: { value: new THREE.Color(config.SUN_COLOR) },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      sunSize: { value: config.SUN_SIZE },
      sunGlow: { value: config.SUN_GLOW },
      stars: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww; // siempre en el plano lejano
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenithColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        uniform vec3 sunColor;
        uniform vec3 sunDirection;
        uniform float sunSize;
        uniform float sunGlow;
        uniform float stars;
        varying vec3 vDir;
        float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = h > 0.0
            ? mix(horizonColor, zenithColor, pow(h, 0.55))
            : mix(horizonColor, groundColor, pow(min(-h * 4.0, 1.0), 0.8));
          // Estrellas: una por celda de una rejilla 3D sobre la esfera (solo de noche).
          if (stars > 0.001 && h > 0.0) {
            vec3 p = dir * 160.0;
            vec3 cell = floor(p);
            float r = hash3(cell);
            if (r > 0.985) {
              vec3 offset = vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) - 0.5;
              float dist = length(fract(p) - 0.5 - offset * 0.5);
              float bright = (r - 0.985) / 0.015;
              col += vec3(0.85, 0.9, 1.0) * stars * smoothstep(0.22, 0.0, dist) * (0.35 + 0.65 * bright)
                * smoothstep(0.0, 0.12, h);
            }
          }
          float d = dot(dir, normalize(sunDirection));
          float aboveHorizon = smoothstep(-0.03, 0.02, h);
          col += sunColor * sunGlow * pow(max(d, 0.0), 24.0) * (0.3 + 0.7 * aboveHorizon); // halo
          col = mix(col, sunColor * 1.6, smoothstep(sunSize - 0.0004, sunSize, d) * aboveHorizon); // disco
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
    this.mesh.name = 'SkyDome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  setSunDirection(direction) {
    this.uniforms.sunDirection.value.copy(direction).normalize();
  }

  setSunColor(color) {
    this.uniforms.sunColor.value.set(color);
  }

  /** 0 = sin estrellas, 1 = cielo nocturno completo. */
  setStars(amount) {
    this.uniforms.stars.value = amount;
  }

  setColors({ zenith, horizon, ground } = {}) {
    if (zenith !== undefined) this.uniforms.zenithColor.value.set(zenith);
    if (horizon !== undefined) this.uniforms.horizonColor.value.set(horizon);
    if (ground !== undefined) this.uniforms.groundColor.value.set(ground);
  }

  update() {
    this.mesh.position.copy(this._camera.position);
  }
}

import * as THREE from 'three';

/**
 * SkyDome — cielo con degradado (cenit → horizonte → suelo) y disco solar.
 *
 * Es una esfera centrada siempre en la cámara, sin niebla ni escritura de
 * profundidad. El color del horizonte coincide con el de la niebla, de modo
 * que el terreno lejano se funde con el cielo.
 *
 * En la Fase 11, TimeSystem cambiará colores y dirección del sol con
 * `setColors()` / `setSunDirection()`; en la Fase 12, CelestialSystem
 * dibujará lunas delante de este fondo.
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
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = dir.y;
          vec3 col = h > 0.0
            ? mix(horizonColor, zenithColor, pow(h, 0.55))
            : mix(horizonColor, groundColor, pow(min(-h * 4.0, 1.0), 0.8));
          float d = dot(dir, normalize(sunDirection));
          col += sunColor * sunGlow * pow(max(d, 0.0), 24.0);            // halo
          col = mix(col, sunColor * 1.6, smoothstep(sunSize - 0.0004, sunSize, d)); // disco
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

  setColors({ zenith, horizon, ground } = {}) {
    if (zenith !== undefined) this.uniforms.zenithColor.value.set(zenith);
    if (horizon !== undefined) this.uniforms.horizonColor.value.set(horizon);
    if (ground !== undefined) this.uniforms.groundColor.value.set(ground);
  }

  update() {
    this.mesh.position.copy(this._camera.position);
  }
}

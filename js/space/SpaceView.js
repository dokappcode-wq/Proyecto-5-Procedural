import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom.js';
import { orbitPosition } from '../celestial/CelestialCatalog.js';
import { createMoonGeometry } from '../celestial/CelestialSystem.js';

/**
 * SpaceView — lo que se ve desde la nave en el espacio (en la escena normal).
 *
 * El sistema mide decenas de miles de km y la nave unos metros. Para no perder
 * precisión, cada cuerpo se dibuja a VIEW_DISTANCE metros de la cámara, en su
 * dirección real y con su TAMAÑO APARENTE real (radio × distancia de dibujo /
 * distancia real). Lo mismo con los asteroides de los cinturones (por seed).
 *
 * Además: polvo que pasa junto a la nave (sensación de velocidad). El sol, las
 * estrellas y la nebulosa los dibuja SkyDome.
 */
export const SPACE_SUN_DIR = new THREE.Vector3(1, 0.12, 0.08).normalize();

export class SpaceView {
  constructor({ scene, config, celestialConfig }) {
    this._cfg = config;
    this._cel = celestialConfig;
    this.group = new THREE.Group();
    this.group.name = 'SpaceView';
    this.group.visible = false;
    scene.add(this.group);
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();

    // Planeta (textura de MUNDO 0 iluminada por el sol del espacio).
    this._planetMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, sunDir: { value: SPACE_SUN_DIR } },
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec2 vUv;
        void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 sunDir; varying vec3 vN; varying vec2 vUv;
        void main() {
          float lit = smoothstep(-0.08, 0.25, dot(normalize(vN), sunDir));
          gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.03 + 1.1 * lit), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this._planetMat);
    this._cloudMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.8, depthWrite: false, fog: false });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), this._cloudMat);
    this.clouds.visible = false;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: SPACE_SUN_DIR } },
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vView;
          void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0);
            vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 sunDir; varying vec3 vN; varying vec3 vView;
          void main() { float rim = pow(1.0 - abs(dot(vN, vView)), 2.5);
            float day = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(-vN, sunDir));
            gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * rim * day * 1.6, rim * day); }`,
      }),
    );
    this.planetRoot = new THREE.Group();
    this.planetRoot.add(this.planet, this.clouds, halo);
    this.group.add(this.planetRoot);
    this.planetRoot.traverse((o) => (o.frustumCulled = false));

    this.moons = {};
    this._asteroids = null;
    this._belts = [];
    this._buildDust();
  }

  /** Lunas, asteroides y texturas de una seed. */
  build({ catalog, seed, textures }) {
    this._catalog = catalog;
    this._planetMat.uniforms.map.value = textures.surface;
    this._cloudMat.map = textures.clouds;
    this._cloudMat.needsUpdate = true;
    this.clouds.visible = true;
    if (this._builtFor === seed) return;
    this._builtFor = seed;
    for (const m of Object.values(this.moons)) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.moons = {};
    for (const body of catalog.bodies) {
      const mesh = new THREE.Mesh(createMoonGeometry(body, 4), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
      mesh.frustumCulled = false;
      this.moons[body.id] = mesh;
      this.group.add(mesh);
    }
    this._buildAsteroids(seed);
  }

  /**
   * Cinturones de asteroides procedurales: anillos (con la seed) entre las
   * órbitas de las lunas y por fuera. Posiciones en km respecto a MUNDO 0.
   */
  _buildAsteroids(seed) {
    const c = this._cfg;
    const rng = new SeededRandom(seed ^ 0xa57e);
    this._belts = [];
    const rocks = [];
    for (let b = 0; b < c.ASTEROID_BELTS; b++) {
      const radius = rng.range(22000, 60000);
      const tilt = rng.range(-0.25, 0.25);
      const node = rng.range(0, Math.PI * 2);
      this._belts.push({ radius, tilt, node });
      for (let i = 0; i < c.ASTEROIDS_PER_BELT; i++) {
        const a = rng.range(0, Math.PI * 2);
        const r = radius + rng.range(-1800, 1800);
        const y0 = rng.range(-300, 300);
        const x0 = Math.cos(a) * r;
        const z0 = Math.sin(a) * r;
        const y = z0 * Math.sin(tilt) + y0;
        const zi = z0 * Math.cos(tilt);
        rocks.push({
          x: x0 * Math.cos(node) - zi * Math.sin(node),
          y,
          z: x0 * Math.sin(node) + zi * Math.cos(node),
          radius: rng.range(1.5, 22) ** 1.1,
          rot: [rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)],
          spin: rng.range(-0.2, 0.2),
        });
      }
    }
    this.asteroidData = rocks;
    if (this._asteroids) {
      this.group.remove(this._asteroids);
      this._asteroids.geometry.dispose();
    }
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.getAttribute('position');
    const jr = new SeededRandom(seed ^ 0x1234);
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + jr.next() * 0.45;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.8, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    this._asteroids = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x8a847a, flatShading: true, fog: false }), rocks.length);
    this._asteroids.frustumCulled = false;
    this._asteroids.count = 0;
    this.group.add(this._asteroids);
  }

  _buildDust() {
    const n = this._cfg.DUST_COUNT;
    const pos = new Float32Array(n * 3);
    const rng = new SeededRandom(99);
    for (let i = 0; i < n * 3; i++) pos[i] = rng.range(-60, 60);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfd6ff, size: 0.18, transparent: true, opacity: 0.6, fog: false }));
    this._dust.frustumCulled = false;
    this.group.add(this._dust);
  }

  /** Posición (km) de cada cuerpo ahora. */
  bodyPositions(totalHours) {
    const out = [{ id: 'MUNDO_0', name: this._catalog.planet.name, radiusKm: this._catalog.planet.radiusKm, position: { x: 0, y: 0, z: 0 } }];
    for (const b of this._catalog.bodies) {
      out.push({ id: b.id, name: b.name, radiusKm: b.radiusKm, position: orbitPosition(b, totalHours, {}) });
    }
    return out;
  }

  /** Etiquetas en pantalla (px) de MUNDO 0 y las lunas: [{ id, name, x, y, visible }]. */
  screenLabels(camera, width, height) {
    if (!this._catalog || !this.group.visible) return [];
    const items = [{ id: 'MUNDO_0', name: this._catalog.planet.name, obj: this.planetRoot }];
    for (const b of this._catalog.bodies) items.push({ id: b.id, name: b.name, obj: this.moons[b.id] });
    return items.map(({ id, name, obj }) => {
      this._v.copy(obj.position);
      this._v.y += obj.scale.x * 1.1;
      this._v.project(camera);
      return {
        id,
        name,
        x: (this._v.x * 0.5 + 0.5) * width,
        y: (-this._v.y * 0.5 + 0.5) * height,
        visible: this._v.z < 1 && Math.abs(this._v.x) < 1.05 && Math.abs(this._v.y) < 1.05,
      };
    });
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /**
   * @param {object} nav   SpaceNavigation (posición en km, velocidad)
   * @param {THREE.Vector3} camPos posición de la cámara (m)
   */
  update(dt, nav, camPos, totalHours, noonHour) {
    if (!this._catalog) return;
    const D = this._cfg.VIEW_DISTANCE;
    const place = (obj, px, py, pz, radiusKm) => {
      this._v.set(px - nav.pos.x, py - nav.pos.y, pz - nav.pos.z);
      const d = this._v.length();
      this._v.divideScalar(d);
      obj.position.copy(camPos).addScaledVector(this._v, D);
      obj.scale.setScalar((radiusKm * D) / d);
    };
    const R = this._catalog.planet.radiusKm;
    place(this.planetRoot, 0, 0, 0, R);
    this.planet.rotation.y = (Math.PI * 2 * (totalHours - noonHour)) / 24;
    this.clouds.rotation.y += dt * 0.004;
    for (const b of this._catalog.bodies) {
      const p = orbitPosition(b, totalHours, {});
      place(this.moons[b.id], p.x, p.y, p.z, b.radiusKm);
      this.moons[b.id].rotation.y = -Math.PI * 2 * b.speed * totalHours;
    }

    // Asteroides a menos de 12 000 km (dibujados con su tamaño aparente).
    let n = 0;
    const t = totalHours * 3600;
    for (const a of this.asteroidData ?? []) {
      const dx = a.x - nav.pos.x;
      const dy = a.y - nav.pos.y;
      const dz = a.z - nav.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 12000 || d < 1) continue;
      this._v.set(dx / d, dy / d, dz / d);
      const s = (a.radius * D) / d;
      if (s < 0.02) continue;
      this._q.setFromEuler(this._e.set(a.rot[0] + a.spin * t * 0.001, a.rot[1], a.rot[2]));
      this._m.compose(this._v.multiplyScalar(D * 0.98).add(camPos), this._q, this._s.setScalar(s));
      this._asteroids.setMatrixAt(n++, this._m);
    }
    this._asteroids.count = n;
    this._asteroids.instanceMatrix.needsUpdate = true;

    // Polvo: pasa en sentido contrario a la marcha y se recoloca alrededor de la cámara.
    const f = nav.forward;
    const v = Math.min(80, Math.abs(nav.speed) * 0.35) * Math.sign(nav.speed);
    const arr = this._dust.geometry.getAttribute('position');
    for (let i = 0; i < arr.count; i++) {
      let x = arr.getX(i) - f.x * v * dt;
      let y = arr.getY(i) - f.y * v * dt;
      let z = arr.getZ(i) - f.z * v * dt;
      x = wrap(x);
      y = wrap(y);
      z = wrap(z);
      arr.setXYZ(i, x, y, z);
    }
    arr.needsUpdate = true;
    this._dust.position.copy(camPos);
    this._dust.material.opacity = Math.min(0.7, Math.abs(nav.speed) / 40);
  }
}

function wrap(v) {
  return v > 60 ? v - 120 : v < -60 ? v + 120 : v;
}

import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom.js';
import { bodyPositions } from '../celestial/SystemLayout.js';
import { createMoonGeometry } from '../celestial/CelestialSystem.js';

/**
 * SpaceView — lo que se ve desde la nave en el espacio (en la escena normal).
 *
 * El sistema mide cientos de miles de km y la nave unos metros. Para no perder
 * precisión, cada cuerpo (estrella, planetas, lunas, asteroides) se dibuja cerca
 * de la cámara, en su dirección real y con su TAMAÑO APARENTE real: a una distancia
 * de dibujo que crece con la distancia real (`drawDistance`, siempre ≤ VIEW_DISTANCE),
 * así lo que está más cerca tapa a lo que está más lejos.
 *
 * Cada planeta usa su textura (el de inicio, con el mapa real de su región) y la
 * luz de la estrella desde su posición. Además: polvo que pasa junto a la nave.
 * Las estrellas del fondo y la nebulosa las dibuja SkyDome.
 */
export const SPACE_SUN_DIR = new THREE.Vector3(1, 0.12, 0.08).normalize();

const PLANET_VERTEX = /* glsl */ `
  varying vec3 vN; varying vec2 vUv;
  void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLANET_FRAGMENT = /* glsl */ `
  uniform sampler2D map; uniform vec3 sunDir; varying vec3 vN; varying vec2 vUv;
  void main() {
    float lit = smoothstep(-0.08, 0.25, dot(normalize(vN), sunDir));
    gl_FragColor = vec4(texture2D(map, vUv).rgb * (0.03 + 1.1 * lit), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class SpaceView {
  constructor({ scene, config }) {
    this._cfg = config;
    this.group = new THREE.Group();
    this.group.name = 'SpaceView';
    this.group.visible = false;
    scene.add(this.group);
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();

    this.planets = {};   // id → { root, planet, clouds, material, cloudMaterial, sunDir }
    this.moons = {};
    this.star = this._buildStar();
    this._layout = null;
    this._asteroids = null;
    this._belts = [];
    this._buildDust();
  }

  /** El planeta de inicio (compatibilidad). */
  get planetRoot() {
    return this._layout ? this.planets[this._layout.planets.find((p) => p.home).id]?.root : null;
  }

  /**
   * Cuerpos, asteroides y texturas de una seed.
   * @param {object} p.layout   SystemLayout (estrella, planetas y lunas)
   * @param {Function} p.textures (planetId) → { surface, clouds, atmosphere }
   */
  build({ layout, seed, textures }) {
    this._layout = layout;
    for (const p of layout.planets) {
      const t = textures(p.id);
      if (!this.planets[p.id]) this.planets[p.id] = this._makePlanet(p.id);
      const v = this.planets[p.id];
      v.material.uniforms.map.value = t.surface;
      v.cloudMaterial.map = t.clouds;
      v.cloudMaterial.needsUpdate = true;
      v.clouds.visible = !!t.clouds;
      v.halo.visible = !!t.atmosphere;
    }
    this.star.core.material.color.setHex(layout.star.color);
    this.star.glow.material.color.setHex(layout.star.color);
    if (this._builtFor === seed) return;
    this._builtFor = seed;
    for (const m of Object.values(this.moons)) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.moons = {};
    for (const p of layout.planets) {
      for (const body of p.catalog.bodies) {
        const mesh = new THREE.Mesh(createMoonGeometry(body, 4), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }));
        mesh.frustumCulled = false;
        this.moons[body.id] = mesh;
        this.group.add(mesh);
      }
    }
    this._buildAsteroids(seed);
  }

  _makePlanet(id) {
    const sunDir = new THREE.Vector3().copy(SPACE_SUN_DIR);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, sunDir: { value: sunDir } },
      fog: false,
      vertexShader: PLANET_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
    const cloudMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.8, depthWrite: false, fog: false });
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), cloudMaterial);
    clouds.visible = false;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: sunDir } },
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
    const root = new THREE.Group();
    root.name = `Planet_${id}`;
    root.add(planet, clouds, halo);
    root.traverse((o) => (o.frustumCulled = false));
    this.group.add(root);
    return { root, planet, clouds, halo, material, cloudMaterial, sunDir };
  }

  _buildStar() {
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.setScalar(5);
    const root = new THREE.Group();
    root.name = 'Star';
    root.add(core, glow);
    root.traverse((o) => (o.frustumCulled = false));
    this.group.add(root);
    return { root, core, glow };
  }

  /**
   * Cinturones de asteroides procedurales: anillos (con la seed) entre las
   * órbitas de las lunas y por fuera. Posiciones en km respecto al planeta.
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

  /** Posición (km) de cada cuerpo ahora (la estrella primero). */
  bodyPositions(totalHours) {
    return this._layout ? bodyPositions(this._layout, totalHours) : [];
  }

  /** Dirección (unitaria) hacia la estrella desde un punto (km). */
  sunDirectionFrom(pos, target = new THREE.Vector3()) {
    const S = this._layout?.star.position;
    if (!S) return target.copy(SPACE_SUN_DIR);
    return target.set(S.x - pos.x, S.y - pos.y, S.z - pos.z).normalize();
  }

  /** Etiquetas en pantalla (px) de la estrella, los planetas y las lunas: [{ id, name, x, y, visible }]. */
  screenLabels(camera, width, height) {
    if (!this._layout || !this.group.visible) return [];
    const items = [{ id: 'STAR', name: this._layout.star.name, obj: this.star.root }];
    for (const p of this._layout.planets) {
      items.push({ id: p.id, name: p.name, obj: this.planets[p.id].root });
      for (const b of p.catalog.bodies) items.push({ id: b.id, name: b.name, obj: this.moons[b.id] });
    }
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
   * Distancia de dibujo (m) para un cuerpo a `km` de la nave: crece con la
   * distancia real (lo cercano tapa lo lejano) y nunca pasa de VIEW_DISTANCE.
   */
  drawDistance(km) {
    const D = this._cfg.VIEW_DISTANCE;
    return D * Math.min(1, Math.max(0.3, 0.3 + 0.1 * Math.log10(Math.max(1, km / 100))));
  }

  /**
   * @param {object} nav   SpaceNavigation (posición en km, velocidad)
   * @param {THREE.Vector3} camPos posición de la cámara (m)
   */
  update(dt, nav, camPos, totalHours, noonHour) {
    if (!this._layout) return;
    const place = (obj, p, radiusKm) => {
      this._v.set(p.x - nav.pos.x, p.y - nav.pos.y, p.z - nav.pos.z);
      const d = this._v.length();
      const D = this.drawDistance(d);
      this._v.divideScalar(d);
      obj.position.copy(camPos).addScaledVector(this._v, D);
      obj.scale.setScalar((radiusKm * D) / d);
    };
    const bodies = bodyPositions(this._layout, totalHours);
    const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));
    const S = this._layout.star.position;
    place(this.star.root, S, this._layout.star.radiusKm);
    const spin = (Math.PI * 2 * (totalHours - noonHour)) / 24;
    for (const p of this._layout.planets) {
      const v = this.planets[p.id];
      const b = byId[p.id];
      place(v.root, b.position, p.radiusKm);
      // Luz desde la estrella; la región del planeta mira a la estrella a mediodía.
      v.sunDir.set(S.x - b.position.x, S.y - b.position.y, S.z - b.position.z).normalize();
      v.planet.rotation.y = spin + (p.home ? 0 : Math.atan2(-v.sunDir.z, v.sunDir.x));
      v.clouds.rotation.y += dt * 0.004;
      for (const m of p.catalog.bodies) {
        place(this.moons[m.id], byId[m.id].position, m.radiusKm);
        this.moons[m.id].rotation.y = -Math.PI * 2 * m.speed * totalHours;
      }
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
      const D = this.drawDistance(d);
      this._v.set(dx / d, dy / d, dz / d);
      const s = (a.radius * D) / d;
      if (s < 0.02) continue;
      this._q.setFromEuler(this._e.set(a.rot[0] + a.spin * t * 0.001, a.rot[1], a.rot[2]));
      this._m.compose(this._v.multiplyScalar(D).add(camPos), this._q, this._s.setScalar(s));
      this._asteroids.setMatrixAt(n++, this._m);
    }
    this._asteroids.count = n;
    this._asteroids.instanceMatrix.needsUpdate = true;

    // Polvo: pasa en sentido contrario a la marcha y se recoloca alrededor de la cámara.
    const f = nav.forward;
    const v = Math.min(80, Math.abs(nav.speed) * 0.35) * Math.sign(nav.speed);
    const arr = this._dust.geometry.getAttribute('position');
    for (let i = 0; i < arr.count; i++) {
      arr.setXYZ(i, wrap(arr.getX(i) - f.x * v * dt), wrap(arr.getY(i) - f.y * v * dt), wrap(arr.getZ(i) - f.z * v * dt));
    }
    arr.needsUpdate = true;
    this._dust.position.copy(camPos);
    this._dust.material.opacity = Math.min(0.7, Math.abs(nav.speed) / 40);
  }
}

function wrap(v) {
  return v > 60 ? v - 120 : v < -60 ? v + 120 : v;
}

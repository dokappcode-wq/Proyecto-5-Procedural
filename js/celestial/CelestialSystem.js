import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { smoothstep } from '../core/MathUtils.js';
import { createCelestialCatalog, skyAngle, illumination } from './CelestialCatalog.js';

/**
 * CelestialSystem — el sol y las lunas vistos desde la superficie (Fase 12).
 *
 * - El catálogo (tamaño, distancia, velocidad, fase inicial, inclinación, cráteres)
 *   se crea a partir de la sub-seed "celestial" al generar el mundo.
 * - TimeSystem da la hora: cada luna sale y se pone con la rotación del planeta y
 *   avanza en su órbita (sale un poco más tarde cada día).
 * - Cada luna es una esfera low-poly con cráteres iluminada por la dirección del
 *   sol: sus fases (nueva, creciente, llena…) salen solas de la geometría.
 * - `getNightLight()` le dice a AtmosphereSystem de dónde viene la luz de luna.
 *
 * El sol lo dibuja SkyDome (disco + halo); aquí solo se usa su dirección.
 * Añadir cuerpos = añadir entradas al catálogo.
 *
 * Observador (`setObserver`): desde el planeta se ven las lunas; desde una luna se
 * ve el planeta enorme y quieto en el cielo (siempre la misma cara, con sus fases);
 * en el espacio no se dibuja nada aquí (lo hace SpaceView).
 */
// Dirección fija del planeta en el cielo de cada luna (acoplamiento de marea), por orden de luna.
const PLANET_IN_SKY = [
  new THREE.Vector3(0.35, 0.72, -0.6).normalize(),
  new THREE.Vector3(-0.45, 0.6, -0.66).normalize(),
  new THREE.Vector3(0.6, 0.55, 0.58).normalize(),
  new THREE.Vector3(-0.5, 0.65, 0.57).normalize(),
];
export class CelestialSystem {
  constructor({ config, system, time, scene, camera, events }) {
    this.name = 'celestial';
    this._cfg = config;
    this._system = system;
    this._time = time;
    this._camera = camera;
    this._events = events;
    this.catalog = null;
    this.moons = [];      // { body, mesh, material, dir, height, lit, visible }
    this._sun = new THREE.Vector3();
    this._group = new THREE.Group();
    this._group.name = 'Moons';
    scene.add(this._group);
    this._started = false;
    this.observer = system.homeId;
    this._planetMesh = null;

    events.on(GameEvents.GAME_STARTED, () => (this._started = true));
  }

  /**
   * Desde qué cuerpo se mira el cielo. `planetTexture`: textura del planeta (para
   * verlo desde las lunas).
   */
  setObserver(id, planetTexture = null) {
    this.observer = id;
    if (this._planetDirFrom(id) && planetTexture) {
      if (!this._planetMesh) this._createPlanetMesh();
      this._planetMesh.material.uniforms.map.value = planetTexture;
    }
    this.update(0);
  }

  _createPlanetMesh() {
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec2 vUv;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 sunDir;
        varying vec3 vNormalW;
        varying vec2 vUv;
        void main() {
          float lit = smoothstep(-0.08, 0.25, dot(normalize(vNormalW), normalize(sunDir)));
          vec3 col = texture2D(map, vUv).rgb * (0.03 + 1.1 * lit);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this._planetMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
    this._planetMesh.name = 'PlanetInSky';
    this._planetMesh.frustumCulled = false;
    this._planetMesh.renderOrder = 1;
    this._group.add(this._planetMesh);
  }

  /** Crea las lunas de una seed (lo llama main al generar el mundo). */
  setSeed(celestialSeed) {
    for (const m of this.moons) {
      this._group.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.material.dispose();
    }
    this.catalog = createCelestialCatalog(this._cfg, celestialSeed, this._system);
    this._maxSkySize = Math.max(1, ...this.catalog.bodies.map((b) => b.skySizeDeg));
    this.moons = this.catalog.bodies.map((body) => this._createMoon(body));
    this.update(0);
    for (const m of this.moons) m.wasUp = m.height > 0; // sin aviso al empezar
  }

  _createMoon(body) {
    const geometry = createMoonGeometry(body, 3);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        night: { value: 0 },
        dayOpacity: { value: this._cfg.DAY_OPACITY },
      },
      vertexColors: true,
      transparent: true,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vNormalW;
        varying vec3 vColor;
        void main() {
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        uniform float night;
        uniform float dayOpacity;
        varying vec3 vNormalW;
        varying vec3 vColor;
        void main() {
          float lit = smoothstep(-0.05, 0.25, dot(normalize(vNormalW), normalize(sunDir)));
          vec3 col = vColor * (0.05 + 1.15 * lit);
          // De día la parte oscura deja ver el cielo; de noche tapa las estrellas.
          float alpha = lit * mix(dayOpacity, 1.0, night) + (1.0 - lit) * night * 0.92;
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = body.id;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    const sizeDeg = body.skySizeDeg ?? 3;
    mesh.scale.setScalar(this._cfg.SKY_DISTANCE * Math.tan(((sizeDeg * Math.PI) / 180) / 2));
    // Cada luna gira sobre sí misma distinto (se ven caras diferentes).
    mesh.rotation.set(body.inclination * 2, body.node, 0);
    this._group.add(mesh);
    return { body, mesh, material, dir: new THREE.Vector3(), height: 0, lit: 0, wasUp: false };
  }

  update() {
    if (!this.catalog) return;
    const t = this._time;
    const sun = t.getSunDirection(this._sun);
    const onPlanet = this.observer === this._system.homeId;
    const fromMoon = this._planetDirFrom(this.observer);
    if (this._planetMesh) {
      this._planetMesh.visible = !!fromMoon;
      if (fromMoon) {
        const body = this.catalog.bodies.find((b) => b.id === this.observer);
        const angular = Math.atan(this.catalog.planet.radiusKm / body.distanceKm);
        this._planetMesh.position.copy(this._camera.position).addScaledVector(fromMoon, this._cfg.SKY_DISTANCE);
        this._planetMesh.scale.setScalar(this._cfg.SKY_DISTANCE * Math.tan(angular));
        this._planetMesh.rotation.y = t.rotationAngle * 0.2;
        this._planetMesh.material.uniforms.sunDir.value.copy(sun);
      }
    }
    if (!onPlanet) {
      for (const m of this.moons) m.mesh.visible = false;
      return;
    }
    const night = 1 - t.daylight;
    const rot = t.rotationAngle;
    // Tras un salto de reloj (dormir, Admin) no se anuncia nada: solo el paso normal del tiempo.
    const jumped = this._lastHours !== undefined && Math.abs(t.totalHours - this._lastHours) > 0.25;
    this._lastHours = t.totalHours;
    for (const m of this.moons) {
      t.skyDirection(skyAngle(m.body, rot, t.totalHours), m.body.inclination, m.dir);
      m.height = m.dir.y;
      m.lit = illumination(m.dir, sun);
      m.material.uniforms.sunDir.value.copy(sun);
      m.material.uniforms.night.value = night;
      const up = m.height > -0.05;
      m.mesh.visible = up;
      if (up) m.mesh.position.copy(this._camera.position).addScaledVector(m.dir, this._cfg.SKY_DISTANCE);
      // Aviso al salir por el horizonte (de noche, que es cuando se ven bien).
      const isUp = m.height > 0;
      if (isUp && !m.wasUp && !jumped && this._started && night > 0.5 && this._cfg.MOON_RISE_MESSAGES) {
        this._events.emit(GameEvents.MOON_RISE, { id: m.body.id, name: m.body.name });
      }
      m.wasUp = isUp;
    }
  }

  /**
   * Luz de luna para la noche: la luna visible que más ilumina.
   * @returns {{ direction: THREE.Vector3, strength: number } | null} strength 0..1
   */
  getNightLight() {
    const fromMoon = this._planetDirFrom(this.observer);
    if (fromMoon) {
      // Desde una luna: la luz reflejada por el planeta.
      return { direction: fromMoon, strength: illumination(fromMoon, this._sun) };
    }
    if (this.observer !== this._system.homeId) return null;
    let best = null;
    let bestStrength = 0;
    for (const m of this.moons) {
      const size = m.body.skySizeDeg / this._maxSkySize;
      const strength = m.lit * smoothstep(0, 0.2, m.height) * Math.min(1, size);
      if (strength > bestStrength) {
        bestStrength = strength;
        best = m;
      }
    }
    return best ? { direction: best.dir, strength: bestStrength } : null;
  }

  /** Dirección del planeta en el cielo de una luna (null si `id` no es una luna del planeta). */
  _planetDirFrom(id) {
    const i = this.catalog?.bodies.findIndex((b) => b.id === id) ?? -1;
    return i >= 0 ? PLANET_IN_SKY[i % PLANET_IN_SKY.length] : null;
  }

  /** Estado para Admin / UI. */
  getState() {
    return this.moons.map((m) => ({
      id: m.body.id,
      name: m.body.name,
      altitudeDeg: (Math.asin(Math.max(-1, Math.min(1, m.height))) * 180) / Math.PI,
      illumination: m.lit,
      visible: m.height > 0,
      direction: m.dir,
    }));
  }

  /** Busca desde ahora la primera hora de noche con las dos lunas sobre el horizonte. */
  findNightWithAllMoons(maxHours = 24 * 12) {
    const t = this._time;
    const start = t.totalHours;
    const dir = {};
    for (let h = 0; h < maxHours; h += 0.25) {
      const probe = start + h;
      t.totalHours = probe;
      if (t.daylight > 0.05) continue;
      const rot = t.rotationAngle;
      const allUp = this.catalog.bodies.every((b) => t.skyDirection(skyAngle(b, rot, probe), b.inclination, dir).y > 0.2);
      if (allUp) {
        t.totalHours = start;
        return probe;
      }
    }
    t.totalHours = start;
    return null;
  }
}

/**
 * Esfera low-poly con cráteres (color por vértice). Las lunas grandes tienen
 * pocos cráteres grandes ("mares"); las pequeñas, muchos y pequeños. Todo sale
 * de craterSeed.
 */
export function createMoonGeometry(body, detail = 3) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const pos = geometry.getAttribute('position');
  const rng = new SeededRandom(body.craterSeed);
  const craters = [];
  const large = body.radiusKm >= 400;
  const count = large ? 26 : 40;
  for (let i = 0; i < count; i++) {
    const u = rng.range(-1, 1);
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(1 - u * u);
    craters.push({ c: new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)), size: rng.range(0.08, large ? 0.45 : 0.25) });
  }
  const base = new THREE.Color(body.color);
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let shade = 1;
    let height = 0;
    for (const cr of craters) {
      const d = v.angleTo(cr.c) / cr.size;
      if (d < 1) {
        shade *= 0.72 + 0.28 * d;          // fondo del cráter más oscuro
        height -= 0.05 * cr.size * (1 - d);
      } else if (d < 1.3) {
        shade *= 1.08;                     // borde claro
        height += 0.02 * cr.size;
      }
    }
    tmp.copy(base).multiplyScalar(Math.min(1.2, shade));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
    pos.setXYZ(i, v.x * (1 + height), v.y * (1 + height), v.z * (1 + height));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom.js';
import { orbitPosition } from '../celestial/CelestialCatalog.js';
import { createMoonGeometry } from '../celestial/CelestialSystem.js';
import { createPlanetTextures } from './PlanetTexture.js';

/**
 * SpaceScene — escena espacial separada (Fase 13): un planeta (el del grupo que
 * se muestra) con su mapa real, nubes y atmósfera, sus lunas en sus órbitas, el sol, las estrellas y la nave.
 *
 * Unidades: el planeta mide `PLANET_RADIUS`; las distancias de las lunas se
 * escalan con él (km × PLANET_RADIUS / PLANET_RADIUS_KM) y su tamaño se exagera
 * MOON_VISUAL_SCALE veces para que se vean. Solo presentación: SpaceSystem decide
 * cuándo se usa y adónde mira la cámara.
 */
const SUN_DIR = new THREE.Vector3(1, 0.12, 0.08).normalize();

export class SpaceScene {
  constructor({ config, system }) {
    this._cfg = config;
    this._system = system;
    this._kmScale = config.PLANET_RADIUS / system.home.radiusKm; // se recalcula en build()
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(config.CAMERA_FOV, window.innerWidth / window.innerHeight, 0.5, 9000);
    this.bodies = {}; // id → { object, radius, name }
    this._built = false;
    this._texturesFor = null;

    // Luz del sol + un poco de luz ambiente para que el lado nocturno no sea negro puro.
    const sun = new THREE.DirectionalLight(0xfff4e0, 3);
    sun.position.copy(SUN_DIR).multiplyScalar(100);
    this.scene.add(sun, new THREE.AmbientLight(0x223044, 0.35));
    this.sunDirection = SUN_DIR;

    this._buildSun();
    this._buildPlanet();
  }

  // ---- Construcción --------------------------------------------------------------

  _buildSun() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.18, 'rgba(255,236,180,0.9)');
    grad.addColorStop(0.45, 'rgba(255,200,120,0.25)');
    grad.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.position.copy(SUN_DIR).multiplyScalar(6000);
    sprite.scale.setScalar(900);
    this.scene.add(sprite);
  }

  _buildPlanet() {
    const R = this._cfg.PLANET_RADIUS;
    this.planet = new THREE.Group();
    this.planet.name = 'HomePlanet';
    this._surfaceMaterial = new THREE.MeshLambertMaterial({ color: 0x2d6f98 });
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), this._surfaceMaterial);
    this._cloudMaterial = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.85, depthWrite: false });
    this.cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(R * 1.015, 64, 48), this._cloudMaterial);
    this.cloudLayer.visible = false;
    this.planet.add(this.surface, this.cloudLayer);

    // Halo de atmósfera (efecto de borde, aditivo).
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.09, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { sunDir: { value: SUN_DIR } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vView = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 sunDir;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(vN, vView)), 2.5);
            float day = 0.25 + 0.75 * smoothstep(-0.3, 0.4, dot(-vN, sunDir));
            gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * rim * day * 1.6, rim * day);
          }`,
      }),
    );
    this.scene.add(atmosphere);

    // La nave, en órbita baja sobre la isla del planeta (hija del planeta: gira con él).
    const shipGeo = new THREE.ConeGeometry(0.9, 2.6, 6);
    shipGeo.rotateZ(-Math.PI / 2);
    this.ship = new THREE.Mesh(shipGeo, new THREE.MeshBasicMaterial({ color: 0xffa060 }));
    this.ship.position.set(R * 1.12, R * 0.02, 0);
    this.scene.add(this.ship);
    this.scene.add(this.planet);
    this.bodies.SHIP = { object: this.ship, radius: 1.5, name: 'Tu nave' };
  }

  /**
   * Estrellas, planeta y lunas del grupo `catalog` (un planeta y sus lunas) según la
   * seed. Solo se rehace si cambia la seed o el planeta.
   */
  build({ catalog, seed, mapCanvas, planet }) {
    const key = `${seed}:${catalog.planet.id}:${mapCanvas ? 1 : 0}`;
    if (this._texturesFor === key) return;
    this._texturesFor = key;
    this._catalog = catalog;
    this._kmScale = this._cfg.PLANET_RADIUS / catalog.planet.radiusKm;
    for (const id of Object.keys(this.bodies)) if (id !== 'SHIP' && !this.bodies[id].body) delete this.bodies[id];
    this.bodies[catalog.planet.id] = { object: this.planet, radius: this._cfg.PLANET_RADIUS, name: catalog.planet.name };
    const textures = createPlanetTextures({ width: this._cfg.TEXTURE_WIDTH, seed, mapCanvas, planet });
    const toTex = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    this._surfaceMaterial.map?.dispose();
    this._surfaceMaterial.map = toTex(textures.surface);
    this._surfaceMaterial.color.set(0xffffff);
    this._surfaceMaterial.needsUpdate = true;
    this._cloudMaterial.map?.dispose();
    this._cloudMaterial.map = toTex(textures.clouds);
    this._cloudMaterial.needsUpdate = true;
    this.cloudLayer.visible = planet.BREATHABLE !== false;

    this._buildStars(seed);
    this._buildMoons(catalog);
  }

  _buildStars(seed) {
    if (this._stars) {
      this.scene.remove(this._stars);
      this._stars.geometry.dispose();
    }
    const rng = new SeededRandom(seed ^ 0x5eed);
    const n = this._cfg.STAR_COUNT;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u) * 7000;
      pos.set([Math.cos(a) * r, u * 7000, Math.sin(a) * r], i * 3);
      const b = 0.4 + rng.next() * 0.6;
      const warm = rng.next();
      col.set([b * (0.85 + warm * 0.15), b * 0.9, b * (1 - warm * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this._stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }));
    this.scene.add(this._stars);
  }

  _buildMoons(catalog) {
    for (const [id, old] of Object.entries(this.bodies)) {
      if (!old.body) continue; // solo las lunas
      this.scene.remove(old.object, old.orbit);
      old.object.geometry.dispose();
      delete this.bodies[id];
    }
    for (const body of catalog.bodies) {
      const radius = body.radiusKm * this._kmScale * this._cfg.MOON_VISUAL_SCALE;
      const mesh = new THREE.Mesh(
        createMoonGeometry(body, 4),
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      );
      mesh.scale.setScalar(radius);
      mesh.name = body.id;
      // Órbita (línea tenue).
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const p = orbitPosition(body, (i / 128) / body.speed - body.phase / (Math.PI * 2 * body.speed), {});
        pts.push(new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(this._kmScale));
      }
      const orbit = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x7f9fc8, transparent: true, opacity: 0.25 }),
      );
      this.scene.add(mesh, orbit);
      this.bodies[body.id] = { object: mesh, orbit, radius, name: body.name, body };
    }
  }

  /** Posiciones según la hora: el planeta gira (la isla mira al sol a mediodía) y las lunas orbitan. */
  update(totalHours, dt, noonHour, shipLocation = null, origin = { x: 0, y: 0, z: 0 }) {
    this.planet.rotation.y = (Math.PI * 2 * (totalHours - noonHour)) / 24;
    this.planet.updateMatrixWorld(true);
    this.cloudLayer.rotation.y += dt * 0.004;
    const p = {};
    for (const { id } of this._catalog?.bodies ?? []) {
      const b = this.bodies[id];
      if (!b) continue;
      orbitPosition(b.body, totalHours, p);
      b.object.position.set(p.x, p.y, p.z).multiplyScalar(this._kmScale);
      b.object.rotation.y = -Math.PI * 2 * b.body.speed * totalHours; // cara oculta: siempre la misma hacia el planeta
    }
    // La nave: en el espacio, donde esté; en un cuerpo, sobre su zona de aterrizaje.
    const R = this._cfg.PLANET_RADIUS;
    const center = this._catalog?.planet.id;
    const loc = shipLocation ?? { body: center };
    if (loc.body === 'SPACE' && loc.pos) {
      // Posición de la nave respecto al planeta del grupo (`origin`, en km).
      this.ship.position.set(loc.pos.x - origin.x, loc.pos.y - origin.y, loc.pos.z - origin.z).multiplyScalar(this._kmScale);
      this.ship.rotation.set(0, loc.yaw ?? 0, 0);
    } else if (this.bodies[loc.body] && loc.body !== center) {
      const m = this.bodies[loc.body];
      this.ship.position.copy(m.object.position).add(new THREE.Vector3(m.radius * 1.4, 0, 0));
    } else {
      this.ship.position.set(R * 1.12, R * 0.02, 0).applyMatrix4(this.planet.matrixWorld);
    }
  }
}

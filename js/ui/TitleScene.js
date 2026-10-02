import * as THREE from 'three';
import { buildCapsule } from '../render/CapsuleModel.js';
import { SeededRandom } from '../core/SeededRandom.js';

/**
 * TitleScene — fondo 3D del menú de inicio: la cápsula de salvamento flotando en
 * órbita sobre el planeta de inicio, con estrellas y el sol.
 *
 * `launch(onImpact)` hace la caída: la cápsula gira el escudo hacia el planeta,
 * acelera hacia él, se envuelve en plasma al entrar en la atmósfera y, con un
 * fogonazo, termina (onImpact): el juego empieza junto a la cápsula estrellada.
 *
 * Es un sistema del bucle: mientras está activa, el renderer dibuja SU escena y
 * su cámara (RenderContext.setActive). Al terminar devuelve la superficie.
 */
export class TitleScene {
  /**
   * @param {object} p
   * @param {object} p.render    RenderContext
   * @param {object} p.textures  { surface, clouds, atmosphere } del planeta de inicio (texturas de Three)
   * @param {number} [p.seed]
   */
  constructor({ render, textures, seed = 1 }) {
    this.name = 'titleScene';
    this._render = render;
    this.active = false;
    this._t = 0;
    this._fall = null; // estado de la caída (null = en órbita)

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x020309);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 3000);
    render.addCamera(this.camera);

    // Luz del sol (desde arriba a la derecha) y un poco de luz ambiente azulada (reflejo del planeta).
    this._sunDir = new THREE.Vector3(0.75, 0.45, 0.5).normalize();
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.position.copy(this._sunDir).multiplyScalar(50);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x101018, 0.45));

    this._buildStars(new SeededRandom(seed ^ 0x51a7));
    this._buildSun();
    this._buildPlanet(textures);

    const cap = buildCapsule();
    this.capsule = cap.group;
    this._beacon = cap.beacon;
    scene.add(this.capsule);
    this._buildPlasma();

    this._camOffset = new THREE.Vector3(5.4, 1.4, 7.4);
    this._look = new THREE.Vector3();
    this._resetOrbit();
  }

  /** Muestra la escena en el renderer. */
  start() {
    this.active = true;
    this._render.setActive(this.scene, this.camera);
  }

  /** Devuelve el renderer a la superficie y libera la escena. */
  stop() {
    if (!this.active) return;
    this.active = false;
    this._render.setActive(null, null);
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) for (const m of [].concat(o.material)) m.dispose?.();
    });
  }

  /**
   * Empieza la caída. `onFlash` se llama al entrar el fogonazo final (para tapar
   * el cambio de escena) y `onImpact` al terminar.
   */
  launch({ onFlash, onImpact, duration = 6.5 }) {
    if (this._fall) return;
    const from = this.capsule.position.clone();
    const toCenter = this._planetCenter.clone().sub(from).normalize();
    // Punto de entrada: sobre la superficie, un poco a la izquierda (lado de día).
    const entry = this._planetCenter.clone().addScaledVector(toCenter, -(this._planetRadius + 1.5));
    this._fall = {
      t: 0, duration, from, entry, dir: toCenter, onFlash, onImpact, flashed: false,
      startQuat: this.capsule.quaternion.clone(),
      // El escudo (−Y local) apunta al planeta.
      endQuat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), toCenter),
    };
  }

  update(dt) {
    if (!this.active) return;
    this._render.setActive(this.scene, this.camera);
    this._t += dt;
    const t = this._t;
    this._planet.rotation.y += dt * 0.012;
    this._clouds.rotation.y += dt * 0.018;
    this._beacon.visible = Math.sin(t * 5) > 0.2;

    if (!this._fall) {
      // Órbita tranquila: la cápsula gira despacio y la cámara la rodea.
      this.capsule.rotation.set(0.35 + Math.sin(t * 0.21) * 0.12, t * 0.11, -0.25 + Math.sin(t * 0.17) * 0.08);
      const a = t * 0.05;
      const off = this._camOffset;
      this.camera.position.set(Math.cos(a) * off.x - Math.sin(a) * off.z, off.y + Math.sin(t * 0.13) * 0.35, Math.sin(a) * off.x + Math.cos(a) * off.z);
      // El encuadre deja la cápsula a la derecha (el menú va a la izquierda).
      this._look.set(-1.6, 0.4, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      this.camera.lookAt(this._look);
      return;
    }
    this._updateFall(dt);
  }

  _updateFall(dt) {
    const f = this._fall;
    f.t += dt;
    const u = Math.min(1, f.t / f.duration);
    // 0–18 %: se orienta; después acelera hacia el planeta (cada vez más deprisa).
    const turn = smooth(Math.min(1, u / 0.18));
    this.capsule.quaternion.slerpQuaternions(f.startQuat, f.endQuat, turn);
    const travel = u < 0.12 ? 0 : ((u - 0.12) / 0.88) ** 2.2;
    this.capsule.position.lerpVectors(f.from, f.entry, travel);
    // Bamboleo creciente durante la reentrada.
    const heat = smooth(Math.max(0, (u - 0.45) / 0.45));
    const wobble = heat * 0.06;
    this.capsule.rotateX(Math.sin(f.t * 23) * wobble);
    this.capsule.rotateZ(Math.cos(f.t * 19) * wobble);

    // Plasma alrededor del escudo y chispas detrás.
    const p = this._plasma;
    p.group.position.copy(this.capsule.position);
    p.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), f.dir);
    p.shell.material.opacity = heat * 0.85;
    p.shell.scale.set(1 + heat * 0.25, 1 + heat * 1.6, 1 + heat * 0.25);
    p.core.material.opacity = heat * 0.9;
    p.light.intensity = heat * 30;
    this._updateSparks(dt, heat, f.dir);

    // Cámara: detrás y algo por encima de la cápsula, mirando hacia el planeta; tiembla con el calor.
    const side = new THREE.Vector3().crossVectors(f.dir, new THREE.Vector3(0, 1, 0)).normalize();
    const behind = this.capsule.position.clone()
      .addScaledVector(f.dir, -(6.5 - heat * 2))
      .addScaledVector(side, 2.4 - heat * 1.2)
      .add(new THREE.Vector3(0, 1.6, 0));
    const shake = heat * 0.12;
    behind.x += (Math.random() - 0.5) * shake;
    behind.y += (Math.random() - 0.5) * shake;
    this.camera.position.lerp(behind, Math.min(1, dt * (u < 0.2 ? 2 : 6)));
    this._look.lerp(this.capsule.position.clone().addScaledVector(f.dir, 4), Math.min(1, dt * 4));
    this.camera.lookAt(this._look);
    this.camera.fov = 50 + heat * 12;
    this.camera.updateProjectionMatrix();

    if (!f.flashed && u >= 0.86) {
      f.flashed = true;
      f.onFlash?.();
    }
    if (u >= 1 && !f.done) {
      f.done = true;
      f.onImpact?.();
    }
  }

  // ---- Construcción -------------------------------------------------------

  _resetOrbit() {
    this.capsule.position.set(0, 0, 0);
    this.camera.position.copy(this._camOffset);
    this.camera.lookAt(0, 0, 0);
  }

  _buildStars(rng) {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rng.range(-1, 1);
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * r * 1500, u * 1500, Math.sin(a) * r * 1500], i * 3);
      const tint = rng.next();
      if (tint < 0.15) c.setRGB(1, 0.85, 0.7);
      else if (tint < 0.3) c.setRGB(0.75, 0.85, 1);
      else c.setRGB(1, 1, 1);
      c.multiplyScalar(0.45 + rng.next() * 0.55);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    this.scene.add(stars);
  }

  _buildSun() {
    const tex = glowTexture([[0, 'rgba(255,250,235,1)'], [0.12, 'rgba(255,236,190,0.9)'], [0.35, 'rgba(255,200,140,0.18)'], [1, 'rgba(255,180,120,0)']]);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.copy(this._sunDir).multiplyScalar(900);
    glow.scale.setScalar(260);
    this.scene.add(glow);
  }

  _buildPlanet(textures) {
    this._planetRadius = 60;
    this._planetCenter = new THREE.Vector3(-34, -62, -95);
    const root = new THREE.Group();
    root.position.copy(this._planetCenter);
    root.rotation.z = 0.35;
    const sunDir = { value: this._sunDir };
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(this._planetRadius, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: textures?.surface ?? null }, sunDir, hasMap: { value: textures?.surface ? 1 : 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec2 vUv;
          void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D map; uniform vec3 sunDir; uniform float hasMap; varying vec3 vN; varying vec2 vUv;
          void main() {
            float lit = smoothstep(-0.12, 0.3, dot(normalize(vN), sunDir));
            vec3 base = hasMap > 0.5 ? texture2D(map, vUv).rgb : vec3(0.25, 0.45, 0.6);
            gl_FragColor = vec4(base * (0.035 + 1.15 * lit), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    root.add(planet);
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(this._planetRadius * 1.012, 64, 48),
      new THREE.MeshLambertMaterial({ map: textures?.clouds ?? null, transparent: true, opacity: textures?.clouds ? 0.85 : 0, depthWrite: false }),
    );
    root.add(clouds);
    if (textures?.atmosphere !== false) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(this._planetRadius * 1.07, 64, 48),
        new THREE.ShaderMaterial({
          uniforms: { sunDir },
          side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: /* glsl */ `
            varying vec3 vN; varying vec3 vView;
            void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0);
              vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
          fragmentShader: /* glsl */ `
            uniform vec3 sunDir; varying vec3 vN; varying vec3 vView;
            void main() { float rim = pow(1.0 - abs(dot(vN, vView)), 2.2);
              float day = 0.2 + 0.8 * smoothstep(-0.3, 0.4, dot(-vN, sunDir));
              gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * rim * day * 1.8, rim * day); }`,
        }),
      );
      root.add(halo);
    }
    this._planet = planet;
    this._clouds = clouds;
    this.scene.add(root);
  }

  _buildPlasma() {
    const group = new THREE.Group();
    const shellTex = glowTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,190,90,0.8)'], [0.7, 'rgba(255,90,30,0.25)'], [1, 'rgba(255,60,20,0)']]);
    // Envoltura alargada (detrás de la cápsula) y núcleo blanco junto al escudo.
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.7, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xff8a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    shell.position.y = 0.9; // la estela se alarga hacia atrás (+Y local = detrás del escudo)
    group.add(shell);
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: shellTex, color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.setScalar(4.2);
    core.position.y = -0.3;
    group.add(core);
    const light = new THREE.PointLight(0xff9a4a, 0, 30, 1.5);
    group.add(light);
    this.scene.add(group);

    // Chispas: puntos que salen del escudo hacia atrás.
    const n = 260;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, color: 0xffb36b, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sparks.frustumCulled = false;
    this.scene.add(sparks);
    this._sparks = { pos, vel: new Float32Array(n * 3), life: new Float32Array(n), n, next: 0, geo, mesh: sparks };
    this._plasma = { group, shell, core, light };
  }

  _updateSparks(dt, heat, dir) {
    const s = this._sparks;
    const spawn = Math.floor(heat * 260 * dt * 4);
    const c = this.capsule.position;
    for (let i = 0; i < spawn; i++) {
      const k = s.next;
      s.next = (s.next + 1) % s.n;
      const a = Math.random() * Math.PI * 2;
      const r = 1.1 * Math.sqrt(Math.random());
      s.pos[k * 3] = c.x + dir.x * 0.4 + Math.cos(a) * r;
      s.pos[k * 3 + 1] = c.y + dir.y * 0.4 + Math.sin(a) * r;
      s.pos[k * 3 + 2] = c.z + dir.z * 0.4 + Math.sin(a + 1) * r;
      const sp = 8 + Math.random() * 10;
      s.vel[k * 3] = -dir.x * sp + (Math.random() - 0.5) * 3;
      s.vel[k * 3 + 1] = -dir.y * sp + (Math.random() - 0.5) * 3;
      s.vel[k * 3 + 2] = -dir.z * sp + (Math.random() - 0.5) * 3;
      s.life[k] = 0.5 + Math.random() * 0.5;
    }
    for (let k = 0; k < s.n; k++) {
      if (s.life[k] <= 0) {
        s.pos[k * 3 + 1] = -1e5;
        continue;
      }
      s.life[k] -= dt;
      for (let j = 0; j < 3; j++) s.pos[k * 3 + j] += s.vel[k * 3 + j] * dt;
    }
    s.geo.attributes.position.needsUpdate = true;
  }
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

/** Textura de brillo radial (lienzo) a partir de paradas [posición, color]. */
function glowTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [p, color] of stops) grad.addColorStop(p, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

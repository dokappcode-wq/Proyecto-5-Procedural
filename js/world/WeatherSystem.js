import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { WIND } from './Wind.js';

/**
 * WeatherSystem — el clima del planeta (P7).
 *
 * Estados (WEATHER.STATES): despejado, nublado, lluvia, tormenta y niebla. Cada uno dura
 * un rato y se pasa al siguiente al azar según su peso; los valores (nubes, lluvia, niebla,
 * viento) cambian poco a poco (BLEND s). Lo usan:
 *   - el cielo y la niebla (AtmosphereSystem.setWeather), el sonido (AudioSystem.setWeather),
 *   - el viento de la vegetación (Wind), la lluvia y la nieve alrededor de la cámara,
 *   - los rayos de la tormenta (destello, rayo lejano y trueno con retraso),
 *   - el huerto y el recolector de lluvia (raining), el estado «Mojado».
 * En el frío (montañas heladas o por encima de la cota de nieve) cae nieve en vez de lluvia.
 */
export class WeatherSystem {
  constructor({ config, scene, camera, events, atmosphere = null, audio = null, isActive = () => true, coldAt = () => false, sheltered = () => false, random = Math.random }) {
    this.name = 'weather';
    this._cfg = config;
    this._camera = camera;
    this._events = events;
    this._atmos = atmosphere;
    this._audio = audio;
    this._isActive = isActive;
    this._coldAt = coldAt;
    this._sheltered = sheltered;
    this._random = random;
    this.state = config.START;
    this._left = this._duration(this.state);
    const s = config.STATES[this.state];
    this.cloud = s.CLOUD;
    this.rain = s.RAIN;
    this.fog = s.FOG;
    this.wind = s.WIND;
    this.flash = 0;
    this.snowing = false;
    this._t = 0;
    this._strikeIn = 8;
    this._thunders = [];
    this._windAngle = random() * Math.PI * 2;
    // Lluvia: segmentos (gota con estela); nieve: puntos.
    const N = config.DROPS;
    this._rainOff = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) this._seed(this._rainOff, i, 18, 14);
    this._rainGeo = new THREE.BufferGeometry();
    this._rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    this._rainMesh = new THREE.LineSegments(this._rainGeo, new THREE.LineBasicMaterial({ color: 0xaecbe0, transparent: true, opacity: 0.45, depthWrite: false }));
    this._rainMesh.frustumCulled = false;
    const F = config.FLAKES;
    this._snowOff = new Float32Array(F * 3);
    for (let i = 0; i < F; i++) this._seed(this._snowOff, i, 16, 12);
    this._snowGeo = new THREE.BufferGeometry();
    this._snowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(F * 3), 3));
    this._snowMesh = new THREE.Points(this._snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
    this._snowMesh.frustumCulled = false;
    // Rayo (línea quebrada lejana).
    this._bolt = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 1 }));
    this._bolt.frustumCulled = false;
    this._bolt.visible = false;
    this._boltLife = 0;
    scene.add(this._rainMesh, this._snowMesh, this._bolt);
    this._cam = new THREE.Vector3();
  }

  _seed(arr, i, r, h) {
    arr[i * 3] = (this._random() * 2 - 1) * r;
    arr[i * 3 + 1] = (this._random() * 2 - 1) * h;
    arr[i * 3 + 2] = (this._random() * 2 - 1) * r;
  }

  _duration(state) {
    const [a, b] = this._cfg.STATES[state].TIME;
    return a + this._random() * (b - a);
  }

  /** ¿Llueve de verdad (para el huerto, el recolector y mojarse)? */
  get raining() {
    return this._isActive() && this.rain > 0.3;
  }

  get name_() {
    return this._cfg.STATES[this.state].NAME;
  }

  /** Cambia de estado ya (Admin / pruebas). */
  set(state) {
    if (typeof state !== 'string' || !Object.hasOwn(this._cfg.STATES, state)) return false;
    this.state = state;
    this._left = this._duration(state);
    this._events.emit(GameEvents.WEATHER_CHANGED, { state, name: this._cfg.STATES[state].NAME });
    return true;
  }

  _next() {
    const entries = Object.entries(this._cfg.STATES).filter(([id]) => id !== this.state);
    const total = entries.reduce((a, [, s]) => a + s.W, 0);
    let r = this._random() * total;
    for (const [id, s] of entries) {
      r -= s.W;
      if (r <= 0) return this.set(id);
    }
    return this.set(entries[0][0]);
  }

  update(dt) {
    this._t += dt;
    this._left -= dt;
    if (this._left <= 0) this._next();
    const active = this._isActive();
    const S = this._cfg.STATES[this.state];
    const k = Math.min(1, dt / this._cfg.BLEND);
    // Fuera del planeta (o en el espacio): sin clima.
    const want = active ? S : { CLOUD: 0, RAIN: 0, FOG: 0, WIND: 0.1 };
    this.cloud += (want.CLOUD - this.cloud) * k;
    this.rain += (want.RAIN - this.rain) * k;
    this.fog += (want.FOG - this.fog) * k;
    this.wind += (want.WIND - this.wind) * k;
    // Viento: dirección que gira despacio; la vegetación se mece.
    this._windAngle += dt * 0.01;
    WIND.time.value = this._t;
    WIND.strength.value = 0.15 + this.wind * 0.85;
    WIND.dir.value.set(Math.cos(this._windAngle), Math.sin(this._windAngle));

    this._lightning(dt, active && S.STORM);
    this._atmos?.setWeather({ cloud: this.cloud, fog: this.fog, flash: this.flash });
    this._audio?.setWeather?.({ rain: this.rain, wind: this.wind });
    this._precipitation(dt, active);
  }

  _precipitation(dt, active) {
    this._camera.getWorldPosition(this._cam);
    const c = this._cam;
    this.snowing = active && this.rain > 0.02 && this._coldAt(c.x, c.y, c.z);
    const hide = !active || this.rain < 0.02 || this._sheltered();
    this._rainMesh.visible = !hide && !this.snowing;
    this._snowMesh.visible = !hide && this.snowing;
    if (hide) return;
    const wx = WIND.dir.value.x * this.wind;
    const wz = WIND.dir.value.y * this.wind;
    if (!this.snowing) {
      const N = this._rainOff.length / 3;
      const n = Math.floor(N * Math.min(1, this.rain * 1.2));
      const pos = this._rainGeo.attributes.position.array;
      const vy = -16;
      const vx = wx * 5;
      const vz = wz * 5;
      for (let i = 0; i < N; i++) {
        const o = this._rainOff;
        o[i * 3] += vx * dt;
        o[i * 3 + 1] += vy * dt;
        o[i * 3 + 2] += vz * dt;
        if (o[i * 3 + 1] < -14) {
          this._seed(o, i, 18, 14);
          o[i * 3 + 1] = 14;
        }
        if (o[i * 3] > 18) o[i * 3] -= 36;
        else if (o[i * 3] < -18) o[i * 3] += 36;
        if (o[i * 3 + 2] > 18) o[i * 3 + 2] -= 36;
        else if (o[i * 3 + 2] < -18) o[i * 3 + 2] += 36;
        const x = c.x + o[i * 3];
        const y = c.y + o[i * 3 + 1];
        const z = c.z + o[i * 3 + 2];
        const j = i * 6;
        if (i >= n) {
          pos[j] = pos[j + 3] = x;
          pos[j + 1] = pos[j + 4] = -1e4;
          pos[j + 2] = pos[j + 5] = z;
          continue;
        }
        pos[j] = x;
        pos[j + 1] = y;
        pos[j + 2] = z;
        pos[j + 3] = x - vx * 0.035;
        pos[j + 4] = y - vy * 0.035;
        pos[j + 5] = z - vz * 0.035;
      }
      this._rainGeo.attributes.position.needsUpdate = true;
      this._rainMesh.material.opacity = 0.25 + this.rain * 0.3;
    } else {
      const F = this._snowOff.length / 3;
      const n = Math.floor(F * Math.min(1, this.rain * 1.2));
      const pos = this._snowGeo.attributes.position.array;
      for (let i = 0; i < F; i++) {
        const o = this._snowOff;
        o[i * 3] += (wx * 2 + Math.sin(this._t * 1.3 + i) * 0.4) * dt;
        o[i * 3 + 1] -= 1.4 * dt;
        o[i * 3 + 2] += (wz * 2 + Math.cos(this._t * 1.1 + i * 0.7) * 0.4) * dt;
        if (o[i * 3 + 1] < -12) {
          this._seed(o, i, 16, 12);
          o[i * 3 + 1] = 12;
        }
        if (o[i * 3] > 16) o[i * 3] -= 32;
        else if (o[i * 3] < -16) o[i * 3] += 32;
        if (o[i * 3 + 2] > 16) o[i * 3 + 2] -= 32;
        else if (o[i * 3 + 2] < -16) o[i * 3 + 2] += 32;
        pos[i * 3] = c.x + o[i * 3];
        pos[i * 3 + 1] = i < n ? c.y + o[i * 3 + 1] : -1e4;
        pos[i * 3 + 2] = c.z + o[i * 3 + 2];
      }
      this._snowGeo.attributes.position.needsUpdate = true;
    }
  }

  /** Tormenta: de vez en cuando un rayo lejano (destello y, con retraso, el trueno). */
  _lightning(dt, storm) {
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this._boltLife > 0) {
      this._boltLife -= dt;
      this._bolt.material.opacity = Math.max(0, this._boltLife / 0.25);
      if (this._boltLife <= 0) this._bolt.visible = false;
    }
    for (const th of this._thunders) th.t -= dt;
    while (this._thunders.length && this._thunders[0].t <= 0) {
      const th = this._thunders.shift();
      this._events.emit(GameEvents.THUNDER, { distance: th.d });
    }
    if (!storm) return;
    this._strikeIn -= dt;
    if (this._strikeIn > 0) return;
    const [a, b] = this._cfg.LIGHTNING_EVERY;
    this._strikeIn = a + this._random() * (b - a);
    const d = 250 + this._random() * 900;
    this.strike(d, this._random() * Math.PI * 2);
  }

  /** Un rayo a `d` m en la dirección `ang`. */
  strike(d, ang) {
    this.flash = 1;
    this._camera.getWorldPosition(this._cam);
    const c = this._cam;
    const x0 = c.x + Math.cos(ang) * d;
    const z0 = c.z + Math.sin(ang) * d;
    const pos = this._bolt.geometry.attributes.position.array;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      pos[i * 3] = x0 + (this._random() - 0.5) * 18 * (i > 0 && i < n - 1 ? 1 : 0);
      pos[i * 3 + 1] = c.y + 160 - t * 190;
      pos[i * 3 + 2] = z0 + (this._random() - 0.5) * 18 * (i > 0 && i < n - 1 ? 1 : 0);
    }
    this._bolt.geometry.attributes.position.needsUpdate = true;
    this._bolt.visible = true;
    this._boltLife = 0.25;
    this._thunders.push({ t: d / 340, d });
    this._thunders.sort((p, q) => p.t - q.t);
  }

  snapshot() {
    return { state: this.state, left: Math.round(this._left) };
  }

  restore(d) {
    if (!d || typeof d.state !== 'string' || !Object.hasOwn(this._cfg.STATES, d.state)) return;
    this.state = d.state;
    this._left = Number.isFinite(d.left) ? Math.max(5, Math.min(3600, d.left)) : this._duration(d.state);
    const s = this._cfg.STATES[d.state];
    this.cloud = s.CLOUD;
    this.rain = s.RAIN;
    this.fog = s.FOG;
    this.wind = s.WIND;
  }
}

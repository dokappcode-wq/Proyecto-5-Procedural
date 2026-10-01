import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { WAVE_MARGIN as MARGIN, waveProfile, waveState, waveHeightAt } from './WaveMath.js';

/**
 * GiantWaveSystem — la ola gigante periódica (capacidad del motor).
 *
 * Un cuerpo con WAVE en su perfil (water.giant_wave en el sistema solar) recibe
 * cada PERIOD_HOURS horas de juego, a partir de la hora HOUR, una ola que cruza
 * toda la región en línea recta (dirección según la seed) a SPEED m/s:
 *   - se ve como un muro de agua con espuma en la cresta;
 *   - levanta la superficie del mar (quien nada sube con ella: `heightAt`);
 *   - arrastra a quien esté fuera de la nave y, si le pilla en tierra, le hace daño;
 *   - la IA avisa WARNING_HOURS antes y cuando llega.
 * Dentro de la nave no pasa nada.
 */
export class GiantWaveSystem {
  constructor({ scene, events, time, worlds, player, controller, ship, timeConfig, say }) {
    this.name = 'giantWave';
    this._events = events;
    this._time = time;
    this._worlds = worlds;
    this._player = player;
    this._controller = controller;
    this._ship = ship;
    this._hoursPerSecond = 24 / (timeConfig.DAY_LENGTH_MINUTES * 60);
    this._offset = 0; // horas (herramienta Admin: provocarla ya)
    this._warnedCycle = null;
    this._arrivedCycle = null;
    this._hitCycle = null;
    this.state = { active: false, crest: 0, untilHours: Infinity, dir: { x: 1, z: 0 } };
    this._mesh = null;
    this._meshKey = null;
    this._scene = scene;
    this._sayFn = say ?? null;
  }

  /** Configuración de la ola del cuerpo activo (o null). */
  get config() {
    if (this._worlds.activeId === 'SPACE') return null;
    return this._worlds.profile()?.WAVE ?? null;
  }

  /** Cuánto sube el agua en (x, z) por la ola ahora (0 si no hay ola). */
  heightAt(x, z) {
    const W = this.config;
    return W ? waveHeightAt(W, this.state, x, z) : 0;
  }

  _profile(u, h) {
    return waveProfile(u, h);
  }

  /** Provoca la ola ahora mismo (Admin). */
  triggerNow() {
    const W = this.config;
    if (!W) return false;
    // Que la cresta aparezca ~250 m antes del jugador (no al otro lado de la región).
    const size = this._worlds.active.worldSize;
    const L = size + 2 * MARGIN;
    const crossHours = (L / W.SPEED) * this._hoursPerSecond;
    const dir = { x: Math.cos(W.ANGLE), z: Math.sin(W.ANGLE) };
    const u = this._player.position.x * dir.x + this._player.position.z * dir.z - 250;
    const want = Math.max(0, Math.min(0.95, (u + L / 2) / L)) * crossHours;
    const now = waveState(W, this._time.totalHours + this._offset, size, this._hoursPerSecond).phase;
    this._offset += want - now;
    this._warnedCycle = this._arrivedCycle = this._hitCycle = null;
    return true;
  }

  update(dt) {
    const W = this.config;
    if (!W) {
      this.state.active = false;
      if (this._mesh) this._mesh.visible = false;
      return;
    }
    const world = this._worlds.active;
    const size = world.worldSize;
    const s = (this.state = waveState(W, this._time.totalHours + this._offset, size, this._hoursPerSecond));
    const cycle = s.cycle;

    // Avisos de la IA.
    if (!s.active && s.untilHours <= W.WARNING_HOURS && this._warnedCycle !== cycle + 1) {
      this._warnedCycle = cycle + 1;
      const min = Math.max(1, Math.round(s.untilHours * 60));
      this._say(`¡Ola gigante en ${min} minutos! Vuelve a la nave o aléjate del agua.`);
    }
    if (s.active && this._arrivedCycle !== cycle) {
      this._arrivedCycle = cycle;
      this._say(`¡La ola gigante está aquí! ${Math.round(W.HEIGHT)} m de agua cruzando la región.`);
    }

    this._updateMesh(world, size, W);
    if (s.active) this._push(dt, W);
  }

  /** Arrastre (y daño en tierra) a quien esté fuera de la nave cuando pasa la cresta. */
  _push(dt, W) {
    const p = this._player;
    if (this._ship.isAboard(p.position)) return;
    const s = this.state;
    const u = p.position.x * s.dir.x + p.position.z * s.dir.z - s.crest;
    const k = this._profile(u, W.HEIGHT);
    if (k < 0.25) return;
    const ground = this._worlds.active.getHeightAt(p.position.x, p.position.z);
    const top = Math.max(0, this._worlds.active.seaLevel) + W.HEIGHT * k;
    if (p.position.y > top + 1) return; // por encima de la ola (un risco alto)
    // El agua arrastra con la ola (más cerca de la cresta, más fuerte).
    const drag = W.SPEED * 0.6 * k * dt;
    this._controller.drift(s.dir.x * drag, s.dir.z * drag);
    const cycle = this._arrivedCycle;
    if (ground > this._worlds.active.seaLevel - 0.5 && !p.state.isSwimming && this._hitCycle !== cycle) {
      this._hitCycle = cycle;
      this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: 15, source: 'WAVE', sourceName: 'la ola gigante' });
    }
  }

  _updateMesh(world, size, W) {
    const key = `${this._worlds.activeId}:${size}:${W.HEIGHT}`;
    if (this._meshKey !== key) {
      this._meshKey = key;
      if (this._mesh) {
        this._scene.remove(this._mesh);
        this._mesh.geometry.dispose();
      }
      this._mesh = this._buildMesh(size + 2 * MARGIN, W.HEIGHT, world.planet?.COLORS?.SEA ?? 0x2d6f98);
      this._scene.add(this._mesh);
    }
    const s = this.state;
    this._mesh.visible = s.active;
    if (!s.active) return;
    this._mesh.position.set(s.dir.x * s.crest, world.seaLevel, s.dir.z * s.crest);
    this._mesh.rotation.y = -Math.atan2(s.dir.z, s.dir.x);
  }

  /** Muro de agua: banda a lo largo de la cresta (eje Z local), con espuma arriba. */
  _buildMesh(length, height, color) {
    const across = 48;
    const span = height * 14;
    const geo = new THREE.PlaneGeometry(span, length, across, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(color);
    const foam = new THREE.Color(0xf2fbff);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i); // a lo largo de la dirección de avance
      const k = this._profile(u, height);
      pos.setY(i, height * k - 0.05);
      // Cara de la ola más oscura (agua profunda levantada) y espuma blanca en la cresta.
      c.copy(base).multiplyScalar(0.55 + 0.45 * (1 - k)).lerp(foam, Math.max(0, (k - 0.6) / 0.4) * 0.95);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true, transparent: true, opacity: 0.96, shininess: 90, specular: 0x9fd4ee, side: THREE.DoubleSide,
    }));
    mesh.name = 'GiantWave';
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  _say(text) {
    if (this._sayFn) this._sayFn(text);
    else this._events.emit(GameEvents.UI_MESSAGE, { text: `🌊 ${text}`, type: 'warning' });
  }

  /** Texto para la IA: cuánto falta para la próxima ola (o null si este cuerpo no tiene). */
  describe() {
    const W = this.config;
    if (!W) return null;
    const s = this.state;
    if (s.active) return `La ola gigante está cruzando ahora mismo: ${Math.round(W.HEIGHT)} m de agua.`;
    const h = Math.floor(s.untilHours);
    const m = Math.round((s.untilHours - h) * 60);
    return `Aquí llega una ola gigante de ${Math.round(W.HEIGHT)} m cada ${W.PERIOD_HOURS} h. Próxima en ${h} h ${m} min. Dentro de la nave estás a salvo.`;
  }
}

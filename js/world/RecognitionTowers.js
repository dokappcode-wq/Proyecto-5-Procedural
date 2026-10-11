import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { FogOfWar } from './map/FogOfWar.js';

/**
 * RecognitionTowers — torres de reconocimiento del planeta de inicio (P11).
 *
 * Cada torre (sitios RECON_TOWER del mapa diseñado) se activa con E: durante RECON.SCAN_TIME s
 * un haz y un anillo barren la zona; al acabar, un círculo de RECON.SCAN_RADIUS m queda revelado
 * en el mapa (FogOfWar). El resto del mapa está tapado con niebla: al empezar solo se ve el
 * entorno del inicio. Provider de InteractionSystem. Se guarda: torres activas y zonas vistas.
 */
export class RecognitionTowers {
  constructor({ config, events, scene, colliders = null, isHome = () => true }) {
    this.name = 'recon';
    this._cfg = config;
    this._events = events;
    this._colliders = colliders;
    this._isHome = isHome;
    this.fog = new FogOfWar({ limit: config.REVEAL_LIMIT });
    this.towers = [];   // { id, x, y, z, active, scan, beam, ring, crystal }
    this.group = new THREE.Group();
    this.group.name = 'RecognitionTowers';
    scene.add(this.group);
    this._t = 0;
    this._spawn = null;
  }

  /** Coloca las torres del mundo de inicio y la niebla de partida (antes de cargar la partida). */
  setup(world) {
    this.group.clear();
    this.towers = [];
    this.fog = new FogOfWar({ limit: this._cfg.REVEAL_LIMIT });
    const sites = world?.getSites?.('RECON_TOWER') ?? [];
    for (const s of sites) {
      const y = world.getHeightAt(s.x, s.z);
      const t = { id: s.id, x: s.x, y, z: s.z, active: false, scan: null };
      buildTower(t, this._cfg.TOWER_HEIGHT, this.group);
      this.towers.push(t);
      this._colliders?.add(`recon:${s.id}`, [{ x: s.x, z: s.z, r: 3.4, y0: y - 1, y1: y + this._cfg.TOWER_HEIGHT, wall: true }]);
    }
    const sp = world?.getSpawnPoint?.();
    if (sp) {
      this._spawn = { x: sp.x, z: sp.z };
      this.fog.reveal(sp.x, sp.z, this._cfg.START_REVEAL);
    }
  }

  /** Torres visibles en el mapa (las que están dentro de una zona revelada). */
  marks() {
    return this.towers.filter((t) => this.fog.isRevealed(t.x, t.z)).map((t) => ({ id: t.id, x: t.x, z: t.z, active: t.active, scanning: t.scan !== null }));
  }

  get activeCount() {
    return this.towers.filter((t) => t.active).length;
  }

  update(dt) {
    this._t += dt;
    this.group.visible = this._isHome();
    const C = this._cfg;
    for (const t of this.towers) {
      t.crystal.rotation.y += dt * 0.8;
      if (t.scan !== null) {
        t.scan -= dt;
        const k = Math.min(1, 1 - Math.max(0, t.scan) / C.SCAN_TIME); // 0 → 1 durante el barrido
        t.beam.visible = true;
        t.beam.material.opacity = 0.3 + Math.sin(this._t * 10) * 0.08;
        t.ring.visible = true;
        t.ring.scale.setScalar(1 + k * (C.SCAN_RADIUS / 6));
        t.ring.material.opacity = 0.85 * (1 - k * 0.6);
        if (t.scan <= 0) this._finish(t);
      } else {
        t.beam.visible = t.active;
        t.beam.material.opacity = 0.1 + Math.sin(this._t * 2 + t.x) * 0.03;
        t.ring.visible = false;
        t.crystal.material.emissiveIntensity = t.active ? 1.6 : 0.6;
      }
    }
  }

  _finish(t) {
    t.scan = null;
    t.active = true;
    this.fog.reveal(t.x, t.z, this._cfg.SCAN_RADIUS);
    this._events.emit(GameEvents.TOWER_REVEALED, { id: t.id, x: t.x, z: t.z, r: this._cfg.SCAN_RADIUS });
    this._events.emit(GameEvents.UI_MESSAGE, { text: `🗺️ Zona revelada: ${this.activeCount} de ${this.towers.length} torres activas. Mira el mapa (M).`, type: 'pickup' });
  }

  // ---- Interacción (provider de InteractionSystem) -----------------------------------

  getInteractablesNear(x, y, z, range) {
    if (!this._isHome()) return [];
    const out = [];
    for (const t of this.towers) {
      if (Math.hypot(t.x - x, t.z - z) > range + 4) continue;
      out.push({
        id: `recon:${t.id}`, x: t.x, y: t.y + 8, z: t.z, aimRadius: 1.4, reach: 3.5,
        label: '📡 Torre de reconocimiento',
        action: t.active ? 'Ya escaneada' : t.scan !== null ? 'Escaneando…' : 'Activar',
        key: 'E',
      });
    }
    return out;
  }

  interact(id) {
    const t = this.towers.find((x) => `recon:${x.id}` === id);
    if (!t) return false;
    if (t.active) {
      this._events.emit(GameEvents.UI_MESSAGE, { text: '📡 Esta torre ya escaneó la zona.', type: 'info' });
      return true;
    }
    if (t.scan !== null) return true;
    t.scan = this._cfg.SCAN_TIME;
    this._events.emit(GameEvents.TOWER_ACTIVATED, { id: t.id });
    this._events.emit(GameEvents.UI_MESSAGE, { text: `📡 Torre activada: escaneando la zona durante ${this._cfg.SCAN_TIME} s…`, type: 'biome' });
    return true;
  }

  // ---- Guardar --------------------------------------------------------------------

  snapshot() {
    return { active: this.towers.filter((t) => t.active).map((t) => t.id), fog: this.fog.snapshot() };
  }

  restore(d) {
    if (!d || typeof d !== 'object') return;
    const ids = new Set(Array.isArray(d.active) ? d.active.filter((v) => typeof v === 'string') : []);
    for (const t of this.towers) {
      t.active = ids.has(t.id);
      t.scan = null;
    }
    this.fog.restore(d.fog);
  }
}

/** Modelo de una torre: base de piedra, cuerpo estrecho, plataforma, cristal azul y haz. */
function buildTower(t, height, parent) {
  const g = new THREE.Group();
  g.name = `recon:${t.id}`;
  g.position.set(t.x, t.y, t.z);
  const stone = new THREE.MeshLambertMaterial({ color: 0x8d8a80, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5d5b55, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 3, 8), dark);
  base.position.y = 1.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, height - 3, 8), stone);
  shaft.position.y = 3 + (height - 3) / 2;
  shaft.castShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.6, 8), dark);
  top.position.y = height;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.9, 0),
    new THREE.MeshStandardMaterial({ color: 0x59d8ff, emissive: 0x2a9ad0, emissiveIntensity: 0.6, roughness: 0.2 }),
  );
  crystal.scale.y = 1.8;
  crystal.position.y = height + 1.8;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 1.1, 170, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x6fdcff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = height + 85;
  beam.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.6, 6.4, 40),
    new THREE.MeshBasicMaterial({ color: 0x9ae6ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  ring.visible = false;
  g.add(base, shaft, top, crystal, beam, ring);
  parent.add(g);
  Object.assign(t, { crystal, beam, ring, group: g });
}

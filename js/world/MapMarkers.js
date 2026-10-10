import * as THREE from 'three';

/**
 * MapMarkers — marcas del jugador en el mapa (P9): clic en el mapa pone una marca (y otro
 * clic encima la quita). En el mundo, cada marca es un haz de luz de su color para ir hacia
 * ella. Cada marca es de un cuerpo (planeta o luna) y solo se ve en él.
 * Se guardan con la partida (datos no fiables al cargar: se validan).
 */
export const MARKER_COLORS = ['#ff5a5a', '#ffd23f', '#5ad1ff', '#7dff7a', '#d38bff', '#ff9a3c'];
export const MAX_MARKERS = 24;

export class MapMarkers {
  constructor({ scene = null, worlds = null, max = MAX_MARKERS } = {}) {
    this.name = 'mapMarkers';
    this._worlds = worlds;
    this._max = max;
    this.list = [];
    this._seq = 0;
    this._t = 0;
    this.root = new THREE.Group();
    this.root.name = 'map-markers';
    scene?.add(this.root);
  }

  /** Pone una marca en (x, z) del cuerpo `body`. @returns la marca o null (demasiadas) */
  add(body, x, z, label = null) {
    if (typeof body !== 'string' || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (this.list.length >= this._max) return null;
    const n = ++this._seq;
    const m = { id: n, body, x, z, label: cleanLabel(label) ?? `Marca ${n}`, color: MARKER_COLORS[(n - 1) % MARKER_COLORS.length] };
    m.mesh = beam(m.color);
    this.root.add(m.mesh);
    this.list.push(m);
    return m;
  }

  remove(id) {
    const i = this.list.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const [m] = this.list.splice(i, 1);
    this.root.remove(m.mesh);
    m.mesh.geometry.dispose();
    m.mesh.material.dispose();
    return true;
  }

  /** La marca más cercana a (x, z) a menos de `radius` m en ese cuerpo, o null. */
  near(body, x, z, radius) {
    let best = null;
    let bd = radius;
    for (const m of this.list) {
      if (m.body !== body) continue;
      const d = Math.hypot(m.x - x, m.z - z);
      if (d <= bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  of(body) {
    return this.list.filter((m) => m.body === body);
  }

  clear() {
    for (const m of [...this.list]) this.remove(m.id);
  }

  update(dt) {
    this._t += dt;
    const active = this._worlds?.activeId;
    const w = this._worlds?.get?.(active);
    for (const m of this.list) {
      const show = m.body === active && !!w;
      m.mesh.visible = show;
      if (!show) continue;
      m.mesh.position.set(m.x, w.getHeightAt(m.x, m.z) + 40, m.z);
      m.mesh.material.opacity = 0.2 + Math.sin(this._t * 2.5 + m.id) * 0.06;
    }
  }

  snapshot() {
    return this.list.map(({ body, x, z, label }) => ({ body, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, label }));
  }

  restore(d) {
    this.clear();
    this._seq = 0;
    if (!Array.isArray(d)) return;
    for (const m of d.slice(0, this._max)) {
      if (!m || typeof m.body !== 'string' || m.body.length > 40) continue;
      if (!Number.isFinite(m.x) || !Number.isFinite(m.z) || Math.abs(m.x) > 1e6 || Math.abs(m.z) > 1e6) continue;
      this.add(m.body, m.x, m.z, m.label);
    }
  }
}

/** Nombre de una marca: texto corto sin caracteres de control (o null). */
function cleanLabel(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24);
  return t || null;
}

function beam(color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.6, 80, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

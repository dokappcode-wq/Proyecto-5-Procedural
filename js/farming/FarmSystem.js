import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { toGeometry } from '../construction/BuildModels.js';

/**
 * FarmSystem — huerto (P4). Las parcelas son piezas de construcción (FARM_PLOT) y su
 * cultivo vive en piece.data (se guarda con lo construido):
 *   { crop: 'WHEAT' | null, growth: 0..1, water: s que le quedan regada, fert: abonada }
 *
 * Con E sobre la parcela (según lo que se lleve en la mano):
 *   semilla (ITEMS.*.SEED)  → sembrar             cubo de agua → regar (y las de al lado)
 *   harina de hueso         → abonar               madura       → cosechar (FARM.CROPS.*.YIELD)
 * Crece regada a 1/GROW por segundo; seca, a DRY_SPEED; abonada, ×FERT_SPEED y da más.
 * Durmiendo también crece (las horas dormidas). Cada parcela dibuja su cultivo en 4 fases.
 */
const SOIL_TOP = 0.2; // altura de la tierra de la parcela (BuildModels.FARM_PLOT)
const STAGES = 4;     // brote, planta joven, crecida, madura

export class FarmSystem {
  constructor({ config, items, construction, inventory, hotbar, events, hourSeconds = 60, random = Math.random }) {
    this.name = 'farm';
    this._cfg = config;
    this._items = items;
    this._construction = construction;
    this._inv = inventory;
    this._hotbar = hotbar;
    this._events = events;
    this._random = random;
    this._views = new Map(); // pieza → { group, key }
    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._wetMaterial = new THREE.MeshLambertMaterial({ color: 0x2a1c12, transparent: true, opacity: 0.45, depthWrite: false });
    this._geoCache = new Map();
    // Durmiendo pasan horas: los cultivos crecen lo mismo.
    events.on(GameEvents.PLAYER_SLEPT, ({ hours = 0 }) => this.advance(hours * hourSeconds));
    events.on(GameEvents.STRUCTURE_REMOVED, ({ structure }) => this._dropView(structure));
    events.on(GameEvents.STRUCTURE_INTERACT, ({ structure }) => {
      if (structure?.type === 'FARM_PLOT') this.interact(structure);
    });
  }

  // ---- Estado --------------------------------------------------------------------

  /** Estado del cultivo de una parcela (lo crea si no hay). */
  stateOf(piece) {
    const d = piece.data && typeof piece.data === 'object' ? piece.data : (piece.data = {});
    if (!(d.crop in this._cfg.CROPS)) d.crop = null;
    d.growth = clamp01(Number(d.growth) || 0);
    d.water = Math.max(0, Number(d.water) || 0);
    d.fert = !!d.fert;
    return d;
  }

  plots() {
    return this._construction.allPieces().filter((p) => p.type === 'FARM_PLOT');
  }

  /** Fase de dibujo: -1 vacía, 0..3 (3 = madura). */
  stage(d) {
    if (!d.crop) return -1;
    return d.growth >= 1 ? STAGES - 1 : Math.min(STAGES - 2, Math.floor(d.growth * (STAGES - 1)));
  }

  /** Hace crecer todas las parcelas `seconds` segundos. */
  advance(seconds) {
    if (!(seconds > 0)) return;
    const C = this._cfg;
    for (const piece of this.plots()) {
      const d = this.stateOf(piece);
      if (d.crop && d.growth < 1) {
        // Regada solo el tiempo que le quede de agua; el resto, seca.
        const wet = Math.min(seconds, d.water);
        const k = (d.fert ? C.FERT_SPEED : 1) / C.CROPS[d.crop].GROW;
        d.growth = Math.min(1, d.growth + (wet + (seconds - wet) * C.DRY_SPEED) * k);
      }
      d.water = Math.max(0, d.water - seconds);
    }
  }

  update(dt) {
    this.advance(dt);
    // Dibujo de las parcelas del cuerpo actual (las demás están ocultas con su grupo).
    for (const piece of this._construction.pieces) {
      if (piece.type === 'FARM_PLOT') this._sync(piece);
    }
  }

  // ---- Acciones (E sobre la parcela) --------------------------------------------------

  /** Texto de la acción para el letrero, según lo que se lleve en la mano. */
  actionText(piece, heldId = this._hotbar.selectedId) {
    const d = this.stateOf(piece);
    const held = heldId ? this._items[heldId] : null;
    if (d.crop && d.growth >= 1) return `Cosechar ${this._cfg.CROPS[d.crop].NAME.toLowerCase()}`;
    if (heldId === 'BUCKET_WATER') return 'Regar';
    if (held?.FERTILIZER && d.crop && !d.fert) return 'Abonar';
    if (!d.crop && held?.SEED) return `Sembrar ${this._cfg.CROPS[held.SEED].NAME.toLowerCase()}`;
    if (!d.crop) return 'Vacía (E con semillas)';
    return `${this._cfg.CROPS[d.crop].NAME} ${Math.floor(d.growth * 100)} %${d.water > 0 ? ' · regada' : ' · seca'}`;
  }

  /** E sobre la parcela. @returns {boolean} si ha hecho algo */
  interact(piece, heldId = this._hotbar.selectedId) {
    const d = this.stateOf(piece);
    const C = this._cfg;
    const held = heldId ? this._items[heldId] : null;
    if (d.crop && d.growth >= 1) return this._harvest(piece, d);
    if (heldId === 'BUCKET_WATER') return this._water(piece);
    if (held?.FERTILIZER) {
      if (!d.crop) return this._say('🦴 Primero siembra algo: el abono es para lo sembrado.');
      if (d.fert) return this._say('🦴 Esta parcela ya está abonada.');
      if (!this._inv.removeItem(heldId, 1)) return false;
      d.fert = true;
      this._events.emit(GameEvents.FARM_CHANGED, { piece, action: 'fert' });
      return this._say('🦴 Abonada: crecerá más deprisa y dará más.', 'pickup', true);
    }
    if (!d.crop && held?.SEED && C.CROPS[held.SEED]) {
      if (!this._inv.removeItem(heldId, 1)) return false;
      Object.assign(d, { crop: held.SEED, growth: 0, fert: false });
      this._events.emit(GameEvents.FARM_CHANGED, { piece, action: 'plant' });
      return this._say(`🌱 Sembrado: ${C.CROPS[held.SEED].NAME.toLowerCase()}.${d.water > 0 ? '' : ' Riégalo con un cubo de agua para que crezca deprisa.'}`, 'pickup', true);
    }
    if (!d.crop) return this._say('🌱 Parcela vacía: ponte semillas (trigo, zanahoria, patata o pipas de calabaza) en la mano y pulsa E.');
    const crop = C.CROPS[d.crop];
    return this._say(`🌱 ${crop.NAME}: ${Math.floor(d.growth * 100)} %. ${d.water > 0 ? 'Regada.' : 'Seca: con un cubo de agua crece mucho más deprisa.'}${d.fert ? ' Abonada.' : ''}`);
  }

  _harvest(piece, d) {
    const crop = this._cfg.CROPS[d.crop];
    const got = [];
    let first = true;
    for (const [item, [lo, hi]] of Object.entries(crop.YIELD)) {
      let n = lo + Math.floor(this._random() * (hi - lo + 1));
      if (first && d.fert) n += this._cfg.FERT_BONUS; // el abono da más de lo principal
      first = false;
      if (n <= 0) continue;
      this._inv.addItem(item, n);
      got.push(`${this._items[item].ICON} ${n}`);
    }
    Object.assign(d, { crop: null, growth: 0, fert: false });
    this._events.emit(GameEvents.FARM_CHANGED, { piece, action: 'harvest' });
    this._events.emit(GameEvents.RESOURCE_HARVESTED, { item: Object.keys(crop.YIELD)[0], amount: 1, farm: true });
    return this._say(`🧺 Cosecha de ${crop.NAME.toLowerCase()}: ${got.join(' · ')}`, 'pickup', true);
  }

  /** Riega la parcela y las de al lado (un cubo da para un pequeño huerto) y vacía el cubo. */
  _water(piece) {
    const R = this._cfg.WATER_RADIUS;
    let n = 0;
    for (const p of this._construction.pieces) {
      if (p.type !== 'FARM_PLOT' || Math.hypot(p.x - piece.x, p.z - piece.z) > R || Math.abs(p.y - piece.y) > 1.5) continue;
      this.stateOf(p).water = this._cfg.WATER_TIME;
      n++;
    }
    const idx = this._hotbar.selectedIndex;
    const st = idx != null ? this._inv.slots[idx] : null;
    if (st?.id === 'BUCKET_WATER') {
      st.id = 'BUCKET';
      this._inv._emit?.('BUCKET', 0);
    } else if (this._inv.removeItem('BUCKET_WATER', 1)) this._inv.addItem('BUCKET', 1);
    this._events.emit(GameEvents.FARM_CHANGED, { piece, action: 'water' });
    return this._say(`💧 Regad${n > 1 ? `as ${n} parcelas` : 'a'} (${Math.round(this._cfg.WATER_TIME / 60)} min).`, 'pickup', true);
  }

  _say(text, type = 'info', ok = false) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return ok;
  }

  // ---- Dibujo ---------------------------------------------------------------------

  _sync(piece) {
    const d = this.stateOf(piece);
    const stage = this.stage(d);
    const wet = d.water > 0;
    const key = `${d.crop}:${stage}:${wet}`;
    let v = this._views.get(piece);
    if (v?.key === key) return;
    if (!v) {
      v = { group: new THREE.Group(), key: null };
      v.group.name = 'crop';
      piece.object.add(v.group);
      this._views.set(piece, v);
    }
    v.key = key;
    v.group.clear();
    if (wet) {
      const wetMesh = new THREE.Mesh(this._wetGeo ??= new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2), this._wetMaterial);
      wetMesh.position.y = SOIL_TOP + 0.012;
      wetMesh.renderOrder = 1;
      v.group.add(wetMesh);
    }
    if (stage >= 0) {
      const mesh = new THREE.Mesh(this._cropGeometry(d.crop, stage), this._material);
      mesh.castShadow = true;
      v.group.add(mesh);
    }
    v.group.traverse((o) => (o.userData.pieceId = piece.id));
  }

  _dropView(piece) {
    const v = piece && this._views.get(piece);
    if (!v) return;
    v.group.removeFromParent();
    this._views.delete(piece);
  }

  _cropGeometry(crop, stage) {
    const key = `${crop}:${stage}`;
    if (!this._geoCache.has(key)) this._geoCache.set(key, toGeometry(buildCrop(crop, stage, this._cfg.CROPS[crop].COLORS)));
    return this._geoCache.get(key);
  }
}

// ---- Modelos de los cultivos (en coordenadas de la parcela: 2×2 m, tierra a SOIL_TOP) ----

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.IcosahedronGeometry(0.5, 1);
const cone = new THREE.ConeGeometry(0.5, 1, 6);

/** Cultivo `crop` en la fase `stage` (0 brote … 3 maduro): plantas en hileras sobre la parcela. */
export function buildCrop(crop, stage, [leaf, ripe]) {
  const b = new PartsBuilder();
  const k = (stage + 1) / STAGES; // tamaño
  const y0 = SOIL_TOP;
  const rows = crop === 'WHEAT' ? 4 : crop === 'PUMPKIN' ? 2 : 3;
  const step = 1.5 / rows;
  let seed = crop.length * 7 + stage;
  const r = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -0.75 + step * (i + 0.5) + (r() - 0.5) * 0.08;
      const z = -0.75 + step * (j + 0.5) + (r() - 0.5) * 0.08;
      if (crop === 'WHEAT') {
        const h = 0.15 + 0.75 * k;
        const color = stage === STAGES - 1 ? ripe : leaf;
        for (let s = 0; s < 3; s++) {
          const a = s * 2.1 + r();
          const lean = [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12];
          b.add(box, { position: [x + Math.cos(a) * 0.04, y0 + h / 2, z + Math.sin(a) * 0.04], rotation: lean, scale: [0.025, h, 0.025], color });
          if (stage >= 2) b.add(box, { position: [x + Math.cos(a) * 0.04 + lean[0] * h * 0.5, y0 + h + 0.05, z + Math.sin(a) * 0.04 + lean[2] * h * 0.5], rotation: lean, scale: [0.05, 0.14, 0.05], color: stage === STAGES - 1 ? 0xe8cc6a : 0x9ac25a });
        }
      } else if (crop === 'CARROT' || crop === 'POTATO') {
        // Matas de hojas; madura: asoma la zanahoria (o las patatas al pie).
        const h = 0.08 + 0.32 * k;
        for (let s = 0; s < 5; s++) {
          const a = (s / 5) * Math.PI * 2 + r();
          b.add(crop === 'CARROT' ? cone : ball, {
            position: [x + Math.cos(a) * 0.05 * k, y0 + h * 0.55, z + Math.sin(a) * 0.05 * k],
            rotation: [Math.cos(a) * 0.5, a, Math.sin(a) * 0.5],
            scale: crop === 'CARROT' ? [0.05, h, 0.02] : [0.09 * k + 0.03, 0.06 * k + 0.03, 0.09 * k + 0.03],
            color: leaf,
          });
        }
        if (stage === STAGES - 1) {
          if (crop === 'CARROT') b.add(cone, { position: [x, y0 + 0.02, z], rotation: [Math.PI, 0, 0], scale: [0.07, 0.1, 0.07], color: ripe });
          else for (let s = 0; s < 3; s++) b.add(ball, { position: [x + (s - 1) * 0.09, y0 + 0.02, z + (s % 2) * 0.07], scale: [0.09, 0.07, 0.08], color: ripe });
        }
      } else {
        // Calabaza: guía con hojas grandes; el fruto crece y se vuelve naranja.
        const sz = 0.12 + 0.2 * k;
        for (let s = 0; s < 4; s++) {
          const a = (s / 4) * Math.PI * 2 + r();
          b.add(ball, { position: [x + Math.cos(a) * sz, y0 + 0.08, z + Math.sin(a) * sz], scale: [sz * 0.8, 0.05, sz * 0.8], color: leaf });
        }
        if (stage >= 1) {
          const f = stage === 1 ? 0.12 : stage === 2 ? 0.22 : 0.32;
          b.add(ball, { position: [x, y0 + f * 0.42, z], scale: [f, f * 0.78, f], color: stage === STAGES - 1 ? ripe : 0x8fae3a });
          b.add(box, { position: [x, y0 + f * 0.82, z], scale: [0.03, 0.08, 0.03], color: 0x5a6e2a });
        }
      }
    }
  }
  return b.build();
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

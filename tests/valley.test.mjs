/**
 * Valle del Despertar (v1.38): la zona inicial cerrada por muros de roca, con su tutorial.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { MapData } = await import('../js/world/map/MapData.js');
const { StartValley, DEBRIS_LOOT, VALLEY_CLUES, buildCliffFallGeometry } = await import('../js/world/StartValley.js');
const { StaticColliders } = await import('../js/story/StaticColliders.js');
const { PlayerController } = await import('../js/player/PlayerController.js');
const { STEPS } = await import('../js/story/Tutorial.js');

const dir = new URL('../maps/eden/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('eden.map.json', dir)));
const map = MapData.fromFiles(meta, zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
const V = meta.valley;

const inside = (poly, x, z) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) r = !r;
  }
  return r;
};
const centroid = V.points.reduce((c, p) => ({ x: c.x + p.x / V.points.length, z: c.z + p.z / V.points.length }), { x: 0, z: 0 });
const nearGorge = (x, z) => {
  for (let i = 0; i < V.gorge.length - 1; i++) {
    const a = V.gorge[i];
    const b = V.gorge[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < 22) return true;
  }
  return false;
};

test('valle: el inicio está dentro, en un fondo casi llano rodeado de muros altos sin escalar', () => {
  assert.ok(inside(V.points, meta.spawn.x, meta.spawn.z), 'la cápsula cae dentro del valle');
  // El fondo, casi llano.
  let lo = Infinity;
  let hi = -Infinity;
  for (let a = 0; a < 24; a++) {
    for (const k of [0.2, 0.5]) {
      const p = V.points[Math.floor((a / 24) * V.points.length)];
      const x = centroid.x + (p.x - centroid.x) * k;
      const z = centroid.z + (p.z - centroid.z) * k;
      if (map.waterAt(x, z) !== null) continue;
      const h = map.heightAt(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  assert.ok(hi - lo < 4 && Math.abs(lo - V.floor) < 3, `fondo llano (${lo.toFixed(1)}–${hi.toFixed(1)} m)`);
  // Los muros: en todas direcciones (salvo la garganta) suben más de 35 m y no se escalan.
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2;
    let top = -Infinity;
    let flagged = 0;
    let gorge = false;
    for (let s = 0; s < 330; s += 2) {
      const x = centroid.x + Math.cos(ang) * s;
      const z = centroid.z + Math.sin(ang) * s;
      if (inside(V.points, x, z)) continue;
      if (nearGorge(x, z)) gorge = true;
      top = Math.max(top, map.heightAt(x, z));
      if (map.noClimbAt(x, z)) flagged++;
      if (top > V.floor + 35 && flagged > 5) break;
    }
    if (gorge) continue;
    assert.ok(top > V.floor + 35, `muro a ${(ang * 180 / Math.PI).toFixed(0)}°: ${top.toFixed(1)} m`);
    assert.ok(flagged > 5, `muro sin escalar a ${(ang * 180 / Math.PI).toFixed(0)}°`);
  }
  // Lo de dentro (fondo y peñas) sí se escala; la pradera de fuera, también.
  assert.equal(map.noClimbAt(meta.spawn.x, meta.spawn.z), false);
  for (const m of V.mesas) assert.equal(map.noClimbAt(m.x + m.r + 0.8, m.z), false, `${m.id} se puede trepar`);
  assert.equal(map.noClimbAt(V.balcony.x + 120, V.balcony.z + 200), false);
});

test('valle: una sola salida, la garganta del sur, llana hasta el mirador y una bajada suave a la pradera', () => {
  // La garganta: a la altura del fondo, sin cuestas.
  for (let i = 0; i < V.gorge.length - 1; i++) {
    const a = V.gorge[i];
    const b = V.gorge[i + 1];
    for (let t = 0; t <= 1; t += 0.1) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      assert.ok(Math.abs(map.heightAt(x, z) - V.floor) < 2, `garganta a ${map.heightAt(x, z).toFixed(1)} m`);
      // Y estrecha: a 12 m de su eje, roca alta.
      const nx = -(b.z - a.z);
      const nz = b.x - a.x;
      const L = Math.hypot(nx, nz);
      const side = Math.max(map.heightAt(x + (nx / L) * 14, z + (nz / L) * 14), map.heightAt(x - (nx / L) * 14, z - (nz / L) * 14));
      if (i === 1) assert.ok(side > V.floor + 10, 'paredes a los lados de la garganta');
    }
  }
  // El mirador, a la altura del valle y por encima de la pradera.
  assert.ok(Math.abs(map.heightAt(V.balcony.x, V.balcony.z) - V.balcony.y) < 1);
  // La bajada: se baja andando (pendiente < 40°) hasta la pradera.
  const ramp = meta.roads.find((r) => r.id === 'BAJADA_MIRADOR');
  const end = ramp.points.at(-1);
  assert.ok(map.heightAt(end.x, end.z) < V.balcony.y - 8, 'la bajada llega abajo');
  for (let i = 0; i < ramp.points.length - 1; i++) {
    const a = ramp.points[i];
    const b = ramp.points[i + 1];
    for (let t = 0; t < 1; t += 0.05) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const g = Math.hypot(map.heightAt(x + 1, z) - map.heightAt(x - 1, z), map.heightAt(x, z + 1) - map.heightAt(x, z - 1)) / 2;
      assert.ok(g < 0.8, `bajada andable (${g.toFixed(2)})`);
    }
  }
});

test('valle: cascadas que caen por los muros a sus pozas, lago, peñas y lugares del tutorial', () => {
  assert.ok(V.falls.length >= 2);
  for (const f of V.falls) {
    assert.ok(f.top > V.floor + 35, `${f.id} cae desde arriba del muro`);
    assert.ok(Math.abs(f.points.at(-1).y - f.foot.y) < 1.5, `${f.id} llega a su poza`);
    assert.ok(map.waterAt(f.foot.x, f.foot.z) !== null, `${f.id}: poza con agua`);
    for (const p of f.points) assert.ok(p.y >= map.heightAt(p.x, p.z) - 0.6, `${f.id}: la cinta va por fuera de la roca`);
    const geo = buildCliffFallGeometry(f);
    assert.equal(geo.attributes.color.itemSize, 4);
    assert.equal(geo.attributes.position.count, f.points.length * 2);
  }
  const lake = meta.lakes.find((l) => l.id === 'LAGO_VALLE');
  const lc = lake.points.reduce((c, p) => ({ x: c.x + p.x / lake.points.length, z: c.z + p.z / lake.points.length }), { x: 0, z: 0 });
  assert.ok(map.waterAt(lc.x, lc.z) - map.heightAt(lc.x, lc.z) > 1.2, 'el lago del valle tiene fondo');
  const pena = V.mesas.find((m) => m.id === 'PENA_SALTOS');
  const roca = V.mesas.find((m) => m.id === 'ROCA_RESTOS');
  assert.ok(Math.abs(map.heightAt(pena.x, pena.z) - (V.floor + 4)) < 1);
  assert.ok(Math.abs(map.heightAt(roca.x, roca.z) - (V.floor + 8)) < 1);
  assert.ok(map.heightAt(roca.x, roca.z) - map.heightAt(roca.x + roca.r + 5, roca.z) > 6, 'la Roca de los Restos tiene su pared');
  // La torre del valle, el templo (prueba TRIAL) y su recinto, dentro del valle.
  const inV = (s) => inside(V.points, s.x, s.z);
  assert.ok(meta.sites.some((s) => s.kind === 'RECON_TOWER' && inV(s)));
  assert.ok(meta.sites.some((s) => s.kind === 'CHALLENGE_TEMPLE' && s.type === 'TRIAL' && inV(s)));
  assert.equal(meta.sites.filter((s) => s.kind === 'CHALLENGE_ARENA' && inV(s)).length, 1);
  // El ermitaño y el mercader, fuera; la torre del ermitaño, cerca del mirador.
  const hermit = meta.sites.find((s) => s.kind === 'HERMIT_TOWER');
  assert.ok(!inV(hermit) && Math.hypot(hermit.x - V.balcony.x, hermit.z - V.balcony.z) < 350);
  assert.ok(!inV(meta.sites.find((s) => s.kind === 'MERCHANT')));
});

test('sin red de caminos: solo el sendero del tutorial y los accesos de algún lugar', () => {
  assert.deepEqual(meta.roads.map((r) => r.id).sort(), ['BAJADA_MIRADOR', 'SENDERO_DESPERTAR', 'SUBIDA_OBSERVATORIO']);
  const sendero = meta.roads.find((r) => r.id === 'SENDERO_DESPERTAR');
  // El sendero del tutorial empieza en la cápsula y acaba en el mirador.
  assert.ok(Math.hypot(sendero.points[0].x - meta.spawn.x, sendero.points[0].z - meta.spawn.z) < 10);
  assert.ok(Math.hypot(sendero.points.at(-1).x - V.balcony.x, sendero.points.at(-1).z - V.balcony.z) < 20);
});

/** Valle de juego con dobles sencillos de los sistemas. */
function kit() {
  const events = new EventBus();
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const colliders = new StaticColliders();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const player = { position: new THREE.Vector3(meta.spawn.x, V.floor, meta.spawn.z) };
  const spawned = [];
  const enemies = {
    spawnAt: (type, x, z, y) => {
      const e = { type, x, z, y, alive: true };
      spawned.push(e);
      return e;
    },
    remove: (e) => (e.removed = true),
  };
  const dialogs = [];
  const ui = { dialog: (lines) => dialogs.push(lines), letterbox() {}, caption() {} };
  const shots = [];
  const camera = { setCinematic: (fn) => shots.push(fn) };
  const locks = [];
  const valley = new StartValley({
    map, heightAt: (x, z) => map.heightAt(x, z), root: new THREE.Group(), colliders, events, player, enemies, inventory,
    items: C.ITEMS, ui, camera, lock: (r, on) => locks.push(on),
  });
  return { events, msgs, colliders, inventory, player, spawned, dialogs, shots, locks, valley };
}

test('valle en juego: piedras para saltar, lianas, puentes y la losa que se aparta al superar el templo', () => {
  const { valley, colliders, events } = kit();
  // Piedras: cada una más alta, hay que saltar (más que un escalón) pero se llega.
  const st = [...valley.stones].reverse(); // de la más baja a la más alta
  assert.equal(st.length, 5);
  let prev = map.heightAt(st[0].x, st[0].z) - 0.05;
  for (const s of st) {
    const rise = s.top - prev;
    assert.ok(rise > C.PLAYER.MAX_STEP_HEIGHT && rise < 1.2, `subida de ${rise.toFixed(2)} m`);
    assert.equal(colliders.surfaceAt(s.x, s.z, s.top + 0.3), s.top, 'se puede estar encima');
    prev = s.top;
  }
  const pena = V.mesas.find((m) => m.id === 'PENA_SALTOS');
  assert.ok(pena.top - prev > 0 && pena.top - prev < 1.2, 'de la última piedra a la peña');
  // Puentes donde el sendero cruza los arroyos, por encima del agua y andables.
  assert.equal(valley.bridges.length, 2);
  for (const b of valley.bridges) {
    assert.ok(b.deck > map.waterAt(b.x, b.z) + 0.3);
    assert.ok(Math.abs(colliders.surfaceAt(b.x, b.z, b.deck + 0.3) - b.deck) < 1e-6);
  }
  // Losa: cierra la garganta hasta superar la prueba TRIAL.
  const g = V.gate;
  const blocked = () => colliders.blocksAt(g.x, g.z, 0.35, V.floor + 0.2, V.floor + 2);
  assert.equal(valley.open, false);
  assert.ok(blocked(), 'la losa no deja pasar');
  events.emit(GameEvents.TEMPLE_CLEARED, { id: 'X', type: 'RACE' });
  assert.equal(valley.open, false, 'otro templo no la abre');
  let opened = 0;
  events.on(GameEvents.VALLEY_OPENED, () => opened++);
  events.emit(GameEvents.TEMPLE_CLEARED, { id: 'CHALLENGE_TEMPLE:5', type: 'TRIAL' });
  assert.equal(valley.open, true);
  assert.equal(opened, 1);
  for (let i = 0; i < 60; i++) valley.update(0.1);
  assert.ok(!blocked(), 'ya se puede salir');
  assert.ok(valley.targets.stones && valley.targets.shelf && valley.targets.climb && valley.targets.debris && valley.targets.ruins && valley.targets.balcony);
});

test('valle en juego: restos de la nave (una vez), pistas, slimes de las ruinas y el mirador', () => {
  const { valley, inventory, dialogs, player, spawned, shots, locks, events } = kit();
  // Restos: recursos y mejoras la primera vez; después, solo el registro.
  const near = valley.getInteractablesNear(valley.targets.debris.x, valley.targets.debris.y - 1.2, valley.targets.debris.z, 2);
  assert.ok(near.some((i) => i.id === 'valley:debris' && i.action === 'Registrar'));
  assert.equal(valley.interact('valley:debris'), true);
  for (const [item, n] of Object.entries(DEBRIS_LOOT)) assert.equal(inventory.getItemCount(item), n, item);
  valley.interact('valley:debris');
  assert.equal(inventory.getItemCount('WATERSKIN'), 1, 'no se repite');
  assert.equal(dialogs.length, 2);
  // Pistas.
  for (const c of valley.clues) assert.equal(valley.interact(`valley:clue:${c.i}`), true);
  assert.equal(valley.state.clues.length, VALLEY_CLUES.length);
  // Slimes: salen al acercarse a las ruinas; al vencerlos, ruinas despejadas.
  valley.update(0.1);
  assert.equal(spawned.length, 0, 'lejos de las ruinas no salen');
  player.position.set(valley.targets.ruins.x + 10, V.floor, valley.targets.ruins.z);
  valley.update(0.1);
  assert.equal(spawned.length, 3);
  spawned.forEach((e) => (e.alive = false));
  valley.update(0.1);
  assert.equal(valley.slimesBeaten, true);
  // Mirador: con la salida cerrada no hay plano de cine; abierta, sí (una vez).
  const B = V.balcony;
  player.position.set(B.x, B.y, B.z);
  valley.update(0.1);
  assert.equal(shots.length, 0);
  events.emit(GameEvents.TEMPLE_CLEARED, { id: 'T', type: 'TRIAL' });
  let left = 0;
  events.on(GameEvents.VALLEY_LEFT, () => left++);
  valley.update(0.1);
  assert.equal(shots.length, 1);
  assert.deepEqual(locks, [true]);
  for (let i = 0; i < 100; i++) valley.update(0.1);
  assert.equal(left, 1);
  assert.equal(locks.at(-1), false, 'devuelve el control');
  assert.equal(shots.at(-1), null);
  valley.update(0.1);
  assert.equal(left, 1, 'solo la primera vez');
});

test('valle: se guarda, se valida lo cargado y las partidas antiguas tienen la salida abierta', () => {
  const { valley, colliders } = kit();
  valley.state.debris = true;
  const snap = JSON.parse(JSON.stringify(valley.snapshot()));
  const b = kit().valley;
  b.restore(snap);
  assert.equal(b.state.debris, true);
  assert.equal(b.open, false);
  b.restore({ gate: 'sí', debris: 1, clues: [0, 0, 7, -1, 'x', 1], __proto__: { gate: true } });
  assert.deepEqual(b.state, { debris: false, slimes: false, gate: false, vista: false, clues: [0, 1] });
  valley.legacy();
  assert.equal(valley.open, true);
  assert.equal(valley.state.vista, true, 'sin plano de cine');
  assert.ok(!colliders.blocksAt(V.gate.x, V.gate.z, 0.35, V.floor + 0.2, V.floor + 2));
});

test('muros del valle: avanzar contra ellos no trepa (se avisa); una pared normal sí', () => {
  const steep = (x) => (x < 2 ? 10 : 10 + (x - 2) * 3);
  let noClimb = false;
  const msgs = [];
  const events = { emit: (type, d) => type === GameEvents.UI_MESSAGE && msgs.push(d.text) };
  const terrain = { getHeightAt: (x) => steep(x), noClimbAt: () => noClimb };
  const player = { position: new THREE.Vector3(1.9, 10, 0), velocity: new THREE.Vector3(), state: { onGround: true, isClimbing: false, isFlying: false } };
  const input = { wasPressed: () => false, isDown: () => false };
  const pc = new PlayerController({ config: C.PLAYER, look: {}, input, player, terrain, events });
  pc._wish.set(1, 0, 0);
  assert.equal(pc._updateClimbing(0.1), true, 'pared normal: trepa');
  assert.equal(player.state.isClimbing, true);
  player.position.set(1.9, 10, 0);
  player.state.isClimbing = false;
  noClimb = true;
  pc._updateClimbing(0.1);
  assert.equal(player.state.isClimbing, false, 'muro del valle: no trepa');
  assert.ok(player.position.x < 1.9 && player.position.y < 10.5, 'resbala hacia atrás');
  assert.equal(msgs.length, 1);
  pc._updateClimbing(0.1);
  assert.equal(msgs.length, 1, 'el aviso sale una vez');
});

test('tutorial: los pasos del valle siguen la lámina (moverse, saltar, trepar, interactuar, combate, torre, templo, salida)', () => {
  const ids = STEPS.map((s) => s.id);
  assert.deepEqual(ids.slice(0, 8), ['MOVE', 'JUMP', 'CLIMB', 'SEARCH', 'FIGHT', 'TOWER_SCAN', 'TEMPLE', 'EXIT']);
  assert.ok(STEPS.slice(0, 8).every((s) => s.valley));
  assert.ok(ids.indexOf('WOOD') > ids.indexOf('EXIT') && ids.at(-1) === 'HERMIT');
  assert.equal(new Set(ids).size, ids.length);
});

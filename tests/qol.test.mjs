/**
 * P9 (v1.32): calidad de vida — ordenar y guardar en cofres, bolsa al morir, ajustes,
 * marcas del mapa y cola de fabricación.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { CraftingSystem, MAX_QUEUE } from '../js/crafting/CraftingSystem.js';
import { Settings, parseSettings, SETTINGS_KEY, DEFAULTS, QUALITY } from '../js/settings/Settings.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { MapMarkers, MAX_MARKERS } = await import('../js/world/MapMarkers.js');
const { PickupSystem } = await import('../js/world/PickupSystem.js');

const inv = () => new InventorySystem({ items: C.ITEMS, events: new EventBus(), config: C.INVENTORY });

test('mochila: ordenar junta pilas y las pone por tipo; la barra no se toca', () => {
  const i = inv();
  i.slots[0] = { id: 'STONE', count: 3 };
  i.slots[12] = { id: 'WOOD', count: 30 };
  i.slots[20] = { id: 'STONE', count: 40 };
  i.slots[15] = { id: 'WOOD', count: 90 };
  i.slots[30] = { id: 'STONE_AXE', count: 1, dur: 20 };
  i.slots[31] = { id: 'STONE_AXE', count: 1, dur: 90 };
  i.sortBag();
  assert.deepEqual(i.slots[0], { id: 'STONE', count: 3 }, 'barra intacta');
  const bag = i.slots.slice(i.hotbarSize).filter(Boolean);
  assert.equal(bag.length, 5, 'madera 120 → 100 + 20; las hachas no se juntan');
  assert.equal(i.getItemCount('WOOD'), 120);
  assert.equal(i.getItemCount('STONE'), 43);
  assert.ok(i.slots.slice(i.hotbarSize, i.hotbarSize + 5).every(Boolean), 'sin huecos delante');
  const ids = bag.map((s) => s.id);
  const order = Object.keys(C.ITEMS);
  assert.deepEqual(ids, [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)), 'por tipo');
  const axes = bag.filter((s) => s.id === 'STONE_AXE');
  assert.deepEqual(axes.map((a) => a.dur), [90, 20], 'herramientas: la más entera primero');
});

test('cofre: ordenar, guardar iguales y coger todo', () => {
  const i = inv();
  const box = { slots: new Array(9).fill(null) };
  box.slots[4] = { id: 'WOOD', count: 10 };
  box.slots[7] = { id: 'COAL', count: 5 };
  i.attachContainer(box);
  i.sortContainer();
  assert.ok(box.slots[0] && box.slots[1] && !box.slots[2]);
  i.slots[0] = { id: 'WOOD', count: 7 };        // barra: no se guarda
  i.slots[10] = { id: 'WOOD', count: 50 };
  i.slots[11] = { id: 'COAL', count: 3 };
  i.slots[12] = { id: 'STONE', count: 9 };      // no hay piedra en el cofre: se queda
  assert.equal(i.quickStack(), 53);
  assert.equal(i.getItemCount('WOOD'), 7);
  assert.equal(i.getItemCount('STONE'), 9);
  assert.equal(box.slots.filter(Boolean).reduce((a, s) => a + (s.id === 'WOOD' ? s.count : 0), 0), 60);
  assert.equal(i.takeAll(), 68);
  assert.ok(box.slots.every((s) => !s));
  assert.equal(i.getItemCount('WOOD'), 67);
  i.attachContainer(null);
  assert.equal(i.quickStack(), 0, 'sin cofre no hace nada');
  assert.equal(i.sortContainer(), false);
});

test('bolsa al morir: se lleva todo menos lo de la historia; se recupera y se guarda', () => {
  const events = new EventBus();
  const i = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  i.slots[0] = { id: 'STONE_AXE', count: 1, dur: 33 };
  i.slots[14] = { id: 'WOOD', count: 40 };
  i.slots[20] = { id: 'SPACE_NODE', count: 1 };
  const contents = i.takeEverything((id) => C.SURVIVAL.DEATH_KEEP.includes(id));
  assert.equal(contents.length, 2);
  assert.equal(i.getItemCount('SPACE_NODE'), 1, 'el nodo espacial no se pierde');
  assert.equal(i.getItemCount('WOOD'), 0);
  assert.ok(C.SURVIVAL.DEATH_BAG);

  const worlds = { activeId: 'P1', get: () => ({ getHeightAt: () => 4 }) };
  const pickups = new PickupSystem({ scene: new THREE.Scene(), worlds, events, inventory: i, items: C.ITEMS });
  const bag = pickups.deathBag('P1', 10, 20, contents);
  assert.match(bag.label, /Tus cosas/);
  assert.deepEqual(pickups.markers('P1').map((m) => m.label), ['💀 Tus cosas']);
  assert.ok(bag.mesh.userData.beam, 'haz para encontrarla');
  // Otra cosa tirada al lado no se mezcla con ella.
  pickups.drop('P1', 11, 20, 'STONE', 3);
  assert.equal(bag.contents.length, 2);
  // Guardar y cargar (con datos raros).
  const snap = JSON.parse(JSON.stringify(pickups.snapshot()));
  snap.bags.push({ body: 'P1', x: 0, z: 0, death: true, contents: [{ item: 'HACK', count: 5 }, { item: 'WOOD', count: 1e9 }] });
  const p2 = new PickupSystem({ scene: new THREE.Scene(), worlds, events, inventory: i, items: C.ITEMS });
  p2.restore(snap, (id) => typeof id === 'string' && Object.hasOwn(C.ITEMS, id));
  const deaths = p2.markers('P1');
  assert.equal(deaths.length, 2);
  const again = p2.getInteractablesNear(10, 4, 20, 2).find((x) => x.label.includes('Tus cosas'));
  assert.equal(again.action, 'Recuperar');
  assert.ok(p2.interact(again.id));
  assert.equal(i.getItemCount('WOOD'), 40);
  assert.equal(i.slots.find((s) => s?.id === 'STONE_AXE').dur, 33, 'el hacha conserva su aguante');
  assert.equal(p2.markers('P1').length, 1, 'recogida: fuera del mapa');
});

test('ajustes: valores con límites, solo claves conocidas y guardado seguro', () => {
  assert.deepEqual(parseSettings('{"fov": 500, "sensitivity": -3, "quality": "ULTRA", "invertY": "sí", "hack": 1}'), { ...DEFAULTS, fov: 100, sensitivity: 0.2 });
  assert.deepEqual(parseSettings('no es json'), DEFAULTS);
  assert.deepEqual(parseSettings('x'.repeat(5000)), DEFAULTS);
  assert.deepEqual(parseSettings({ quality: '__proto__' }), DEFAULTS);
  assert.deepEqual(parseSettings([1, 2]), DEFAULTS);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const s = new Settings({ defaults: { fov: 75 }, storage });
  assert.equal(s.get('fov'), 75);
  const seen = [];
  s.onChange((v, k) => seen.push(k));
  assert.ok(s.set('quality', 'LOW'));
  assert.ok(s.set('fov', 90));
  assert.equal(s.set('fov', 90), false, 'sin cambio');
  assert.equal(s.set('nope', 1), false);
  assert.deepEqual(seen, ['quality', 'fov']);
  const s2 = new Settings({ storage });
  assert.equal(s2.get('quality'), 'LOW');
  assert.equal(s2.get('fov'), 90);
  assert.ok(JSON.parse(store.get(SETTINGS_KEY)));
  s2.reset();
  assert.equal(s2.get('quality'), 'HIGH');
  // Sin almacenamiento (modo privado): funciona igual.
  const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
  const s3 = new Settings({ storage: broken });
  assert.ok(s3.set('invertY', true));
  for (const q of Object.values(QUALITY)) assert.ok(q.NAME && q.PIXEL_RATIO > 0 && q.PIXEL_RATIO <= 1);
});

test('marcas del mapa: poner, quitar, la más cercana, límite y guardar', () => {
  const scene = new THREE.Scene();
  const worlds = { activeId: 'P1', get: () => ({ getHeightAt: () => 2 }) };
  const M = new MapMarkers({ scene, worlds });
  const a = M.add('P1', 100, 50);
  const b = M.add('P1M1', 0, 0, 'Luna\u0007 base');
  assert.equal(a.label, 'Marca 1');
  assert.equal(b.label, 'Luna base');
  assert.notEqual(a.color, b.color);
  M.update(0.1);
  assert.ok(a.mesh.visible && !b.mesh.visible, 'solo las del cuerpo donde estás');
  assert.equal(M.near('P1', 103, 52, 5), a);
  assert.equal(M.near('P1', 120, 50, 5), null);
  assert.equal(M.near('P1M1', 100, 50, 5), null, 'otro cuerpo');
  assert.ok(M.remove(a.id));
  assert.equal(M.of('P1').length, 0);
  for (let k = 0; k < MAX_MARKERS + 3; k++) M.add('P1', k, k);
  assert.equal(M.list.length, MAX_MARKERS);
  const snap = JSON.parse(JSON.stringify(M.snapshot()));
  const M2 = new MapMarkers({ scene, worlds });
  M2.restore([...snap, { body: 'P1', x: 'a', z: 0 }, { body: 7, x: 0, z: 0 }, null]);
  assert.equal(M2.list.length, MAX_MARKERS);
  assert.equal(M2.of('P1M1')[0].label, 'Luna base');
  M2.restore({ hack: true });
  assert.equal(M2.list.length, 0);
  assert.equal(scene.getObjectByName('map-markers').children.length, MAX_MARKERS, 'M sigue con las suyas');
});

test('cola de fabricación: más sitio y cuántas caben', () => {
  const events = new EventBus();
  const i = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory: i, events });
  assert.equal(crafting.queueRoom(), MAX_QUEUE);
  assert.ok(MAX_QUEUE >= 40);
  const id = Object.keys(C.RECIPES).find((r) => !C.RECIPES[r].STATION && (C.RECIPES[r].TIME ?? 0) > 0 && crafting.isUnlocked(r));
  for (const [item, n] of Object.entries(crafting.ingredients(id))) i.addItem(item, n * 3);
  for (let k = 0; k < 3; k++) assert.ok(crafting.craft(id));
  assert.equal(crafting.queueRoom(), MAX_QUEUE - 3);
  assert.equal(C.INPUT.KEYBINDINGS.SETTINGS[0], 'KeyP');
  assert.ok(GameEvents.SETTINGS_OPEN_REQUEST);
});

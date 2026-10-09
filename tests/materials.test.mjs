/**
 * P5 (v1.27): materiales y estaciones — arcilla y ladrillo, fibra y tela, resina, hueso,
 * oro, acero y cristal; telar, curtidor, mesa de alquimia y forja; pociones; ropa de
 * abrigo y mochilas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { HotbarSystem } from '../js/inventory/HotbarSystem.js';
import { ItemUseSystem } from '../js/inventory/ItemUseSystem.js';
import { ThirstSystem } from '../js/player/ThirstSystem.js';
import { StatusEffects } from '../js/player/StatusEffects.js';
import { FLORA_TABLE } from '../js/world/map/MapLegend.js';
import './helpers/three.mjs';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { SHAPES } = await import('../js/construction/BuildRules.js');
const { BUILD_MODELS } = await import('../js/construction/BuildModels.js');
const { buildItemModel } = await import('../js/render/ItemModels.js');
const { PropMesher } = await import('../js/world/props/PropMesher.js');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');

const STATIONS = ['LOOM', 'TANNER', 'ALCHEMY', 'FORGE'];

test('estaciones nuevas: pieza, receta, forma, modelo y recetas propias', () => {
  for (const st of STATIONS) {
    assert.ok(C.STATIONS[st], st);
    assert.equal(SHAPES[st].interact, 'CRAFT');
    assert.equal(SHAPES[st].station, st);
    assert.ok(C.ITEMS[`PIECE_${st}`] && C.RECIPES[`PIECE_${st}`], st);
    assert.ok(BUILD_MODELS[st]().positions.length > 0, st);
    assert.ok(C.BUILD.HOME_ONLY.includes(st));
    const own = Object.values(C.RECIPES).filter((r) => r.STATION === st);
    assert.ok(own.length >= 3, `${st}: ${own.length} recetas`);
  }
  // Todas las recetas usan objetos y estaciones que existen.
  for (const [id, r] of Object.entries(C.RECIPES)) {
    assert.ok(C.ITEMS[r.RESULT], id);
    for (const ing of Object.keys(r.INGREDIENTS)) assert.ok(C.ITEMS[ing], `${id}: ${ing}`);
    if (r.STATION) assert.ok(C.STATIONS[r.STATION], `${id}: ${r.STATION}`);
    assert.ok(C.RECIPE_CATEGORIES[r.CATEGORY], `${id}: ${r.CATEGORY}`);
  }
});

test('materiales: de dónde salen y para qué sirven', () => {
  const made = (id) => Object.values(C.RECIPES).some((r) => r.RESULT === id);
  const used = (id) => Object.values(C.RECIPES).some((r) => r.INGREDIENTS[id]);
  const fromWorld = (id) => Object.values(C.RESOURCE_TYPES).some((r) => r.HARVEST?.ITEM === id || r.BREAK?.ITEM === id || r.HARVEST?.BONUS?.[id])
    || Object.values(C.ANIMALS.SPECIES).some((s) => s.DROPS[id]) || Object.values(C.ENEMIES.TYPES).some((e) => e.DROPS?.[id] || e.ORE_DROP?.TYPES[id]);
  for (const id of ['CLAY', 'FIBER', 'RESIN', 'BONE', 'GOLD_ORE', 'CRYSTAL_SHARD', 'WILD_FLOWER']) {
    assert.ok(fromWorld(id), `${id} sale del mundo`);
    assert.ok(used(id), `${id} sirve para algo`);
  }
  for (const id of ['BRICK', 'CLOTH', 'STEEL', 'GOLD_INGOT', 'GLUE', 'GLASS_BOTTLE', 'DIAMOND_DUST']) {
    assert.ok(made(id), `${id} se fabrica`);
    assert.ok(used(id), `${id} sirve para algo`);
  }
  // Usos de monedas, slime, flores y diamante.
  assert.equal(C.RECIPES.GOLD_FROM_COINS.INGREDIENTS.COIN, 8);
  assert.ok(C.RECIPES.LEAP_POTION.INGREDIENTS.SLIME && C.RECIPES.GLUE.INGREDIENTS.SLIME);
  assert.ok(C.RECIPES.NIGHT_VISION_POTION.INGREDIENTS.GLOW_FLOWER && C.RECIPES.HEALING_POTION.INGREDIENTS.WILD_FLOWER);
  assert.ok(C.RECIPES.DIAMOND_DUST.INGREDIENTS.REFINED_DIAMOND);
  // Ropa de abrigo: abriga más que el cuero.
  const warm = ['WOOL_HAT', 'WOOL_SWEATER', 'WOOL_TROUSERS', 'FUR_BOOTS', 'WOOL_MITTENS'].reduce((a, id) => a + C.ITEMS[id].COLD_PROTECTION, 0);
  const leather = ['LEATHER_CAP', 'LEATHER_SHIRT', 'LEATHER_PANTS', 'LEATHER_SHOES', 'LEATHER_GLOVES'].reduce((a, id) => a + C.ITEMS[id].COLD_PROTECTION, 0);
  assert.ok(warm > leather * 1.5, `abrigo ${warm} > cuero ${leather}`);
  // Modelos: pociones (frasco) y recursos nuevos.
  for (const id of Object.keys(C.ITEMS).filter((k) => C.ITEMS[k].USE === 'POTION')) assert.ok(buildItemModel(id, C.ITEMS), id);
  const mesher = new PropMesher({ colors: C.PROPS });
  for (const t of ['CLAY_DEPOSIT', 'WILD_FLOWERS', 'GOLD_ORE', 'CRYSTAL_CLUSTER', 'BUSH']) assert.ok(mesher.nodeGeometry({ type: t, variant: 1, tint: 0.5 }), t);
  for (const table of Object.values(FLORA_TABLE)) for (const t of Object.keys(table)) assert.ok(C.RESOURCE_TYPES[t], t);
});

function kit() {
  const events = new EventBus();
  const messages = [];
  events.on(GameEvents.UI_MESSAGE, (m) => messages.push(m.text));
  const input = { blocked: false, wasPressed: () => false, isDown: () => false, setBlocked() {} };
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const thirst = new ThirstSystem({ config: C.SURVIVAL, events });
  const equipment = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory, events });
  const hotbar = new HotbarSystem({ input, inventory, events });
  const effects = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events, thirst });
  const itemUse = new ItemUseSystem({ items: C.ITEMS, equipmentConfig: C.EQUIPMENT, input, hotbar, inventory, nutrition: {}, equipment, interaction: { target: null }, thirst, events });
  return { events, messages, inventory, itemUse, effects };
}

test('mochilas: +9 huecos cada una, la grande después; se guardan con la partida', () => {
  const k = kit();
  const base = k.inventory.slots.length;
  k.inventory.addItem('LARGE_BACKPACK', 1);
  assert.equal(k.itemUse.use('LARGE_BACKPACK'), false, 'la grande va encima de la normal');
  k.inventory.addItem('BACKPACK', 1);
  assert.ok(k.itemUse.use('BACKPACK'));
  assert.equal(k.inventory.slots.length, base + 9);
  assert.equal(k.inventory.getItemCount('BACKPACK'), 0);
  assert.equal(k.itemUse.use('LARGE_BACKPACK'), true);
  assert.equal(k.inventory.slots.length, base + 18);
  // Llenar los huecos nuevos y recuperarlo todo en otra partida.
  k.inventory.addItem('STONE', 100 * 40);
  const snap = k.inventory.snapshot();
  const other = kit();
  other.inventory.restore(snap);
  assert.equal(other.inventory.slots.length, base + 18);
  assert.equal(other.inventory.getItemCount('STONE'), k.inventory.getItemCount('STONE'));
  // Datos extraños: nunca más de MAX_EXTRA_ROWS filas.
  const third = kit();
  third.inventory.restore(new Array(500).fill(['STONE', 1]));
  assert.equal(third.inventory.slots.length, base + 9 * C.INVENTORY.MAX_EXTRA_ROWS);
});

test('pociones: se beben, dejan el frasco y dan sus estados', () => {
  const k = kit();
  k.inventory.addItem('STRENGTH_POTION', 1);
  k.inventory.addItem('SWIFT_POTION', 1);
  k.inventory.addItem('LEAP_POTION', 1);
  k.inventory.addItem('WARMTH_POTION', 1);
  k.inventory.addItem('NIGHT_VISION_POTION', 1);
  const drunk = [];
  k.events.on(GameEvents.POTION_DRUNK, (e) => drunk.push(e.itemId));
  for (const id of ['STRENGTH_POTION', 'SWIFT_POTION', 'LEAP_POTION', 'WARMTH_POTION', 'NIGHT_VISION_POTION']) assert.ok(k.itemUse.use(id), id);
  assert.equal(drunk.length, 5);
  assert.equal(k.inventory.getItemCount('GLASS_BOTTLE'), 5);
  assert.equal(k.effects.damageMultiplier, C.STATUS_EFFECTS.STRENGTH.DAMAGE);
  assert.equal(k.effects.speedMultiplier, C.STATUS_EFFECTS.SWIFT.SPEED);
  assert.equal(k.effects.jumpMultiplier, C.STATUS_EFFECTS.LEAP.JUMP);
  assert.equal(k.effects.fallMultiplier, 0.5);
  assert.ok(k.effects.coldMultiplier <= 0.15);
  assert.ok(k.effects.nightVision);
  // Caducan.
  k.effects.update(1000);
  assert.equal(k.effects.damageMultiplier, 1);
  assert.equal(k.effects.nightVision, false);
  // El elixir dorado da varios a la vez (y cura: HEAL, lo aplica main).
  k.inventory.addItem('GOLDEN_ELIXIR', 1);
  k.itemUse.use('GOLDEN_ELIXIR');
  assert.ok(k.effects.has('STRENGTH') && k.effects.has('SWIFT') && k.effects.has('REGENERATION'));
  assert.ok(C.ITEMS.GOLDEN_ELIXIR.HEAL >= 100 && C.ITEMS.HEALING_POTION.HEAL > 0);
});

test('Edén: arcilla y flores en el mapa; oro y drusas de cristal en las cuevas', () => {
  const dir = new URL('../maps/eden/', import.meta.url);
  const map = MapData.fromFiles(JSON.parse(fs.readFileSync(new URL('eden.map.json', dir))), zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, maps: { [EDEN.homeId]: map }, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: 11, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS },
    },
  });
  const w = worlds.home;
  w.generate('42');
  const counts = {};
  const ids = new Set();
  const cs = C.WORLD.CHUNK_SIZE;
  const n = Math.round(w.worldSize / cs);
  for (let cz = 0; cz < n; cz += 2) {
    for (let cx = 0; cx < n; cx += 2) {
      for (const node of w.resources.getChunk(cx, cz).nodes) {
        counts[node.type] = (counts[node.type] ?? 0) + 1;
        assert.ok(!ids.has(node.id), `id repetido ${node.id}`);
        ids.add(node.id);
        if (C.RESOURCE_TYPES[node.type].CELL_ID) assert.match(node.id, /:n\d+\.\d+$/);
      }
    }
  }
  assert.ok(counts.CLAY_DEPOSIT > 30, `arcilla ${counts.CLAY_DEPOSIT}`);
  assert.ok(counts.WILD_FLOWERS > 100, `flores ${counts.WILD_FLOWERS}`);
  assert.ok(counts.BUSH > 100);
  const content = (group) => w.caves.caves.filter((c) => c.group === group).flatMap((c) => c.content);
  const crystal = content('GRUTA_CRISTAL').filter((o) => o.type === 'CRYSTAL_CLUSTER').length;
  const gold = content('MINA_VIEJA').filter((o) => o.type === 'GOLD_ORE').length;
  assert.ok(crystal >= 5, `drusas en la Gruta de Cristal: ${crystal}`);
  assert.ok(gold >= 3, `oro en la Mina Vieja: ${gold}`);
  // Dentro del túnel.
  for (const c of w.caves.caves) {
    for (const o of c.content.filter((x) => x.type === 'GOLD_ORE' || x.type === 'CRYSTAL_CLUSTER')) {
      assert.ok(w.inCave(o.x, o.y + 0.5, o.z, -0.6) || w.caveFloorAt(o.x, o.z, o.y + 0.5), `${o.type} fuera del túnel`);
    }
  }
});

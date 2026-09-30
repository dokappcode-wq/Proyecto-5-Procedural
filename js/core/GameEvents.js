/**
 * Catálogo de eventos. Tenerlos en un único sitio evita errores tipográficos
 * y documenta qué se comunica entre sistemas.
 */
export const GameEvents = Object.freeze({
  // Flujo de juego
  GAME_STARTED: 'game:started',
  POINTER_LOCK_CHANGED: 'input:pointerLockChanged', // { locked }

  // Mundo
  WORLD_GENERATED: 'world:generated',               // { seed, spawn }
  WORLD_EDGE_REACHED: 'world:edgeReached',
  WATER_DISCOVERED: 'world:waterDiscovered',        // { pond, first }
  ANIMAL_DISCOVERED: 'world:animalDiscovered',      // { species, name, namePlural }

  // Cámara
  CAMERA_MODE_CHANGED: 'camera:modeChanged',        // { mode }
  CAMERA_BODY_VISIBILITY: 'camera:bodyVisibility',  // { visible }

  // Jugador
  PLAYER_JUMPED: 'player:jumped',
  PLAYER_LANDED: 'player:landed',                   // { fallSpeed }
  PLAYER_FLY_CHANGED: 'player:flyChanged',          // { flying }
  PLAYER_BIOME_CHANGED: 'player:biomeChanged',      // { biome: { id, name, weights, temperature }, first }
  PLAYER_DAMAGED: 'player:damaged',                 // { amount, source, sourceName, fromX, fromZ }
  PLAYER_ACTION: 'player:action',                   // { kind: 'hit' | 'harvest' | 'drink' | 'miss' }
  PLAYER_DRANK: 'player:drank',                     // { source: 'POND' }
  PLAYER_STAT_CHANGED: 'player:statChanged',        // { stat, value, max, ratio, delta }
  PLAYER_STAT_LEVEL: 'player:statLevel',            // { stat, level: 'ok' | 'low' | 'critical', previous }
  PLAYER_DIED: 'player:died',                       // { cause, causeName }
  PLAYER_RESPAWN_REQUEST: 'player:respawnRequest',
  PLAYER_RESPAWNED: 'player:respawned',

  // Interacción, animales e inventario
  INTERACTION_TARGET_CHANGED: 'interaction:targetChanged', // { target: { kind, label, action } | null }
  ANIMAL_HIT: 'animal:hit',                         // { animal, killed }
  ANIMAL_KILLED: 'animal:killed',                   // { animal, drops }
  RESOURCE_HARVESTED: 'resource:harvested',         // { node, item, amount, depleted }
  INVENTORY_CHANGED: 'inventory:changed',           // { itemId, count, delta, items }
  HOTBAR_CHANGED: 'inventory:hotbarChanged',        // { selectedId }
  ITEM_USED: 'inventory:itemUsed',                  // { itemId, use }
  EQUIPMENT_CHANGED: 'inventory:equipmentChanged',  // { slot, itemId|null }

  // Alimentación
  FOOD_EATEN: 'nutrition:foodEaten',                // { itemId, foodType, hunger }
  DIET_CHANGED: 'nutrition:dietChanged',            // { state: 'UNKNOWN'|'BALANCED'|'TOO_MUCH_ANIMAL'|'TOO_MUCH_PLANT', share }

  // Fabricación, construcción y sueño
  CRAFT_REQUEST: 'crafting:request',                // { recipeId }
  ITEM_CRAFTED: 'crafting:crafted',                 // { recipeId, result, amount }
  CRAFTING_PANEL_TOGGLED: 'crafting:panelToggled',  // { open }
  STRUCTURE_PLACED: 'construction:placed',          // { structure }
  PLACEMENT_CHANGED: 'construction:placement',      // { active, valid, type }
  SLEEP_REQUEST: 'sleep:request',                   // { bed }
  PLAYER_SLEEP_STARTED: 'sleep:started',            // { bed }
  PLAYER_SLEPT: 'sleep:finished',                   // { hours, bed }

  // Admin
  ADMIN_MODE_CHANGED: 'admin:modeChanged',          // { active }
  ADMIN_PANEL_TOGGLED: 'admin:panelToggled',        // { open }

  // UI
  UI_MESSAGE: 'ui:message',                         // { text, type? }
});

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
  BUILD_MODE_CHANGED: 'construction:mode',          // { active, pieceId }
  BUILD_SELECTION_CHANGED: 'construction:selection', // { pieceId }
  PLACEMENT_CHANGED: 'construction:placement',      // { active, valid, reason, pieceId }
  STRUCTURE_PLACED: 'construction:placed',          // { structure }
  STRUCTURE_REMOVED: 'construction:removed',        // { structure }
  STRUCTURE_INTERACT: 'construction:interact',      // { structure }  (E sobre puerta/cama)
  SLEEP_REQUEST: 'sleep:request',                   // { bed }
  PLAYER_SLEEP_STARTED: 'sleep:started',            // { bed }
  PLAYER_SLEPT: 'sleep:finished',                   // { hours, bed }

  // Cuerpos (MUNDO 0, lunas, espacio)
  BODY_CHANGED: 'world:bodyChanged',                // { id, previous, planet }

  // Tiempo y temperatura (Fases 10–11)
  TIME_CHANGED: 'time:changed',                     // { day, hour, minute, totalHours, daylight, isNight }
  TIME_PERIOD_CHANGED: 'time:period',               // { period: 'DAWN'|'DAY'|'DUSK'|'NIGHT', previous }
  TEMPERATURE_CHANGED: 'temperature:changed',       // { value, ambient, target, state, frost, visibility }
  TEMPERATURE_STATE_CHANGED: 'temperature:state',   // { state: 'NORMAL'|'COLD'|'FREEZING'|'CRITICAL', previous }
  MOON_RISE: 'celestial:moonRise',                  // { id, name }

  // Espacio (Fase 13)
  SPACE_ENTER_REQUEST: 'space:enterRequest',        // { source: 'SHIP'|'ADMIN' }
  SPACE_EXIT_REQUEST: 'space:exitRequest',         // { target } aterrizar en el cuerpo cercano
  SPACE_STATE_CHANGED: 'space:state',               // { state: 'SURFACE'|'ASCENDING'|'SPACE'|'DESCENDING', previous }
  SPACE_FOCUS_CHANGED: 'space:focus',               // { id, name }  (mapa estelar)
  SPACE_AUTOPILOT: 'space:autopilot',               // { target } rumbo automático hacia un cuerpo
  GALACTIC_JUMP_ATTEMPT: 'space:galacticJump',     // la nave intenta salir del sistema con el nodo galáctico
  STAR_MAP_REQUEST: 'starMap:request',              // { open? }
  STAR_MAP_TOGGLED: 'starMap:toggled',              // { open }
  SPACE_NAV_UPDATE: 'space:nav',                    // { speed, bodies, landable, zoneWarning, powered }
  SPACE_FOCUS_REQUEST: 'space:focusRequest',        // { id }

  // Nave
  SHIP_STATE_CHANGED: 'ship:state',                 // { flight, hatch, legs, door, piloting, charge }
  SHIP_PILOT_CHANGED: 'ship:pilot',                 // { piloting }
  SHIP_COMMAND: 'ship:command',                     // { command: 'TAKEOFF'|'LAND'|'TOGGLE_HATCH'|'RETRACT_LEGS'|'DEPLOY_LEGS'|'STAND_UP' }
  SHIP_CONTROL_HOLD: 'ship:controlHold',            // { control: 'FORWARD'|'BACKWARD'|'UP'|'DOWN'|'LEFT'|'RIGHT', active }
  SHIP_PANEL_REQUEST: 'ship:panel',                 // { panel: 'MAP'|'CHARGER' }
  SHIP_BATTERY_REQUEST: 'ship:battery',             // { slot, action: 'REMOVE'|'INSERT' }
  SHIP_BATTERIES_CHANGED: 'ship:batteries',         // { slots: [{ charge }|null], total, capacity }
  SHIP_WATCH_TOGGLE: 'ship:watchToggle',            // {}  (usar el reloj de la nave)

  // Admin
  ADMIN_MODE_CHANGED: 'admin:modeChanged',          // { active }
  ADMIN_PANEL_TOGGLED: 'admin:panelToggled',        // { open }

  // UI
  UI_MESSAGE: 'ui:message',                         // { text, type? }
  UI_PANEL_TOGGLED: 'ui:panelToggled',              // { id, open }  (paneles que liberan el ratón)
});

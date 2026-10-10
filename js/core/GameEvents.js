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
  PLAYER_CROUCH_CHANGED: 'player:crouch',          // { crouching }
  PLAYER_DODGED: 'player:dodged',                  // { x, z } dirección
  GAME_SAVE_REQUEST: 'game:saveRequest',           // { reason, silent? }
  STRUCTURE_RESTORED: 'construction:restored',    // { structure } (al cargar partida)
  CHEST_OPEN: 'construction:chestOpen',           // { piece }
  PROJECTILE_HIT: 'combat:projectileHit',         // { x, y, z, target? }
  PLAYER_BLOCKED: 'combat:blocked',               // { amount } golpe parado con el escudo
  WATCH_SETTINGS_REQUEST: 'story:watchSettings',  // {}  (cambiar nombre y color del reloj)
  GAME_SAVED: 'game:saved',                        // { reason, at }
  PLAYER_CLIMB_CHANGED: 'player:climbChanged',      // { climbing } escalando una pendiente
  PLAYER_LEVEL_UP: 'player:levelUp',              // { level, points }
  PROGRESSION_CHANGED: 'player:progression',      // { level, xp, points, stats }
  PLAYER_JUMPED: 'player:jumped',
  PLAYER_LANDED: 'player:landed',                   // { fallSpeed }
  PLAYER_SWIM_CHANGED: 'player:swim',                // { swimming, underwater, surface }
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
  ENEMY_KILLED: 'enemy:killed',                     // { enemy, drops }
  ENEMY_ATTACKED: 'enemy:attacked',                 // { enemy }  (un enemigo ha descargado un golpe)
  RESOURCE_HIT: 'resource:hit',                    // { node, x, y, z, fromX, fromZ, felled } golpe a un tronco
  RESOURCE_HARVESTED: 'resource:harvested',         // { node, item, amount, depleted }
  INVENTORY_CHANGED: 'inventory:changed',           // { itemId, count, delta, items, slots, cursor }
  HOTBAR_CHANGED: 'inventory:hotbarChanged',        // { selectedId, selectedIndex }
  INVENTORY_FULL: 'inventory:full',                 // { itemId, amount, dur? } lo que no ha cabido
  TOOL_BROKEN: 'inventory:toolBroken',              // { itemId, index } una herramienta se ha gastado del todo
  ITEM_USED: 'inventory:itemUsed',                  // { itemId, use }
  ITEM_REPAIRED: 'inventory:itemRepaired',          // { itemId, dur, max } (martillo)
  INVENTORY_EXPANDED: 'inventory:expanded',         // { rows } mochila puesta (P5)
  POTION_DRUNK: 'player:potionDrunk',               // { itemId } (P5)
  STRUCTURE_INTERACT_DONE: 'construction:interactDone', // { structure } puerta/trampilla abierta o cerrada (P6)
  WELL_USE: 'construction:wellUse',                 // { piece, source: 'WELL' | 'COLLECTOR' } (P6)
  WEATHER_CHANGED: 'weather:changed',               // { state, name } (P7)
  THUNDER: 'weather:thunder',                       // { distance } (P7)
  WOLF_HOWL: 'enemies:wolfHowl',                   // { x, z } una manada aparece (P10)
  BASE_CLEARED: 'enemies:baseCleared',              // { base } (P8)
  TRADE_OPEN: 'trade:open',                         // {} E sobre el mercader (P8)
  TRADE_DONE: 'trade:done',                         // { kind: 'BUY' | 'SELL', item, amount, price } (P8)
  ORDER_DONE: 'trade:orderDone',                    // { order } (P8)
  TREASURE_FOUND: 'treasure:found',                 // { ruin, loot } (P8)
  TREASURE_MARKED: 'treasure:marked',               // { ruin } (P8)
  ACHIEVEMENT_UNLOCKED: 'progress:achievement',     // { id, def } (P8)
  FARM_CHANGED: 'farm:changed',                     // { piece, action: plant|water|fert|harvest } (P4)
  ANIMAL_TAMED: 'animal:tamed',                     // { animal } (P4)
  ANIMAL_CARE: 'animal:care',                       // { animal, action: feed|milk|shear|egg } (P4)
  FISHING_STATE: 'fishing:state',                   // { state, … } (P4)
  FISH_CAUGHT: 'fishing:caught',                    // { item, name, where } (P4)
  EQUIPMENT_CHANGED: 'inventory:equipmentChanged',  // { slot, itemId|null, slots }

  // Alimentación
  FOOD_EATEN: 'nutrition:foodEaten',                // { itemId, foodType, hunger }
  DIET_CHANGED: 'nutrition:dietChanged',            // { state: 'UNKNOWN'|'BALANCED'|'TOO_MUCH_ANIMAL'|'TOO_MUCH_PLANT', share }
  STATUS_EFFECTS_CHANGED: 'player:statusEffects',   // { effects: [{ id, name, icon, desc, left, bad }] }

  // Fabricación, construcción y sueño
  CRAFT_REQUEST: 'crafting:request',                // { recipeId }
  ITEM_CRAFTED: 'crafting:crafted',                 // { recipeId, result, amount }
  CRAFT_QUEUE_CHANGED: 'crafting:queue',          // { queue } cola de fabricación (con tiempo)
  CRAFT_STATION_OPEN: 'crafting:station',         // { station, piece } usar una estación (mesa de refinería)
  BUILD_PIECE_REQUEST: 'build:pieceRequest',      // { pieceId } entrar en el modo construcción con esa pieza
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

  // Cuerpos (planeta, lunas, espacio)
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
  SHIP_UPGRADED: 'ship:upgraded',                   // { blueprint }  (la nave crece con el nodo espacial)
  SHIP_DECOMPRESSION: 'ship:decompression',         // { ejected, inSpace }
  ESCAPE_POD_REQUEST: 'ship:escapePod',             // { pod }
  SUIT_LOCKER_REQUEST: 'ship:suitLocker',           // {}
  OXYGEN_REFILL_REQUEST: 'ship:oxygenRefill',       // { source }
  SPACE_NODE_INSTALL_REQUEST: 'ship:spaceNode',     // { slot }
  GALACTIC_NODE_INSTALL_REQUEST: 'ship:galacticNode', // { slot }

  // Objetos del mundo (nodo espacial, cofres…)
  PICKUP_TAKEN: 'pickup:taken',                     // { id, body, contents }
  MAP_OPEN_REQUEST: 'map:open',                     // {}  (usar un mapa de papel)
  SETTINGS_OPEN_REQUEST: 'settings:open',          // {}  (botón del reloj; P9)

  // Soporte vital (traje, oxígeno, burbujas, estaciones)
  LIFE_SUPPORT_CHANGED: 'life:state',               // { wearing, powered, breathable, lungs, oxygen, battery }
  SUIT_CHANGED: 'life:suit',                        // { wearing }
  BUBBLE_PLACE_REQUEST: 'bubble:place',             // { itemId }
  BUBBLE_CHANGED: 'bubble:changed',                 // { id, powered }
  BATTERY_USE_REQUEST: 'battery:use',               // { itemId }  (usar una batería plank)

  // Meteoritos y paseo espacial (Etapa 5)
  METEOR_SPAWNED: 'meteor:spawned',                 // { id, distanceKm }
  EVA_CHANGED: 'eva:changed',                       // { active }

  // Nodo galáctico, cápsulas de escape y fin de la demo (Etapa 6)
  SHIP_CRIPPLED: 'ship:crippled',                   // { crippled }  (salto galáctico fallido)
  ESCAPE_POD_LAUNCH: 'pod:launch',                  // { target }
  ESCAPE_POD_ARRIVED: 'pod:arrived',                // { target, emergency }
  DEMO_END: 'demo:end',                             // { stats }
  DEMO_RESTART: 'demo:restart',                     // {}

  // IA de la nave
  AI_SAY: 'ai:say',                                 // { text, type? }  mensaje de la IA
  HYPERSPACE_EDGE: 'hyperspace:edge',           // la nave con nodo de velocidad-luz llega al borde del sistema
  HYPERSPACE_PANEL_REQUEST: 'hyperspace:panel', // abrir la navegación hiperespacial
  HYPERSPACE_JUMP: 'hyperspace:jump',           // { entry } saltar al sistema elegido
  IMPORT_PANEL_REQUEST: 'import:panel',         // { from? } abrir el panel de importar sistemas
  HYPERSPACE_ARRIVED: 'hyperspace:arrived',     // { from } llegada tras un salto
  AI_PANEL_REQUEST: 'ai:panel',                     // {}

  // Lugares con nombre (mapas diseñados)
  PLACE_CHANGED: 'world:placeChanged',             // { name, kind: 'region'|'cave'|'room', first }

  // Jefe (sonido y efectos)
  BOSS_EVENT: 'boss:event',                         // { type, x?, y?, z? } golpe, láser, roca, grieta…

  // Admin
  ADMIN_MODE_CHANGED: 'admin:modeChanged',          // { active }
  ADMIN_PANEL_TOGGLED: 'admin:panelToggled',        // { open }

  // UI
  UI_MESSAGE: 'ui:message',                         // { text, type? }
  UI_PANEL_TOGGLED: 'ui:panelToggled',              // { id, open }  (paneles que liberan el ratón)
});

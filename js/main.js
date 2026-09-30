/**
 * main.js — raíz de composición.
 *
 * Crea los sistemas, les inyecta sus dependencias y define el ORDEN de
 * actualización. No contiene lógica de juego: si algo "hace" cosas, vive en
 * su propio sistema. Añadir un sistema nuevo = crearlo aquí y registrarlo.
 */
import { GameConfig } from './config/GameConfig.js';
import { EventBus } from './core/EventBus.js';
import { GameEvents } from './core/GameEvents.js';
import { GameLoop } from './core/GameLoop.js';
import { InputManager } from './core/InputManager.js';
import { RenderContext } from './core/RenderContext.js';
import { SceneLighting } from './world/SceneLighting.js';
import { SkyDome } from './world/SkyDome.js';
import { BiomeTracker } from './world/BiomeTracker.js';
import { DiscoveryTracker } from './world/DiscoveryTracker.js';
import { AnimalSystem } from './animals/AnimalSystem.js';
import { InventorySystem } from './inventory/InventorySystem.js';
import { InteractionSystem } from './interaction/InteractionSystem.js';
import { HealthSystem } from './player/HealthSystem.js';
import { HungerSystem } from './player/HungerSystem.js';
import { ThirstSystem } from './player/ThirstSystem.js';
import { EnergySystem } from './player/EnergySystem.js';
import { registerSurvivalTools } from './admin/tools/SurvivalTools.js';
import { NutritionSystem } from './nutrition/NutritionSystem.js';
import { CraftingSystem } from './crafting/CraftingSystem.js';
import { ConstructionSystem } from './construction/ConstructionSystem.js';
import { EquipmentSystem } from './inventory/EquipmentSystem.js';
import { HotbarSystem } from './inventory/HotbarSystem.js';
import { ItemUseSystem } from './inventory/ItemUseSystem.js';
import { SleepSystem } from './player/SleepSystem.js';
import { CraftingPanel } from './ui/CraftingPanel.js';
import { registerCraftTools } from './admin/tools/CraftTools.js';
import { WorldGenerator } from './world/WorldGenerator.js';
import { Player } from './player/Player.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraSystem } from './camera/CameraSystem.js';
import { UIManager } from './ui/UIManager.js';
import { AdminSystem } from './admin/AdminSystem.js';
import { registerCoreDebugTools } from './admin/tools/CoreDebugTools.js';
import { registerWorldTools } from './admin/tools/WorldTools.js';
import { registerLifeTools } from './admin/tools/LifeTools.js';
import { registerInventoryTools } from './admin/tools/InventoryTools.js';

function boot() {
  const cfg = GameConfig;
  const events = new EventBus();

  // ---- Infraestructura -----------------------------------------------------
  const render = new RenderContext({
    config: cfg.RENDER,
    skyConfig: cfg.SKY,
    container: document.getElementById('game-container'),
  });
  const input = new InputManager({ config: cfg.INPUT, domElement: render.domElement, events });

  // ---- Mundo procedural (MUNDO 0) -------------------------------------------
  const world = new WorldGenerator({
    scene: render.scene,
    config: cfg.WORLD,
    planet: cfg.PLANETS.MUNDO_0,
    events,
    resourceTypes: cfg.RESOURCE_TYPES,
    propColors: cfg.PROPS,
    flatShading: cfg.RENDER.TERRAIN_FLAT_SHADING,
  });
  // Seed: ?seed=... en la URL o la seed por defecto de la configuración.
  const urlSeed = new URLSearchParams(window.location.search).get('seed');

  // ---- Ambiente: luz y cielo comparten la dirección del sol -----------------
  const lighting = new SceneLighting({ scene: render.scene, renderConfig: cfg.RENDER, config: cfg.LIGHTING });
  const sky = new SkyDome({ scene: render.scene, camera: render.camera, config: cfg.SKY, radius: cfg.RENDER.FAR * 0.9 });
  sky.setSunDirection(lighting.sunDirection);

  // ---- Jugador y cámara ----------------------------------------------------
  const player = new Player({ config: cfg.PLAYER, scene: render.scene });
  const controller = new PlayerController({
    config: cfg.PLAYER,
    look: { sensitivity: cfg.INPUT.MOUSE_SENSITIVITY, invertY: cfg.INPUT.INVERT_Y },
    input,
    player,
    terrain: world,
    // Obstáculos: recursos (troncos, rocas) + construcciones (postes del refugio).
    obstacles: {
      resolveCollisions: (pos, r) => {
        const a = world.resources?.resolveCollisions(pos, r) ?? false;
        const b = construction?.resolveCollisions(pos, r) ?? false;
        return a || b;
      },
    },
    events,
  });
  const camera = new CameraSystem({
    config: cfg.CAMERA,
    camera: render.camera,
    input,
    target: player,
    terrain: world,
    events,
  });
  lighting.follow(player.position);
  world.follow(player.position);

  const biomeTracker = new BiomeTracker({ world, target: player, events });

  // ---- Mundo vivo: animales y descubrimientos ------------------------------
  const animals = new AnimalSystem({
    config: cfg.ANIMALS,
    fauna: cfg.PLANETS.MUNDO_0.FAUNA,
    scene: render.scene,
    world,
    player,
    events,
    hitKnockback: cfg.INTERACTION.HIT_KNOCKBACK,
  });
  const discovery = new DiscoveryTracker({
    world,
    animals,
    target: player,
    events,
    waterDistance: cfg.PLANETS.MUNDO_0.WATER.DISCOVERY_DISTANCE,
    animalDistance: cfg.ANIMALS.DISCOVERY_DISTANCE,
    species: cfg.ANIMALS.SPECIES,
  });

  // Cada vez que se (re)genera el mundo, el jugador aparece en el spawn de esa seed.
  events.on(GameEvents.WORLD_GENERATED, () => controller.spawn());

  // ---- Inventario e interacción (recoger, golpear) --------------------------
  const inventory = new InventorySystem({ items: cfg.ITEMS, events });
  const hotbar = new HotbarSystem({ input, inventory, events });
  const equipment = new EquipmentSystem({ items: cfg.ITEMS, config: cfg.EQUIPMENT, inventory, events });
  const crafting = new CraftingSystem({ recipes: cfg.RECIPES, items: cfg.ITEMS, inventory, events });
  const construction = new ConstructionSystem({
    scene: render.scene,
    config: cfg.CONSTRUCTION,
    structures: cfg.STRUCTURES,
    items: cfg.ITEMS,
    world,
    player,
    input,
    hotbar,
    inventory,
    events,
  });
  events.on(GameEvents.EQUIPMENT_CHANGED, ({ slot, itemId }) => {
    if (slot === 'BODY') player.model.setArmor(itemId === 'LEATHER_ARMOR');
  });
  const interaction = new InteractionSystem({
    config: cfg.INTERACTION,
    resourceTypes: cfg.RESOURCE_TYPES,
    input,
    camera: render.camera,
    player,
    world,
    animals,
    inventory,
    events,
    construction,
  });
  events.on(GameEvents.PLAYER_ACTION, ({ kind }) => kind !== 'drink' && player.playAction());

  // ---- Supervivencia: cuatro sistemas independientes -----------------------
  const S = cfg.SURVIVAL;
  const hunger = new HungerSystem({ config: S, events });
  const thirst = new ThirstSystem({ config: S, events });
  const energy = new EnergySystem({ config: S, events, player });
  const health = new HealthSystem({
    config: S,
    events,
    // Solo se cura si está bien alimentado, hidratado y (Fase 7) con dieta equilibrada.
    canRegenerate: () =>
      hunger.ratio >= S.HEALTH_REGEN_MIN_RATIO &&
      thirst.ratio >= S.HEALTH_REGEN_MIN_RATIO &&
      !(cfg.NUTRITION.UNBALANCED_BLOCKS_REGEN && nutrition.isUnbalanced),
  });

  // ---- Alimentación, uso de objetos y sueño (Fases 7–9) ----------------------
  const nutrition = new NutritionSystem({ config: cfg.NUTRITION, items: cfg.ITEMS, hunger, events });
  events.on(GameEvents.DIET_CHANGED, () => {
    hunger.decayMultiplier = nutrition.isUnbalanced ? cfg.NUTRITION.UNBALANCED_HUNGER_DECAY_MULTIPLIER : 1;
  });
  const itemUse = new ItemUseSystem({
    items: cfg.ITEMS,
    equipmentConfig: cfg.EQUIPMENT,
    input,
    hotbar,
    inventory,
    nutrition,
    equipment,
    construction,
    interaction,
    thirst,
    events,
  });
  const sleep = new SleepSystem({ config: cfg.SLEEP, energy, hunger, thirst, input, events });
  // Dormir en una cama la convierte en punto de reaparición.
  let respawnBed = null;
  events.on(GameEvents.PLAYER_SLEPT, ({ bed }) => {
    if (bed && cfg.SLEEP.SETS_RESPAWN) respawnBed = bed;
  });
  events.on(GameEvents.WORLD_GENERATED, () => (respawnBed = null));
  const needs = [hunger, thirst, energy];
  const setNeedsPaused = (paused) => needs.forEach((n) => (n.paused = paused));

  // Los ataques con origen (animales) empujan al jugador.
  events.on(GameEvents.PLAYER_DAMAGED, ({ fromX, fromZ }) => {
    if (fromX !== undefined && !health.dead) controller.applyKnockback(fromX, fromZ, cfg.INTERACTION.DAMAGE_KNOCKBACK);
  });
  // La energía decide si se puede correr y a qué velocidad.
  events.on(GameEvents.PLAYER_STAT_CHANGED, ({ stat }) => {
    if (stat === 'ENERGY') controller.setMovementModifiers(energy.getMovementModifiers());
  });
  // Muerte y reaparición.
  events.on(GameEvents.PLAYER_DIED, () => {
    input.setBlocked('dead', true);
    setNeedsPaused(true);
  });
  events.on(GameEvents.PLAYER_RESPAWNED, () => {
    if (respawnBed && construction.exists(respawnBed)) {
      controller.placeAt(respawnBed.x + Math.cos(respawnBed.rotation) * 1.4, respawnBed.z - Math.sin(respawnBed.rotation) * 1.4);
    } else {
      controller.spawn();
    }
    hunger.set(S.RESPAWN_VALUES.HUNGER);
    thirst.set(S.RESPAWN_VALUES.THIRST);
    energy.set(S.RESPAWN_VALUES.ENERGY);
    if (!S.KEEP_INVENTORY_ON_DEATH) inventory.clear();
    setNeedsPaused(false);
    input.setBlocked('dead', false);
  });

  // Sin entrada de juego ni desgaste hasta pulsar "Entrar".
  input.setBlocked('start-screen', true);
  setNeedsPaused(true);
  events.on(GameEvents.GAME_STARTED, () => {
    input.setBlocked('start-screen', false);
    setNeedsPaused(false);
  });

  // Presentación: el cuerpo se oculta cuando la cámara está "dentro" de la cabeza.
  events.on(GameEvents.CAMERA_BODY_VISIBILITY, ({ visible }) => player.setBodyVisible(visible));

  // ---- Interfaz y herramientas --------------------------------------------
  const ui = new UIManager({
    config: cfg.UI,
    gameInfo: cfg.GAME,
    items: cfg.ITEMS,
    equipmentConfig: cfg.EQUIPMENT,
    events,
    input,
    canvas: render.domElement,
  });
  const craftingPanel = new CraftingPanel({ container: document.getElementById('hud'), crafting, input, events });
  ui.setInitialCameraMode(camera.mode);
  [health, hunger, thirst, energy].forEach((s) => s.emitState()); // pinta las barras iniciales

  // Generación inicial: después de crear los oyentes (UI, tracker) y antes de las
  // herramientas Admin, que leen los biomas del mundo generado.
  world.generate(urlSeed ?? cfg.WORLD.DEFAULT_SEED);

  const admin = new AdminSystem({ config: cfg.ADMIN, input, events, container: document.body });
  registerWorldTools(admin, { world, player, controller });
  registerLifeTools(admin, { world, animals, player, controller, species: cfg.ANIMALS.SPECIES });
  registerInventoryTools(admin, { inventory, items: cfg.ITEMS });
  registerSurvivalTools(admin, { health, hunger, thirst, energy, events });
  registerCraftTools(admin, { nutrition, equipment, construction, player, events });
  registerCoreDebugTools(admin, { player, controller, camera });

  // ---- Bucle: el orden de registro es el orden de actualización ----------
  const loop = new GameLoop({ maxDelta: cfg.RENDER.MAX_DELTA, render: () => render.render() });
  loop.add(world);       // carga/descarga progresiva de chunks
  loop.add(controller);  // entrada → física del jugador
  loop.add(player);      // sincroniza y anima el modelo
  loop.add(camera);      // coloca la cámara a partir del jugador
  loop.add(hotbar);      // teclas 1–9
  loop.add(construction); // vista previa de colocación
  loop.add(interaction); // objetivo de la mira + recoger/golpear
  loop.add(itemUse);     // usar objeto seleccionado (comer, beber, equipar, colocar)
  loop.add(animals);     // simula y dibuja animales cercanos
  loop.add(hunger);      // supervivencia: desgaste por tiempo y actividad
  loop.add(thirst);
  loop.add(energy);
  loop.add(health);      // curación, cuenta atrás de reaparición
  loop.add(nutrition);   // la dieta "olvida" poco a poco lo comido
  loop.add(sleep);
  loop.add(biomeTracker); // bioma actual del jugador
  loop.add(discovery);   // agua y animales descubiertos
  loop.add(lighting);    // sombra centrada en el jugador
  loop.add(sky);         // cúpula centrada en la cámara
  loop.add(ui);
  loop.add(craftingPanel);
  loop.add(admin);
  loop.add(input);       // lateUpdate: limpia el estado por frame

  loop.start();

  // Acceso de depuración desde la consola del navegador (solo desarrollo).
  window.__MUNDO0__ = { config: cfg, events, render, input, world, lighting, sky, biomeTracker, animals, discovery, inventory, interaction, health, hunger, thirst, energy, nutrition, hotbar, equipment, crafting, construction, itemUse, sleep, player, controller, camera, ui, admin, loop };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal-error');
  el.textContent = `No se pudo iniciar MUNDO 0: ${err.message}. ¿Tu navegador soporta WebGL?`;
  el.classList.remove('hidden');
}

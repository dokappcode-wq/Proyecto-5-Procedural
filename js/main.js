/**
 * main.js — raíz de composición.
 *
 * Crea los sistemas, les inyecta sus dependencias y define el ORDEN de
 * actualización. No contiene lógica de juego: si algo "hace" cosas, vive en
 * su propio sistema. Añadir un sistema nuevo = crearlo aquí y registrarlo.
 */
import * as THREE from 'three';
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
import { WorldManager, HOME } from './world/WorldManager.js';
import { createPlanetTextures } from './space/PlanetTexture.js';
import { Player } from './player/Player.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraSystem } from './camera/CameraSystem.js';
import { UIManager } from './ui/UIManager.js';
import { AdminSystem } from './admin/AdminSystem.js';
import { registerCoreDebugTools } from './admin/tools/CoreDebugTools.js';
import { registerWorldTools } from './admin/tools/WorldTools.js';
import { registerLifeTools } from './admin/tools/LifeTools.js';
import { registerInventoryTools } from './admin/tools/InventoryTools.js';
import { TimeSystem } from './time/TimeSystem.js';
import { AtmosphereSystem } from './time/AtmosphereSystem.js';
import { TemperatureSystem } from './player/TemperatureSystem.js';
import { CelestialSystem } from './celestial/CelestialSystem.js';
import { StarMap } from './space/StarMap.js';
import { StarMapHUD } from './ui/StarMapHUD.js';
import { SpaceHUD } from './ui/SpaceHUD.js';
import { SpaceWorld } from './space/SpaceWorld.js';
import { SpaceView, SPACE_SUN_DIR } from './space/SpaceView.js';
import { SpaceTravel } from './space/SpaceTravel.js';
import { SeededRandom } from './core/SeededRandom.js';
import { registerSpaceTools } from './admin/tools/SpaceTools.js';
import { ShipSystem } from './ship/ShipSystem.js';
import { overlapsFootprint, LEGS, RAMP_FOOT_SAMPLE, toWorld as toShipWorld } from './ship/ShipLayout.js';
import { PlanetMapRenderer } from './ui/PlanetMapRenderer.js';
import { ShipMapPanel } from './ui/ShipMapPanel.js';
import { ShipChargerPanel } from './ui/ShipChargerPanel.js';
import { ShipPilotHUD } from './ui/ShipPilotHUD.js';
import { ShipWatchHUD } from './ui/ShipWatchHUD.js';
import { registerEnvironmentTools } from './admin/tools/EnvironmentTools.js';
import { registerShipTools } from './admin/tools/ShipTools.js';

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

  // ---- Mundos: MUNDO 0 y sus lunas (cada uno conserva su estado) -------------
  const worlds = new WorldManager({
    scene: render.scene,
    planets: cfg.PLANETS,
    events,
    options: {
      config: cfg.WORLD,
      resourceTypes: cfg.RESOURCE_TYPES,
      propColors: cfg.PROPS,
      flatShading: cfg.RENDER.TERRAIN_FLAT_SHADING,
      // La nave aparece aterrizada cerca del inicio, en un claro sin árboles.
      landing: { DISTANCE: cfg.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: cfg.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
    },
  });
  // Todos los sistemas consultan el cuerpo ACTIVO a través de este proxy.
  const world = worlds.proxy;
  // Seed: ?seed=... en la URL o la seed por defecto de la configuración.
  const urlSeed = new URLSearchParams(window.location.search).get('seed');

  // ---- Ambiente: luz y cielo comparten la dirección del sol -----------------
  const lighting = new SceneLighting({ scene: render.scene, renderConfig: cfg.RENDER, config: cfg.LIGHTING });
  const sky = new SkyDome({ scene: render.scene, camera: render.camera, config: cfg.SKY, radius: cfg.RENDER.FAR * 0.9 });
  sky.setSunDirection(lighting.sunDirection);
  // Día y noche (Fase 11): TimeSystem calcula la hora; AtmosphereSystem la aplica a luz, cielo y niebla.
  const time = new TimeSystem({ config: cfg.TIME, events });
  // Sol y dos lunas (Fase 12): TimeSystem da la hora; la luz de noche viene de la luna visible.
  const celestial = new CelestialSystem({ config: cfg.CELESTIAL, time, scene: render.scene, camera: render.camera, events });
  const atmosphere = new AtmosphereSystem({
    time, lighting, sky, celestial, scene: render.scene, palette: cfg.TIME.PALETTE, renderConfig: cfg.RENDER,
  });

  // Estructuras en las que se camina y que bloquean: construcciones + nave.
  // (Se crean más abajo; estas funciones solo se llaman durante el bucle.)
  const structureSources = () => [construction, ship];
  const combinedStructures = {
    surfaceAt: (x, z, maxY) => {
      let best = null;
      for (const s of structureSources()) {
        const v = s.surfaceAt(x, z, maxY);
        if (v !== null && (best === null || v > best)) best = v;
      }
      return best;
    },
    blocksAt: (x, z, r, y0, y1) => structureSources().some((s) => s.blocksAt(x, z, r, y0, y1)),
    ceilingAt: (x, z, y) => Math.min(...structureSources().map((s) => s.ceilingAt(x, z, y))),
    resolveCollisions: (pos, r, y0, y1) => {
      let hit = false;
      for (const s of structureSources()) if (s.resolveCollisions(pos, r, y0, y1)) hit = true;
      return hit;
    },
    raycastDistance: (o, d, max) => {
      const hits = structureSources().map((s) => s.raycastDistance(o, d, max)).filter((v) => v !== null);
      return hits.length ? Math.min(...hits) : null;
    },
  };

  // ---- Jugador y cámara ----------------------------------------------------
  const player = new Player({ config: cfg.PLAYER, scene: render.scene });
  const controller = new PlayerController({
    config: cfg.PLAYER,
    look: { sensitivity: cfg.INPUT.MOUSE_SENSITIVITY, invertY: cfg.INPUT.INVERT_Y },
    input,
    player,
    terrain: world,
    // Obstáculos: recursos (troncos, rocas) + construcciones y nave (paredes, patas...).
    obstacles: {
      resolveCollisions: (pos, r, y0, y1) => {
        const a = world.resources?.resolveCollisions(pos, r) ?? false;
        const b = combinedStructures.resolveCollisions(pos, r, y0, y1);
        return a || b;
      },
    },
    // Superficies: suelos, cimientos, escaleras y tejados construidos; suelo y rampa de la nave.
    structures: combinedStructures,
    events,
  });
  const camera = new CameraSystem({
    config: cfg.CAMERA,
    camera: render.camera,
    input,
    target: player,
    terrain: world,
    events,
    occluders: { raycastDistance: (o, d, max) => combinedStructures.raycastDistance(o, d, max) },
  });
  lighting.follow(player.position);
  worlds.follow(player.position);

  const biomeTracker = new BiomeTracker({ world, target: player, events });

  // ---- Mundo vivo: animales y descubrimientos ------------------------------
  const animals = new AnimalSystem({
    config: cfg.ANIMALS,
    fauna: cfg.PLANETS.MUNDO_0.FAUNA,
    scene: render.scene,
    world: worlds.home, // los animales viven en MUNDO 0
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
  // Construcción modular (B): paredes, suelos, puertas, ventanas, vallas, pilares...
  const construction = new ConstructionSystem({
    scene: render.scene,
    camera: render.camera,
    config: cfg.BUILD,
    world,
    player,
    input,
    inventory,
    items: cfg.ITEMS,
    events,
  });
  // Nave pequeña: estructura en la que se entra y con la que se vuela (Tecnologías 1–3).
  const ship = new ShipSystem({
    config: cfg.SHIP,
    spaceConfig: cfg.SPACE,
    scene: render.scene,
    world,
    player,
    input,
    events,
    // No aterrizar encima de árboles ni construcciones; una roca solo estorba bajo una pata o la rampa
    // (el casco está a 2,2 m del suelo y las rocas son más bajas).
    landingBlocked: (s) => {
      const supports = [...LEGS.map((l) => [l.x, l.z]), RAMP_FOOT_SAMPLE].map(([lx, lz]) => toShipWorld(s, lx, lz));
      for (const n of world.resources.getNodesNear(s.x, s.z, 12)) {
        const r = n.radius;
        if (!(r > 0)) continue;
        if (n.type === 'ROCK') {
          if (supports.some(([x, z]) => Math.hypot(n.x - x, n.z - z) < r + 0.6)) return 'Hay una roca bajo las patas: busca un sitio despejado';
        } else if (overlapsFootprint(s, { minX: n.x - r, maxX: n.x + r, minZ: n.z - r, maxZ: n.z + r })) {
          return 'Hay árboles debajo: busca un claro para aterrizar';
        }
      }
      for (const p of construction.pieces) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < 12 && overlapsFootprint(s, { minX: p.x - 1, maxX: p.x + 1, minZ: p.z - 1, maxZ: p.z + 1 })) {
          return 'Hay construcciones debajo';
        }
      }
      return null;
    },
  });
  ship.setInventory(inventory);
  ship.setBodyProvider(() => worlds.activeId);
  construction.addBlocker(ship); // no se construye encima de la nave
  // Las vallas, paredes y patas de la nave también frenan a los animales.
  animals.setObstacles({ resolveCollisions: (pos, r, y0, y1) => combinedStructures.resolveCollisions(pos, r, y0, y1) });
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
    providers: [ship], // botones, puerta, asiento y tecnologías de la nave
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
    interaction,
    thirst,
    events,
  });
  // En modo construcción el clic coloca/quita piezas: se pausan la barra de
  // objetos, "usar" y la interacción normal (recoger, golpear).
  events.on(GameEvents.BUILD_MODE_CHANGED, ({ active }) => {
    hotbar.enabled = !active;
    itemUse.enabled = !active;
    interaction.enabled = !active;
    if (!active) interaction.resetTarget();
  });
  // Control a pie del jugador: se suspende a los mandos de la nave y en el espacio.
  const controlLocks = new Set();
  const setControlLock = (reason, locked) => {
    if (locked) controlLocks.add(reason);
    else controlLocks.delete(reason);
    if (locked) construction.setActive(false);
    for (const s of [controller, hotbar, itemUse, interaction, construction, craftingPanel]) s.enabled = controlLocks.size === 0;
    if (!controlLocks.size) interaction.resetTarget();
  };
  // A los mandos de la nave: el jugador no camina ni usa objetos; la cámara sigue a la nave.
  events.on(GameEvents.SHIP_PILOT_CHANGED, ({ piloting }) => {
    setControlLock('pilot', piloting);
    camera.setVehicleView(piloting ? ship.view : null);
    player.setBodyVisible(!piloting && camera.mode === 'THIRD_PERSON');
    if (!piloting) interaction.resetTarget();
  });
  const sleep = new SleepSystem({ config: cfg.SLEEP, energy, hunger, thirst, input, events });
  // Dormir en una cama la convierte en punto de reaparición.
  let respawnBed = null;
  events.on(GameEvents.PLAYER_SLEPT, ({ bed }) => {
    if (bed && cfg.SLEEP.SETS_RESPAWN) respawnBed = bed;
  });
  events.on(GameEvents.WORLD_GENERATED, () => (respawnBed = null));
  // Temperatura oculta (Fase 10): bioma, altura, noche, armadura y refugio (casa o nave).
  const temperature = new TemperatureSystem({
    config: cfg.TEMPERATURE,
    biomes: cfg.PLANETS.MUNDO_0.BIOMES,
    world,
    time,
    player,
    equipment,
    shelter: {
      getShelterAt: (x, y, z) => {
        const a = construction.getShelterAt(x, y, z);
        const b = ship.getShelterAt(x, y, z);
        return { factor: Math.max(a.factor, b.factor), heated: !!b.heated };
      },
    },
    events,
  });
  // Al congelarse se ve menos (la niebla se acerca poco a poco).
  events.on(GameEvents.TEMPERATURE_CHANGED, ({ visibility }) => atmosphere.setVisibility(visibility));

  const needs = [hunger, thirst, energy, temperature, time];
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
    if (worlds.activeId !== HOME) {
      // Fuera de MUNDO 0: dentro de la nave si está aquí; si no, en la zona de aterrizaje.
      if (ship.present) {
        const r = ship.getRespawnPoint();
        player.teleport(r.x, r.y, r.z);
      } else {
        controller.spawn();
      }
    } else if (respawnBed && construction.exists(respawnBed)) {
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
  events.on(GameEvents.CAMERA_BODY_VISIBILITY, ({ visible }) => player.setBodyVisible(visible && !ship.piloting));

  // ---- Interfaz y herramientas --------------------------------------------
  const ui = new UIManager({
    config: cfg.UI,
    gameInfo: cfg.GAME,
    items: cfg.ITEMS,
    equipmentConfig: cfg.EQUIPMENT,
    buildConfig: cfg.BUILD,
    events,
    input,
    canvas: render.domElement,
  });
  const hudRoot = document.getElementById('hud');
  const craftingPanel = new CraftingPanel({ container: hudRoot, crafting, input, events });

  // Tecnologías de la nave: mapa (y mapa planetario) y puesto de carga; mandos de vuelo.
  const planetMap = new PlanetMapRenderer({
    world: worlds.home,
    planet: cfg.PLANETS.MUNDO_0,
    worldSize: cfg.WORLD.WORLD_SIZE,
    resolution: cfg.SHIP.MAP_RESOLUTION,
  });
  // Mapas de las lunas (se dibujan la primera vez que se visitan).
  const moonMaps = new Map();
  const mapOf = (id) => {
    if (id === HOME || !cfg.PLANETS[id]) return planetMap;
    if (!moonMaps.has(id)) {
      moonMaps.set(id, new PlanetMapRenderer({
        world: worlds.get(id), planet: cfg.PLANETS[id], worldSize: cfg.WORLD.WORLD_SIZE, resolution: cfg.SHIP.MAP_RESOLUTION,
      }));
    }
    return moonMaps.get(id);
  };
  const maps = {
    name: 'planetMaps',
    update() {
      planetMap.update();
      if (worlds.activeId !== HOME && cfg.PLANETS[worlds.activeId]) mapOf(worlds.activeId).update();
    },
  };
  // Textura de MUNDO 0 visto desde fuera (lunas, espacio): se crea una vez por seed.
  let planetTextures = null;
  const getPlanetTextures = () => {
    const seed = worlds.home.seed.sub.celestial;
    if (!planetTextures || planetTextures.seed !== seed || (!planetTextures.withMap && planetMap.ready)) {
      const t = createPlanetTextures({
        width: cfg.SPACE.TEXTURE_WIDTH, seed, mapCanvas: planetMap.ready ? planetMap.canvas : null, planet: cfg.PLANETS.MUNDO_0,
      });
      const toTex = (c) => Object.assign(new THREE.CanvasTexture(c), { colorSpace: THREE.SRGBColorSpace });
      planetTextures = { seed, withMap: planetMap.ready, surface: toTex(t.surface), clouds: toTex(t.clouds) };
    }
    return planetTextures;
  };
  events.on(GameEvents.WORLD_GENERATED, () => {
    planetMap.reset();
    moonMaps.clear();
    time.reset();
    celestial.setSeed(worlds.home.seed.sub.celestial);
  });

  // Cambio de cuerpo (MUNDO 0 ↔ lunas ↔ espacio): cada sistema se adapta a él.
  events.on(GameEvents.BODY_CHANGED, ({ id, planet }) => {
    construction.setBody(id);
    animals.setActive(id === HOME);
    controller.gravityScale = planet?.GRAVITY_SCALE ?? 1;
    atmosphere.setAirless(planet?.BREATHABLE === false);
    celestial.setObserver(id, id !== HOME && id !== 'SPACE' ? getPlanetTextures().surface : null);
    // Espacio: sol fijo, sin horizonte, nebulosa con colores de la seed.
    const inSpace = id === 'SPACE';
    atmosphere.setFixedSun(inSpace ? SPACE_SUN_DIR : null);
    const rng = new SeededRandom(worlds.home.seed.value ^ 0x9eb);
    const hue = () => new THREE.Color().setHSL(rng.next(), 0.55, 0.35);
    sky.setSpace(inSpace, { colorA: hue(), colorB: hue(), axis: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)) });
  });
  const mapTexture = new THREE.CanvasTexture(planetMap.canvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;
  planetMap.onReady = () => {
    mapTexture.needsUpdate = true;
    ship.model.setMapTexture(mapTexture);
  };
  const shipMapPanel = new ShipMapPanel({
    container: hudRoot,
    input,
    events,
    sources: {
      get map() {
        return mapOf(worlds.activeId);
      },
      world,
      player,
      ship,
      time,
      get planetConfig() {
        return worlds.profile() ?? cfg.PLANETS.MUNDO_0;
      },
      getCatalog: () => celestial.catalog,
      getBed: () => (respawnBed && construction.exists(respawnBed) ? respawnBed : null),
      spaceNodeRequired: cfg.SHIP.SPACE_NODE_REQUIRED,
      hasSpaceNode: () => ship.hasSpaceNode,
    },
  });
  const shipChargerPanel = new ShipChargerPanel({
    container: hudRoot,
    input,
    events,
    ship,
    inventory,
    items: cfg.ITEMS,
    config: cfg.SHIP,
  });
  events.on(GameEvents.SHIP_PANEL_REQUEST, ({ panel }) => {
    if (panel === 'MAP') shipMapPanel.setOpen(true);
    else if (panel === 'CHARGER') shipChargerPanel.setOpen(true);
  });
  new ShipPilotHUD({ container: hudRoot, events, shipName: cfg.SHIP.NAME });

  // El espacio: un "cuerpo" sin suelo donde la nave vuela entre MUNDO 0 y sus lunas.
  worlds.registerExtra('SPACE', new SpaceWorld({ getSeed: () => worlds.home.seed }));
  const noonHour = (cfg.TIME.SUNRISE_HOUR + cfg.TIME.SUNSET_HOUR) / 2;
  const spaceView = new SpaceView({ scene: render.scene, config: cfg.SPACE, celestialConfig: cfg.CELESTIAL });
  const spaceTravel = new SpaceTravel({
    config: cfg.SPACE,
    events,
    worlds,
    ship,
    time,
    camera: render.camera,
    view: spaceView,
    sources: {
      getCatalog: () => celestial.catalog,
      getTextures: () => getPlanetTextures(),
      getSeed: () => worlds.home.seed.sub.celestial,
      noonHour,
    },
  });
  // Solo durante los fundidos se suspende el control (en el espacio se pilota o se camina por la nave).
  events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => setControlLock('space', state === 'ASCENDING' || state === 'DESCENDING'));
  const spaceHUD = new SpaceHUD({ container: hudRoot, events, travel: spaceTravel });

  // Mapa estelar 3D (tecnología Mapa): la escena espacial "de mapa".
  const starMap = new StarMap({
    config: cfg.SPACE,
    celestialConfig: cfg.CELESTIAL,
    render,
    input,
    events,
    time,
    sources: {
      getCatalog: () => celestial.catalog,
      getMapCanvas: () => (planetMap.ready ? planetMap.canvas : null),
      getSeed: () => worlds.home.seed.sub.celestial,
      planet: cfg.PLANETS.MUNDO_0,
      noonHour,
      getShipLocation: () => spaceTravel.getShipLocation(),
    },
  });
  events.on(GameEvents.STAR_MAP_TOGGLED, ({ open }) => setControlLock('starmap', open));
  const starMapHUD = new StarMapHUD({ container: hudRoot, events, map: starMap, spaceNodeRequired: cfg.SHIP.SPACE_NODE_REQUIRED });
  // Reloj de la nave: se coge en el laboratorio; al usarlo muestra dónde está la nave.
  const shipWatch = new ShipWatchHUD({ container: hudRoot, events, player, ship, time, inventory, watchItem: cfg.SHIP.WATCH_ITEM });
  ui.setInitialCameraMode(camera.mode);
  [health, hunger, thirst, energy].forEach((s) => s.emitState()); // pinta las barras iniciales

  // Generación inicial: después de crear los oyentes (UI, tracker) y antes de las
  // herramientas Admin, que leen los biomas del mundo generado.
  world.generate(urlSeed ?? cfg.WORLD.DEFAULT_SEED);

  const loop = new GameLoop({ maxDelta: cfg.RENDER.MAX_DELTA, render: () => render.render() });
  const admin = new AdminSystem({ config: cfg.ADMIN, input, events, container: document.body });
  registerWorldTools(admin, { world, player, controller });
  registerLifeTools(admin, { world, animals, player, controller, species: cfg.ANIMALS.SPECIES });
  registerInventoryTools(admin, { inventory, items: cfg.ITEMS });
  registerSurvivalTools(admin, { health, hunger, thirst, energy, events });
  registerCraftTools(admin, { nutrition, equipment, construction, inventory, events });
  registerEnvironmentTools(admin, { time, temperature });
  registerShipTools(admin, { ship, player, controller, inventory, world, events });
  registerSpaceTools(admin, { celestial, travel: spaceTravel, starMap, ship, time, player, events, worlds, controller });
  registerCoreDebugTools(admin, { player, controller, camera, loop, renderer: render.renderer });

  // ---- Bucle: el orden de registro es el orden de actualización ----------
  loop.add(worlds);      // carga/descarga progresiva de chunks del cuerpo activo
  loop.add(time);        // reloj del mundo (Fase 11)
  loop.add(ship);        // nave: mandos, vuelo, compuerta, patas (coloca al piloto en su asiento)
  loop.add(controller);  // entrada → física del jugador
  loop.add(player);      // sincroniza y anima el modelo
  loop.add(camera);      // coloca la cámara a partir del jugador
  loop.add(hotbar);      // teclas 1–9
  loop.add(construction); // modo construcción: apuntar, vista previa, colocar/quitar
  loop.add(interaction); // objetivo de la mira + recoger/golpear
  loop.add(itemUse);     // usar objeto seleccionado (comer, beber, equipar, colocar)
  loop.add(animals);     // simula y dibuja animales cercanos
  loop.add(hunger);      // supervivencia: desgaste por tiempo y actividad
  loop.add(thirst);
  loop.add(energy);
  loop.add(temperature); // temperatura oculta: frío, congelación, daño (Fase 10)
  loop.add(health);      // curación, cuenta atrás de reaparición
  loop.add(nutrition);   // la dieta "olvida" poco a poco lo comido
  loop.add(sleep);
  loop.add(biomeTracker); // bioma actual del jugador
  loop.add(discovery);   // agua y animales descubiertos
  loop.add(atmosphere);  // luz, cielo, estrellas y niebla según la hora
  loop.add(lighting);    // sombra centrada en el jugador
  loop.add(sky);         // cúpula centrada en la cámara
  loop.add(celestial);   // lunas en el cielo (tras la cámara: se colocan respecto a ella)
  loop.add(spaceTravel); // viaje por el espacio (tras la cámara: dibuja los cuerpos respecto a ella)
  loop.add(starMap);     // mapa estelar 3D
  loop.add(maps);        // mapas de MUNDO 0 y de la luna actual (se dibujan poco a poco)
  loop.add(ui);
  loop.add(spaceHUD);
  loop.add(starMapHUD);
  loop.add(craftingPanel);
  loop.add(shipMapPanel);
  loop.add(shipChargerPanel);
  loop.add(shipWatch);
  loop.add(admin);
  loop.add(input);       // lateUpdate: limpia el estado por frame

  loop.start();

  // Acceso de depuración desde la consola del navegador (solo desarrollo).
  window.__MUNDO0__ = {
    config: cfg, events, render, input, world, lighting, sky, biomeTracker, animals, discovery, inventory, interaction,
    health, hunger, thirst, energy, nutrition, hotbar, equipment, crafting, construction, itemUse, sleep, player,
    controller, camera, ui, admin, loop, time, atmosphere, temperature, ship, planetMap, shipMapPanel, shipChargerPanel, shipWatch,
    worlds,
    celestial, spaceTravel, spaceView, starMap, spaceHUD, starMapHUD,
  };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal-error');
  el.textContent = `No se pudo iniciar MUNDO 0: ${err.message}. ¿Tu navegador soporta WebGL?`;
  el.classList.remove('hidden');
}

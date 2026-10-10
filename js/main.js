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
import { EnemySystem } from './enemies/EnemySystem.js';
import { StaticColliders } from './story/StaticColliders.js';
import { StoryUI } from './story/StoryUI.js';
import { StorySystem } from './story/StorySystem.js';
import { labLayout } from './story/LabLayout.js';
import { StoryPart2 } from './story/StoryPart2.js';
import { InventorySystem } from './inventory/InventorySystem.js';
import { InteractionSystem } from './interaction/InteractionSystem.js';
import { HealthSystem } from './player/HealthSystem.js';
import { HungerSystem } from './player/HungerSystem.js';
import { ThirstSystem } from './player/ThirstSystem.js';
import { EnergySystem } from './player/EnergySystem.js';
import { ProgressionSystem } from './player/ProgressionSystem.js';
import { registerSurvivalTools } from './admin/tools/SurvivalTools.js';
import { NutritionSystem } from './nutrition/NutritionSystem.js';
import { CraftingSystem } from './crafting/CraftingSystem.js';
import { ConstructionSystem } from './construction/ConstructionSystem.js';
import { EquipmentSystem } from './inventory/EquipmentSystem.js';
import { HotbarSystem } from './inventory/HotbarSystem.js';
import { ItemUseSystem } from './inventory/ItemUseSystem.js';
import { SleepSystem } from './player/SleepSystem.js';
import { PlayerMenu } from './ui/PlayerMenu.js';
import { registerCraftTools } from './admin/tools/CraftTools.js';
import { WorldManager } from './world/WorldManager.js';
import { loadSystem } from './systemdata/SystemLoader.js';
import { SolarSystem, withPrep } from './systemdata/SolarSystem.js';
import { parseSystemCatalog } from './systemdata/SystemCatalog.js';
import { SystemStore, importIdFromParam, IMPORT_PREFIX } from './systemdata/SystemStore.js';
import { ImportPanel } from './ui/ImportPanel.js';
import { captureState, saveHandoff, takeHandoff, applyState } from './core/TravelHandoff.js';
import { HyperspacePanel, WarpOverlay } from './ui/HyperspaceUI.js';
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
import { SeededRandom, hashString, deriveSeed } from './core/SeededRandom.js';
import { registerSpaceTools } from './admin/tools/SpaceTools.js';
import { ShipSystem } from './ship/ShipSystem.js';
import { toWorld as toShipWorld } from './ship/ShipLayout.js';
import { PickupSystem, findDropSite } from './world/PickupSystem.js';
import { GiantWaveSystem } from './world/GiantWave.js';
import { ChopEffects } from './world/ChopEffects.js';
import { CrashSite } from './world/CrashSite.js';
import { TitleScene } from './ui/TitleScene.js';
import { SaveGame, saveDateText } from './core/SaveGame.js';
import { HeldItems } from './player/HeldItems.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { BubbleSystem } from './world/BubbleSystem.js';
import { LifeSupportSystem } from './player/LifeSupportSystem.js';
import { StationSystem } from './construction/StationSystem.js';
import { LifeSupportHUD } from './ui/LifeSupportHUD.js';
import { ShipAI } from './ship/ShipAI.js';
import { MeteorSystem } from './space/MeteorSystem.js';
import { EVASystem } from './player/EVASystem.js';
import { EscapeSystem } from './space/EscapeSystem.js';
import { PodPanel, EscapeOverlay } from './ui/EscapeUI.js';
import { createSystemLayout, bodyPositions } from './celestial/SystemLayout.js';
import { AIPanel } from './ui/AIPanel.js';
import { PlanetMapRenderer } from './ui/PlanetMapRenderer.js';
import { ShipMapPanel } from './ui/ShipMapPanel.js';
import { ShipChargerPanel } from './ui/ShipChargerPanel.js';
import { ShipPilotHUD } from './ui/ShipPilotHUD.js';
import { ShipWatchHUD } from './ui/ShipWatchHUD.js';
import { registerEnvironmentTools } from './admin/tools/EnvironmentTools.js';
import { registerShipTools } from './admin/tools/ShipTools.js';
import { registerLifeSupportTools } from './admin/tools/LifeSupportTools.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { MapData } from './world/map/MapData.js';
import { PlaceTracker } from './world/map/PlaceTracker.js';
import { Landmarks } from './world/map/Landmarks.js';
import { StatusEffects } from './player/StatusEffects.js';
import { StatusEffectsHUD } from './ui/StatusEffectsHUD.js';
import { FarmSystem } from './farming/FarmSystem.js';
import { HomeSystem } from './construction/HomeSystem.js';
import { SHAPES } from './construction/BuildRules.js';
import { RanchSystem } from './animals/RanchSystem.js';
import { FishingSystem, FishingUI } from './fishing/FishingSystem.js';

function boot(system, { file, catalog = [], handoff = null, store = new SystemStore(), imported = [], save = null, maps: designMaps = {} } = {}) {
  const cfg = GameConfig;
  const events = new EventBus();
  const HOME = system.homeId;
  const homeProfile = system.home.profile;
  const homeName = system.home.name;
  // La campaña (el Edén): se empieza en una cápsula estrellada y la nave está en un monte helado.
  const campaign = file === cfg.CAMPAIGN.SYSTEM_FILE;
  // La mazmorra empieza en la trampilla del búnker del centro de investigación.
  const dungeonStart = (sites) => {
    const s = sites.RESEARCH_CENTER?.[0];
    if (!s) return null;
    const L = labLayout(s);
    return { x: L.hatch.x, z: L.hatch.z, yaw: L.heading };
  };

  // ---- Infraestructura -----------------------------------------------------
  const render = new RenderContext({
    config: cfg.RENDER,
    skyConfig: cfg.SKY,
    container: document.getElementById('game-container'),
  });
  const input = new InputManager({ config: cfg.INPUT, domElement: render.domElement, events });

  // ---- Mundos: el planeta de inicio y sus lunas (cada uno conserva su estado) ----
  const worlds = new WorldManager({
    scene: render.scene,
    system,
    events,
    options: {
      config: cfg.WORLD,
      maps: designMaps,
      resourceTypes: cfg.RESOURCE_TYPES,
      propColors: cfg.PROPS,
      flatShading: cfg.RENDER.TERRAIN_FLAT_SHADING,
      // La nave aparece aterrizada cerca del inicio, en un claro sin árboles.
      landing: { DISTANCE: cfg.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: cfg.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      // Campaña: el inicio en cualquier punto del planeta y la nave en lo alto de las Montañas Heladas.
      homeRules: campaign ? { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: cfg.SHIP.MOUNTAIN_LANDING_DISTANCE, CAVES: cfg.CAVES, SITES: cfg.SITES.LIST, SAFE_RADIUS: cfg.SITES.SAFE_RADIUS, DUNGEON: dungeonStart } : null,
    },
  });
  // Todos los sistemas consultan el cuerpo ACTIVO a través de este proxy.
  const world = worlds.proxy;

  // ---- Ambiente: luz y cielo comparten la dirección del sol -----------------
  const lighting = new SceneLighting({ scene: render.scene, renderConfig: cfg.RENDER, config: cfg.LIGHTING });
  const sky = new SkyDome({ scene: render.scene, camera: render.camera, config: cfg.SKY, radius: cfg.RENDER.FAR * 0.9 });
  sky.setSunDirection(lighting.sunDirection);
  // Día y noche (Fase 11): TimeSystem calcula la hora; AtmosphereSystem la aplica a luz, cielo y niebla.
  const time = new TimeSystem({ config: cfg.TIME, events });
  // Sol y dos lunas (Fase 12): TimeSystem da la hora; la luz de noche viene de la luna visible.
  const celestial = new CelestialSystem({ config: cfg.CELESTIAL, system, time, scene: render.scene, camera: render.camera, events });
  const atmosphere = new AtmosphereSystem({
    time, lighting, sky, celestial, scene: render.scene, palette: cfg.TIME.PALETTE, renderConfig: cfg.RENDER,
  });

  // Estructuras en las que se camina y que bloquean: construcciones + nave.
  // (Se crean más abajo; estas funciones solo se llaman durante el bucle.)
  // Edificios de la historia (torre, arena del nodo, centro de investigación…).
  const storyColliders = new StaticColliders();
  let landmarks = null; // lugares del mapa diseñado (se crean tras generar el mundo)
  // ¿Hay una hoguera (o una cocina) encendida a menos de r m? (calor, luz, slimes)
  const nearFire = (x, y, z, r) => {
    for (const pc of construction?.pieces ?? []) {
      if ((pc.type === 'CAMPFIRE' || pc.type === 'KITCHEN' || pc.type === 'FORGE') && Math.abs(pc.x - x) < r && Math.abs(pc.z - z) < r && Math.hypot(pc.x - x, pc.z - z) < r && (y === null || Math.abs(pc.y - y) < 4)) return true;
    }
    return false;
  };
  const structureSources = () => (crashSite ? [construction, ship, crashSite, storyColliders] : [construction, ship, storyColliders]);
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
    ladderAt: (x, y, z) => construction?.ladderAt(x, y, z) ?? null, // escaleras de mano (P6)
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
        const c = enemies?.resolveCollisions(pos, r, y0, y1) ?? false; // bases y enemigos despiertos
        return a || b || c;
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
  const placeTracker = new PlaceTracker({ world, player, events }); // regiones, cuevas y salas con nombre

  // ---- Mundo vivo: animales y descubrimientos ------------------------------
  const animals = new AnimalSystem({
    config: cfg.ANIMALS,
    fauna: homeProfile.FAUNA,
    scene: render.scene,
    world: worlds.home, // empieza en el planeta de inicio; cada cuerpo con fauna tiene sus rebaños
    player,
    events,
    hitKnockback: cfg.INTERACTION.HIT_KNOCKBACK,
    bodyId: HOME,
  });
  const discovery = new DiscoveryTracker({
    world,
    animals,
    target: player,
    events,
    waterDistance: homeProfile.WATER.DISCOVERY_DISTANCE,
    animalDistance: cfg.ANIMALS.DISCOVERY_DISTANCE,
    species: cfg.ANIMALS.SPECIES,
  });

  // Cada vez que se (re)genera el mundo, el jugador aparece en el spawn de esa seed.
  events.on(GameEvents.WORLD_GENERATED, () => controller.spawn());

  // ---- Inventario e interacción (recoger, golpear) --------------------------
  const inventory = new InventorySystem({ items: cfg.ITEMS, events, config: cfg.INVENTORY });
  const hotbar = new HotbarSystem({ input, inventory, events });
  const equipment = new EquipmentSystem({ items: cfg.ITEMS, config: cfg.EQUIPMENT, inventory, events });
  const crafting = new CraftingSystem({ recipes: cfg.RECIPES, items: cfg.ITEMS, inventory, events });
  // La receta de la mesa de elaboración la da Nova en la campaña; fuera de ella se sabe desde el principio.
  if (!campaign) crafting.unlock('WORKBENCH');
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
    homeId: HOME,
  });
  // Nave pequeña: estructura en la que se entra y con la que se vuela (Tecnologías 1–3).
  const ship = new ShipSystem({
    config: cfg.SHIP,
    spaceConfig: cfg.SPACE,
    system,
    scene: render.scene,
    world,
    player,
    input,
    events,
    // No aterrizar encima de árboles ni construcciones; una roca solo estorba bajo una pata o la rampa
    // (el casco está a 2,2 m del suelo y las rocas son más bajas).
    landingBlocked: (s, L) => {
      const supports = [...L.LEGS.map((l) => [l.x, l.z]), L.RAMP_FOOT_SAMPLE].map(([lx, lz]) => toShipWorld(s, lx, lz));
      const overlapsFootprint = (ship, box) => L.overlapsFootprint(ship, box);
      for (const n of world.resources?.getNodesNear(s.x, s.z, 20) ?? []) {
        const r = n.radius;
        if (!(r > 0)) continue;
        if (n.type === 'ROCK') {
          if (supports.some(([x, z]) => Math.hypot(n.x - x, n.z - z) < r + 0.6)) return 'Hay una roca bajo las patas: busca un sitio despejado';
        } else if (overlapsFootprint(s, { minX: n.x - r, maxX: n.x + r, minZ: n.z - r, maxZ: n.z + r })) {
          return 'Hay árboles debajo: busca un claro para aterrizar';
        }
      }
      for (const p of construction.pieces) {
        if (Math.hypot(p.x - s.x, p.z - s.z) < 20 && overlapsFootprint(s, { minX: p.x - 1, maxX: p.x + 1, minZ: p.z - 1, maxZ: p.z + 1 })) {
          return 'Hay construcciones debajo';
        }
      }
      return null;
    },
  });
  ship.setInventory(inventory);
  ship.setBodyProvider(() => worlds.activeId);
  ship.setBreathableProvider(() => worlds.profile()?.BREATHABLE !== false);
  // Objetos sueltos del mundo (nodo espacial, cofres…): se cogen con E.
  const pickups = new PickupSystem({ scene: render.scene, worlds, events, inventory, items: cfg.ITEMS });
  // Reloj de pulsera (fabricación): en una partida nueva de la campaña está en la cápsula estrellada.
  let hasWatch = handoff ? handoff.watch !== false : !campaign;
  const crashSite = campaign
    ? new CrashSite({
      rootOf: (id) => worlds.rootOf(id),
      bodyId: HOME,
      activeBody: () => worlds.activeId,
      withWatch: !hasWatch,
      onTakeWatch: () => {
        hasWatch = true;
        player.model.setWatchVisible(true);
        playerMenu.refreshWatch();
        events.emit(GameEvents.PLAYER_ACTION, { kind: 'harvest' });
        message('⌚ Reloj de pulsera recuperado: Tab = fabricar · I = mochila. Empieza por madera (golpea un tronco) y piedras sueltas (E).', 'pickup');
        if (story.onWatchTaken()) return; // la historia: nombre, color, transmisión, tutorial
        if (!shipFound) setTimeout(() => message(`📡 El reloj capta la señal de la nave: está en lo alto de las ${worlds.home.biomes.get('FROZEN_MOUNTAINS')?.NAME ?? 'montañas'}. Busca el haz de luz… y abrígate antes de subir: allí arriba se congela uno.`, 'warning'), 5000);
      },
    })
    : null;
  crashSite?.setPlayer(player);
  events.on(GameEvents.WORLD_GENERATED, () => crashSite?.place(worlds.home));
  // Burbujas de oxígeno (lunas): con batería, dentro se respira.
  const bubbles = new BubbleSystem({
    scene: render.scene, worlds, events, inventory, player, config: cfg.LIFE_SUPPORT, batteries: cfg.SHIP.BATTERIES, blockers: [ship],
  });
  // Ola gigante periódica (cuerpos con water.giant_wave): la IA avisa; si está apagada, aviso normal.
  const giantWave = new GiantWaveSystem({
    scene: render.scene, events, time, worlds, player, controller, ship, timeConfig: cfg.TIME,
    say: (text) => (shipAI.online ? shipAI.say(text, 'ai-warn') : message(`🌊 ${text}`, 'warning')),
  });
  ship.setWaveProvider((x, z) => giantWave.heightAt(x, z));
  // Superficie del agua en (x, z), con lo que la levante la ola gigante al pasar.
  const waterSurfaceAt = (x, z) => {
    const s = world.waterSurfaceAt?.(x, z) ?? null;
    return s === null ? null : s + giantWave.heightAt(x, z);
  };
  // ¿Se respira en (x, y, z)? Nave (según compuerta y cámara) → burbujas → aire del cuerpo.
  const isBreathableAt = (x, y, z) => {
    const inShip = ship.breathableAt(x, y, z);
    if (inShip !== null) return inShip;
    // Bajo el agua no se respira (el traje con oxígeno sí deja bucear).
    const surface = waterSurfaceAt(x, z);
    if (surface !== null && y < surface) return false;
    if (bubbles.contains(worlds.activeId, x, y, z)) return true;
    return worlds.profile()?.BREATHABLE !== false;
  };
  construction.addBlocker(ship); // no se construye encima de la nave
  // Nadar y bucear: capacidad del motor; cada cuerpo la activa o ajusta (water.swim/dive/visibility_m).
  controller.setWater({ surfaceAt: waterSurfaceAt, fluid: () => world.fluid });
  let swimHint = false;
  events.on(GameEvents.PLAYER_SWIM_CHANGED, ({ swimming, underwater }) => {
    document.body.classList.toggle('underwater', underwater);
    const f = world.fluid;
    atmosphere.setUnderwater(underwater && f ? { color: f.seaColor || f.pondColor || 0x2d6f98, visibility: f.visibility } : null);
    if (swimming && !swimHint) {
      swimHint = true;
      events.emit(GameEvents.UI_MESSAGE, {
        text: f?.dive ? 'Nadando: [Espacio] subir · [C] bucear · [Shift] más rápido. Bajo el agua no se respira (el traje con oxígeno sí).' : 'Nadando: [Espacio] subir · [Shift] más rápido. Aquí no se puede bucear.',
        type: 'biome',
      });
    }
  });
  // Las vallas, paredes y patas de la nave también frenan a los animales.
  animals.setObstacles({ resolveCollisions: (pos, r, y0, y1) => combinedStructures.resolveCollisions(pos, r, y0, y1) });
  // Ropa puesta: cada pieza del personaje toma el color de su prenda.
  events.on(GameEvents.EQUIPMENT_CHANGED, ({ slots }) => {
    player.model.setOutfit(Object.fromEntries(Object.entries(slots).map(([k, id]) => [k, id ? cfg.ITEMS[id].COLOR ?? null : null])));
  });
  // Astillas al golpear troncos y árboles que caen al talarlos.
  const chopEffects = new ChopEffects({ scene: render.scene, events, worlds });
  // Lo que se lleva en la mano: en 3ª persona en el personaje; en 1ª, la mano en pantalla.
  const held = new HeldItems({ player, camera: render.camera, render, items: cfg.ITEMS, lighting });
  events.on(GameEvents.HOTBAR_CHANGED, ({ selectedId }) => held.setHeld(selectedId ?? null, equipment.slots.OFFHAND ?? null));
  events.on(GameEvents.PLAYER_ACTION, ({ kind }) => kind !== 'drink' && kind !== 'land' && kind !== 'block' && held.playAction(kind === 'chop' ? 0.42 : kind === 'harvest' || kind === 'place' ? 0.4 : 0.32, kind));
  events.on(GameEvents.EQUIPMENT_CHANGED, () => {
    held.setHandColor(player.model.handColor);
    held.setSleeveColor?.(player.model.sleeveColor);
    held.setHeld(hotbar.selectedId ?? null, equipment.slots.OFFHAND ?? null);
  });
  events.on(GameEvents.PLAYER_BLOCKED, () => message('🛡️ ¡Bloqueado!', 'info'));
  // Tirar objetos: caen al suelo en una bolsa delante del jugador (E para recogerlos).
  // También lo que no cabe en el inventario (lleno) se queda en el suelo así.
  const dropItems = (itemId, amount, dur) => {
    if (!itemId || !(amount > 0)) return;
    const p = player.position;
    const ahead = 1.2;
    const inCave = world.inCave?.(p.x, p.y + 1, p.z);
    pickups.drop(worlds.activeId, p.x - Math.sin(player.yaw) * ahead, p.z - Math.cos(player.yaw) * ahead, itemId, amount, dur, inCave ? p.y : null);
  };
  events.on(GameEvents.INVENTORY_FULL, ({ itemId, amount, dur }) => dropItems(itemId, amount, dur));
  // Una herramienta gastada se rompe.
  events.on(GameEvents.TOOL_BROKEN, ({ itemId }) => message(`💥 Se ha roto: ${cfg.ITEMS[itemId].ICON} ${cfg.ITEMS[itemId].NAME}`, 'warning'));
  const interactionProviders = [ship, pickups, bubbles, ...(crashSite ? [crashSite] : [])];
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
    providers: interactionProviders, // nave (botones, puertas, asiento, tecnologías), objetos sueltos, burbujas, meteoritos
    tool: () => cfg.ITEMS[hotbar.selectedId]?.TOOL ?? null, // herramienta seleccionada (hacha: tala más rápido)
    canWork: () => energy.canWork, // sin energía no se golpea
    wearTool: () => hotbar.selectedIndex !== null && inventory.wearSlot(hotbar.selectedIndex, 1), // aguante de la herramienta
    power: () => progression.damageMultiplier * statusEffects.damageMultiplier, // nivel (y poción de fuerza): más daño y más rapidez al talar/picar/romper
    weapon: () => cfg.ITEMS[hotbar.selectedId]?.WEAPON ?? null, // espada seleccionada: su daño
    suppressAttack: () => combat.suppressAttack || fishing.busy, // bloqueando, con arco/tirachinas o pescando el clic no golpea
    // Granja (P4): letrero de las parcelas y E sobre los animales (dar de comer, ordeñar, esquilar).
    structureAction: (piece) => (piece.type === 'FARM_PLOT' ? farm.actionText(piece) : home.actionText(piece)), // huerto, pozo, recolector, maniquí
    animalAction: (animal, source) => ranch.actionText(animal, source),
    animalInteract: (animal, source) => ranch.interact(animal, source),
  });
  events.on(GameEvents.PLAYER_ACTION, ({ kind }) => kind !== 'land' && player.playAction(kind));

  // ---- Supervivencia: cuatro sistemas independientes -----------------------
  const S = cfg.SURVIVAL;
  const hunger = new HungerSystem({ config: S, events });
  const thirst = new ThirstSystem({ config: S, events });
  const energy = new EnergySystem({ config: S, events, player, hunger, thirst });
  // Estados por la comida (P2): bien alimentado, comida caliente, con energía, indigestión.
  const statusEffects = new StatusEffects({ config: cfg.STATUS_EFFECTS, items: cfg.ITEMS, events, hunger, thirst });
  // Pociones y manzana dorada (P5): HEAL cura al momento (los estados los pone StatusEffects).
  const healFrom = ({ itemId }) => {
    const heal = cfg.ITEMS[itemId]?.HEAL;
    if (heal > 0) health.heal(heal);
  };
  events.on(GameEvents.FOOD_EATEN, healFrom);
  events.on(GameEvents.POTION_DRUNK, healFrom);
  const health = new HealthSystem({
    config: S,
    events,
    // Solo se cura si está bien alimentado, hidratado y (Fase 7) con dieta equilibrada.
    canRegenerate: () =>
      hunger.ratio >= S.HEALTH_REGEN_MIN_RATIO &&
      thirst.ratio >= S.HEALTH_REGEN_MIN_RATIO &&
      !(cfg.NUTRITION.UNBALANCED_BLOCKS_REGEN && nutrition.isUnbalanced) &&
      !statusEffects.blocksRegen,
  });

  // Niveles: XP por recoger, talar, picar, fabricar y cazar; puntos para subir estadísticas.
  const PG = cfg.PROGRESSION;
  const progression = new ProgressionSystem({ config: PG, events });
  progression.applyTo({ health, energy });
  // Daño de los ataques: esquivando no alcanza; la armadura quita una parte.
  health.modifier = (d) => {
    const attack = d.fromX !== undefined || d.attack;
    if (d.source === 'FALL') return d.amount * statusEffects.fallMultiplier; // poción de salto
    if (!attack) return d.amount;
    if (player.state.dodging > 0) return 0;
    if (combat.blockHit(d)) return 0; // el escudo lo para (de frente)
    return d.amount * (1 - equipment.damageReduction);
  };
  events.on(GameEvents.RESOURCE_HARVESTED, ({ amount }) => progression.addXp(PG.XP.HARVEST * (amount ?? 1)));
  events.on(GameEvents.RESOURCE_HIT, ({ felled, material, node }) => {
    if (!felled) return;
    if (material === 'web') progression.addXp(PG.XP.COBWEB);
    else if (material === 'stone' && node?.type) progression.addXp(PG.XP.BREAK_ROCK);
    else if (material === 'wood') progression.addXp(PG.XP.FELL_TREE);
  });
  events.on(GameEvents.ITEM_CRAFTED, ({ recipeId }) => progression.addXp(Math.max(1, Math.round((cfg.RECIPES[recipeId]?.TIME ?? 0) * PG.XP.CRAFT_PER_SECOND))));
  events.on(GameEvents.ANIMAL_KILLED, () => progression.addXp(PG.XP.KILL));
  events.on(GameEvents.PLAYER_LEVEL_UP, ({ level, points }) =>
    events.emit(GameEvents.UI_MESSAGE, { text: `⭐ ¡Nivel ${level}! Tienes ${points} ${points === 1 ? 'punto' : 'puntos'}: repártelos en el reloj (Tab → Tú).`, type: 'pickup' }),
  );
  events.on(GameEvents.PROGRESSION_CHANGED, () => (controller.speedBonus = progression.speedMultiplier));

  // ---- Alimentación, uso de objetos y sueño (Fases 7–9) ----------------------
  const nutrition = new NutritionSystem({ config: cfg.NUTRITION, items: cfg.ITEMS, hunger, events });
  // Hambre, curación y energía según la dieta y los estados por la comida.
  const effectsApply = {
    name: 'effectsApply',
    update: () => {
      hunger.decayMultiplier = (nutrition.isUnbalanced ? cfg.NUTRITION.UNBALANCED_HUNGER_DECAY_MULTIPLIER : 1) * statusEffects.hungerMultiplier;
      health.regenMultiplier = statusEffects.regenMultiplier;
      energy.regenMultiplier = statusEffects.energyMultiplier;
      controller.effectSpeed = statusEffects.speedMultiplier;
      controller.jumpBonus = statusEffects.jumpMultiplier;
      atmosphere.setNightVision(statusEffects.nightVision);
    },
  };
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
    capturesUse: () => combat.capturesUse || fishing.capturesUse, // escudo, arma a distancia o caña: el clic dcho es suyo
  });
  // Combate: escudo (bloquear) y armas a distancia (apuntar, tensar, disparar).
  const combat = new CombatSystem({
    input, items: cfg.ITEMS, inventory, hotbar, equipment, player, controller, camera: render.camera, cameraSystem: camera, held,
    scene: render.scene, world, events, power: () => progression.damageMultiplier * statusEffects.damageMultiplier, creatures: interaction.creatures,
    // La lanza lanzada se queda donde cae (en las cuevas, a su altura).
    drop: (x, y, z, id, n, dur) => pickups.drop(worlds.activeId, x, z, id, n, dur, world.inCave?.(x, y + 1, z) ? y : null),
  });
  // Enemigos (Fase 4): gólems, slimes de noche, bases de goblins y equipos de exploración.
  const enemies = new EnemySystem({
    config: cfg.ENEMIES, safeRadius: cfg.SITES.SAFE_RADIUS, scene: render.scene, worlds, homeId: HOME, player, events, time,
    obstacles: combinedStructures, pickups, isSheltered: () => ship.isAboard(),
    fires: () => construction.pieces.filter((pc) => pc.type === 'CAMPFIRE' || pc.type === 'KITCHEN' || pc.type === 'FORGE'), fireRadius: cfg.BUILD.CAMPFIRE_SLIME_RADIUS,
  });
  enemies.playerAlive = () => !health.dead;
  // Granja, corral y pesca (P4).
  const farm = new FarmSystem({ config: cfg.FARM, items: cfg.ITEMS, construction, inventory, hotbar, events, hourSeconds: (cfg.TIME.DAY_LENGTH_MINUTES * 60) / 24 });
  // Útiles de casa (P6): pozo, recolector de lluvia y maniquí.
  const home = new HomeSystem({
    config: cfg.BUILD.RAIN_COLLECTOR, items: cfg.ITEMS, construction, inventory, hotbar, equipment, thirst, events, waterPerSkin: cfg.EQUIPMENT.WATER_CAPACITY,
  });
  const ranch = new RanchSystem({
    config: cfg.RANCH, items: cfg.ITEMS, animals, inventory, hotbar, events, pickups, homeId: HOME, isHome: () => worlds.activeId === HOME,
  });
  const fishing = new FishingSystem({
    config: cfg.FISHING, items: cfg.ITEMS, input, hotbar, inventory, player, camera: render.camera, world, scene: render.scene, events,
    ui: new FishingUI(document.getElementById('hud') ?? document.body),
  });
  events.on(GameEvents.FISH_CAUGHT, () => progression.addXp(PG.XP.KILL));
  events.on(GameEvents.ANIMAL_TAMED, () => progression.addXp(PG.XP.KILL * 2));
  interaction.creatures.push(enemies); // (CombatSystem comparte la lista)
  events.on(GameEvents.ENEMY_KILLED, ({ enemy, drops }) => {
    progression.addXp(PG.XP.KILL * (enemy.type === 'GOBLIN_BOSS' ? 4 : enemy.type === 'SLIME' ? 1 : 2));
    const list = Object.entries(drops ?? {}).map(([id, n]) => `${cfg.ITEMS[id]?.ICON ?? ''} ${n} ${cfg.ITEMS[id]?.NAME ?? id}`).join(' · ');
    message(`⚔️ ${enemy.def.NAME} derrotado${list ? `: ${list}` : ''}`, 'pickup');
  });
  // En modo construcción el clic coloca/quita piezas: se pausan la barra de
  // objetos, "usar" y la interacción normal (recoger, golpear).
  events.on(GameEvents.BUILD_MODE_CHANGED, ({ active }) => {
    // Colocando una pieza de la barra, la barra sigue funcionando (cambiar de objeto sale).
    hotbar.enabled = !active || construction.itemMode;
    itemUse.enabled = !active;
    interaction.enabled = !active;
    if (!active) interaction.resetTarget();
  });
  // Control a pie del jugador: se suspende a los mandos de la nave y en el espacio.
  const controlLocks = new Set();
  let eva = null; // EVASystem (se crea con el espacio, más abajo)
  const setControlLock = (reason, locked) => {
    if (locked) controlLocks.add(reason);
    else controlLocks.delete(reason);
    if (locked) construction.setActive(false);
    for (const s of [controller, hotbar, itemUse, interaction, construction, playerMenu]) s.enabled = controlLocks.size === 0;
    if (controlLocks.size) playerMenu.setOpen(false);
    if (eva?.active) controller.enabled = false; // en el paseo espacial manda EVASystem
    if (!controlLocks.size) interaction.resetTarget();
  };
  // A los mandos de la nave: el jugador no camina ni usa objetos; la cámara sigue a la nave.
  events.on(GameEvents.SHIP_PILOT_CHANGED, ({ piloting }) => {
    setControlLock('pilot', piloting);
    camera.setVehicleView(piloting ? ship.view : null);
    if (piloting) held.setFirstPerson(false);
    player.setBodyVisible(!piloting && camera.mode === 'THIRD_PERSON');
    if (!piloting) interaction.resetTarget();
  });
  const sleep = new SleepSystem({ config: cfg.SLEEP, energy, hunger, thirst, input, events });
  // Dormir en una cama la convierte en punto de reaparición.
  let respawnBed = null;
  events.on(GameEvents.PLAYER_SLEPT, ({ bed }) => {
    if (bed && cfg.SLEEP.SETS_RESPAWN) respawnBed = bed; // el sofá cama de la nave: { ship: true }
  });
  events.on(GameEvents.WORLD_GENERATED, () => (respawnBed = null));
  // Soporte vital (Etapa 4): aire, traje espacial (oxígeno + batería plank) y asfixia.
  const lifeSupport = new LifeSupportSystem({
    config: cfg.LIFE_SUPPORT, batteries: cfg.SHIP.BATTERIES, player, inventory, events, isBreathableAt,
  });
  const stations = new StationSystem({
    construction, lifeSupport, inventory, events, config: cfg.LIFE_SUPPORT, batteries: cfg.SHIP.BATTERIES,
  });
  events.on(GameEvents.SUIT_CHANGED, ({ wearing }) => player.model.setSuit(wearing));
  events.on(GameEvents.SUIT_LOCKER_REQUEST, () => lifeSupport.toggleSuit());
  events.on(GameEvents.OXYGEN_REFILL_REQUEST, () => lifeSupport.refillOxygen());
  events.on(GameEvents.BUBBLE_PLACE_REQUEST, ({ itemId }) => bubbles.placeInFront(itemId));
  events.on(GameEvents.BATTERY_USE_REQUEST, () => lifeSupport.swapBattery());
  // Temperatura oculta (Fase 10): bioma, altura, noche, armadura y refugio (casa o nave).
  const temperature = new TemperatureSystem({
    config: cfg.TEMPERATURE,
    biomes: homeProfile.BIOMES,
    world,
    time,
    player,
    // La comida caliente abriga (se pierde calor más despacio).
    equipment: { getColdLossMultiplier: () => equipment.getColdLossMultiplier() * statusEffects.coldMultiplier },
    shelter: {
      getShelterAt: (x, y, z) => {
        const a = construction.getShelterAt(x, y, z);
        const b = ship.getShelterAt(x, y, z);
        // El traje encendido y las burbujas con batería mantienen el calor.
        const warm = lifeSupport.powered || bubbles.contains(worlds.activeId, x, y + 1, z) || (worlds.activeId === HOME && !!landmarks?.isWarmAt(x, y, z)) || nearFire(x, y, z, cfg.BUILD.CAMPFIRE_WARM_RADIUS);
        return { factor: Math.max(a.factor, b.factor), heated: !!b.heated || warm };
      },
    },
    events,
  });
  // Al congelarse se ve menos (la niebla se acerca poco a poco).
  events.on(GameEvents.TEMPERATURE_CHANGED, ({ visibility }) => atmosphere.setVisibility(visibility));
  // Mapas diseñados: se ve lejos (la isla entera en baja resolución detrás de la niebla).
  const applyFog = () => (worlds.active.map ? atmosphere.setFogRange(170, 1150) : atmosphere.setFogRange(cfg.RENDER.FOG_NEAR, cfg.RENDER.FOG_FAR));
  applyFog();
  events.on(GameEvents.BODY_CHANGED, applyFog);

  const needs = [hunger, thirst, energy, temperature, time, lifeSupport];
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
      // Fuera del planeta de inicio: dentro de la nave si está aquí; si no, en la zona de aterrizaje.
      if (ship.present) {
        const r = ship.getRespawnPoint();
        player.teleport(r.x, r.y, r.z);
      } else {
        controller.spawn();
      }
    } else if (respawnBed?.ship && ship.present) {
      const r = ship.getRespawnPoint();
      player.teleport(r.x, r.y, r.z);
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
  events.on(GameEvents.CAMERA_BODY_VISIBILITY, ({ visible }) => {
    player.setBodyVisible(visible && !ship.piloting);
    held.setFirstPerson(!visible && !ship.piloting);
  });

  // ---- Interfaz y herramientas --------------------------------------------
  const ui = new UIManager({
    config: cfg.UI,
    gameInfo: cfg.GAME,
    system,
    items: cfg.ITEMS,
    equipmentConfig: cfg.EQUIPMENT,
    buildConfig: cfg.BUILD,
    events,
    input,
    canvas: render.domElement,
  });
  ui._hasShield = () => !!cfg.ITEMS[equipment.slots.OFFHAND]?.SHIELD;
  const hudRoot = document.getElementById('hud');
  // Menú del reloj de pulsera: Tab = fabricación, I = inventario (mochila 9×3, barra, ropa) + "Tú".
  const playerMenu = new PlayerMenu({
    container: hudRoot, input, events, inventory, equipment, crafting, hotbar, time,
    items: cfg.ITEMS, categories: cfg.RECIPE_CATEGORIES, stations: cfg.STATIONS, stats: { health, hunger, thirst, energy },
    progression, statDefs: PG.STATS,
    hasWatch: () => hasWatch,
    onDrop: (itemId, count, dur) => {
      dropItems(itemId, count, dur);
      message(`Tiras ${count > 1 ? `${count} × ` : ''}${cfg.ITEMS[itemId].ICON} ${cfg.ITEMS[itemId].NAME}`, 'info');
    },
  });
  playerMenu.refreshWatch();
  player.model.setWatchVisible(hasWatch);
  // Q: tirar una unidad del objeto seleccionado en la barra (en el modo construcción, Q gira la pieza).
  const dropKey = {
    name: 'dropKey',
    update: () => {
      if (!input.wasPressed('DROP') || construction.active || controlLocks.size || hotbar.selectedIndex === null) return;
      const got = inventory.takeFromSlot(hotbar.selectedIndex, 1);
      if (got) {
        dropItems(got.id, got.count, got.dur);
        message(`Tiras ${cfg.ITEMS[got.id].ICON} ${cfg.ITEMS[got.id].NAME} (Q)`, 'info');
      }
    },
  };
  // Estaciones (mesa de refinería): E sobre ella abre su pestaña del menú.
  events.on(GameEvents.CRAFT_STATION_OPEN, ({ station }) => playerMenu.open('STATION', { station }));
  // Colocar una estación fabricada: modo construcción con esa pieza seleccionada.
  events.on(GameEvents.BUILD_PIECE_REQUEST, ({ pieceId, once }) => construction.startPlacing(pieceId, { once }));
  // Seleccionar una pieza en la barra = colocarla (la antorcha no: en la mano ilumina; R la clava).
  events.on(GameEvents.HOTBAR_CHANGED, ({ selectedId }) => {
    const def = cfg.ITEMS[selectedId];
    if (def?.USE === 'BUILD' && !def.HOLD) construction.startPlacing(def.BUILD_PIECE);
    else if (construction.itemMode) construction.setActive(false);
  });
  // Cofres: E abre su contenido junto al inventario. Al romperlos, lo que tenían cae en una bolsa.
  events.on(GameEvents.CHEST_OPEN, ({ piece }) => playerMenu.openChest(piece.data));
  events.on(GameEvents.STRUCTURE_REMOVED, ({ structure }) => {
    for (const st of structure.data?.slots ?? []) {
      if (st) pickups.drop(worlds.activeId, structure.x, structure.z, st.id, st.count, st.dur, structure.y);
    }
  });
  // Partida cargada: el contenido de los cofres se comprueba (solo objetos que existen).
  events.on(GameEvents.STRUCTURE_RESTORED, ({ structure }) => {
    if (!SHAPES[structure.type]?.storage) return; // cofres, armarios y barriles
    const slots = Array.isArray(structure.data?.slots) ? structure.data.slots : [];
    const n = structure.type === 'CHEST' ? cfg.BUILD.CHEST_SLOTS : SHAPES[structure.type].storage;
    structure.data = {
      slots: Array.from({ length: n }, (_, i) => {
        const st = slots[i];
        const count = Math.floor(st?.count);
        if (!st || !Object.prototype.hasOwnProperty.call(cfg.ITEMS, st.id) || !(count > 0)) return null;
        return { id: st.id, count: Math.min(count, inventory.stackLimit(st.id)), ...(Number.isFinite(st.dur) ? { dur: st.dur } : {}) };
      }),
    };
  });
  // Luces del mundo: antorchas clavadas y flores luminosas de las cuevas. Solo las más
  // cercanas al jugador tienen luz de verdad (un número fijo de luces).
  const torchLights = Array.from({ length: cfg.BUILD.TORCH_LIGHTS + 2 }, () => {
    const l = new THREE.PointLight(0xffa24a, 0, 13, 1.6);
    render.scene.add(l);
    return l;
  });
  const torches = {
    name: 'torchLights',
    update: (dt, t) => {
      const p = player.position;
      const list = [];
      for (const pc of construction.pieces) {
        const fire = pc.type === 'CAMPFIRE' || pc.type === 'KITCHEN' || pc.type === 'FORGE';
        if (pc.type !== 'TORCH' && !fire) continue;
        const d = Math.hypot(pc.x - p.x, pc.z - p.z, (pc.y - p.y) * 2);
        const small = pc.type !== 'CAMPFIRE'; // cocina y forja: brasas tapadas, luz más corta
        if (d < 70 && fire) list.push({ x: pc.x, y: pc.y + (pc.type === 'KITCHEN' ? 0.6 : pc.type === 'FORGE' ? 1.3 : 0.9), z: pc.z, d, cave: true, color: 0xff8a3a, distance: small ? 9 : 17, intensity: small ? 1.4 : 2.8, fire: true });
        else if (d < 60) list.push({ x: pc.x, y: pc.y + 1.15, z: pc.z, d, torch: true });
      }
      // Lámparas de la casa (P6).
      for (const pc of construction.pieces) {
        const L = SHAPES[pc.type]?.light;
        if (!L) continue;
        const d = Math.hypot(pc.x - p.x, pc.z - p.z, (pc.y - p.y) * 2);
        if (d < 50) list.push({ x: pc.x, y: pc.y + L.y, z: pc.z, d, cave: true, color: L.color, distance: L.distance, intensity: L.intensity, fire: true });
      }
      for (const n of world.resources?.getNodesNear(p.x, p.z, 36) ?? []) {
        const glow = cfg.RESOURCE_TYPES[n.type]?.LIGHT;
        if (!glow || n.removed) continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z, (n.y - p.y) * 2);
        if (d < 40) list.push(n.type === 'GLOW_FLOWER' ? { x: n.x, y: n.y + 0.7, z: n.z, d, torch: false } : { x: n.x, y: n.y + 0.8, z: n.z, d, cave: true, color: glow, distance: 8, intensity: 1.3 });
      }
      for (const c of world.caveLightsNear?.(p.x, p.y, p.z, 45) ?? []) list.push({ ...c, cave: true });
      list.sort((a, b) => a.d - b.d);
      torchLights.forEach((l, i) => {
        const e = list[i];
        l.visible = !!e;
        if (!e) return;
        l.position.set(e.x, e.y, e.z);
        if (e.cave) {
          l.color.setHex(e.color);
          l.distance = e.distance;
          l.intensity = e.fire
            ? e.intensity * (0.82 + Math.sin(t * 11 + i) * 0.08 + Math.sin(t * 4.3 + i * 2) * 0.07 + Math.sin(t * 23) * 0.03)
            : e.intensity * (0.92 + Math.sin(t * 2.1 + i) * 0.08);
        } else if (e.torch) {
          l.color.setHex(0xffa24a);
          l.distance = 13;
          l.intensity = 2.2 * (0.88 + Math.sin(t * 13 + i) * 0.06 + Math.sin(t * 5.1 + i * 2) * 0.06);
        } else {
          l.color.setHex(cfg.RESOURCE_TYPES.GLOW_FLOWER.LIGHT);
          l.distance = 9;
          l.intensity = 1.5 + Math.sin(t * 1.7 + i) * 0.25;
        }
      });
    },
  };
  // Catalejo (mantener clic dcho: zoom con viñeta) y luz que lleva el jugador: el farol en
  // la mano izquierda, o la antorcha en 1ª persona (el cuerpo con su luz está oculto).
  const spyView = document.getElementById('spyglass-view');
  const carryLight = new THREE.PointLight(0xffb45a, 0, 16, 1.6);
  render.scene.add(carryLight);
  let spyOn = false;
  const gadgets = {
    name: 'gadgets',
    update: (dt, t) => {
      const on = hotbar.selectedId === 'SPYGLASS' && input.isDown('USE') && !input.blocked && !ship.piloting;
      camera.setSpyglass(on);
      controller.lookScale = Math.max(0.15, Math.min(1, camera.zoomFactor));
      if (on !== spyOn) {
        spyOn = on;
        spyView?.classList.toggle('hidden', !on);
      }
      const bodyShown = player.model.root.visible;
      const lantern = equipment.slots.OFFHAND === 'LANTERN';
      const torch = hotbar.selectedId === 'TORCH';
      const want = !ship.piloting && (lantern || torch) && !bodyShown;
      carryLight.visible = want;
      if (!want) return;
      player.getEyePosition(carryLight.position);
      carryLight.position.y -= 0.35;
      carryLight.position.x += Math.sin(player.yaw) * -0.3;
      carryLight.position.z += Math.cos(player.yaw) * -0.3;
      carryLight.distance = lantern ? 16 : 13;
      carryLight.intensity = (lantern ? 2.6 : 2.2) * (0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 5.3) * 0.05);
    },
  };

  // Cuevas: cuanto más hondo, más oscuro (solo alumbran antorchas y flores luminosas).
  let caveMsg = false;
  const caveDark = {
    name: 'caveDarkness',
    update: () => {
      const p = player.position;
      const inside = worlds.activeId === HOME && !!world.inCave?.(p.x, p.y + 1, p.z);
      const depth = inside ? world.getHeightAt(p.x, p.z) - (p.y + player.eyeHeight) : 0;
      const k = inside ? Math.max(0, Math.min(1, (depth - 1) / cfg.CAVES.DARKNESS_DEPTH)) : 0;
      atmosphere.setCave(Math.max(Math.min(k, story.caveCap ?? 1), story.darkness)); // también la habitación del ermitaño
      if (k > 0.6 && !caveMsg) {
        caveMsg = true;
        message('🕳️ Una cueva: aquí abajo no llega la luz. Lleva una 🔥 antorcha (1 madera + 1 carbón) y un ⛏️ pico para las menas.', 'info');
      }
    },
  };
  // Al abrirlo, el jugador se gira hacia donde miraba, levanta la muñeca para mirar
  // el reloj y la cámara se coloca delante de él (retrato, con el menú a la derecha).
  events.on(GameEvents.UI_PANEL_TOGGLED, ({ id, open }) => {
    if (id !== 'player-menu') return;
    if (open) player.bodyYaw = player.yaw;
    player.model.setWristPose(open && hasWatch);
    camera.setPortraitView(open);
  });
  new LifeSupportHUD({ container: document.getElementById('stats'), events, lowRatio: cfg.LIFE_SUPPORT.LOW_RATIO });
  new StatusEffectsHUD({ container: document.getElementById('stats'), events });

  // Tecnologías de la nave: mapa (y mapa planetario) y puesto de carga; mandos de vuelo.
  // Resolución del mapa según el tamaño de la región (160 px para 1 km, hasta 320 px).
  const newMap = (w, planet) => {
    const size = w.worldSize;
    const resolution = Math.round(Math.min(320, Math.max(112, cfg.SHIP.MAP_RESOLUTION * Math.sqrt(size / cfg.WORLD.WORLD_SIZE))));
    return new PlanetMapRenderer({ world: w, planet, worldSize: size, resolution });
  };
  const planetMap = newMap(worlds.home, homeProfile);
  // Mapas de las lunas (se dibujan la primera vez que se visitan).
  const moonMaps = new Map();
  const mapOf = (id) => {
    if (id === HOME || !system.profiles[id]) return planetMap;
    if (!moonMaps.has(id)) {
      moonMaps.set(id, newMap(worlds.get(id), system.profiles[id]));
    }
    return moonMaps.get(id);
  };
  const maps = {
    name: 'planetMaps',
    update() {
      planetMap.update();
      if (worlds.activeId !== HOME && system.profiles[worlds.activeId]) mapOf(worlds.activeId).update();
    },
  };
  // Textura de cada planeta visto desde fuera (lunas, espacio): se crea una vez por seed y se
  // rehace cuando su mapa está listo (la región real aparece pegada en el ecuador).
  const planetTextures = new Map();
  const getPlanetTextures = (id = HOME) => {
    const home = id === HOME;
    const map = home ? planetMap : moonMaps.get(id) ?? null;
    const seed = home ? worlds.home.seed.sub.celestial : deriveSeed(worlds.home.seed.sub.celestial, id);
    const withMap = !!map?.ready;
    let t = planetTextures.get(id);
    if (!t || t.seed !== seed || (!t.withMap && withMap)) {
      const profile = system.profiles[id];
      const c = createPlanetTextures({ width: cfg.SPACE.TEXTURE_WIDTH, seed, mapCanvas: withMap ? map.plainCanvas ?? map.canvas : null, planet: profile });
      const toTex = (canvas) => Object.assign(new THREE.CanvasTexture(canvas), { colorSpace: THREE.SRGBColorSpace });
      t = { seed, withMap, surface: toTex(c.surface), clouds: profile.BREATHABLE ? toTex(c.clouds) : null, atmosphere: profile.BREATHABLE };
      planetTextures.set(id, t);
    }
    return t;
  };
  // Dónde está cada cuerpo del sistema (estrella, planetas, lunas): se crea una vez por seed.
  let layout = null;
  const getLayout = () => {
    const seed = worlds.home.seed.sub.celestial;
    if (!layout || layout.seed !== seed) {
      layout = createSystemLayout({ ...cfg.CELESTIAL, ZONE_MARGIN_KM: cfg.SPACE.ZONE_MARGIN_KM }, seed, system, cfg.SPACE.SUN_DIRECTION);
      layout.seed = seed;
    }
    return layout;
  };
  events.on(GameEvents.WORLD_GENERATED, () => {
    planetMap.reset();
    moonMaps.clear();
    time.reset();
    celestial.setSeed(worlds.home.seed.sub.celestial);
  });

  // Cofre de suministros en la primera luna a la que se llega (burbuja de oxígeno y baterías).
  let moonChestPlaced = false;
  events.on(GameEvents.WORLD_GENERATED, () => (moonChestPlaced = false));
  events.on(GameEvents.BODY_CHANGED, ({ id, planet }) => {
    if (moonChestPlaced || planet?.KIND !== 'MOON') return;
    const site = worlds.get(id).getLandingSite();
    if (!site) return;
    moonChestPlaced = true;
    const [x, z] = toShipWorld({ x: site.x, z: site.z, yaw: site.yaw }, 16, 4);
    pickups.add({
      id: 'MOON_CHEST', body: id, x, z, model: 'CHEST', label: '📦 Cofre de suministros', action: 'Abrir',
      contents: cfg.LIFE_SUPPORT.MOON_CHEST, mapLabel: 'Cofre de suministros', mapColor: '#ffd27a',
    });
    message(`📦 Hay un cofre de suministros junto a la zona de aterrizaje ${withPrep('de', planet.NAME)} (haz amarillo). Ponte el traje antes de salir.`);
  });

  // Cambio de cuerpo (planeta ↔ lunas ↔ espacio): cada sistema se adapta a él.
  events.on(GameEvents.BODY_CHANGED, ({ id, planet }) => {
    construction.setBody(id, planet);
    animals.setBody(id, id === 'SPACE' ? null : worlds.get(id), system.profiles[id]?.FAUNA ?? null);
    controller.gravityScale = planet?.GRAVITY_SCALE ?? 1;
    atmosphere.setAirless(planet?.BREATHABLE === false);
    const parent = system.body(id)?.parent;
    celestial.setObserver(id, parent ? getPlanetTextures(parent).surface : null);
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
        return worlds.profile() ?? homeProfile;
      },
      homeConfig: homeProfile,
      homeMap: planetMap,
      systemName: system.name,
      onHome: () => worlds.activeId === HOME,
      getCatalog: () => celestial.catalog,
      getBed: () => (respawnBed && !respawnBed.ship && construction.exists(respawnBed) ? respawnBed : null),
      getMarkers: () => pickups.markers(worlds.activeId),
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
  // ---- Nodo espacial: cae en un sitio aleatorio del planeta de inicio (según la seed) ----------
  const message = (text, type = 'biome') => events.emit(GameEvents.UI_MESSAGE, { text, type });
  let gameStarted = false;
  const dropSpaceNode = () => {
    pickups.clear(HOME);
    const home = worlds.home;
    const rng = new SeededRandom(home.seed.value ^ 0x5bace);
    const site = findDropSite(home, rng, home.getSpawnPoint(), cfg.SHIP.SPACE_NODE_DROP_DISTANCE);
    if (!site) return;
    pickups.add({
      id: 'SPACE_NODE', body: HOME, x: site.x, z: site.z, model: 'NODE',
      label: `${cfg.ITEMS.SPACE_NODE.ICON} Nodo espacial`, action: 'Coger',
      contents: [{ item: cfg.SHIP.SPACE_NODE_ITEM, count: 1 }],
      mapLabel: 'Señal del nodo espacial', mapColor: '#6fdcff',
    });
  };
  // (Ya no se da el mapa de papel de la señal: el nodo se encuentra por su haz de luz azul.)
  events.on(GameEvents.WORLD_GENERATED, () => (campaign ? pickups.clear(HOME) : dropSpaceNode()));
  events.on(GameEvents.GAME_STARTED, () => {
    gameStarted = true;
  });
  events.on(GameEvents.PICKUP_TAKEN, ({ id }) => {
    if (id === 'SPACE_NODE') message('Llévalo a la nave e instálalo en una ranura libre (E sobre la ranura).');
  });
  // Instalarlo amplía la nave: alas, propulsores extra y salas nuevas.
  const installSpaceNode = () => {
    if (ship.isExplorer) return false;
    if (inventory.hasItem(cfg.SHIP.SPACE_NODE_ITEM, 1)) inventory.removeItem(cfg.SHIP.SPACE_NODE_ITEM, 1);
    if (inventory.hasItem(cfg.SHIP.NODE_MAP_ITEM, 1)) inventory.removeItem(cfg.SHIP.NODE_MAP_ITEM, 1);
    const node = pickups.get('SPACE_NODE');
    if (node) node.taken = true;
    ship.upgrade({
      // Árboles y rocas que queden bajo la nave ampliada desaparecen.
      removeResourcesUnder: (s, L) => {
        const res = worlds.get(ship.body)?.resources;
        for (const n of res?.getNodesNear(s.x, s.z, 26) ?? []) {
          const r = Math.max(n.radius, 0.4);
          if (L.overlapsFootprint(s, { minX: n.x - r, maxX: n.x + r, minZ: n.z - r, maxZ: n.z + r }, 1.2)) res.removeNode(n.id);
        }
      },
    });
    message('🔷 Nodo espacial instalado: la nave se amplía (alas, propulsores y cinco salas). Ya puede salir al espacio: a los mandos, vuela alto y pulsa O.');
    return true;
  };
  events.on(GameEvents.SPACE_NODE_INSTALL_REQUEST, () => {
    if (inventory.hasItem(cfg.SHIP.SPACE_NODE_ITEM, 1)) installSpaceNode();
  });

  events.on(GameEvents.MAP_OPEN_REQUEST, () => {
    shipMapPanel.showTab('PLANET');
    shipMapPanel.setOpen(true);
  });
  events.on(GameEvents.SHIP_PANEL_REQUEST, ({ panel }) => {
    if (panel === 'MAP') shipMapPanel.setOpen(true);
    else if (panel === 'CHARGER') shipChargerPanel.setOpen(true);
  });
  new ShipPilotHUD({ container: hudRoot, events, shipName: cfg.SHIP.NAME });

  // El espacio: un "cuerpo" sin suelo donde la nave vuela entre el planeta y sus lunas.
  worlds.registerExtra('SPACE', new SpaceWorld({ getSeed: () => worlds.home.seed }));
  const noonHour = (cfg.TIME.SUNRISE_HOUR + cfg.TIME.SUNSET_HOUR) / 2;
  const spaceView = new SpaceView({ scene: render.scene, config: cfg.SPACE });
  const spaceTravel = new SpaceTravel({
    config: cfg.SPACE,
    system,
    events,
    worlds,
    ship,
    time,
    camera: render.camera,
    view: spaceView,
    sources: {
      getLayout,
      getTextures: (id) => getPlanetTextures(id),
      onSunDirection: (dir) => atmosphere.setFixedSun(dir),
      getSeed: () => worlds.home.seed.sub.celestial,
      noonHour,
    },
  });
  // Solo durante los fundidos se suspende el control (en el espacio se pilota o se camina por la nave).
  events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => setControlLock('space', state === 'ASCENDING' || state === 'DESCENDING'));
  const spaceHUD = new SpaceHUD({ container: hudRoot, events, travel: spaceTravel, system });
  // Meteoritos (Etapa 5): aparecen de vez en cuando; no se aterriza, se baja con el traje.
  const meteors = new MeteorSystem({
    scene: render.scene,
    config: cfg.SPACE.METEORS,
    events,
    inventory,
    items: cfg.ITEMS,
    getNav: () => spaceTravel.nav,
    isInSpace: () => spaceTravel.inSpace,
    getSeed: () => worlds.home.seed.value,
    frequency: system.meteors.frequency,
  });
  spaceTravel.meteors = meteors;
  interactionProviders.push(meteors);
  // Paseo espacial: fuera de la nave en el espacio (ingravidez, jetpack, gravedad de los meteoritos).
  eva = new EVASystem({
    config: cfg.SPACE.EVA,
    input,
    look: { sensitivity: cfg.INPUT.MOUSE_SENSITIVITY, invertY: cfg.INPUT.INVERT_Y },
    player,
    controller,
    cameraSystem: camera,
    camera: render.camera,
    ship,
    meteors,
    worlds,
    lifeSupport,
    events,
  });
  spaceHUD.setEVA(eva, ship, render.camera);

  // ---- Etapa 6: nodo galáctico, salto fallido, cápsulas de escape y fin de la demo ----
  const bodiesNow = () => bodyPositions(getLayout(), time.totalHours).filter((b) => b.landable);
  // El nodo galáctico está en una de las lunas (según la seed); aparece al llegar a ella.
  const galacticMoon = () => {
    const moons = system.moons;
    if (!moons.length) return HOME; // sin lunas, en el propio planeta
    return moons[Math.floor(new SeededRandom(worlds.home.seed.value ^ 0x6a1ac).next() * moons.length)].id;
  };
  let galacticPlaced = false;
  events.on(GameEvents.WORLD_GENERATED, () => (galacticPlaced = false));
  events.on(GameEvents.BODY_CHANGED, ({ id, planet }) => {
    // Con el nodo de velocidad-luz (tutorial terminado) ya no hay señal galáctica.
    if (galacticPlaced || id !== galacticMoon() || spaceTravel.hyperdrive()) return;
    const w = worlds.get(id);
    const site = w.getLandingSite();
    if (!site) return;
    galacticPlaced = true;
    const spot = findDropSite(w, new SeededRandom(worlds.home.seed.value ^ 0x9a1), site, cfg.SHIP.GALACTIC_NODE_DROP_DISTANCE);
    if (!spot) return;
    pickups.add({
      id: 'GALACTIC_NODE', body: id, x: spot.x, z: spot.z, model: 'GALACTIC_NODE',
      label: `${cfg.ITEMS.GALACTIC_NODE.ICON} Nodo galáctico`, action: 'Coger',
      contents: [{ item: cfg.SHIP.GALACTIC_NODE_ITEM, count: 1 }], mapLabel: 'Señal galáctica', mapColor: '#c07bff',
    });
    shipAI.say(`Detecto una señal galáctica ${withPrep('en', planet.NAME)}, no muy lejos de la zona de aterrizaje (haz violeta). Está en el mapa.`, 'ai-warn');
  });
  events.on(GameEvents.PICKUP_TAKEN, ({ id }) => {
    if (id === 'GALACTIC_NODE') shipAI.say('¡Es un nodo galáctico! Instálalo en una ranura libre de la nave ampliada. Con él quizá podamos salir del sistema…');
  });
  events.on(GameEvents.GALACTIC_NODE_INSTALL_REQUEST, ({ slot }) => {
    if (!inventory.removeItem(cfg.SHIP.GALACTIC_NODE_ITEM, 1)) return;
    ship.installTech(slot, 'GALACTIC_NODE');
    spaceTravel.galacticNode = true;
    shipAI.say(`Nodo galáctico instalado. Para intentar el salto, sal del ${system.name}: aléjate de la estrella ${system.star.name} hasta más de ${Math.round(getLayout().zoneRadiusKm).toLocaleString('es-ES')} km (Shift = impulso).`);
  });
  // El salto falla: la nave queda inutilizada; solo queda evacuar en una cápsula.
  events.on(GameEvents.GALACTIC_JUMP_ATTEMPT, () => {
    ship.setCrippled(true);
    shipAI.say('¡FALLO DEL SALTO GALÁCTICO! El nodo galáctico se ha sobrecargado. Motores y navegación fuera de servicio.', 'ai-warn');
    setTimeout(() => shipAI.say(`Evacúa: levántate (E) y ve a la sala de cápsulas de escape. Rumbo de emergencia: ${homeName}.`, 'ai-warn'), 3500);
  });
  const escape = new EscapeSystem({
    config: cfg.SPACE.ESCAPE, system, events, worlds, ship, travel: spaceTravel, controller, input, getBodies: bodiesNow,
  });
  const podPanel = new PodPanel({ container: hudRoot, input, events, escape, system });
  new EscapeOverlay({ events, input, system, gameTitle: cfg.GAME.TITLE });
  // Estadísticas para la pantalla final.
  const visited = new Set([HOME]);
  let meteorsSeen = 0;
  events.on(GameEvents.BODY_CHANGED, ({ id }) => id !== 'SPACE' && visited.add(id));
  events.on(GameEvents.METEOR_SPAWNED, () => meteorsSeen++);
  events.on(GameEvents.ESCAPE_POD_ARRIVED, ({ emergency }) => {
    if (!emergency) return;
    // Fin de la demo: de vuelta en el planeta de inicio con la nave (y su nodo espacial) y el planeta como estaba.
    ship.setCrippled(false);
    // Fin del tutorial: la IA convierte los restos del nodo galáctico en un nodo de velocidad-luz.
    const slot = Object.entries(ship.installed).find(([, t]) => t === 'GALACTIC_NODE')?.[0];
    if (slot) ship.installTech(slot, 'LIGHTSPEED_NODE');
    else ship.uninstallTech('GALACTIC_NODE');
    try {
      localStorage.setItem('mundo0.tutorialDone', '1');
    } catch {
      /* sin almacenamiento */
    }
    ship.podsUsed = 0;
    spaceTravel.resetAfterDemo();
    ship.relocateTo(HOME);
    lifeSupport.oxygen = 1;
    lifeSupport.gas = 1;
    events.emit(GameEvents.DEMO_END, {
      stats: [
        ['Días en el sistema', `${Math.floor(time.totalHours / 24) + 1}`],
        ['Cuerpos visitados', [...visited].map((id) => worlds.profile(id)?.NAME ?? id).join(', ')],
        ['Meteoritos avistados', `${meteorsSeen}`],
        ['Mineral en la mochila', `${inventory.getItemCount('MINERAL')}`],
        ['IA de a bordo', shipAI.aiName],
      ],
    });
  });
  events.on(GameEvents.DEMO_RESTART, () => {
    shipAI.say(`Bienvenido de vuelta ${withPrep('a', homeName)}. La nave está en la zona de aterrizaje.`);
    setTimeout(() => shipAI.say(`He convertido los restos del nodo galáctico en un nodo de velocidad-luz. Sal al espacio y aléjate de la estrella ${system.star.name} hasta el borde del sistema: allí elegiremos a qué sistema saltar. Cada salto gasta ${cfg.SPACE.HYPERSPACE.BATTERY_COST} batería de la nave.`), 4000);
  });

  // ---- Hiperespacio: del borde del sistema a otro sistema del catálogo ----------------
  const hasLightspeed = () => Object.values(ship.installed).includes('LIGHTSPEED_NODE');
  spaceTravel.hyperdrive = hasLightspeed;
  const campaignSeed = file === cfg.CAMPAIGN.SYSTEM_FILE ? system.seed : handoff?.campaignSeed ?? null;
  const HS = cfg.SPACE.HYPERSPACE;
  // Sistemas importados (IndexedDB): también son destinos del hiperespacio.
  const toEntry = (s) => ({ id: `import-${s.id}`, file: `${IMPORT_PREFIX}${s.id}`, name: s.name, description: s.description, imported: true });
  let importedEntries = imported.map(toEntry);
  const hyperPanel = new HyperspacePanel({
    container: hudRoot,
    input,
    events,
    sources: {
      catalog: () => [...catalog, ...importedEntries],
      currentFile: file,
      systemName: system.name,
      aiName: () => shipAI.aiName,
      batteries: ship.batteries,
      cost: HS.BATTERY_COST,
    },
  });
  const warp = new WarpOverlay();
  events.on(GameEvents.HYPERSPACE_EDGE, () => {
    shipAI.say(`Borde del ${system.name}. Nodo de velocidad-luz preparado: ¿a qué sistema vamos?`);
    events.emit(GameEvents.HYPERSPACE_PANEL_REQUEST, {});
  });
  let jumping = false;
  events.on(GameEvents.HYPERSPACE_JUMP, ({ entry }) => {
    if (jumping || entry.file === file) return;
    if (!ship.batteries.spendWhole(HS.BATTERY_COST)) {
      shipAI.say(`No hay carga suficiente: el salto necesita ${HS.BATTERY_COST} batería entera. Recarga o cambia baterías en el puesto de carga.`, 'ai-warn');
      return;
    }
    jumping = true;
    input.setBlocked('hyperspace', true);
    setNeedsPaused(true);
    shipAI.say(`Salto confirmado. Rumbo al ${entry.name}. Entrando en el hiperespacio…`);
    events.emit(GameEvents.SHIP_BATTERIES_CHANGED, { total: ship.batteries.total, capacity: ship.batteries.capacity });
    warp.enter(`Hiperespacio · rumbo al ${entry.name}`, HS.JUMP_TIME, () => {
      saveHandoff(captureState({
        systemName: system.name, target: entry.file, campaignSeed,
        inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression, hasWatch,
      }));
      const seed = entry.file === cfg.CAMPAIGN.SYSTEM_FILE && campaignSeed !== null ? `&seed=${campaignSeed}` : '';
      window.location.assign(`${window.location.pathname}?system=${encodeURIComponent(entry.file)}${seed}`);
    });
  });

  // ---- Importar sistemas (bloque 1d) ------------------------------------------------
  let importFrom = null; // 'hyperspace' si se abrió desde la navegación hiperespacial
  const importPanel = new ImportPanel({
    input, events, store,
    inGame: () => gameStarted,
    onChange: (list) => (importedEntries = list.map(toEntry)),
    play: (id) => {
      const target = `${IMPORT_PREFIX}${id}`;
      if (importFrom === 'hyperspace') {
        // En el borde del sistema, "jugar" es saltar allí (gasta batería y te llevas la partida).
        importFrom = null;
        importPanel.setOpen(false);
        const s = importPanel.saved.find((e) => e.id === id);
        events.emit(GameEvents.HYPERSPACE_JUMP, { entry: toEntry(s ?? { id, name: 'sistema importado', description: '' }) });
        return;
      }
      if (gameStarted && !window.confirm('¿Empezar una partida nueva en ese sistema? Lo que llevas en esta partida no viaja contigo (para eso, usa el hiperespacio).')) return;
      window.location.assign(`${window.location.pathname}?system=${encodeURIComponent(target)}`);
    },
  });
  events.on(GameEvents.IMPORT_PANEL_REQUEST, ({ from } = {}) => {
    importFrom = from ?? null;
    importPanel.open(() => {
      if (importFrom === 'hyperspace') events.emit(GameEvents.HYPERSPACE_PANEL_REQUEST, {});
      importFrom = null;
    });
  });
  document.getElementById('import-button')?.addEventListener('click', () => events.emit(GameEvents.IMPORT_PANEL_REQUEST, {}));

  // Mapa estelar 3D (tecnología Mapa): la escena espacial "de mapa".
  const starMap = new StarMap({
    config: cfg.SPACE,
    system,
    render,
    input,
    events,
    time,
    sources: {
      getCatalog: () => celestial.catalog,
      getMapCanvas: (id) => {
        const m = id === HOME ? planetMap : moonMaps.get(id);
        return m?.ready ? m.canvas : null;
      },
      getSeed: () => worlds.home.seed.sub.celestial,
      getProfile: (id) => system.profiles[id],
      getBodyPosition: (id) => bodyPositions(getLayout(), time.totalHours).find((b) => b.id === id)?.position,
      noonHour,
      getShipLocation: () => spaceTravel.getShipLocation(),
    },
  });
  events.on(GameEvents.STAR_MAP_TOGGLED, ({ open }) => setControlLock('starmap', open));
  // IA de la nave (nodo de IA): nombre, datos del sistema y avisos.
  const shipAI = new ShipAI({
    events,
    system,
    sources: { ship, lifeSupport, worlds, getCatalog: () => celestial.catalog, pickups, travel: spaceTravel },
  });
  events.on(GameEvents.AI_SAY, ({ name, text, type }) => events.emit(GameEvents.UI_MESSAGE, { text: `🤖 ${name}: ${text}`, type }));
  const aiPanel = new AIPanel({ container: hudRoot, input, events, ai: shipAI });
  // ---- Historia (campaña del Edén) ----------------------------------------------------
  const storyUI = new StoryUI({ container: hudRoot, input, events });
  const story = new StorySystem({
    campaign, config: cfg, events, input, ui: storyUI, player, controller, worlds, homeId: HOME, camera, inventory, enemies, crashSite,
    shipAI, ship, time, colliders: storyColliders, lock: setControlLock, items: cfg.ITEMS, pickups, health,
  });
  interactionProviders.push(story);
  // Segunda parte: la nave, el centro de investigación, la mazmorra y el gólem gigante.
  const storyPart2 = new StoryPart2({
    story, events, worlds, homeId: HOME, ship, shipAI, inventory, crafting, enemies, pickups, colliders: storyColliders, player,
    hotbar, health, creatures: interaction.creatures, installSpaceNode, items: cfg.ITEMS,
  });
  story._d.part2 = storyPart2;
  // Sonido: efectos, ambiente y música generados con WebAudio (N: silenciar).
  const audio = new AudioSystem({
    events, input, player, camera: render.camera, worlds, homeId: HOME, construction, ship, enemies, animals, time, story2: storyPart2, items: cfg.ITEMS,
    waterfalls: () => landmarks?.waterfalls ?? [],
  });
  events.on(GameEvents.WATCH_SETTINGS_REQUEST, () => (campaign ? story.openWatchSettings() : message('El reloj de la campaña solo se configura en el Edén.', 'info')));
  const storyKeys = {
    name: 'storyKeys',
    update: () => {
      if (input.wasPressed('COMPASS')) story.toggleCompass();
    },
  };
  const starMapHUD = new StarMapHUD({ container: hudRoot, events, map: starMap, system, spaceNodeRequired: cfg.SHIP.SPACE_NODE_REQUIRED });
  // Reloj de la nave: se coge en el laboratorio; al usarlo muestra dónde está la nave.
  const shipWatch = new ShipWatchHUD({ container: hudRoot, events, player, ship, time, inventory, watchItem: cfg.SHIP.WATCH_ITEM });
  ui.setInitialCameraMode(camera.mode);
  [health, hunger, thirst, energy].forEach((s) => s.emitState()); // pinta las barras iniciales

  // Generación inicial: después de crear los oyentes (UI, tracker) y antes de las
  // herramientas Admin, que leen los biomas del mundo generado.
  world.generate(String(system.seed));
  // Lugares con nombre del mapa diseñado (árbol gigante, ruinas, faro, arco, puente…).
  landmarks = worlds.home.map
    ? new Landmarks({ map: worlds.home.map, heightAt: (x, z) => worlds.home.getHeightAt(x, z), colliders: storyColliders, root: worlds.rootOf(HOME), isEnabled: () => worlds.activeId === HOME })
    : null;

  // ---- Menú de inicio: la cápsula en órbita y la caída al planeta ------------------
  let titleScene = null;
  if (!handoff && !save) {
    titleScene = new TitleScene({ render, textures: getPlanetTextures(HOME), seed: system.seed });
    titleScene.start();
    const target = document.getElementById('title-target');
    if (target) target.textContent = `RUMBO: ${homeName.toUpperCase()}`;
    const flash = document.getElementById('title-flash');
    ui.setStartSequence((done) => {
      titleScene.launch({
        onFlash: () => flash?.classList.add('on'),
        onImpact: () => {
          titleScene.stop();
          done();
          setTimeout(() => {
            flash?.classList.remove('on');
            flash?.classList.add('off');
          }, 300);
          setTimeout(() => flash?.classList.remove('off'), 2800);
        },
      });
    });
  }
  // Al empezar se mira hacia la cápsula estrellada.
  events.on(GameEvents.GAME_STARTED, () => {
    if (!crashSite?.group || worlds.activeId !== HOME || handoff || save) return;
    player.yaw = player.bodyYaw = crashSite.spawnYaw;
    player.pitch = -0.12;
    // Campaña: la IA de la nave está apagada hasta que Nova llega a la nave.
    if (ship.installed && Object.values(ship.installed).includes('AI_NODE')) ship.uninstallTech('AI_NODE');
    story.startNewGame();
  });

  // ---- Faro de la nave: un haz de luz en el monte helado hasta que se llega a ella ----
  let shipFound = !campaign || !!handoff;
  const shipBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 2.6, 260, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  shipBeam.name = 'ShipBeacon';
  shipBeam.visible = false;
  render.scene.add(shipBeam);
  const shipBeacon = {
    name: 'shipBeacon',
    update: (dt, t) => {
      const s = ship.ship;
      if (!shipFound && ship.present && Math.hypot(player.position.x - s.x, player.position.z - s.z) < 22) {
        shipFound = true;
        message('🚀 ¡La nave! Sube por la rampa (E en el botón de la compuerta).', 'pickup');
      }
      shipBeam.visible = !shipFound && hasWatch && ship.present && worlds.activeId === HOME && (!campaign || story.shipRevealed);
      if (!shipBeam.visible) return;
      shipBeam.position.set(s.x, s.y + 130, s.z);
      shipBeam.material.opacity = 0.16 + Math.sin(t * 2) * 0.05;
    },
  };

  // Llegada desde el hiperespacio: se recupera la partida y la nave aparece en el espacio.
  if (handoff) {
    applyState(handoff, {
      items: cfg.ITEMS, techs: cfg.SHIP.TECHNOLOGIES, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression,
    });
    if (ship.isExplorer) {
      pickups.remove('SPACE_NODE'); // la nave ya tiene el nodo espacial
      if (inventory.hasItem(cfg.SHIP.NODE_MAP_ITEM, 1)) inventory.removeItem(cfg.SHIP.NODE_MAP_ITEM, inventory.getItemCount(cfg.SHIP.NODE_MAP_ITEM));
    }
    document.getElementById('start-button').textContent = `Salir del hiperespacio · ${system.name}`;
    events.on(GameEvents.GAME_STARTED, () => {
      warp.exit(`Llegada al ${system.name}`);
      events.emit(GameEvents.HYPERSPACE_ARRIVED, { from: handoff.from });
      setTimeout(() => {
        const planets = system.planets.map((p) => p.name).join(', ');
        shipAI.say(`Salto completado desde el ${handoff.from}. Bienvenido al ${system.name}: ${system.planets.length === 1 ? 'un planeta' : `${system.planets.length} planetas`} (${planets}) alrededor de la estrella ${system.star.name}. Elige rumbo con las teclas numéricas.`);
      }, 2500);
    });
  }

  // ---- Guardar y cargar partida (localStorage) ------------------------------------
  // Cada parte guarda lo suyo; las fases nuevas (historia, cofres, cuevas…) se registran igual.
  const saveGame = new SaveGame({ key: cfg.SAVE.KEY });
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const isItem = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(cfg.ITEMS, id);
  saveGame.register('state', {
    save: () => captureState({
      systemName: system.name, target: file, campaignSeed, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression, hasWatch,
    }),
    load: (st) => {
      applyState(st, { items: cfg.ITEMS, techs: cfg.SHIP.TECHNOLOGIES, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression });
      hasWatch = st.watch !== false;
      player.model.setWatchVisible(hasWatch);
      playerMenu.refreshWatch();
      if (crashSite && hasWatch && !crashSite.watchTaken) crashSite.interact('watch');
    },
  });
  saveGame.register('player', {
    save: () => ({ x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.yaw }),
    load: (d) => {
      if (![d?.x, d?.y, d?.z].every(finite)) return;
      const b = worlds.home.getBounds();
      if (d.x < b.minX || d.x > b.maxX || d.z < b.minZ || d.z > b.maxZ) return;
      player.teleport(d.x, Math.max(d.y, worlds.home.getHeightAt(d.x, d.z)), d.z);
      if (finite(d.yaw)) player.yaw = player.bodyYaw = d.yaw;
    },
  });
  saveGame.register('ship', {
    save: () => (ship.body === HOME && ship.state === 'LANDED' ? { x: ship.ship.x, z: ship.ship.z, yaw: ship.ship.yaw } : null),
    load: (d) => {
      if (d && [d.x, d.z, d.yaw].every(finite)) ship.placeLanded(d.x, d.z, d.yaw);
    },
  });
  saveGame.register('world', { save: () => worlds.home.resources.snapshot(), load: (d) => worlds.home.reloadResources(d) });
  saveGame.register('construction', { save: () => construction.snapshot(), load: (d) => construction.restore(d) });
  saveGame.register('places', { save: () => placeTracker.snapshot(), load: (d) => placeTracker.restore(d) });
  saveGame.register('effects', { save: () => statusEffects.snapshot(), load: (d) => statusEffects.restore(d) });
  saveGame.register('ranch', { save: () => ranch.snapshot(), load: (d) => ranch.restore(d) });
  saveGame.register('story', { save: () => (campaign ? story.snapshot() : null), load: (d) => campaign && story.restore(d) });
  saveGame.register('enemies', { save: () => enemies.snapshot(), load: (d) => enemies.restore(d) });
  saveGame.register('pickups', { save: () => pickups.snapshot(), load: (d) => pickups.restore(d, isItem) });
  saveGame.register('flags', {
    save: () => ({ shipFound, respawnBed: respawnBed && !respawnBed.ship ? { x: respawnBed.x, z: respawnBed.z } : null }),
    load: (d) => {
      if (typeof d?.shipFound === 'boolean') shipFound = d.shipFound;
    },
  });
  const canSave = () => gameStarted && !health.dead && worlds.activeId === HOME && !ship.piloting && !spaceTravel.inSpace;
  const saveNow = (reason = 'manual', { silent = false } = {}) => {
    if (!canSave()) {
      if (!silent) message('💾 Ahora no se puede guardar: hazlo en tierra, en el planeta de inicio (no a los mandos ni en el espacio).', 'warning');
      return false;
    }
    const ok = saveGame.write({ file, seed: system.seed, system: system.name, reason });
    if (!ok) {
      if (!silent) message('💾 No se ha podido guardar (¿el navegador no deja guardar datos?).', 'warning');
      return false;
    }
    const at = Date.now();
    events.emit(GameEvents.GAME_SAVED, { reason, at });
    if (!silent) message(reason === 'auto' ? '💾 Guardado automático' : '💾 Partida guardada', 'info');
    return true;
  };
  events.on(GameEvents.GAME_SAVE_REQUEST, ({ reason, silent } = {}) => saveNow(reason ?? 'manual', { silent }));
  let autosaveIn = cfg.SAVE.AUTOSAVE_SECONDS;
  const autosave = {
    name: 'autosave',
    update: (dt) => {
      if (!gameStarted) return;
      autosaveIn -= dt;
      if (autosaveIn > 0) return;
      autosaveIn = canSave() ? cfg.SAVE.AUTOSAVE_SECONDS : 20;
      if (canSave()) saveNow('auto', { silent: true });
    },
  };
  // Menú de inicio: "Continuar partida" si hay una guardada (recarga con su sistema y su semilla).
  const saved = !handoff && !save ? saveGame.peek() : null;
  const continueBtn = document.getElementById('continue-button');
  if (saved && continueBtn) {
    continueBtn.classList.remove('hidden');
    continueBtn.innerHTML = '';
    continueBtn.append('▶ Continuar partida');
    const small = document.createElement('small');
    small.textContent = `${saved.system ?? ''} · ${saveDateText(saved.at)}`;
    continueBtn.append(small);
    continueBtn.addEventListener('click', () => {
      window.location.assign(`${window.location.pathname}?system=${encodeURIComponent(saved.file)}&seed=${saved.seed}&load=1`);
    });
  }

  const loop = new GameLoop({
    maxDelta: cfg.RENDER.MAX_DELTA, render: () => render.render(),
    // Un fallo en una parte del juego no lo congela: se avisa y lo demás sigue.
    onError: (name, err) => message(`⚠️ Error en «${name}»: ${err?.message ?? err}. El juego sigue; avísame con este texto.`, 'warning'),
  });
  const admin = new AdminSystem({ config: cfg.ADMIN, input, events, container: document.body });
  registerWorldTools(admin, { world, player, controller });
  admin.registerTool({ category: 'Mundo', label: 'Importar sistema solar…', run: () => events.emit(GameEvents.IMPORT_PANEL_REQUEST, {}) });
  admin.registerTool({ category: 'Mundo', type: 'info', label: 'Ola gigante', read: () => giantWave.describe() ?? 'Este cuerpo no tiene' });
  admin.registerTool({
    category: 'Mundo',
    label: 'Provocar la ola gigante ahora',
    run: () => {
      if (!giantWave.triggerNow()) throw new Error('Este cuerpo no tiene ola gigante');
    },
  });
  // Al llegar a un cuerpo con ola gigante, la IA dice cuándo llega la próxima.
  events.on(GameEvents.BODY_CHANGED, ({ id }) => {
    if (id === 'SPACE' || !system.profiles[id]?.WAVE) return;
    setTimeout(() => {
      const text = worlds.activeId === id && giantWave.describe();
      if (text) giantWave._say(text);
    }, 2500);
  });
  registerLifeTools(admin, { world, animals, player, controller, species: cfg.ANIMALS.SPECIES });
  registerInventoryTools(admin, { inventory, items: cfg.ITEMS });
  registerSurvivalTools(admin, { health, hunger, thirst, energy, events });
  registerCraftTools(admin, { nutrition, equipment, construction, inventory, events });
  registerEnvironmentTools(admin, { time, temperature });
  registerShipTools(admin, { ship, player, controller, inventory, world, events });
  registerSpaceTools(admin, { system, hasLightspeed, celestial, travel: spaceTravel, starMap, ship, time, player, events, worlds, controller, installSpaceNode, pickups, meteors, lifeSupport, inventory });
  registerLifeSupportTools(admin, { lifeSupport, inventory, bubbles, worlds });
  registerCoreDebugTools(admin, { player, controller, camera, loop, renderer: render.renderer });
  // Historia: ir a cada lugar y adelantar el escáner de Nova.
  if (campaign) {
    admin.registerTool({ category: 'Historia', type: 'info', label: 'Etapa', read: () => `${story.state.stage}${story.state.stage === 'SCAN' ? ` (${Math.ceil(story.scanLeft())} h)` : ''}` });
    const goTo = (label, where) => admin.registerTool({ category: 'Historia', label, run: () => {
      const t = where();
      if (!t || worlds.activeId !== HOME) throw new Error('No disponible');
      controller.placeAt(t.x, t.z);
      if (t.y !== undefined) player.teleport(t.x, t.y + 0.1, t.z);
      if (t.yaw !== undefined) player.yaw = player.bodyYaw = t.yaw;
    } });
    goTo('Ir a la torre del ermitaño', () => story._built?.tower && { ...story._built.tower.bottom });
    goTo('Ir al nodo espacial', () => story._built?.arena && { x: story._built.arena.center.x + 6, z: story._built.arena.center.z });
    goTo('Ir a la nave', () => ({ x: ship.ship.x + 14, z: ship.ship.z + 14 }));
    goTo('Ir al centro de investigación', () => storyPart2.built?.lab && { ...storyPart2.built.lab.entrance });
    goTo('Ir a la sala de las cascadas (mazmorra)', () => {
      const a = storyPart2.built?.dungeon?.arena;
      return a && { x: a.entrance.x + a.dir.x * 3, z: a.entrance.z + a.dir.z * 3, y: a.floor };
    });
    admin.registerTool({ category: 'Historia', label: 'Acabar el escáner de Nova (24 h)', run: () => {
      if (story.state.stage !== 'SCAN') throw new Error('Nova aún no está escaneando');
      time.advance(Math.ceil(story.scanLeft()) + 0.1);
    } });
  }
  // Enemigos: crear uno delante e ir al más cercano.
  admin.registerTool({ category: 'Enemigos', type: 'info', label: 'Activos', read: () => `${enemies.activeCount} cerca · ${enemies.enemies.filter((e) => e.alive).length} vivos · ${enemies.bases.filter((b) => !b.cleared).length} bases` });
  for (const [type, label] of [['GOLEM', 'Gólem'], ['SLIME', 'Slime'], ['GOBLIN', 'Goblin'], ['GOBLIN_BOSS', 'Jefe goblin']]) {
    admin.registerTool({ category: 'Enemigos', label: `Crear ${label} delante`, run: () => {
      if (worlds.activeId !== HOME) throw new Error('Solo en el planeta de inicio');
      enemies.spawnNear(type);
    } });
  }
  for (const [kind, label] of [['BASE', 'base goblin'], ['TEAM', 'equipo de exploración'], ['GOLEM', 'gólem']]) {
    admin.registerTool({ category: 'Enemigos', label: `Ir a la ${label} más cercana`, run: () => {
      const p = player.position;
      const it = enemies.nearest(kind, p.x, p.z);
      if (!it || worlds.activeId !== HOME) throw new Error('No hay');
      const a = Math.atan2(p.x - it.x, p.z - it.z);
      const d = kind === 'BASE' ? 24 : 14;
      controller.placeAt(it.x + Math.sin(a) * d, it.z + Math.cos(a) * d);
      player.yaw = player.bodyYaw = a;
    } });
  }
  // Cuevas: ir a la boca más cercana de cada tipo (de pie delante de ella, mirándola).
  for (const [kind, label] of [['UNDERGROUND', 'Ir a la cueva subterránea más cercana'], ['MOUNTAIN', 'Ir a la cueva de montaña más cercana']]) {
    admin.registerTool({ category: 'Jugador', label, run: () => {
      const p = player.position;
      const list = (world.caves?.caves ?? []).filter((c) => c.kind === kind);
      if (worlds.activeId !== HOME || !list.length) throw new Error('Aquí no hay cuevas');
      const c = list.reduce((a, b) => (Math.hypot(a.mouth.x - p.x, a.mouth.z - p.z) <= Math.hypot(b.mouth.x - p.x, b.mouth.z - p.z) ? a : b));
      const [n0, n1] = c.nodes;
      const len = Math.hypot(n1.x - n0.x, n1.z - n0.z) || 1;
      const ux = (n1.x - n0.x) / len;
      const uz = (n1.z - n0.z) / len;
      controller.placeAt(n0.x - ux * 9, n0.z - uz * 9);
      player.yaw = player.bodyYaw = Math.atan2(-ux, -uz);
      player.pitch = -0.25;
    } });
  }
  // La nave llega al espacio del nuevo sistema (después de las herramientas Admin, que leen el terreno).
  if (handoff) {
    ship.enterPilot();
    spaceTravel.arriveFromHyperspace();
  }

  // ---- Bucle: el orden de registro es el orden de actualización ----------
  loop.add(worlds);      // carga/descarga progresiva de chunks del cuerpo activo
  loop.add(time);        // reloj del mundo (Fase 11)
  loop.add(giantWave);   // ola gigante periódica (si el cuerpo la tiene)
  loop.add(ship);        // nave: mandos, vuelo, compuerta, patas (coloca al piloto en su asiento)
  loop.add(controller);  // entrada → física del jugador
  loop.add(player);      // sincroniza y anima el modelo
  loop.add(camera);      // coloca la cámara a partir del jugador
  loop.add(held);        // objeto en la mano y mano en 1ª persona (tras la cámara)
  // Reloj de pulsera: su pantalla da la hora del juego.
  loop.add({ name: 'wristWatch', update: () => player.model.setWatchText(time.clockText) });
  loop.add(eva);         // paseo espacial: mueve al jugador y coloca la cámara (sustituye a los dos anteriores)
  loop.add(hotbar);      // teclas 1–9
  loop.add(construction); // modo construcción: apuntar, vista previa, colocar/quitar
  loop.add(combat);      // escudo y armas a distancia (antes que la interacción: decide si el clic golpea)
  loop.add(fishing);     // pesca: lanzar, esperar, minijuego (antes que la interacción)
  loop.add(interaction); // objetivo de la mira + recoger/golpear
  loop.add(itemUse);     // usar objeto seleccionado (comer, beber, equipar, colocar)
  loop.add(ranch);       // animales domesticados: atraer con comida, huevos (antes que los animales)
  loop.add(animals);     // simula y dibuja animales cercanos
  loop.add(farm);        // huerto: crecer y dibujar los cultivos
  loop.add(home);        // recolector de lluvia y maniquíes
  loop.add(enemies);     // gólems, slimes, goblins
  loop.add(story);       // la historia: escenas, Nova, brújula, tutorial
  loop.add(storyKeys);
  loop.add(pickups);     // objetos sueltos (nodo espacial, cofres)
  loop.add(chopEffects); // astillas y árboles que caen
  loop.add(torches);     // luz de las antorchas clavadas, hogueras, flores luminosas y cristales
  loop.add(gadgets);     // catalejo y luz del farol
  if (landmarks) loop.add(landmarks); // vapor de las termas, bruma de las cascadas
  loop.add(caveDark);    // oscuridad dentro de las cuevas
  if (crashSite) loop.add(crashSite); // cápsula estrellada: humo y el reloj brillante
  loop.add(shipBeacon);  // haz de luz sobre la nave hasta encontrarla
  if (titleScene) loop.add(titleScene); // menú de inicio: la cápsula en órbita
  loop.add(hunger);      // supervivencia: desgaste por tiempo y actividad
  loop.add(thirst);
  loop.add(energy);
  loop.add(temperature); // temperatura oculta: frío, congelación, daño (Fase 10)
  loop.add(lifeSupport); // aire, traje y asfixia (Etapa 4)
  loop.add(bubbles);     // burbujas de oxígeno (gastan batería)
  loop.add(stations);    // estaciones de carga y de oxígeno construidas
  loop.add(health);      // curación, cuenta atrás de reaparición
  loop.add(nutrition);   // la dieta "olvida" poco a poco lo comido
  loop.add(statusEffects); // estados por la comida (duración)
  loop.add(effectsApply);
  loop.add(sleep);
  loop.add(biomeTracker); // bioma actual del jugador
  loop.add(placeTracker); // lugar con nombre (mapas diseñados)
  loop.add(discovery);   // agua y animales descubiertos
  loop.add(atmosphere);  // luz, cielo, estrellas y niebla según la hora
  loop.add(lighting);    // sombra centrada en el jugador
  loop.add(sky);         // cúpula centrada en la cámara
  loop.add(celestial);   // lunas en el cielo (tras la cámara: se colocan respecto a ella)
  loop.add(spaceTravel); // viaje por el espacio (tras la cámara: dibuja los cuerpos respecto a ella)
  loop.add(meteors);     // meteoritos cerca del rumbo
  loop.add(escape);      // viaje en cápsula de escape
  loop.add(starMap);     // mapa estelar 3D
  loop.add(maps);        // mapas del planeta y de la luna actual (se dibujan poco a poco)
  loop.add(ui);
  loop.add(audio);       // sonido (tras la cámara: oye desde donde mira)
  loop.add(spaceHUD);
  loop.add(starMapHUD);
  loop.add(playerMenu);
  loop.add(crafting);     // cola de fabricación (con tiempo)
  loop.add(dropKey);     // Q: tirar el objeto seleccionado
  loop.add(shipMapPanel);
  loop.add(shipChargerPanel);
  loop.add(shipWatch);
  loop.add(shipAI);
  loop.add(aiPanel);
  loop.add(podPanel);
  loop.add(hyperPanel);
  loop.add(importPanel);
  loop.add(admin);
  loop.add(autosave);    // guardado automático
  loop.add(input);       // lateUpdate: limpia el estado por frame

  // Partida cargada: se aplica sobre el mundo recién generado y se entra directamente.
  if (save) {
    titleScene?.stop();
    saveGame.apply(save);
    autosaveIn = cfg.SAVE.AUTOSAVE_SECONDS;
    ui.startNow();
    message(`💾 Partida cargada (${saveDateText(save.at)}).`, 'info');
  }

  loop.start();

  // Acceso de depuración desde la consola del navegador (solo desarrollo).
  window.__MUNDO0__ = {
    config: cfg, events, render, input, world, lighting, sky, biomeTracker, animals, enemies, story, storyUI, storyPart2, discovery, inventory, interaction,
    health, hunger, thirst, energy, nutrition, hotbar, equipment, crafting, construction, itemUse, sleep, player,
    controller, camera, ui, admin, loop, time, atmosphere, temperature, ship, planetMap, shipMapPanel, shipChargerPanel, shipWatch,
    worlds, pickups, bubbles, lifeSupport, stations, shipAI, aiPanel, meteors, eva, escape, podPanel,
    celestial, spaceTravel, spaceView, starMap, spaceHUD, starMapHUD, system, hyperPanel, warp, giantWave, importPanel, playerMenu, chopEffects, progression, crafting,
    crashSite, titleScene, held, saveGame, saveNow, combat, audio, get hasWatch() { return hasWatch; },
  };
}

/** Semilla numérica de la partida: ?seed=123 en la URL (un texto se convierte en número) o una al azar. */
function gameSeed() {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null && param.trim() !== '') return /^\d+$/.test(param.trim()) ? Number(param.trim()) % 2 ** 32 : hashString(param.trim());
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1000000000; // hasta 9 cifras: fácil de apuntar y compartir
}

/**
 * La campaña (El Jardín del Edén) o el sistema de systems/ indicado con ?system=kappa.
 * Todos pasan por el mismo validador y compilador que un sistema importado.
 * La campaña usa una semilla aleatoria por partida; los demás sistemas, la suya
 * (del archivo o derivada de su nombre), salvo que la URL traiga ?seed=.
 * Si se llega por el hiperespacio, se recupera el traspaso de la partida.
 */
async function loadCampaign() {
  const params = new URLSearchParams(window.location.search);
  const param = params.get('system');
  const store = new SystemStore();
  // ?system=import:<id> → sistema importado guardado en este navegador (IndexedDB).
  const importId = importIdFromParam(param);
  const file = importId ? `${IMPORT_PREFIX}${importId}` : param && /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(param) ? param : GameConfig.CAMPAIGN.SYSTEM_FILE;
  const url = `systems/${file}.system.json`;
  const [text, catalogText, imported] = await Promise.all([
    importId
      ? store.get(importId).then((rec) => {
        if (!rec) throw Object.assign(new Error('ese sistema importado no está guardado en este navegador (¿se borró?). Quita "?system=…" de la dirección para volver al juego normal'), { dataError: true });
        return rec.text;
      })
      : fetch(url).then((res) => {
        if (!res.ok) throw new Error(`no se pudo leer ${url} (${res.status})`);
        return res.text();
      }),
    fetch(GameConfig.CAMPAIGN.CATALOG_URL).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    store.list().catch(() => []),
  ]);
  const campaign = file === GameConfig.CAMPAIGN.SYSTEM_FILE;
  const seed = campaign || params.has('seed') ? gameSeed() : undefined;
  // ?load=1: continuar la partida guardada (si es de este sistema y esta semilla).
  let save = null;
  if (params.get('load') === '1') {
    const s = new SaveGame({ key: GameConfig.SAVE.KEY }).read();
    if (s && s.file === file && s.seed === seed) save = s;
  }
  // Lo guardado se vuelve a comprobar entero, como si se importara de nuevo.
  const result = loadSystem(text, { seed });
  if (!result.ok) throw Object.assign(new Error(`el sistema ${file} no es válido: ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`), { dataError: true });
  for (const w of result.warnings) console.warn(`[sistema] ${w.path}: ${w.message}`);
  const catalog = catalogText ? parseSystemCatalog(catalogText) : { entries: [], errors: [] };
  for (const e of catalog.errors) console.warn(`[catálogo] ${e.path}: ${e.message}`);
  const solar = new SolarSystem(result.system);
  // Mapas diseñados de la campaña (el Edén): relieve, agua y lugares fijos.
  const maps = {};
  if (campaign) {
    for (const [index, mapId] of Object.entries(GameConfig.CAMPAIGN.MAPS ?? {})) {
      const body = Number(index) === 0 ? solar.homeId : null;
      if (body) maps[body] = await MapData.load(mapId);
    }
  }
  return { system: solar, file, catalog: catalog.entries, handoff: save ? null : takeHandoff(file), store, imported, save, maps };
}

loadCampaign()
  .then(({ system, file, catalog, handoff, store, imported, save, maps }) => boot(system, { file, catalog, handoff, store, imported, save, maps }))
  .catch((err) => {
    console.error(err);
    const el = document.getElementById('fatal-error');
    // "x is not a function" casi siempre es una mezcla de archivos nuevos y viejos guardados
    // por el navegador (tras actualizar): se arregla recargando sin caché.
    const stale = err instanceof TypeError && /is not a function|is not a constructor|does not provide an export/.test(err.message);
    const hint = err.dataError ? '' : stale ? ' Recarga sin caché (Ctrl+F5) o arranca con «python serve.py 8003».' : ' ¿Tu navegador soporta WebGL?';
    el.textContent = `No se pudo iniciar ${GameConfig.GAME.TITLE}: ${err.message}.${hint}`;
    el.classList.remove('hidden');
  });

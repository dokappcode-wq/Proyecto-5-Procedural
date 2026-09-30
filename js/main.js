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
import { WorldGenerator } from './world/WorldGenerator.js';
import { Player } from './player/Player.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraSystem } from './camera/CameraSystem.js';
import { UIManager } from './ui/UIManager.js';
import { AdminSystem } from './admin/AdminSystem.js';
import { registerCoreDebugTools } from './admin/tools/CoreDebugTools.js';
import { registerWorldTools } from './admin/tools/WorldTools.js';
import { registerLifeTools } from './admin/tools/LifeTools.js';

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
    obstacles: { resolveCollisions: (pos, r) => world.resources?.resolveCollisions(pos, r) ?? false },
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

  // Sin entrada de juego hasta pulsar "Entrar".
  input.setBlocked('start-screen', true);
  events.on(GameEvents.GAME_STARTED, () => input.setBlocked('start-screen', false));

  // Presentación: el cuerpo se oculta cuando la cámara está "dentro" de la cabeza.
  events.on(GameEvents.CAMERA_BODY_VISIBILITY, ({ visible }) => player.setBodyVisible(visible));

  // ---- Interfaz y herramientas --------------------------------------------
  const ui = new UIManager({ config: cfg.UI, gameInfo: cfg.GAME, events, input, canvas: render.domElement });
  ui.setInitialCameraMode(camera.mode);

  // Generación inicial: después de crear los oyentes (UI, tracker) y antes de las
  // herramientas Admin, que leen los biomas del mundo generado.
  world.generate(urlSeed ?? cfg.WORLD.DEFAULT_SEED);

  const admin = new AdminSystem({ config: cfg.ADMIN, input, events, container: document.body });
  registerWorldTools(admin, { world, player, controller });
  registerLifeTools(admin, { world, animals, player, controller, species: cfg.ANIMALS.SPECIES });
  registerCoreDebugTools(admin, { player, controller, camera });

  // ---- Bucle: el orden de registro es el orden de actualización ----------
  const loop = new GameLoop({ maxDelta: cfg.RENDER.MAX_DELTA, render: () => render.render() });
  loop.add(world);       // carga/descarga progresiva de chunks
  loop.add(controller);  // entrada → física del jugador
  loop.add(player);      // sincroniza y anima el modelo
  loop.add(camera);      // coloca la cámara a partir del jugador
  loop.add(animals);     // simula y dibuja animales cercanos
  loop.add(biomeTracker); // bioma actual del jugador
  loop.add(discovery);   // agua y animales descubiertos
  loop.add(lighting);    // sombra centrada en el jugador
  loop.add(sky);         // cúpula centrada en la cámara
  loop.add(ui);
  loop.add(admin);
  loop.add(input);       // lateUpdate: limpia el estado por frame

  loop.start();

  // Acceso de depuración desde la consola del navegador (solo desarrollo).
  window.__MUNDO0__ = { config: cfg, events, render, input, world, lighting, sky, biomeTracker, animals, discovery, player, controller, camera, ui, admin, loop };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal-error');
  el.textContent = `No se pudo iniciar MUNDO 0: ${err.message}. ¿Tu navegador soporta WebGL?`;
  el.classList.remove('hidden');
}

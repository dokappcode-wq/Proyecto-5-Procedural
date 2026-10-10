/**
 * P7 (v1.31): clima (estados, mezcla, lluvia/nieve, rayos), viento en la vegetación,
 * estado «Mojado», lluvia que riega el huerto y vida ambiental.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { StatusEffects } from '../js/player/StatusEffects.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { WeatherSystem } = await import('../js/world/WeatherSystem.js');
const { AmbientLife } = await import('../js/world/AmbientLife.js');
const { WIND, applyWind } = await import('../js/world/Wind.js');
const { PropMesher } = await import('../js/world/props/PropMesher.js');
const { AtmosphereSystem } = await import('../js/time/AtmosphereSystem.js');
const { FarmSystem } = await import('../js/farming/FarmSystem.js');

function weatherKit(opts = {}) {
  const events = new EventBus();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);
  const atmos = [];
  const audio = [];
  const w = new WeatherSystem({
    config: C.WEATHER, scene, camera, events,
    atmosphere: { setWeather: (s) => atmos.push(s) },
    audio: { setWeather: (s) => audio.push(s) },
    random: () => 0.5, ...opts,
  });
  return { events, scene, camera, w, atmos, audio };
}

test('clima: estados con peso, cambio gradual y lluvia de verdad', () => {
  const k = weatherKit();
  const changed = [];
  k.events.on(GameEvents.WEATHER_CHANGED, (e) => changed.push(e.state));
  assert.equal(k.w.state, 'CLEAR');
  assert.equal(k.w.raining, false);
  assert.ok(k.w.set('RAIN'));
  assert.equal(k.w.set('HAIL'), false, 'estado desconocido');
  assert.deepEqual(changed, ['RAIN']);
  k.w.update(1);
  assert.ok(k.w.rain > 0 && k.w.rain < 0.1, 'no empieza a llover de golpe');
  for (let i = 0; i < 120; i++) k.w.update(1);
  assert.ok(k.w.rain > 0.6 && k.w.raining);
  assert.ok(k.w._rainMesh.visible && !k.w._snowMesh.visible);
  assert.ok(k.atmos.length > 0 && k.audio.at(-1).rain > 0.6, 'cielo y sonido avisados');
  assert.ok(WIND.strength.value > 0.4, 'con lluvia hace más viento');
  // El estado se acaba y pasa a otro distinto.
  k.w._left = 0.1;
  k.w.update(0.5);
  assert.notEqual(k.w.state, 'RAIN');
  for (const s of Object.values(C.WEATHER.STATES)) assert.ok(s.NAME && s.W > 0 && s.TIME[1] > s.TIME[0]);
});

test('clima: nieve en el frío, nada bajo techo y sin clima fuera del planeta', () => {
  let cold = true;
  let roof = false;
  let home = true;
  const k = weatherKit({ coldAt: () => cold, sheltered: () => roof, isActive: () => home });
  k.w.restore({ state: 'STORM', left: 100 });
  k.w.update(0.1);
  assert.ok(k.w.snowing && k.w._snowMesh.visible && !k.w._rainMesh.visible);
  cold = false;
  roof = true;
  k.w.update(0.1);
  assert.ok(!k.w._snowMesh.visible && !k.w._rainMesh.visible, 'bajo techo no se ve llover');
  home = false;
  assert.equal(k.w.raining, false, 'en una luna no llueve');
  for (let i = 0; i < 200; i++) k.w.update(1);
  assert.ok(k.w.rain < 0.01 && k.w.cloud < 0.01);
});

test('tormenta: rayo con destello y el trueno llega después según la distancia', () => {
  const k = weatherKit();
  const thunder = [];
  k.events.on(GameEvents.THUNDER, (e) => thunder.push(e.distance));
  k.w.strike(680, 0);
  assert.equal(k.w.flash, 1);
  assert.ok(k.w._bolt.visible);
  k.w.update(1);
  assert.equal(thunder.length, 0, 'el sonido tarda');
  k.w.update(1.2);
  assert.deepEqual(thunder, [680]);
  assert.ok(k.w.flash === 0 && !k.w._bolt.visible);
  // En tormenta caen rayos solos.
  k.w.set('STORM');
  for (let i = 0; i < 40; i++) k.w.update(1);
  assert.ok(thunder.length > 1);
});

test('clima: guardar y cargar (datos raros fuera)', () => {
  const k = weatherKit();
  k.w.set('FOG');
  const snap = JSON.parse(JSON.stringify(k.w.snapshot()));
  const k2 = weatherKit();
  k2.w.restore(snap);
  assert.equal(k2.w.state, 'FOG');
  assert.equal(k2.w.fog, C.WEATHER.STATES.FOG.FOG);
  k2.w.restore({ state: '__proto__', left: 1e12 });
  assert.equal(k2.w.state, 'FOG');
  k2.w.restore({ state: 'RAIN', left: 1e12 });
  assert.ok(k2.w._left <= 3600);
});

test('viento: la vegetación se mece (atributo sway), las rocas no', () => {
  const mesher = new PropMesher({ colors: C.PROPS });
  const tree = mesher._merge([{ template: mesher._pick('TREE', 0), x: 0, y: 0, z: 0, scale: 1, rotation: 0, tint: 0.5 }]);
  const rock = mesher._merge([{ template: mesher._pick('ROCK', 0), x: 0, y: 0, z: 0, scale: 1, rotation: 0, tint: 0.5, sway: false }]);
  assert.ok(Math.max(...tree.attributes.sway.array) > 1, 'la copa se mueve');
  assert.equal(Math.max(...rock.attributes.sway.array), 0);
  const m = applyWind(new THREE.MeshLambertMaterial(), 6);
  assert.equal(typeof m.onBeforeCompile, 'function');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n' };
  m.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uWind === WIND.strength && /sway/.test(shader.vertexShader));
});

test('mojado: da más frío; se seca solo', () => {
  const events = new EventBus();
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const fx = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events });
  fx.apply('WET', 30);
  assert.ok(fx.coldMultiplier > 1.5);
  assert.ok(fx.list().find((e) => e.id === 'WET').bad);
  fx.update(31);
  assert.ok(!fx.has('WET') && fx.coldMultiplier === 1);
  assert.ok(msgs.some((t) => /seco/.test(t)));
});

test('la lluvia riega el huerto', () => {
  const events = new EventBus();
  const piece = { id: 1, type: 'FARM_PLOT', x: 0, y: 0, z: 0, data: { crop: 'WHEAT', growth: 0, water: 0, fert: false }, object: new THREE.Group() };
  const construction = { pieces: [piece], allPieces: () => [piece] };
  const farm = new FarmSystem({ config: C.FARM, items: C.ITEMS, construction, inventory: null, hotbar: null, events });
  farm.advance(10);
  assert.equal(piece.data.water, 0);
  let rain = true;
  farm.isRaining = () => rain;
  farm.advance(10);
  assert.equal(piece.data.water, C.FARM.WATER_TIME);
  rain = false;
  farm.advance(100);
  assert.equal(piece.data.water, C.FARM.WATER_TIME - 100);
});

test('cielo: las nubes oscurecen el sol y la niebla acerca el horizonte', () => {
  const fake = {
    airless: false, _cloud: 1, _fog: 1, _flash: 0, _time: { daylight: 1 },
    _lighting: { sun: { intensity: 2 }, hemi: { intensity: 1 } },
    _sky: { setColors() {} },
    _scene: { fog: new THREE.Fog(0xffffff, 50, 400), background: new THREE.Color() },
    _zenith: new THREE.Color(0x3366ff), _horizon: new THREE.Color(0x99ccff), _ground: new THREE.Color(),
  };
  AtmosphereSystem.prototype._applyWeather.call(fake);
  assert.ok(fake._lighting.sun.intensity < 1);
  assert.ok(fake._scene.fog.far < 100);
  fake._flash = 1;
  const before = fake._lighting.hemi.intensity;
  AtmosphereSystem.prototype._applyWeather.call(fake);
  assert.ok(fake._lighting.hemi.intensity > before, 'el rayo ilumina');
});

test('vida ambiental: pájaros de día, luciérnagas de noche, mariposas sin lluvia', () => {
  const scene = new THREE.Scene();
  const player = { position: new THREE.Vector3(0, 10, 0) };
  const time = { daylight: 1 };
  const world = { getHeightAt: () => 5, getBiomeAt: () => ({ id: 'PLAINS' }), map: null };
  const weather = { rain: 0, cloud: 0, state: 'CLEAR' };
  const life = new AmbientLife({ scene, player, time, world, weather, random: () => 0.5 });
  for (let i = 0; i < 5; i++) life.update(0.2);
  assert.ok(life.birds.count > 0, 'de día hay pájaros');
  assert.ok(life.butterflies.count > 0, 'y mariposas en la pradera');
  time.daylight = 0;
  for (let i = 0; i < 20; i++) life.update(0.5);
  assert.ok(life._ff.some((f) => f.live), 'de noche, luciérnagas');
  weather.rain = 1;
  weather.state = 'STORM';
  time.daylight = 1;
  for (let i = 0; i < 40; i++) life.update(0.5);
  assert.equal(life.butterflies.count, 0, 'con tormenta no hay mariposas');
});

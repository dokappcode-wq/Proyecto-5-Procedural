/**
 * El Jardín del Edén (systems/jardin-del-eden.system.json) cargado y compilado
 * para los tests, igual que lo carga el juego.
 */
import fs from 'node:fs';
import { loadSystem } from '../../js/systemdata/SystemLoader.js';
import { SolarSystem } from '../../js/systemdata/SolarSystem.js';

const text = fs.readFileSync(new URL('../../systems/jardin-del-eden.system.json', import.meta.url), 'utf8');
const result = loadSystem(text, { seed: 12345 });
if (!result.ok) throw new Error(JSON.stringify(result.errors));

export const EDEN = new SolarSystem(result.system);
export const HOME = EDEN.home.profile;           // el planeta
export const MOON_A = EDEN.moons[0];             // Luna A (cuerpo compilado)
export const MOON_B = EDEN.moons[1];             // Luna B

// El Edén de antes (isla de 1 km, sin ríos, playas ni montañas bajas): los tests del
// motor sobre una región de 1 km (GameConfig.WORLD.WORLD_SIZE) usan este perfil.
const legacyText = fs.readFileSync(new URL('../fixtures/eden-1km.system.json', import.meta.url), 'utf8');
const legacy = loadSystem(legacyText, { seed: 12345 });
if (!legacy.ok) throw new Error(JSON.stringify(legacy.errors));
export const EDEN_1KM = new SolarSystem(legacy.system);
export const HOME_1KM = EDEN_1KM.home.profile;

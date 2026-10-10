import * as THREE from 'three';
import { smoothstep, clamp01 } from '../core/MathUtils.js';

/**
 * AtmosphereSystem — aplica la hora del día a la escena (Fase 11).
 *
 * Lee TimeSystem (dirección del sol, luz de día) y mezcla la paleta de
 * GameConfig.TIME.PALETTE: día → crepúsculo → noche. Controla:
 *   - SceneLighting: sol; de noche, luz de la luna visible que más ilumina
 *     (CelestialSystem) o, sin lunas, una luz tenue de estrellas.
 *   - SkyDome: colores del cielo, disco solar y estrellas.
 *   - Niebla y fondo de la escena (siempre del color del horizonte).
 *
 * También reduce la distancia de visión cuando el jugador se congela
 * (`setVisibility`, lo alimenta TemperatureSystem por evento desde main.js).
 * No sabe nada de la hora "de reloj": solo de la posición del sol.
 */
const NIGHT_VISION_TINT = new THREE.Color(0xb8f0c8);
const CLOUD_GREY = new THREE.Color(0x8d939c);
const FLASH = new THREE.Color(0xdfe8ff);
const CAVE_FOG = new THREE.Color(0x050506);

export class AtmosphereSystem {
  constructor({ time, lighting, sky, scene, palette, renderConfig, celestial = null }) {
    this.name = 'atmosphere';
    this._time = time;
    this._celestial = celestial; // { getNightLight() } (Fase 12): la luz de noche viene de la luna visible
    this._lighting = lighting;
    this._sky = sky;
    this._scene = scene;
    this._fogNear = renderConfig.FOG_NEAR;
    this._fogFar = renderConfig.FOG_FAR;

    const c = (hex) => new THREE.Color(hex);
    const P = palette;
    this._p = {
      day: { zenith: c(P.DAY.ZENITH), horizon: c(P.DAY.HORIZON), ground: c(P.DAY.GROUND), sun: c(P.DAY.SUN),
        hemiSky: c(P.DAY.HEMI_SKY), hemiGround: c(P.DAY.HEMI_GROUND) },
      twilight: { zenith: c(P.TWILIGHT.ZENITH), horizon: c(P.TWILIGHT.HORIZON), ground: c(P.TWILIGHT.GROUND), sun: c(P.TWILIGHT.SUN) },
      night: { zenith: c(P.NIGHT.ZENITH), horizon: c(P.NIGHT.HORIZON), ground: c(P.NIGHT.GROUND), moon: c(P.NIGHT.MOON_LIGHT),
        hemiSky: c(P.NIGHT.HEMI_SKY), hemiGround: c(P.NIGHT.HEMI_GROUND) },
    };
    this._P = P;

    this._sunDir = new THREE.Vector3();
    this._lightDir = new THREE.Vector3();
    this._zenith = new THREE.Color();
    this._horizon = new THREE.Color();
    this._ground = new THREE.Color();
    this._sunColor = new THREE.Color();
    this._hemiSky = new THREE.Color();
    this._hemiGround = new THREE.Color();

    this.airless = false;        // lunas y espacio: cielo negro, estrellas siempre, sin crepúsculo
    this._airlessColor = new THREE.Color(0x05060b);
    this._airlessGround = new THREE.Color(0x020203);
    this.visibility = 1;         // factor aplicado a la niebla (1 = normal)
    this._targetVisibility = 1;
    this.apply(); // estado inicial coherente con la hora de inicio
  }

  /** En el espacio el sol no depende de la hora: dirección fija (o null para volver a la hora). */
  setFixedSun(direction) {
    this._fixedSun = direction ? direction.clone() : null;
    this.apply();
  }

  /** Cuerpo sin atmósfera (lunas, espacio): cielo negro y luz dura. */
  setAirless(airless) {
    this.airless = airless;
    this.apply();
  }

  /** Factor de distancia de visión deseado (0..1); se alcanza de forma gradual. */
  setVisibility(factor) {
    this._targetVisibility = Math.max(0.1, Math.min(1, factor));
  }

  update(dt) {
    // La visibilidad cambia despacio: nada aparece ni desaparece de golpe.
    const k = 1 - Math.exp(-1.5 * dt);
    this.visibility += (this._targetVisibility - this.visibility) * k;
    this.apply();
  }

  /**
   * Dentro de una cueva (0 = fuera, 1 = en lo hondo): la luz del sol y del cielo no llega,
   * la niebla se vuelve negra y cercana. Solo alumbran antorchas y flores luminosas.
   */
  setCave(k) {
    const v = Math.max(0, Math.min(1, k));
    if (Math.abs(v - (this._cave ?? 0)) < 0.002) return;
    this._cave = v;
    this.apply();
  }

  /**
   * Clima (P7): nubes (0..1: cielo gris, menos sol), niebla (0..1: se ve menos lejos) y
   * relámpago (0..1: destello de luz).
   */
  setWeather({ cloud = 0, fog = 0, flash = 0 } = {}) {
    if (Math.abs(cloud - (this._cloud ?? 0)) < 0.002 && Math.abs(fog - (this._fog ?? 0)) < 0.002 && Math.abs(flash - (this._flash ?? 0)) < 0.01) return;
    this._cloud = cloud;
    this._fog = fog;
    this._flash = flash;
    this.apply();
  }

  /** Poción de visión nocturna (P5): la luz del cielo no baja de un mínimo y se ve lejos en la oscuridad. */
  setNightVision(on) {
    if (!!on === !!this._nightVision) return;
    this._nightVision = !!on;
    this.apply();
  }

  /** Bajo el agua: niebla cercana del color del agua ({ color, visibility } o null). */
  setUnderwater(state) {
    this._underwater = state;
    this.apply();
  }

  apply() {
    if (this.airless) this._applyAirless();
    else this._applyAir();
    this._applyWeather();
    this._applyCave();
    this._applyNightVision();
    this._applyUnderwater();
  }

  _applyWeather() {
    if (this.airless) return;
    const c = this._cloud ?? 0;
    const f = this._fog ?? 0;
    const flash = this._flash ?? 0;
    if (c <= 0 && f <= 0 && flash <= 0) return;
    const L = this._lighting;
    L.sun.intensity *= 1 - c * 0.72;
    L.hemi.intensity *= 1 - c * 0.3;
    if (flash > 0) L.hemi.intensity += flash * 2.2;
    // Cielo gris (más oscuro cuanto más cubierto); en el destello, blanco azulado.
    const grey = CLOUD_GREY.clone().multiplyScalar(0.25 + 0.75 * (this._time.daylight ?? 1));
    this._zenith.lerp(grey, c * 0.75);
    this._horizon.lerp(grey, c * 0.6 + f * 0.3);
    this._ground.lerp(grey, c * 0.4);
    if (flash > 0) {
      this._zenith.lerp(FLASH, flash * 0.6);
      this._horizon.lerp(FLASH, flash * 0.5);
    }
    this._sky.setColors({ zenith: this._zenith, horizon: this._horizon, ground: this._ground });
    const fog = this._scene.fog;
    if (fog) {
      fog.color.copy(this._horizon);
      fog.near *= 1 - f * 0.9;
      fog.far *= 1 - f * 0.82 - c * 0.15;
    }
    if (this._scene.background?.isColor) this._scene.background.copy(this._horizon);
  }

  _applyNightVision() {
    if (!this._nightVision || this.airless) return;
    const L = this._lighting;
    L.hemi.intensity = Math.max(L.hemi.intensity, 1.1);
    L.hemi.color.lerp(NIGHT_VISION_TINT, 0.5);
    L.hemi.groundColor.lerp(NIGHT_VISION_TINT, 0.5);
    const fog = this._scene.fog;
    if (fog) fog.far = Math.max(fog.far, 140);
  }

  _applyCave() {
    const k = this._cave ?? 0;
    if (k <= 0) return;
    const L = this._lighting;
    L.sun.intensity *= 1 - k;
    L.hemi.intensity *= 1 - k * 0.94;
    const fog = this._scene.fog;
    if (fog) {
      fog.color.lerp(CAVE_FOG, k);
      fog.near *= 1 - k * 0.95;
      fog.far = fog.far * (1 - k) + 38 * k;
    }
    if (this._scene.background?.isColor) this._scene.background.lerp(CAVE_FOG, k);
  }

  _applyUnderwater() {
    const u = this._underwater;
    const fog = this._scene.fog;
    if (!u || !fog) return;
    fog.color.set(u.color).multiplyScalar(0.55);
    fog.near = 0.5;
    fog.far = Math.max(4, u.visibility);
    if (this._scene.background?.isColor) this._scene.background.copy(fog.color);
  }

  _applyAir() {
    const P = this._P;
    const p = this._p;
    const sun = this._time.getSunDirection(this._sunDir);
    const h = sun.y;
    const day = this._time.daylight;
    // Crepúsculo: máximo con el sol en el horizonte (al amanecer y al atardecer).
    const twilight = clamp01(1 - Math.abs(h + 0.03) / 0.22);

    // Cielo
    this._zenith.copy(p.night.zenith).lerp(p.day.zenith, day).lerp(p.twilight.zenith, twilight * 0.45);
    this._horizon.copy(p.night.horizon).lerp(p.day.horizon, day).lerp(p.twilight.horizon, twilight * 0.75);
    this._ground.copy(p.night.ground).lerp(p.day.ground, day).lerp(p.twilight.ground, twilight * 0.4);
    this._sunColor.copy(p.twilight.sun).lerp(p.day.sun, smoothstep(0.02, 0.35, h));
    this._sky.setColors({ zenith: this._zenith, horizon: this._horizon, ground: this._ground });
    this._sky.setSunDirection(sun);
    this._sky.setSunColor(this._sunColor);
    this._sky.setStars(P.NIGHT.STARS * (1 - smoothstep(-0.18, 0.02, h)) * (1 - (this._cloud ?? 0))); // nublado: sin estrellas

    // Luz directa: el sol de día; de noche, luz de luna desde el lado opuesto.
    // En el horizonte ambas son ~0, así que el cambio de dirección no se nota.
    if (h >= 0) {
      this._lightDir.copy(sun);
      this._lighting.setSun({
        direction: this._lightDir,
        color: this._sunColor,
        intensity: P.DAY.SUN_INTENSITY * smoothstep(-0.01, 0.22, h),
      });
    } else {
      // Noche: luz de la luna que más ilumina; sin luna, un resto de luz de estrellas.
      const moon = this._celestial?.getNightLight();
      const strength = moon ? 0.3 + 0.7 * moon.strength : 0.3;
      if (moon && moon.strength > 0.02) this._lightDir.copy(moon.direction);
      else this._lightDir.copy(sun).negate();
      this._lighting.setSun({
        direction: this._lightDir,
        color: p.night.moon,
        intensity: P.NIGHT.MOON_INTENSITY * strength * smoothstep(0.0, 0.2, -h),
      });
    }

    // Luz ambiente
    this._hemiSky.copy(p.night.hemiSky).lerp(p.day.hemiSky, day);
    this._hemiGround.copy(p.night.hemiGround).lerp(p.day.hemiGround, day);
    this._lighting.setAmbient({
      skyColor: this._hemiSky,
      groundColor: this._hemiGround,
      intensity: P.NIGHT.HEMI_INTENSITY + (P.DAY.HEMI_INTENSITY - P.NIGHT.HEMI_INTENSITY) * day,
    });

    // Niebla y fondo del color del horizonte (el terreno lejano se funde con el cielo).
    const fog = this._scene.fog;
    if (fog) {
      fog.color.copy(this._horizon);
      fog.near = this._fogNear * this.visibility;
      fog.far = this._fogFar * this.visibility;
    }
    if (this._scene.background?.isColor) this._scene.background.copy(this._horizon);
  }

  /** Distancia de la niebla (los mapas diseñados se ven más lejos: hay terreno lejano). */
  setFogRange(near, far) {
    this._fogNear = near;
    this._fogFar = far;
  }

  /** Sin atmósfera: cielo negro con estrellas, sol blanco y duro, sombras marcadas. */
  _applyAirless() {
    const P = this._P;
    const sun = this._fixedSun ? this._sunDir.copy(this._fixedSun) : this._time.getSunDirection(this._sunDir);
    const h = sun.y;
    this._sky.setColors({ zenith: this._airlessGround, horizon: this._airlessColor, ground: this._airlessGround });
    this._sky.setSunDirection(sun);
    this._sky.setSunColor(0xffffff);
    this._sky.setStars(1.2);
    if (h >= 0) {
      this._lighting.setSun({ direction: sun, color: 0xffffff, intensity: P.DAY.SUN_INTENSITY * 1.2 * smoothstep(-0.02, 0.12, h) });
    } else {
      // De noche, la luz reflejada por el planeta (o la luna) que hay en el cielo.
      const shine = this._celestial?.getNightLight();
      if (shine && shine.strength > 0.02) this._lightDir.copy(shine.direction);
      else this._lightDir.copy(sun).negate();
      this._lighting.setSun({ direction: this._lightDir, color: 0x9fc0ff, intensity: 0.5 * (shine ? 0.3 + 0.7 * shine.strength : 0.3) });
    }
    this._lighting.setAmbient({ skyColor: 0x6a7080, groundColor: 0x1a1a1e, intensity: 0.32 });
    const fog = this._scene.fog;
    if (fog) {
      fog.color.copy(this._airlessColor);
      fog.near = this._fogNear * 1.4 * this.visibility;
      fog.far = this._fogFar * 1.2 * this.visibility;
    }
    if (this._scene.background?.isColor) this._scene.background.copy(this._airlessColor);
  }
}

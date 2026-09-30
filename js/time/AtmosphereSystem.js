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

    this.visibility = 1;         // factor aplicado a la niebla (1 = normal)
    this._targetVisibility = 1;
    this.apply(); // estado inicial coherente con la hora de inicio
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

  apply() {
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
    this._sky.setStars(P.NIGHT.STARS * (1 - smoothstep(-0.18, 0.02, h)));

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
}

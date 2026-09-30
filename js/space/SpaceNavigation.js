/**
 * SpaceNavigation — vuelo de la nave por el sistema solar. Sin Three.js.
 *
 * Unidades: kilómetros y segundos. La nave tiene posición (x, y, z) respecto al
 * centro del planeta de inicio, rumbo (yaw), cabeceo (pitch) y velocidad hacia delante.
 * Mandos: forward (−1..1) empuje, turn (−1..1) girar, vertical (−1..1) cabecear,
 * boost (turbo). Sin mandos la nave frena poco a poco (no es física realista).
 *
 * - Nadie puede atravesar un cuerpo: se queda a MIN_APPROACH radios del centro.
 * - Cerca de un cuerpo (APPROACH_FACTOR radios, o LAND_ALTITUDE km) se puede aterrizar en él.
 * - Frenado de proximidad: cerca de un cuerpo la velocidad máxima baja (no se pasa de largo).
 * - Rumbo automático (`autopilotTarget`): gira y cabecea solo hacia el cuerpo elegido.
 * - Objetos menores (`extras`: meteoritos) no se pueden atravesar ni aterrizar en ellos:
 *   al ir hacia uno la velocidad baja y el rumbo automático se detiene a `stopKm` de su superficie.
 * - La zona del sistema tiene un radio alrededor de su centro (la estrella):
 *   al salir de ella, `outsideZone` lo indica (sin nodo galáctico la nave no
 *   puede pasar; con él, falla: Etapa 6).
 * - Crucero interplanetario: lejos de todos los cuerpos (más de CRUISE.MIN_ALTITUDE_KM)
 *   y con impulso (Shift), la velocidad crece en proporción a sí misma hasta
 *   CRUISE.MAX_SPEED; el frenado de proximidad la baja sola al acercarse a un cuerpo.
 */
export class SpaceNavigation {
  /**
   * @param {object} p.config  sección SPACE
   * @param {Function} p.bodies () → [{ id, name, radiusKm, position: {x,y,z} }]
   */
  constructor({ config, bodies, extras = () => [] }) {
    this._cfg = config;
    this._bodies = bodies;
    this._extras = extras; // () → [{ id, name, position, radiusKm, stopKm, minKm }]
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 0;      // km/s hacia delante (negativo = marcha atrás)
    this.onEvent = null; // (type, data)
    this.autopilotTarget = null; // id del cuerpo al que apunta el rumbo automático
    this.cruising = false;       // crucero interplanetario activo
    this.zone = { center: { x: 0, y: 0, z: 0 }, radius: config.ZONE_RADIUS };
    this._zoneNotice = 0;
  }

  /** Coloca la nave a `altitude` km sobre un punto de la superficie de un cuerpo. */
  placeNear(body, dir, altitudeKm) {
    const d = body.radiusKm + altitudeKm;
    this.pos = { x: body.position.x + dir.x * d, y: body.position.y + dir.y * d, z: body.position.z + dir.z * d };
    // Mirando hacia fuera del cuerpo, en horizontal: forward = (−sin yaw, 0, −cos yaw) ∥ dir.
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = 0;
    this.speed = 0;
  }

  /** Fija (o quita) el rumbo automático hacia un cuerpo o un meteorito. */
  setAutopilot(target) {
    this.autopilotTarget = target;
    this._arrived = null;
  }

  /** Vector unitario hacia donde apunta el morro. */
  get forward() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  /** Detiene la nave (piloto de pie, sin batería…). */
  stop(dt) {
    this.speed = approach(this.speed, 0, this._cfg.ACCELERATION * dt);
    this.pitch = approach(this.pitch, 0, this._cfg.PITCH_RATE * dt);
    this._move(dt);
  }

  /**
   * @param {object} controls { forward, turn, vertical, boost }
   * @param {boolean} powered hay batería para acelerar
   */
  update(dt, controls, powered = true) {
    const c = this._cfg;
    const ctl = powered ? controls : { forward: 0, turn: controls.turn, vertical: controls.vertical, boost: false };
    if (ctl.turn || ctl.vertical) this.autopilotTarget = null; // tocar la dirección cancela el rumbo
    // Frenado de proximidad: cuanto más cerca de un cuerpo, menos velocidad máxima.
    const near = this.survey().nearest;
    const brake = c.CRUISE && ctl.boost ? c.CRUISE.PROXIMITY_BRAKE : c.PROXIMITY_BRAKE;
    const cap = Math.max(c.CRUISE_SPEED * 0.25, near.altitude * brake);
    const boostSpeed = c.CRUISE_SPEED * c.BOOST_MULTIPLIER;
    const cruise = c.CRUISE && ctl.boost && near.altitude > c.CRUISE.MIN_ALTITUDE_KM;
    let max = Math.min(cap, cruise ? c.CRUISE.MAX_SPEED : c.CRUISE_SPEED * (ctl.boost ? c.BOOST_MULTIPLIER : 1));
    // Hacia un meteorito cercano: frenar para detenerse a su lado.
    const f = this.forward;
    for (const e of this._extras()) {
      const dx = e.position.x - this.pos.x;
      const dy = e.position.y - this.pos.y;
      const dz = e.position.z - this.pos.z;
      const d = Math.hypot(dx, dy, dz);
      const align = (dx * f.x + dy * f.y + dz * f.z) / (d || 1);
      const brake = Math.max(0.004, (d - e.radiusKm - e.stopKm) * 1.2);
      if (this.autopilotTarget === e.id) {
        // Rumbo a un meteorito: primero apuntar, después acercarse frenando.
        max = Math.min(max, align > 0.95 ? brake : Math.min(brake, 0.3));
      } else if (align > 0.3 && d < (this._cfg.METEORS?.APPROACH_RANGE_KM ?? 5)) {
        max = Math.min(max, brake);
      }
      if (this.autopilotTarget === e.id && d - e.radiusKm <= e.stopKm + 0.005) {
        max = 0;
        if (this._arrived !== e.id) {
          this._arrived = e.id;
          this.autopilotTarget = null;
          this.speed = 0;
          this.onEvent?.('EXTRA_ARRIVED', { id: e.id });
        }
      }
    }
    let target = ctl.forward > 0 ? max * ctl.forward : ctl.forward < 0 ? c.CRUISE_SPEED * c.REVERSE_FACTOR * ctl.forward : this.speed * 0.985;
    let accel = c.ACCELERATION * (ctl.boost ? c.BOOST_MULTIPLIER : 1);
    if (c.CRUISE && Math.abs(this.speed) > boostSpeed * 0.9) {
      // A velocidades de crucero se acelera y se frena en proporción a la velocidad.
      target = Math.min(target, cap);
      const rate = target > this.speed ? c.CRUISE.ACCEL_RATE : c.CRUISE.BRAKE_RATE;
      accel = Math.max(accel, Math.abs(this.speed) * rate);
    }
    this.speed = approach(this.speed, target, accel * dt);
    this.cruising = this.speed > boostSpeed * 1.05;
    if (this.autopilotTarget) this._steer(dt);
    this.yaw -= ctl.turn * c.TURN_RATE * dt;
    this.pitch = Math.max(-c.MAX_PITCH, Math.min(c.MAX_PITCH, this.pitch + ctl.vertical * c.PITCH_RATE * dt));
    this._move(dt);
  }

  /** Gira y cabecea hacia el cuerpo del rumbo automático. */
  _steer(dt) {
    const b = this._bodies().find((x) => x.id === this.autopilotTarget) ?? this._extras().find((x) => x.id === this.autopilotTarget);
    if (!b) {
      this.autopilotTarget = null;
      return;
    }
    let dx = b.position.x - this.pos.x;
    let dy = b.position.y - this.pos.y;
    let dz = b.position.z - this.pos.z;
    let d = Math.hypot(dx, dy, dz);
    // Si otro cuerpo tapa el camino, apuntar a un lado de él (no atravesar planetas).
    const aim = this._avoid(b, dx / d, dy / d, dz / d, d);
    if (aim) {
      dx = aim.x - this.pos.x;
      dy = aim.y - this.pos.y;
      dz = aim.z - this.pos.z;
      d = Math.hypot(dx, dy, dz);
    }
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.max(-this._cfg.MAX_PITCH, Math.min(this._cfg.MAX_PITCH, Math.asin(dy / d)));
    let dyaw = yaw - this.yaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const turn = this._cfg.TURN_RATE * 1.5 * dt;
    this.yaw += Math.max(-turn, Math.min(turn, dyaw));
    this.pitch = approach(this.pitch, pitch, this._cfg.PITCH_RATE * 1.5 * dt);
  }

  /**
   * Punto al que apuntar para rodear el cuerpo más cercano que se interpone en la
   * línea recta hacia `target` (dirección t, distancia dist), o null si el camino está libre.
   */
  _avoid(target, tx, ty, tz, dist) {
    let best = null;
    let bestAlong = Infinity;
    for (const o of this._bodies()) {
      if (o.id === target.id) continue;
      const bx = o.position.x - this.pos.x;
      const by = o.position.y - this.pos.y;
      const bz = o.position.z - this.pos.z;
      const along = bx * tx + by * ty + bz * tz;
      if (along <= 0 || along >= dist || along >= bestAlong) continue;
      // Vector desde el punto más cercano del camino hasta el centro del cuerpo.
      const cx = bx - tx * along;
      const cy = by - ty * along;
      const cz = bz - tz * along;
      const miss = Math.hypot(cx, cy, cz);
      const clearance = o.radiusKm * 1.6;
      if (miss >= clearance) continue;
      // Dirección hacia el lado por el que pasa el camino (perpendicular a la línea nave–cuerpo).
      const D = Math.hypot(bx, by, bz);
      const ux = bx / D;
      const uy = by / D;
      const uz = bz / D;
      let wx = -cx;
      let wy = -cy;
      let wz = -cz;
      if (miss < 1e-6) {
        wx = -uz; // justo en la línea: rodear por un lado (horizontal)
        wy = 0;
        wz = ux;
      }
      const wu = wx * ux + wy * uy + wz * uz;
      wx -= ux * wu;
      wy -= uy * wu;
      wz -= uz * wu;
      const wl = Math.hypot(wx, wy, wz) || 1;
      wx /= wl;
      wy /= wl;
      wz /= wl;
      let ax;
      let ay;
      let az;
      if (D < clearance * 1.05) {
        // Muy cerca: primero alejarse del cuerpo y hacia un lado.
        ax = this.pos.x + (-ux + wx) * clearance;
        ay = this.pos.y + (-uy + wy) * clearance;
        az = this.pos.z + (-uz + wz) * clearance;
      } else {
        // Tangente a la esfera de seguridad.
        const th = Math.asin(Math.min(1, clearance / D));
        const c = Math.cos(th) * D;
        const sn = Math.sin(th) * D;
        ax = this.pos.x + ux * c + wx * sn;
        ay = this.pos.y + uy * c + wy * sn;
        az = this.pos.z + uz * c + wz * sn;
      }
      best = { x: ax, y: ay, z: az };
      bestAlong = along;
    }
    return best;
  }

  _move(dt) {
    const f = this.forward;
    const p = this.pos;
    p.x += f.x * this.speed * dt;
    p.y += f.y * this.speed * dt;
    p.z += f.z * this.speed * dt;
    // No atravesar cuerpos.
    for (const b of this._bodies()) {
      const dx = p.x - b.position.x;
      const dy = p.y - b.position.y;
      const dz = p.z - b.position.z;
      const d = Math.hypot(dx, dy, dz);
      const min = b.radiusKm * this._cfg.MIN_APPROACH;
      if (d < min && d > 1e-6) {
        const k = min / d;
        p.x = b.position.x + dx * k;
        p.y = b.position.y + dy * k;
        p.z = b.position.z + dz * k;
        this.speed *= 0.3;
      }
    }
    // Meteoritos: nunca más cerca de minKm de su superficie (no se aterriza en ellos).
    for (const e of this._extras()) {
      const dx = p.x - e.position.x;
      const dy = p.y - e.position.y;
      const dz = p.z - e.position.z;
      const d = Math.hypot(dx, dy, dz);
      const min = e.radiusKm + e.minKm;
      if (d < min && d > 1e-9) {
        const k = min / d;
        p.x = e.position.x + dx * k;
        p.y = e.position.y + dy * k;
        p.z = e.position.z + dz * k;
        if (this.speed > 0) this.onEvent?.('EXTRA_BLOCKED', { id: e.id });
        this.speed = Math.min(0, this.speed);
      }
    }
    this._zoneNotice = Math.max(0, this._zoneNotice - dt);
  }

  /** Distancia al centro del sistema (la estrella). */
  get distanceFromCenter() {
    const c = this.zone.center;
    return Math.hypot(this.pos.x - c.x, this.pos.y - c.y, this.pos.z - c.z);
  }

  /** ¿Está fuera de la zona del sistema? */
  get outsideZone() {
    return this.distanceFromCenter > this.zone.radius;
  }

  /** Devuelve la nave al borde de la zona (sin nodo galáctico no se puede salir). */
  clampToZone() {
    const d = this.distanceFromCenter;
    const max = this.zone.radius;
    if (d <= max) return false;
    const k = (max * 0.995) / d;
    const c = this.zone.center;
    this.pos.x = c.x + (this.pos.x - c.x) * k;
    this.pos.y = c.y + (this.pos.y - c.y) * k;
    this.pos.z = c.z + (this.pos.z - c.z) * k;
    this.speed = Math.min(0, this.speed);
    if (this._zoneNotice === 0) {
      this._zoneNotice = 4;
      this.onEvent?.('ZONE_LIMIT', {});
    }
    return true;
  }

  /** Distancias (km a la superficie) y cuál es el cuerpo más cercano. */
  survey() {
    const list = this._bodies().map((b) => {
      const d = Math.hypot(this.pos.x - b.position.x, this.pos.y - b.position.y, this.pos.z - b.position.z);
      const altitude = d - b.radiusKm;
      const canLand = b.landable !== false && (d < b.radiusKm * this._cfg.APPROACH_FACTOR || altitude < this._cfg.LAND_ALTITUDE);
      return { id: b.id, name: b.name, kind: b.kind, parent: b.parent, distance: d, altitude, canLand };
    });
    list.sort((a, b) => a.altitude - b.altitude);
    return { bodies: list, nearest: list[0], landable: list.find((b) => b.canLand) ?? null };
  }
}

function approach(v, t, step) {
  if (v < t) return Math.min(t, v + step);
  if (v > t) return Math.max(t, v - step);
  return v;
}

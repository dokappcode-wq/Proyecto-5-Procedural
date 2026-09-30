import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';
import { orbitPosition } from '../celestial/CelestialCatalog.js';

/**
 * ShipMapPanel — Tecnología 2 de la nave: el mapa.
 *
 *   "Mapa de <cuerpo>": la región del cuerpo actual vista desde arriba (PlanetMapRenderer) con la
 *   posición del jugador, la nave, el punto de inicio y la cama.
 *   "Mapa planetario": el planeta y sus lunas en sus órbitas (CelestialCatalog,
 *   posiciones según la hora del TimeSystem). Las lunas no se pueden visitar:
 *   falta el "nodo espacial".
 *
 * Solo vista: lee estado (consultas de solo lectura) y no modifica nada.
 */
const SIZE = 520;

export class ShipMapPanel extends ModalPanel {
  /**
   * @param {object} p.sources { map: PlanetMapRenderer, world, player, ship, time,
   *                             getCatalog() → CelestialCatalog, getBed() → pieza|null, spaceNodeRequired }
   */
  constructor({ container, input, events, sources }) {
    super({ id: 'ship-map-panel', title: '🗺️ Mapa', container, input, events });
    this._src = sources;
    this.tab = 'PLANET';
    this.body.innerHTML = `
      <div class="map-tabs" role="tablist">
        <button type="button" data-tab="PLANET" role="tab">Mapa de la región</button>
        <button type="button" data-tab="SYSTEM" role="tab">Mapa planetario</button>
      </div>
      <div class="map-layout">
        <canvas width="${SIZE}" height="${SIZE}" aria-label="Mapa"></canvas>
        <aside class="map-side"></aside>
      </div>`;
    this._canvas = this.body.querySelector('canvas');
    this._ctx = this._canvas.getContext('2d');
    this._side = this.body.querySelector('.map-side');
    this.body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.showTab(b.dataset.tab)));
    this._timer = 0;
  }

  showTab(tab) {
    this.tab = tab;
    this.render();
  }

  render() {
    this.body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    this.body.querySelector('[data-tab="PLANET"]').textContent = `Mapa: ${this._src.planetConfig.NAME}`;
    this._side.replaceChildren();
    if (this.tab === 'PLANET') this._renderPlanetSide();
    else this._renderSystemSide();
    this._draw();
  }

  tick(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.2;
    this._draw();
  }

  _draw() {
    if (this.tab === 'PLANET') this._drawPlanet();
    else this._drawSystem();
  }

  // ---- Mapa de la región ---------------------------------------------------------

  _drawPlanet() {
    const ctx = this._ctx;
    const { map, player, ship, world } = this._src;
    ctx.fillStyle = '#0b1522';
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (!map.ready) {
      ctx.fillStyle = '#a9b6c4';
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Cartografiando ${this._src.planetConfig.NAME}… ${Math.round(map.progress * 100)} %`, SIZE / 2, SIZE / 2);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.canvas, 0, 0, SIZE, SIZE);
    // Rejilla de coordenadas cada 128 m.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(SIZE, p);
      ctx.stroke();
    }
    const at = (x, z) => map.toMap(x, z).map((v) => v * SIZE);

    const spawn = world.getSpawnPoint();
    const [sx, sz] = at(spawn.x, spawn.z);
    marker(ctx, sx, sz, '#ffe38a', 'Inicio', 'dot');

    const bed = this._src.getBed?.();
    if (bed) {
      const [bx, bz] = at(bed.x, bed.z);
      marker(ctx, bx, bz, '#ff9ecf', 'Cama', 'dot');
    }

    // Señales (nodo espacial, cofres…): anillo que late.
    const pulse = (performance.now() / 1000) % 1.2;
    for (const m of this._src.getMarkers?.() ?? []) {
      const [mx, mz] = at(m.x, m.z);
      ctx.beginPath();
      ctx.arc(mx, mz, 6 + pulse * 12, 0, Math.PI * 2);
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = 1 - pulse / 1.2;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      marker(ctx, mx, mz, m.color, m.label);
    }

    const s = ship.ship;
    const [shx, shz] = at(s.x, s.z);
    arrow(ctx, shx, shz, s.yaw, '#ff9a4a', 9);
    label(ctx, shx, shz + 18, 'Nave', '#ffcf9e');

    const p = player.position;
    const [px, pz] = at(p.x, p.z);
    arrow(ctx, px, pz, player.yaw, '#ffffff', 7);
  }

  _renderPlanetSide() {
    const { world, planetConfig } = this._src;
    const items = Object.values(planetConfig.BIOMES).map(
      (b) => `<li><span class="swatch" style="background:${hex(b.COLORS.GROUND)}"></span>${escapeHtml(b.NAME)}</li>`,
    );
    if (planetConfig.WATER.POND_COUNT > 0) items.push(`<li><span class="swatch" style="background:${hex(planetConfig.WATER.COLOR)}"></span>Agua dulce</li>`);
    if (planetConfig.HAS_SEA) items.push(`<li><span class="swatch" style="background:${hex(planetConfig.COLORS.SEA)}"></span>Mar</li>`);
    this._side.innerHTML = `
      <h3>${escapeHtml(planetConfig.NAME)}</h3>
      <p class="muted">Seed "${escapeHtml(world.seed?.text ?? '')}" · ${world.getInfo().worldSize} m de lado</p>
      <ul class="legend">${items.join('')}</ul>
      <ul class="legend markers">
        <li><span class="mk" style="color:#fff">▲</span>Tú</li>
        <li><span class="mk" style="color:#ff9a4a">▲</span>Nave</li>
        <li><span class="mk" style="color:#ffe38a">●</span>Inicio</li>
        <li><span class="mk" style="color:#ff9ecf">●</span>Cama (reaparición)</li>
        ${(this._src.getMarkers?.() ?? []).map((m) => `<li><span class="mk" style="color:${m.color}">◎</span>${escapeHtml(m.label)}</li>`).join('')}
      </ul>
      <p class="muted small">${this._src.hasSpaceNode?.() ? 'Con el nodo espacial la nave puede salir al espacio (a los mandos, vuela alto y pulsa O).' : 'Instala el nodo espacial en una ranura libre de la nave para poder salir al espacio.'}</p>`;
  }

  // ---- Mapa planetario -----------------------------------------------------------

  _drawSystem() {
    const ctx = this._ctx;
    const catalog = this._src.getCatalog();
    const hours = this._src.time.totalHours;
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    // Fondo con estrellas fijas.
    ctx.fillStyle = '#04070f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    let seed = 1234;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(220,230,255,${0.2 + rnd() * 0.6})`;
      ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 1.2, 1.2);
    }

    // Luz del sol (desde la izquierda).
    const glow = ctx.createRadialGradient(-40, cy, 10, -40, cy, 260);
    glow.addColorStop(0, 'rgba(255,230,170,0.35)');
    glow.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Proyección oblicua: plano orbital visto desde arriba e inclinado.
    const maxDist = Math.max(...catalog.bodies.map((b) => b.distanceKm));
    const scale = (SIZE * 0.42) / maxDist;
    const project = (p) => [cx + p.x * scale, cy + p.z * scale * 0.42 - p.y * scale * 0.9];

    const drawOrbit = (body) => {
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const [x, y] = project(orbitPosition(body, hours + (i / 96) / body.speed));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(160,190,230,0.35)';
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Las lunas que están "detrás" del planeta se dibujan antes.
    const moons = catalog.bodies.map((b) => ({ b, p: orbitPosition(b, hours) }));
    moons.forEach(({ b }) => drawOrbit(b));
    const drawMoon = ({ b, p }) => {
      const [x, y] = project(p);
      const r = Math.max(5, Math.min(16, b.radiusKm / 40));
      const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.3, r * 0.2, x, y, r);
      grad.addColorStop(0, hex(lighten(b.color, 0.25)));
      grad.addColorStop(1, hex(lighten(b.color, -0.45)));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      label(ctx, x, y - r - 8, b.name, '#e8eef6');
    };
    moons.filter((m) => m.p.z < 0).forEach(drawMoon);

    // Planeta: disco con el mapa real del planeta y sombra del lado nocturno.
    const pr = 46;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = hex(this._src.homeConfig.COLORS.SEA);
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
    const homeMap = this._src.homeMap;
    if (homeMap.ready) ctx.drawImage(homeMap.canvas, cx - pr * 0.72, cy - pr * 0.72, pr * 1.44, pr * 1.44);
    const shade = ctx.createLinearGradient(cx - pr, cy, cx + pr, cy);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.55, 'rgba(0,0,0,0.15)');
    shade.addColorStop(1, 'rgba(0,0,10,0.7)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - pr, cy - pr, pr * 2, pr * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(150,200,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, pr + 1, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, cx, cy + pr + 16, `${catalog.planet.name}${this._src.onHome?.() ? ' (estás aquí)' : ''}`, '#bfe3ff');

    moons.filter((m) => m.p.z >= 0).forEach(drawMoon);

    ctx.fillStyle = 'rgba(169,182,196,0.8)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Tamaños y distancias no a escala · posiciones según la hora actual', 10, SIZE - 10);
  }

  _renderSystemSide() {
    const catalog = this._src.getCatalog();
    const locked = this._src.spaceNodeRequired && !this._src.hasSpaceNode?.();
    const cards = catalog.bodies.map((b) => `
      <div class="moon-card">
        <div class="moon-title"><span class="swatch round" style="background:${hex(b.color)}"></span>${escapeHtml(b.name)}</div>
        <dl>
          <dt>Radio</dt><dd>${b.radiusKm.toLocaleString('es-ES')} km</dd>
          <dt>Distancia</dt><dd>${b.distanceKm.toLocaleString('es-ES')} km</dd>
          <dt>Órbita</dt><dd>${Math.round(b.periodHours)} h (${(b.periodHours / 24).toFixed(1)} días)</dd>
          <dt>Inclinación</dt><dd>${((b.inclination * 180) / Math.PI).toFixed(1)}°</dd>
        </dl>
        ${locked ? '<p class="locked">🔒 No visitable: falta el <b>nodo espacial</b>.</p>' : '<p class="muted small">🚀 Pilota la nave hasta ella (en el espacio, tecla de rumbo).</p>'}
      </div>`);
    const n = catalog.bodies.length;
    this._side.innerHTML = `
      <h3>${escapeHtml(this._src.systemName)}</h3>
      <p class="muted">${n === 0 ? 'Sin lunas.' : n === 1 ? 'Una luna visible desde la superficie.' : `${n} lunas visibles desde la superficie.`}</p>
      ${cards.join('')}
      <button type="button" class="open-star-map">🌌 Abrir mapa estelar 3D</button>
      <p class="muted small">${locked ? 'Con el nodo espacial instalado la nave puede salir al espacio y viajar a las lunas.' : ''}</p>`;
    this._side.querySelector('.open-star-map').addEventListener('click', () => {
      this.setOpen(false);
      this._events.emit(GameEvents.STAR_MAP_REQUEST, { open: true });
    });
  }
}

// ---- Dibujo ------------------------------------------------------------------------

function arrow(ctx, x, y, yaw, color, size) {
  // yaw = 0 mira hacia −Z (arriba en el mapa); yaw crece hacia la izquierda.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-yaw);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, size * 0.8);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.7, size * 0.8);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function marker(ctx, x, y, color, text) {
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
  label(ctx, x, y - 10, text, color);
}

function label(ctx, x, y, text, color) {
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function hex(n) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function lighten(hexColor, amount) {
  const ch = (shift) => {
    const v = (hexColor >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

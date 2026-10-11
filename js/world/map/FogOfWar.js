/**
 * FogOfWar — lo que el jugador ha descubierto del mapa del planeta de inicio (P11): una lista
 * de círculos revelados (las torres de reconocimiento y el entorno del inicio). Sin DOM ni
 * Three.js: el mapa lo dibuja con draw(). Los datos guardados vienen de un archivo que puede
 * estar manipulado, así que restore() valida cada número y limita el número de círculos.
 */
export class FogOfWar {
  constructor({ limit = 64 } = {}) {
    this.circles = [];   // { x, z, r } en metros
    this.version = 0;    // sube con cada cambio (para no volver a dibujar sin motivo)
    this._limit = limit;
  }

  /** Revela un círculo. Si ya está dentro de otro revelado no hace nada. @returns {boolean} */
  reveal(x, z, r) {
    if (![x, z, r].every(Number.isFinite) || r <= 0) return false;
    if (this.circles.some((c) => Math.hypot(c.x - x, c.z - z) + r <= c.r + 1)) return false;
    if (this.circles.length >= this._limit) return false;
    this.circles.push({ x, z, r: Math.min(r, 2000) });
    this.version++;
    return true;
  }

  isRevealed(x, z) {
    return this.circles.some((c) => Math.hypot(c.x - x, c.z - z) <= c.r);
  }

  snapshot() {
    return this.circles.map((c) => ({ x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, r: Math.round(c.r) }));
  }

  /** Datos no fiables: solo círculos con números razonables. */
  restore(list) {
    this.circles = [];
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (this.circles.length >= this._limit) break;
      if (!c || typeof c !== 'object') continue;
      const { x, z, r } = c;
      if (![x, z, r].every(Number.isFinite) || r <= 0 || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
      this.circles.push({ x, z, r: Math.min(r, 2000) });
    }
    this.version++;
  }

  /**
   * Dibuja la niebla encima de un mapa ya dibujado. `toPx(x, z)` → [px, py] en el canvas del
   * mapa; `scratch` es un canvas del mismo tamaño (se reutiliza para no crear uno cada vez).
   */
  draw(ctx, toPx, size, scratch, color = 'rgb(6, 10, 16)') {
    const g = scratch.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, size, size);
    g.fillStyle = color;
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'destination-out';
    for (const c of this.circles) {
      const [x, y] = toPx(c.x, c.z);
      const rp = toPx(c.x + c.r, c.z)[0] - x;
      const grad = g.createRadialGradient(x, y, Math.max(0, rp * 0.72), x, y, rp);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, rp, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(scratch, 0, 0);
  }
}

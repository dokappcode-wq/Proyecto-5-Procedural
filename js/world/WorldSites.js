import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';

/**
 * WorldSites — dónde van los lugares especiales del mundo (bases de goblins, grupos de
 * gólems, la torre del ermitaño, el centro de investigación…). Datos puros, sin Three.js.
 *
 * Cada petición dice cuántos sitios quiere, a qué distancia del inicio, en qué biomas,
 * cuánto sitio ocupa y si necesita una explanada. Todo sale de la semilla: misma semilla,
 * mismos sitios. Alrededor del inicio (SAFE_RADIUS) nunca hay nada.
 *
 * @param {object} p
 * @param {number|string} p.seed
 * @param {object[]} p.requests  [{ id, kind?, count, distance:[min,max], biomes:{ID:peso mínimo}, radius,
 *                                  spacing, maxRelief, minHeight, maxHeight, pad, padBlend }]
 * @param {object} p.terrain     { sample(x,z) → { height, biomes, coast, river }, heightAt(x,z) }
 * @param {object} p.bounds      { minX, maxX, minZ, maxZ }
 * @param {object} p.spawn       { x, z }
 * @param {number} [p.safeRadius]
 * @param {object[]} [p.avoid]   zonas prohibidas { x, z, r }
 * @param {Function} [p.isWater]
 * @returns {{ sites: Record<string, object[]>, pads: object[], clearZones: object[] }}
 */
export function planSites({ seed, requests, terrain, bounds, spawn, safeRadius = 0, avoid = [], isWater = () => false }) {
  const placed = [];
  const sites = {};
  const pads = [];
  const clearZones = [];
  for (const req of requests) {
    const rng = new SeededRandom(deriveSeed(seed, `site:${req.id}`));
    const kind = req.kind ?? req.id;
    const list = (sites[kind] ??= []);
    const start = list.length;
    const want = start + (req.count ?? 1);
    const [dMin, dMax] = req.distance ?? [safeRadius, Infinity];
    const minD = Math.max(dMin, safeRadius + req.radius);
    const margin = (req.radius ?? 10) + 40;
    const attempts = (req.count ?? 1) * (req.attempts ?? 400);
    for (let a = 0; a < attempts && list.length < want; a++) {
      let x;
      let z;
      if (Number.isFinite(dMax)) {
        const ang = rng.range(0, Math.PI * 2);
        const d = rng.range(minD, Math.max(minD + 1, dMax));
        x = spawn.x + Math.cos(ang) * d;
        z = spawn.z + Math.sin(ang) * d;
      } else {
        x = rng.range(bounds.minX + margin, bounds.maxX - margin);
        z = rng.range(bounds.minZ + margin, bounds.maxZ - margin);
      }
      if (x < bounds.minX + margin || x > bounds.maxX - margin || z < bounds.minZ + margin || z > bounds.maxZ - margin) continue;
      if (Math.hypot(x - spawn.x, z - spawn.z) < minD) continue;
      const r = req.radius ?? 10;
      if (avoid.some((v) => Math.hypot(v.x - x, v.z - z) < v.r + r)) continue;
      const spacing = req.spacing ?? 40;
      if (placed.some((s) => Math.hypot(s.x - x, s.z - z) < Math.max(spacing, s.radius + r + 10))) continue;
      const s = terrain.sample(x, z);
      if (s.coast > 0.01 || s.river > 0.05) continue;
      if (req.biomes && !Object.entries(req.biomes).some(([id, w]) => (s.biomes[id] ?? 0) >= w)) continue;
      if (req.minHeight !== undefined && s.height < req.minHeight) continue;
      if (req.maxHeight !== undefined && s.height > req.maxHeight) continue;
      // Relieve dentro del sitio: altura media, mínimo y máximo en dos anillos.
      let lo = s.height;
      let hi = s.height;
      let sum = s.height;
      let n = 1;
      let wet = isWater(x, z);
      for (const k of [0.5, 1]) {
        for (let i = 0; i < 8; i++) {
          const ax = x + Math.cos((i / 8) * Math.PI * 2) * r * k;
          const az = z + Math.sin((i / 8) * Math.PI * 2) * r * k;
          const h = terrain.heightAt(ax, az);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          sum += h;
          n++;
          if (isWater(ax, az)) wet = true;
        }
      }
      if (wet || hi - lo > (req.maxRelief ?? 6)) continue;
      const site = { id: `${kind}:${list.length}`, kind, x, z, radius: r, height: req.pad ? sum / n : s.height, yaw: rng.range(0, Math.PI * 2), seed: deriveSeed(seed, `site:${kind}:${list.length}`) };
      list.push(site);
      placed.push(site);
      if (req.pad) pads.push({ x, z, radius: r, height: site.height, blend: req.padBlend ?? 10 });
      if (req.clear !== false) clearZones.push({ x, z, r: req.clearRadius ?? r });
    }
  }
  return { sites, pads, clearZones };
}

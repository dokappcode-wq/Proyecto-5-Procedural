#!/usr/bin/env node
/**
 * bake.mjs — prepara un mapa diseñado: lee maps/<id>/design.mjs, esculpe el relieve
 * (costa, cordilleras, mesetas, ríos, lagos), lo erosiona, aplana caminos y explanadas,
 * decide el suelo, el bioma, la región y la vegetación de cada celda y lo guarda en:
 *   maps/<id>/<id>.map.json    datos (lugares, ríos, lagos, regiones…)
 *   maps/<id>/<id>.map.bin.gz  rejillas (alturas, agua, suelo, bioma, región, vegetación)
 *   maps/<id>/preview.png      vista desde arriba (para revisar el diseño)
 *
 * Uso: node tools/map/bake.mjs eden [--fast]
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimplexNoise } from '../../js/world/noise/SimplexNoise.js';
import { deriveSeed, hash2D } from '../../js/core/SeededRandom.js';
import {
  SURFACE, BIOME_INDEX, SEA, FLORA, FLORA_BY_NAME, HEIGHT_OFFSET, HEIGHT_SCALE,
} from '../../js/world/map/MapLegend.js';
import { Grid, spline, measure, nearestOnLine, lineIndex, bbox, pointInPolygon, jumpFlood, blur, writePNG, clamp, lerp, smooth, smax } from './lib.mjs';
import { erode, thermal } from './erosion.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const id = process.argv[2] ?? 'eden';
const FAST = process.argv.includes('--fast');
const { [id.toUpperCase()]: D } = await import(path.join(ROOT, 'maps', id, 'design.mjs'));
const OUT = path.join(ROOT, 'maps', id);

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s]`, ...a);
const N = Math.round((2 * D.half) / D.cell) + 1;
const CELL = D.cell;
const noise = (name) => new SimplexNoise(deriveSeed(D.seed, name));
const nz = { coast: noise('coast'), base: noise('base'), hills: noise('hills'), ridge: noise('ridge'), detail: noise('detail'), patch: noise('patch'), flora: noise('flora'), clear: noise('clear'), snow: noise('snow'), stack: noise('stack') };

const H = new Grid(N, D.half);
log(`rejilla ${N}×${N} (${CELL} m)`);

// ---- 1. Regiones (antes que nada: deciden la rugosidad y la erosión) ------------------
const region = new Grid(N, D.half, Uint8Array); // índice + 1 (0 = ninguna)
const regions = D.regions.map((r) => ({ ...r }));
// La primera región de la lista gana: se rellenan en orden inverso. Los bordes se deforman
// con ruido (sin líneas rectas): se rellena en una rejilla y se lee en coordenadas movidas.
{
  const raw = new Grid(N, D.half, Uint8Array);
  for (let ri = regions.length - 1; ri >= 0; ri--) fillPolygon(raw, regions[ri].points, ri + 1);
  const warp = noise('regionWarp');
  region.forAll((i, j, x, z, k) => {
    const wx = x + warp.fbm(x, z, { frequency: 1 / 260, octaves: 4 }) * 85;
    const wz = z + warp.fbm(x + 913, z - 377, { frequency: 1 / 260, octaves: 4 }) * 85;
    region.data[k] = raw.data[clamp(Math.round((wz + D.half) / CELL), 0, N - 1) * N + clamp(Math.round((wx + D.half) / CELL), 0, N - 1)];
  });
}
const regionOf = (k) => (region.data[k] ? regions[region.data[k] - 1] : D.defaultRegion);
log('regiones');

// ---- 2. Costa: tierra/mar y distancia con signo a la orilla --------------------------
const PROFILE_KEYS = ['beach', 'cliff', 'rocky', 'marsh'];
const coastLines = [];
const land = new Grid(N, D.half, Uint8Array);
const prepCoast = (points, closedType = null, top = 0) => {
  const pts = points.map((p) => {
    const type = p.type ?? closedType;
    const q = { x: p.x, z: p.z, top: p.top ?? top ?? 0 };
    for (const k of PROFILE_KEYS) q[k] = type === k ? 1 : 0;
    if (type === 'cliff' && !p.top) q.top = top || 20;
    return q;
  });
  const line = spline(pts, { step: 3, closed: true });
  // Irregularidad de la orilla: más en acantilados y rocas, poca en las playas.
  measure(line);
  for (let i = 0; i < line.length; i++) {
    const a = line[(i - 1 + line.length) % line.length];
    const b = line[(i + 1) % line.length];
    let nx = b.z - a.z;
    let nzv = -(b.x - a.x);
    const l = Math.hypot(nx, nzv) || 1;
    nx /= l;
    nzv /= l;
    const p = line[i];
    const amp = p.beach * 16 + p.cliff * 34 + p.rocky * 28 + p.marsh * 30;
    const n1 = nz.coast.noise2D(p.s / 420, 3.1) * 0.55 + nz.coast.noise2D(p.s / 130, 7.7) * 0.28 + nz.coast.noise2D(p.s / 36, 1.3) * 0.12 * (1 - p.beach * 0.7) + nz.coast.noise2D(p.s / 9, 5.1) * 0.05 * (p.cliff + p.rocky);
    p.x += nx * n1 * amp;
    p.z += nzv * n1 * amp;
  }
  return line;
};
coastLines.push(prepCoast(D.coast));
for (const isl of D.islets ?? []) coastLines.push(prepCoast(isl.points, isl.type, isl.top));
for (const line of coastLines) fillPolygon(land, line, 1, true);
// Semillas de la distancia: las celdas por las que pasa la orilla, con su perfil.
const seedIdx = new Int32Array(N * N).fill(-1);
const seedParams = new Map();
for (const line of coastLines) {
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[(i + 1) % line.length];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL * 0.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const ci = Math.round((lerp(a.x, b.x, t) + D.half) / CELL);
      const cj = Math.round((lerp(a.z, b.z, t) + D.half) / CELL);
      if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue;
      const k = cj * N + ci;
      seedIdx[k] = k;
      seedParams.set(k, a);
    }
  }
}
const coastJF = jumpFlood(N, CELL, seedIdx);
const coastD = new Float32Array(N * N); // + tierra adentro, − mar adentro (m)
for (let k = 0; k < N * N; k++) coastD[k] = land.data[k] ? coastJF.dist[k] : -coastJF.dist[k];
log('costa');

// ---- 3. Relieve base -----------------------------------------------------------------
const und = D.undulation;
H.forAll((i, j, x, z, k) => {
  // Altura de base: media ponderada por distancia de los puntos de base.
  let sw = 0;
  let sh = 0;
  for (const b of D.base) {
    const d2 = (x - b.x) ** 2 + (z - b.z) ** 2 + 120 ** 2;
    const w = 1 / (d2 * d2);
    sw += w;
    sh += b.h * w;
  }
  let h = sh / sw;
  h += nz.base.fbm(x, z, { frequency: und.frequency, octaves: 3 }) * und.amplitude;
  const rough = roughOf(regionOf(k));
  h += nz.hills.fbm(x, z, { frequency: und.hillFrequency, octaves: 4 }) * und.hills * rough;
  H.data[k] = h;
});
log('base');

// ---- 4. Cordilleras, picos, cerros y mesetas ----------------------------------------
for (const r of D.ranges) {
  const line = spline(r.points, { step: 8 });
  measure(line);
  const maxW = Math.max(...r.points.map((p) => p.w));
  const near = lineIndex(line, maxW * 1.25);
  H.forBox(bbox(line, maxW * 1.2), (i, j, x, z, k) => {
    // La cresta serpentea: se mide la distancia en coordenadas deformadas.
    const wx = x + nz.ridge.fbm(x, z, { frequency: 1 / 300, octaves: 3 }) * 70;
    const wz = z + nz.ridge.fbm(x - 400, z + 900, { frequency: 1 / 300, octaves: 3 }) * 70;
    const q = near(wx, wz);
    if (q.d === Infinity) return;
    const p = lerpPoint(line, q.i, q.t);
    const s = q.d / p.w;
    if (s >= 1) return;
    const f = (1 - s) * (1 - s) * (1 + 2 * s);
    // Espolones y barrancos: crestas de ruido a gran escala, más marcadas lejos de la cumbre.
    const crag = nz.ridge.ridged(wx, wz, { frequency: 1 / 210, octaves: 4, gain: 0.45 });
    const fine = nz.ridge.ridged(wx + 77, wz - 31, { frequency: 1 / 70, octaves: 3 });
    const along = 1 + 0.14 * nz.ridge.noise2D(q.s / 260, 11.3);
    const m = p.h * along * Math.pow(f, 0.85) * (1 - r.rough * 0.42 + r.rough * (0.55 * crag + 0.12 * fine));
    H.data[k] = smax(H.data[k], m, 16);
  });
}
for (const pk of D.peaks ?? []) {
  H.forBox({ minX: pk.x - pk.r * 2, maxX: pk.x + pk.r * 2, minZ: pk.z - pk.r * 2, maxZ: pk.z + pk.r * 2 }, (i, j, x, z, k) => {
    const d = Math.hypot(x - pk.x, z - pk.z) / pk.r;
    const crag = nz.ridge.ridged(x + 500, z, { frequency: 1 / 60, octaves: 4 });
    H.data[k] += pk.h * Math.exp(-d * d * 1.6) * (1 - pk.rough * 0.3 + pk.rough * 0.5 * crag);
  });
}
for (const hl of D.hills ?? []) {
  if (!hl.h) continue;
  H.forBox({ minX: hl.x - hl.r, maxX: hl.x + hl.r, minZ: hl.z - hl.r, maxZ: hl.z + hl.r }, (i, j, x, z, k) => {
    const s = Math.hypot(x - hl.x, z - hl.z) / hl.r;
    if (s < 1) H.data[k] += hl.h * (1 - s * s) * (1 - s * s);
  });
}
const plateauMask = new Float32Array(N * N); // 1 en los cortados (no se erosionan ni se derrumban)
for (const pl of D.plateaus ?? []) {
  const line = closedLine(pl.points, 4);
  H.forBox(bbox(pl.points, pl.edge + 4), (i, j, x, z, k) => {
    const inside = pointInPolygon(pl.points, x, z);
    const d = inside ? 0 : nearestOnLine(line, x, z).d;
    if (d > pl.edge) return;
    const top = pl.top + nz.detail.noise2D(x / 40, z / 40) * 0.8;
    const t = Math.pow(smooth(0, pl.edge, d + nz.detail.noise2D(x / 18, z / 18) * 3), 0.55);
    H.data[k] = Math.max(H.data[k], lerp(top, H.data[k], t));
    if (d > 0) plateauMask[k] = Math.max(plateauMask[k], 1 - t);
  });
}
log('montañas');

// ---- 5. Detalle fino según el terreno --------------------------------------------------
H.forAll((i, j, x, z, k) => {
  const rough = roughOf(regionOf(k));
  H.data[k] += nz.detail.fbm(x, z, { frequency: 1 / 26, octaves: 3 }) * 0.9 * rough;
});

// ---- 6. Costa: el relieve se funde con el perfil de cada orilla ------------------------
H.forAll((i, j, x, z, k) => {
  const d = coastD[k];
  if (d > 420) return;
  const P = seedParams.get(coastJF.nearest[k]);
  if (!P) return;
  const inland = H.data[k];
  let h = 0;
  let wsum = 0;
  for (const type of PROFILE_KEYS) {
    const w = P[type];
    if (w <= 0) continue;
    h += w * coastProfile(type, d, P.top, inland, x, z);
    wsum += w;
  }
  H.data[k] = wsum > 0 ? h / wsum : inland;
});
// Agujas de roca en el mar.
for (const st of D.stacks ?? []) {
  H.forBox({ minX: st.x - st.r * 1.6, maxX: st.x + st.r * 1.6, minZ: st.z - st.r * 1.6, maxZ: st.z + st.r * 1.6 }, (i, j, x, z, k) => {
    const d = Math.hypot(x - st.x, z - st.z) / st.r + nz.stack.noise2D(x / 6, z / 6) * 0.18;
    const top = st.h * (0.85 + 0.15 * nz.stack.noise2D(x / 10 + 4, z / 10));
    if (d < 1.25) H.data[k] = Math.max(H.data[k], lerp(top, -6, smooth(0.75, 1.25, d)));
  });
}
log('costa fundida');

// ---- 7. Ríos (cauce aproximado antes de la erosión) -----------------------------------
const rivers = D.rivers.map((r) => prepRiver(r));
const gorges = (D.gorges ?? []).map((g) => {
  const line = spline(g.points, { step: 4 });
  measure(line);
  return { ...g, line };
});
for (const g of gorges) {
  const river = rivers.find((r) => r.id === 'RIO_PLATEADO') ?? rivers[0];
  H.forBox(bbox(g.line, 90), (i, j, x, z, k) => {
    const q = nearestOnLine(g.line, x, z);
    const w = lerpPoint(g.line, q.i, q.t).w;
    const lv = riverLevelAt(river, x, z);
    const wall = lv + 0.5 + Math.max(0, q.d - w / 2) * (3.2 + nz.detail.noise2D(x / 9, z / 9) * 0.8);
    if (wall < H.data[k]) {
      H.data[k] = wall;
      plateauMask[k] = Math.max(plateauMask[k], smooth(w / 2 + 40, w / 2, q.d) * g.wall);
    }
  });
}
for (const r of rivers) carveRiver(r, { valley: true });
log('valles');

// ---- 8. Erosión --------------------------------------------------------------------------
const flow = new Float32Array(N * N);
const before = H.data.slice();
const mask = new Float32Array(N * N);
H.forAll((i, j, x, z, k) => {
  const g = regionOf(k).ground;
  let m = g === 'rocky' || g === 'alpine' || g === 'foothill' ? 1 : g === 'pine' || g === 'forest' ? 0.55 : g === 'sand' || g === 'marsh' ? 0 : 0.35;
  m *= smooth(4, 30, coastD[k]) * (1 - plateauMask[k]);
  mask[k] = m;
});
erode(H.data, {
  n: N, cell: CELL, drops: FAST ? 400000 : 2600000, lifetime: 70, seed: deriveSeed(D.seed, 'erosion'), mask, flow,
  onProgress: (p) => log(`erosión ${Math.round(p * 100)} %`),
});
thermal(H.data, { n: N, talus: 1.5, rate: 0.2, iterations: 4, mask: mask.map((m) => (m > 0 ? 0.6 : 0)) });
despike(H.data);
log('erosión');

// ---- 9. Lugares, caminos, lagos y ríos (definitivos) -----------------------------------
const pads = [];
const site = (s, kind) => ({ ...s, kind, height: meanHeight(s.x, s.z, s.r) });
const sites = D.sites.map((s) => site(s, s.kind));
const landing = site(D.landing, 'LANDING');
const spawnPad = site({ ...D.spawn, r: 7, blend: 8 }, 'SPAWN');
for (const s of [...sites, landing, spawnPad]) {
  if (s.kind === 'GOLEMS') continue;
  pads.push(s);
  H.forBox({ minX: s.x - s.r - s.blend, maxX: s.x + s.r + s.blend, minZ: s.z - s.r - s.blend, maxZ: s.z + s.r + s.blend }, (i, j, x, z, k) => {
    const d = Math.hypot(x - s.x, z - s.z);
    const t = 1 - smooth(s.r, s.r + s.blend, d);
    if (t > 0) H.data[k] = lerp(H.data[k], s.height, t);
  });
}
const roads = D.roads.map((r) => prepRoad(r));
for (const r of roads) flattenRoad(r);
// Cicatriz del choque: surco poco hondo con cordones a los lados.
const scar = spline(D.scar, { step: 2 });
measure(scar);
H.forBox(bbox(scar, 14), (i, j, x, z, k) => {
  const q = nearestOnLine(scar, x, z);
  const w = lerpPoint(scar, q.i, q.t).w;
  const s = q.d / w;
  if (s < 1) H.data[k] -= 0.55 * (1 - s * s) * smooth(0, 40, q.s);
  else if (s < 1.6) H.data[k] += 0.25 * Math.sin(((s - 1) / 0.6) * Math.PI) * smooth(0, 40, q.s);
});
// Laguna de agua de mar y su bocana.
if (D.lagoon) {
  const lg = D.lagoon;
  const line = closedLine(lg.points, 4);
  H.forBox(bbox(lg.points, 30), (i, j, x, z, k) => {
    const inside = pointInPolygon(lg.points, x, z);
    const d = nearestOnLine(line, x, z).d;
    if (inside) H.data[k] = Math.min(H.data[k], -0.25 - lg.depth * smooth(0, 30, d) + nz.detail.noise2D(x / 14, z / 14) * 0.25);
    else if (d < 25) H.data[k] = Math.min(H.data[k], lerp(0.3, H.data[k], smooth(0, 25, d)));
  });
  const mouth = spline(lg.mouth, { step: 3 });
  H.forBox(bbox(mouth, 30), (i, j, x, z, k) => {
    const d = nearestOnLine(mouth, x, z).d;
    if (d < 26) H.data[k] = Math.min(H.data[k], lerp(-1.6, H.data[k], smooth(9, 26, d)));
  });
}
// Lagos y ríos: el agua (nivel) y el cauce.
const water = new Grid(N, D.half); // nivel del agua dulce (NaN = no hay)
water.data.fill(NaN);
const waterKind = new Uint8Array(N * N); // 1 río, 2 lago, 3 hielo, 4 terma
const lakes = D.lakes.map((l) => carveLake(l));
for (const r of rivers) carveRiver(r, { valley: false });
log('agua');

despike(H.data, water.data);
// ---- 10. Pendiente, humedad y clasificación -------------------------------------------
const slope = new Float32Array(N * N);
for (let j = 1; j < N - 1; j++) {
  for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    slope[k] = Math.hypot(H.data[k + 1] - H.data[k - 1], H.data[k + N] - H.data[k - N]) / (2 * CELL);
  }
}
const deposit = new Float32Array(N * N); // >0 donde la erosión dejó material
for (let k = 0; k < N * N; k++) deposit[k] = H.data[k] - before[k];
const wetSeeds = new Int32Array(N * N).fill(-1);
for (let k = 0; k < N * N; k++) if (!Number.isNaN(water.data[k]) && waterKind[k] !== 3) wetSeeds[k] = k;
const wetD = jumpFlood(N, CELL, wetSeeds).dist;
const flowG = new Grid(N, D.half);
for (let k = 0; k < N * N; k++) flowG.data[k] = Math.log1p(flow[k]);
blur(flowG, 1, 1);
const padAt = (x, z) => pads.find((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1.5);

const surface = new Grid(N, D.half, Uint8Array);
const biome = new Grid(N, D.half, Uint8Array);
const flora = new Grid(N, D.half, Uint8Array);
const roadDist = new Float32Array(N * N).fill(Infinity);
for (const r of roads) {
  H.forBox(bbox(r.line, r.w + 4), (i, j, x, z, k) => {
    const d = r.line.near(x, z).d - r.w * 0.5;
    if (d < roadDist[k]) roadDist[k] = d;
  });
}
const scarDist = new Float32Array(N * N).fill(Infinity);
H.forBox(bbox(scar, 20), (i, j, x, z, k) => {
  const q = nearestOnLine(scar, x, z);
  scarDist[k] = q.d - lerpPoint(scar, q.i, q.t).w;
});
const hotDist = new Float32Array(N * N).fill(Infinity);
for (const l of lakes.filter((l) => l.hot)) {
  H.forBox(bbox(l.points, 20), (i, j, x, z, k) => {
    hotDist[k] = Math.min(hotDist[k], Math.hypot(x - l.cx, z - l.cz) - l.r);
  });
}
const poiR = (D.pois ?? []).filter((p) => p.kind === 'ruins' || p.kind === 'quarry');

H.forAll((i, j, x, z, k) => {
  const h = H.data[k];
  const reg = regionOf(k);
  const sl = slope[k];
  const wl = water.data[k];
  const wk = waterKind[k];
  const P = seedParams.get(coastJF.nearest[k]);
  const cd = coastD[k];
  const patch = nz.patch.fbm(x, z, { frequency: 1 / 70, octaves: 3 });
  const fine = nz.patch.noise2D(x / 9, z / 9);
  let s;
  let b = BIOME_INDEX[reg.biome] ?? BIOME_INDEX.PLAINS;
  const snowLine = D.snowLine + nz.snow.fbm(x, z, { frequency: 1 / 120, octaves: 3 }) * 9 + (reg.biome === 'FROZEN_MOUNTAINS' ? 0 : 70);
  const pad = padAt(x, z);
  if (!Number.isNaN(wl) && h < wl) {
    s = wk === 3 ? SURFACE.ICE : wk === 4 ? SURFACE.TRAVERTINE : wk === 1 ? (h < wl - 0.6 ? SURFACE.GRAVEL : SURFACE.MUD) : h < wl - 1.2 ? SURFACE.MUD : SURFACE.WET_SAND;
    b = BIOME_INDEX.RIVER;
  } else if (wk === 3) {
    s = SURFACE.ICE;
    b = BIOME_INDEX.FROZEN_MOUNTAINS;
  } else if (h < -0.25) {
    s = SURFACE.SEABED;
    b = SEA;
  } else if (pad) {
    s = pad.kind === 'GOBLIN_BASE' ? SURFACE.DIRT : pad.kind === 'LANDING' ? (h > snowLine ? SURFACE.SNOW : SURFACE.SCREE) : pad.kind === 'SPAWN' ? SURFACE.SCORCHED : SURFACE.PAVED;
    if (pad.kind === 'HERMIT_TOWER' || pad.kind === 'NODE_ARENA') s = SURFACE.PAVED;
  } else if (scarDist[k] < 0.5 + fine * 1.5) {
    s = SURFACE.SCORCHED;
  } else if (roadDist[k] < 0.3 + fine * 0.4) {
    s = h > snowLine && reg.biome === 'FROZEN_MOUNTAINS' ? SURFACE.SNOW : SURFACE.PATH;
  } else if (hotDist[k] < 14 + fine * 4) {
    s = SURFACE.TRAVERTINE;
  } else if (poiR.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * (0.55 + 0.25 * fine))) {
    s = poiR.find((p) => Math.hypot(x - p.x, z - p.z) < p.r)?.kind === 'quarry' ? SURFACE.SCREE : SURFACE.PAVED;
  } else if (sl > 1.15) {
    s = SURFACE.CLIFF;
  } else if (h > snowLine && sl < 1.0 + patch * 0.2) {
    s = SURFACE.SNOW;
    b = BIOME_INDEX.FROZEN_MOUNTAINS;
  } else if (sl > 0.78 + patch * 0.1) {
    s = SURFACE.ROCK;
  } else if (P && P.beach > 0.5 && cd < 60 + patch * 25 && h < 3.2) {
    s = h < 0.55 ? SURFACE.WET_SAND : SURFACE.SAND;
    b = BIOME_INDEX.BEACH;
  } else if (P && (P.rocky > 0.5 || P.cliff > 0.5) && cd < 10 && h < 4) {
    s = SURFACE.ROCK;
  } else {
    s = groundSurface(reg.ground, { x, z, h, sl, patch, fine, wet: wetD[k], flow: flowG.data[k], dep: deposit[k], snowLine });
    if (s === SURFACE.SAND) b = BIOME_INDEX.BEACH;
  }
  if (b !== SEA && wetD[k] < 22 + patch * 8 && h < 60 && wk !== 3 && reg.biome !== 'BEACH' && s !== SURFACE.SAND) b = BIOME_INDEX.RIVER;
  if (h < -0.25 && Number.isNaN(wl)) b = SEA;
  surface.data[k] = s;
  biome.data[k] = b;
  flora.data[k] = floraCell(reg, s, { x, z, h, sl, pad, road: roadDist[k], scar: scarDist[k], wet: wetD[k], water: wl, cd });
});
log('suelos y vegetación');

// ---- 11. Guardar ---------------------------------------------------------------------------
const toU16 = (v) => (Number.isNaN(v) ? 0 : clamp(Math.round((v + HEIGHT_OFFSET) * HEIGHT_SCALE), 1, 65535));
const hU = new Uint16Array(N * N);
const wU = new Uint16Array(N * N);
let minH = Infinity;
let maxH = -Infinity;
for (let k = 0; k < N * N; k++) {
  hU[k] = toU16(H.data[k]);
  wU[k] = toU16(water.data[k]);
  minH = Math.min(minH, H.data[k]);
  maxH = Math.max(maxH, H.data[k]);
}
const sections = [
  ['height', deltaRows(hU)],
  ['water', deltaRows(wU)],
  ['surface', surface.data],
  ['biome', biome.data],
  ['region', region.data],
  ['flora', flora.data],
];
let offset = 0;
const layout = {};
const parts = [];
for (const [name, arr] of sections) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  layout[name] = { offset, bytes: buf.length, type: arr instanceof Int16Array ? 'int16delta' : 'uint8' };
  parts.push(buf);
  offset += buf.length;
}
const bin = zlib.gzipSync(Buffer.concat(parts), { level: 9 });
fs.writeFileSync(path.join(OUT, `${id}.map.bin.gz`), bin);
const meta = {
  id: D.id, name: D.name, version: 1, half: D.half, cell: CELL, n: N, snowLine: D.snowLine,
  heightRange: [round(minH), round(maxH)],
  layout,
  spawn: { ...D.spawn, y: round(H.sample(D.spawn.x, D.spawn.z)) },
  landing: { x: landing.x, z: landing.z, yaw: landing.yaw, height: round(landing.height), r: landing.r },
  sites: sites.map((s) => ({ kind: s.kind, x: s.x, z: s.z, r: s.r, yaw: s.yaw ?? 0, height: round(s.kind === 'GOLEMS' ? H.sample(s.x, s.z) : s.height) })),
  regions: regions.map((r, i) => ({ index: i + 1, id: r.id, name: r.name, biome: r.biome, ground: r.ground, flora: r.flora, center: centroid(r.points) })),
  pois: D.pois ?? [],
  lakes: lakes.map((l) => ({ id: l.id, name: l.name, level: l.level, ice: !!l.ice, hot: !!l.hot, sinkhole: l.sinkhole ?? 0, points: l.points.map((p) => ({ x: round(p.x), z: round(p.z) })) })),
  rivers: rivers.map((r) => ({ id: r.id, name: r.name, points: simplify(r.line, 6).map((p) => ({ x: round(p.x), z: round(p.z), level: round(p.level), w: round(p.w) })), falls: r.falls })),
  roads: roads.map((r) => ({ id: r.id, name: r.name, w: r.w, points: simplify(r.line, 6).map((p) => ({ x: round(p.x), z: round(p.z) })) })),
  scar: D.scar,
  lagoon: D.lagoon ? { id: D.lagoon.id, name: D.lagoon.name, points: D.lagoon.points } : null,
  islets: (D.islets ?? []).map((i) => ({ id: i.id, name: i.name, center: centroid(i.points) })),
  stacks: D.stacks ?? [],
};
fs.writeFileSync(path.join(OUT, `${id}.map.json`), JSON.stringify(meta));
log(`guardado: ${(bin.length / 1048576).toFixed(2)} MB, alturas ${meta.heightRange.join('…')} m`);
writePreview();
log('vista previa');

// ==== Funciones ===========================================================================

/** Quita pozos y agujas aislados (restos de la erosión): la celda vuelve a la media de sus vecinas. */
function despike(h, wl = null) {
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        if (wl && !Number.isNaN(wl[k])) continue;
        let lo = Infinity;
        let hi = -Infinity;
        let sum = 0;
        for (const o of [-N - 1, -N, -N + 1, -1, 1, N - 1, N, N + 1]) {
          const v = h[k + o];
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
          sum += v;
        }
        if (h[k] < lo - 2.5 || h[k] > hi + 2.5) h[k] = sum / 8;
      }
    }
  }
}

function roughOf(reg) {
  return { rocky: 1.25, alpine: 1.1, foothill: 1.0, pine: 0.9, forest: 0.75, windswept: 0.7, dry: 0.8, meadow: 0.55, lush: 0.4, sand: 0.25, marsh: 0.12 }[reg.ground] ?? 0.6;
}

function coastProfile(type, d, top, inland, x, z) {
  const n = nz.coast.noise2D(x / 30, z / 30);
  if (d < 0) {
    const o = -d;
    const deep = -smooth(140, 700, o) * 20;
    return Math.min(seaNear(type, o, n), seaNear(type, o, n) * (1 - smooth(140, 700, o)) + deep);
  }
  return landProfile(type, d, top, inland, x, z, n);
}

function seaNear(type, o, n) {
  {
    if (type === 'beach') return -Math.min(16, o * 0.045 + o * o * 0.00012) + n * 0.15;
    if (type === 'cliff') return -Math.min(22, 3 + o * 0.22) + n * 0.8;
    if (type === 'rocky') return -Math.min(18, 1.2 + o * 0.11) + n * 1.2;
    return -Math.min(7, o * 0.045) + n * 0.1; // marisma: llanuras de fango
  }
}

function landProfile(type, d, top, inland, x, z, n) {
  if (type === 'beach') {
    const beach = 0.35 + 1.5 * smooth(0, 42, d) + Math.max(0, nz.coast.noise2D(x / 16, z / 16)) * 0.7 * smooth(10, 40, d);
    return lerp(beach, Math.max(inland, beach), smooth(45, 170, d));
  }
  if (type === 'cliff') {
    const rim = top * (0.88 + 0.12 * n);
    const face = rim * Math.pow(smooth(0, 9, d), 0.55);
    return d < 9 ? face : Math.max(inland, lerp(rim, inland, smooth(9, 110, d)));
  }
  if (type === 'rocky') {
    const r = 2.2 * smooth(0, 14, d) + Math.abs(n) * 2.2;
    return lerp(r, Math.max(inland, r), smooth(14, 110, d));
  }
  const m = 0.45 + n * 0.25 + 0.4 * smooth(80, 220, d);
  return lerp(m, inland, smooth(140, 380, d));
}

function lerpPoint(line, i, t) {
  const a = line[i];
  const b = line[Math.min(line.length - 1, i + 1)];
  const out = {};
  for (const key of Object.keys(a)) out[key] = typeof a[key] === 'number' && typeof b[key] === 'number' ? lerp(a[key], b[key], t) : a[key];
  return out;
}

function closedLine(points, step) {
  const line = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let s = 0; s < n; s++) line.push({ x: lerp(a.x, b.x, s / n), z: lerp(a.z, b.z, s / n) });
  }
  line.push({ ...line[0] });
  measure(line);
  return line;
}

/** Relleno de polígono por filas (rápido para rejillas grandes). */
function fillPolygon(grid, poly, value, closed = true) {
  const n = grid.n;
  const pts = poly;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of pts) {
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const j0 = clamp(Math.floor((minZ + grid.half) / grid.cell), 0, n - 1);
  const j1 = clamp(Math.ceil((maxZ + grid.half) / grid.cell), 0, n - 1);
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const z = grid.z(j);
    xs.length = 0;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const A = pts[a];
      const B = pts[b];
      if (A.z > z !== B.z > z) xs.push(((B.x - A.x) * (z - A.z)) / (B.z - A.z) + A.x);
    }
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const i0 = clamp(Math.ceil((xs[s] + grid.half) / grid.cell), 0, n - 1);
      const i1 = clamp(Math.floor((xs[s + 1] + grid.half) / grid.cell), 0, n - 1);
      for (let i = i0; i <= i1; i++) grid.data[j * n + i] = value;
    }
  }
}

function meanHeight(x, z, r) {
  let sum = H.sample(x, z);
  let n = 1;
  for (const f of [0.5, 1]) {
    for (let a = 0; a < 12; a++) {
      sum += H.sample(x + Math.cos((a / 12) * Math.PI * 2) * r * f, z + Math.sin((a / 12) * Math.PI * 2) * r * f);
      n++;
    }
  }
  return sum / n;
}

// ---- Ríos ----------------------------------------------------------------------------

function prepRiver(r) {
  const pts = r.points.map((p, i) => ({ x: p.x, z: p.z, level: p.level, w: p.w, seg: i, fall: p.fall ? 1 : 0, valley: p.valley ?? r.valley ?? 0.16 }));
  const line = spline(pts, { step: 2 });
  // El nivel de un tramo con cascada se mantiene arriba y cae al final del tramo.
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    p.seg = Math.min(r.points.length - 1, Math.floor(p.seg + 1e-6));
    const a = r.points[p.seg];
    const b = r.points[p.seg + 1];
    if (!b) continue;
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const u = clamp(Math.hypot(p.x - a.x, p.z - a.z) / (segLen || 1), 0, 1);
    p.level = a.fall ? (u < 0.82 ? a.level : lerp(a.level, b.level, Math.pow((u - 0.82) / 0.18, 0.5))) : lerp(a.level, b.level, u);
    p.w = lerp(a.w, b.w, u);
    p.valley = lerp(a.valley ?? r.valley ?? 0.16, b.valley ?? r.valley ?? 0.16, u);
    // Meandros: el cauce ondula un poco respecto al diseño.
    const flat = smooth(0.6, 0.15, p.valley);
    const wig = (nz.detail.noise2D(i / 55, r.points.length * 3.7) * Math.min(4 + 10 * flat, a.w * (0.8 + 1.4 * flat))) * (a.fall || (b && b.fall) ? 0 : 1);
    const nx = (b.z - a.z) / (segLen || 1);
    const nzv = -(b.x - a.x) / (segLen || 1);
    p.x += nx * wig;
    p.z += nzv * wig;
  }
  measure(line);
  line.near = lineIndex(line, 130);
  const falls = r.points.map((p, i) => (p.fall ? { x: p.x, z: p.z, top: p.level, bottom: r.points[i + 1]?.level ?? 0, to: { x: r.points[i + 1].x, z: r.points[i + 1].z } } : null)).filter(Boolean);
  return { ...r, line, falls };
}

function riverLevelAt(r, x, z) {
  let q = r.line.near(x, z);
  if (q.d === Infinity) q = nearestOnLine(r.line, x, z);
  return lerpPoint(r.line, q.i, q.t).level;
}

function carveRiver(r, { valley }) {
  const pad = valley ? 120 : 14;
  H.forBox(bbox(r.line, pad), (i, j, x, z, k) => {
    const q = r.line.near(x, z);
    if (q.d > pad) return;
    const p = lerpPoint(r.line, q.i, q.t);
    const d = q.d;
    if (valley) {
      // Valle: el terreno no sube por encima de esta rampa desde el río (en las gargantas, empinada).
      const bank = p.level + 0.8 + Math.max(0, d - p.w * 1.6) * (p.valley + 0.08 * nz.detail.noise2D(x / 50, z / 50));
      if (bank < H.data[k]) H.data[k] = lerp(H.data[k], bank, smooth(pad, pad * 0.5, d));
      return;
    }
    const w = p.w;
    if (d < w) {
      const depth = 0.55 + w * 0.09;
      H.data[k] = Math.min(H.data[k], p.level - 0.12 - depth * (1 - (d / w) ** 2));
    } else if (d < w + 5) {
      // Orilla: un poco por encima del agua (sin desbordarse) y sin paredes colgadas.
      const lo = p.level + 0.12 + (d - w) * 0.18;
      const hi = p.level + 0.4 + (d - w) * 1.4;
      H.data[k] = clamp(H.data[k], lo, Math.max(lo, hi));
    }
    if (d < w + 1.5 && (Number.isNaN(water.data[k]) || p.level > water.data[k])) {
      water.data[k] = p.level;
      waterKind[k] = 1;
    }
  });
  // Pozas al pie de las cascadas.
  if (!valley) {
    for (const f of r.falls) {
      H.forBox({ minX: f.to.x - 26, maxX: f.to.x + 26, minZ: f.to.z - 26, maxZ: f.to.z + 26 }, (i, j, x, z, k) => {
        const d = Math.hypot(x - f.to.x, z - f.to.z);
        if (d < 14) {
          H.data[k] = Math.min(H.data[k], f.bottom - 0.4 - 2.4 * (1 - (d / 14) ** 2));
          if (f.bottom > 0.5) {
            water.data[k] = f.bottom;
            waterKind[k] = 1;
          }
        }
      });
    }
  }
}

// ---- Lagos ---------------------------------------------------------------------------

function carveLake(l) {
  // Contorno suave (curva) con la orilla irregular.
  if (!l.sinkhole && l.points.length > 4) {
    const sp = spline(l.points, { step: 3, closed: true });
    measure(sp);
    l = { ...l, points: sp.map((p) => {
      const c0 = centroid(l.points);
      const dx = p.x - c0.x;
      const dz = p.z - c0.z;
      const dl = Math.hypot(dx, dz) || 1;
      const amp = Math.min(6, dl * 0.08) * nz.coast.noise2D(p.s / 25, l.level);
      return { x: p.x + (dx / dl) * amp, z: p.z + (dz / dl) * amp };
    }) };
  }
  const line = closedLine(l.points, 2);
  const near = lineIndex(line, 16);
  const c = centroid(l.points);
  const r = Math.max(...l.points.map((p) => Math.hypot(p.x - c.x, p.z - c.z)));
  const kind = l.ice ? 3 : l.hot ? 4 : 2;
  const shore = l.sinkhole ? 3 : 10;
  H.forBox(bbox(l.points, shore + 4), (i, j, x, z, k) => {
    const inside = pointInPolygon(l.points, x, z);
    const d = Math.min(near(x, z).d, 60);
    if (inside) {
      if (l.ice) H.data[k] = l.level + nz.detail.noise2D(x / 5, z / 5) * 0.03;
      else H.data[k] = Math.min(H.data[k], l.level - Math.min(l.depth, 0.35 + d * 0.16) + nz.detail.noise2D(x / 8, z / 8) * 0.1);
      water.data[k] = l.level;
      waterKind[k] = kind;
    } else if (d < shore) {
      if (l.sinkhole) {
        // Sima: paredes casi verticales hasta el borde.
        H.data[k] = Math.max(H.data[k] - l.sinkhole * (1 - d / shore), l.level + 0.3);
      } else {
        const lo = l.level + 0.1 + d * 0.06;
        const hi = l.level + 0.3 + d * (l.hot ? 0.25 : 0.4);
        H.data[k] = clamp(H.data[k], lo, Math.max(lo, hi));
      }
      if (d < 1.5 && !l.ice) {
        if (Number.isNaN(water.data[k])) {
          water.data[k] = l.level;
          waterKind[k] = kind;
        }
      }
    }
  });
  return { ...l, cx: c.x, cz: c.z, r };
}

// ---- Caminos -------------------------------------------------------------------------

function prepRoad(r) {
  const line = spline(r.points, { step: 2 });
  measure(line);
  // Altura del camino: el terreno suavizado a lo largo del recorrido y sin rampas fuertes.
  const hs = line.map((p) => H.sample(p.x, p.z));
  const sm = hs.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let k = -8; k <= 8; k++) {
      const v = hs[clamp(i + k, 0, hs.length - 1)];
      s += v;
      n++;
    }
    return s / n;
  });
  const maxGrade = 0.2 * 2; // por punto (cada 2 m)
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < sm.length; i++) sm[i] = clamp(sm[i], sm[i - 1] - maxGrade, sm[i - 1] + maxGrade);
    for (let i = sm.length - 2; i >= 0; i--) sm[i] = clamp(sm[i], sm[i + 1] - maxGrade, sm[i + 1] + maxGrade);
  }
  line.forEach((p, i) => (p.h = sm[i]));
  line.near = lineIndex(line, r.w + 10);
  return { ...r, line };
}

function flattenRoad(r) {
  H.forBox(bbox(r.line, r.w + 6), (i, j, x, z, k) => {
    const q = r.line.near(x, z);
    const t = 1 - smooth(r.w * 0.55, r.w + 5, q.d);
    if (t <= 0) return;
    const h = lerpPoint(r.line, q.i, q.t).h - 0.06;
    H.data[k] = lerp(H.data[k], h, t);
  });
}

// ---- Suelos y vegetación -------------------------------------------------------------

function groundSurface(ground, { x, z, h, sl, patch, fine, wet, flow, dep, snowLine }) {
  const gully = flow > 4.2 && sl > 0.12;
  const scree = dep > 0.35 && sl > 0.3;
  switch (ground) {
    case 'meadow':
      if (gully) return SURFACE.DIRT;
      if (wet < 10) return SURFACE.GRASS_LUSH;
      if (patch > 0.25 && fine > -0.2) return SURFACE.FLOWERS;
      return patch < -0.45 ? SURFACE.GRASS_DRY : SURFACE.GRASS;
    case 'lush':
      return patch > 0.4 && fine > 0.3 ? SURFACE.FLOWERS : SURFACE.GRASS_LUSH;
    case 'dry':
      if (gully || scree) return SURFACE.DIRT;
      if (sl > 0.5) return SURFACE.ROCK;
      return patch > 0.35 ? SURFACE.GRASS : patch < -0.4 && fine > 0.2 ? SURFACE.DIRT : SURFACE.GRASS_DRY;
    case 'forest':
      if (patch > 0.45) return SURFACE.MOSS;
      return fine > 0.55 ? SURFACE.GRASS : SURFACE.FOREST_FLOOR;
    case 'pine':
      if (sl > 0.55 || scree) return SURFACE.SCREE;
      return patch > 0.3 ? SURFACE.GRASS : SURFACE.PINE_FLOOR;
    case 'foothill':
      if (h < 64 + patch * 10) {
        if (scree || sl > 0.6) return SURFACE.SCREE;
        return patch > 0.15 ? SURFACE.GRASS : fine > 0.3 ? SURFACE.ALPINE : SURFACE.PINE_FLOOR;
      }
    // falls through
    case 'alpine':
      if (scree) return SURFACE.SCREE;
      if (sl > 0.55) return SURFACE.ROCK;
      return h > snowLine - 14 && fine > 0.1 ? SURFACE.SCREE : SURFACE.ALPINE;
    case 'rocky':
      if (scree || gully) return SURFACE.SCREE;
      if (sl > 0.45 || patch > 0.35) return SURFACE.ROCK;
      return patch < -0.3 ? SURFACE.GRASS_DRY : SURFACE.ALPINE;
    case 'windswept':
      return patch > 0.2 ? SURFACE.HEATH : fine > 0.4 ? SURFACE.ROCK : SURFACE.GRASS_DRY;
    case 'marsh':
      return h < 0.9 && fine > 0 ? SURFACE.MUD : patch > 0.3 ? SURFACE.GRASS_LUSH : SURFACE.MARSH;
    case 'sand':
      return h < 3.5 ? (h < 0.55 ? SURFACE.WET_SAND : SURFACE.SAND) : patch > 0 ? SURFACE.GRASS_DRY : SURFACE.SAND;
    default:
      return SURFACE.GRASS;
  }
}

function floraCell(reg, s, { x, z, h, sl, pad, road, scar, wet, water, cd }) {
  if (pad || road < 2.5 || scar < 6 || !Number.isNaN(water) || cd < 3) return 0;
  if (s === SURFACE.SNOW || s === SURFACE.ICE || s === SURFACE.CLIFF || s === SURFACE.SEABED || s === SURFACE.PAVED || s === SURFACE.TRAVERTINE || s === SURFACE.WET_SAND) return 0;
  let type = FLORA_BY_NAME[reg.flora] ?? FLORA.MEADOW;
  if (s === SURFACE.SAND) type = FLORA.BEACH;
  else if (s === SURFACE.ROCK || s === SURFACE.SCREE) type = type === FLORA.PINE || type === FLORA.MOUNTAIN ? FLORA.MOUNTAIN : FLORA.ROCKS;
  else if (wet < 14 && (type === FLORA.MEADOW || type === FLORA.SAVANNA)) type = FLORA.LAKESIDE;
  // Bosques con claros y bordes naturales; densidad menor en pendiente y altura.
  const clump = nz.flora.fbm(x, z, { frequency: 1 / 90, octaves: 3 });
  const clear = nz.clear.fbm(x, z, { frequency: 1 / 45, octaves: 2 });
  let dens = 0.62 + clump * 0.55;
  if ((type === FLORA.OAK || type === FLORA.PINE || type === FLORA.MIXED) && clear > 0.45) dens *= 0.15; // claros
  dens *= 1 - smooth(0.45, 0.85, sl);
  dens *= 1 - smooth(D.snowLine - 25, D.snowLine, h) * (type === FLORA.ROCKS ? 0 : 0.85);
  dens *= smooth(1.5, 7, road);
  const v = clamp(Math.round(dens * 15), 0, 15);
  return v ? (type << 4) | v : 0;
}

// ---- Varios ---------------------------------------------------------------------------

function centroid(points) {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    z += p.z;
  }
  return { x: round(x / points.length), z: round(z / points.length) };
}

function round(v) {
  return Math.round(v * 100) / 100;
}

/** Quita puntos casi alineados (para guardar polilíneas ligeras). */
function simplify(line, tol) {
  const out = [line[0]];
  let last = line[0];
  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i];
    if (Math.hypot(p.x - last.x, p.z - last.z) >= tol) {
      out.push(p);
      last = p;
    }
  }
  out.push(line[line.length - 1]);
  return out;
}

function deltaRows(u16) {
  const out = new Int16Array(u16.length);
  for (let j = 0; j < N; j++) {
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      out[k] = u16[k] - prev;
      prev = u16[k];
    }
  }
  return out;
}

// ---- Vista previa ----------------------------------------------------------------------

function writePreview() {
  const S = 1024;
  const step = (N - 1) / S;
  const img = new Uint8Array(S * S * 3);
  const PAL = {
    [SURFACE.GRASS]: [116, 168, 76], [SURFACE.GRASS_LUSH]: [86, 156, 66], [SURFACE.FLOWERS]: [150, 178, 92], [SURFACE.GRASS_DRY]: [190, 176, 98],
    [SURFACE.FOREST_FLOOR]: [74, 104, 52], [SURFACE.PINE_FLOOR]: [96, 92, 60], [SURFACE.ALPINE]: [128, 146, 96], [SURFACE.DIRT]: [138, 108, 78],
    [SURFACE.PATH]: [176, 146, 104], [SURFACE.SCORCHED]: [56, 46, 40], [SURFACE.ROCK]: [128, 124, 118], [SURFACE.SCREE]: [150, 144, 132],
    [SURFACE.CLIFF]: [104, 98, 92], [SURFACE.SAND]: [226, 210, 154], [SURFACE.WET_SAND]: [196, 180, 128], [SURFACE.MUD]: [104, 88, 66],
    [SURFACE.GRAVEL]: [150, 140, 120], [SURFACE.SNOW]: [242, 246, 250], [SURFACE.ICE]: [180, 220, 240], [SURFACE.PAVED]: [170, 166, 156],
    [SURFACE.MARSH]: [104, 132, 84], [SURFACE.TRAVERTINE]: [226, 222, 204], [SURFACE.SEABED]: [170, 160, 120], [SURFACE.HEATH]: [140, 110, 130], [SURFACE.MOSS]: [70, 120, 56],
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = Math.min(N - 2, Math.round(x * step));
      const j = Math.min(N - 2, Math.round(y * step));
      const k = j * N + i;
      const h = H.data[k];
      let c = PAL[surface.data[k]] ?? [255, 0, 255];
      // Sombreado del relieve (luz del noroeste).
      const dx = H.data[k + 1] - H.data[k - 1 < 0 ? k : k - 1];
      const dz = H.data[k + N] - H.data[k - N < 0 ? k : k - N];
      const shade = clamp(1 + (-dx - dz) * 0.09, 0.45, 1.35);
      c = c.map((v) => v * shade);
      const fl = flora.data[k];
      if (fl >> 4 && (fl & 15) > 6) c = c.map((v, ci) => v * 0.78 + [20, 60, 20][ci] * 0.22);
      const wl = water.data[k];
      if (!Number.isNaN(wl) && h < wl && waterKind[k] !== 3) c = waterKind[k] === 4 ? [120, 200, 210] : [58, 128, 176];
      else if (h < 0) {
        const t = clamp(-h / 14, 0, 1);
        c = [lerp(90, 30, t), lerp(170, 80, t), lerp(190, 140, t)];
      }
      const o = (y * S + x) * 3;
      img[o] = clamp(c[0], 0, 255);
      img[o + 1] = clamp(c[1], 0, 255);
      img[o + 2] = clamp(c[2], 0, 255);
    }
  }
  const mark = (wx, wz, col, r = 3) => {
    const px = Math.round((wx + D.half) / (2 * D.half) * S);
    const py = Math.round((wz + D.half) / (2 * D.half) * S);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const o = ((clamp(py + y, 0, S - 1)) * S + clamp(px + x, 0, S - 1)) * 3;
      img[o] = col[0];
      img[o + 1] = col[1];
      img[o + 2] = col[2];
    }
  };
  for (const s of sites) mark(s.x, s.z, s.kind === 'GOLEMS' ? [90, 90, 90] : s.kind === 'GOBLIN_BASE' ? [200, 40, 40] : [255, 220, 0], s.kind === 'GOLEMS' ? 2 : 4);
  mark(D.spawn.x, D.spawn.z, [255, 255, 255], 5);
  mark(landing.x, landing.z, [0, 220, 255], 5);
  for (const p of D.pois ?? []) mark(p.x, p.z, [255, 120, 220], 3);
  writePNG(path.join(OUT, 'preview.png'), S, S, img);
}

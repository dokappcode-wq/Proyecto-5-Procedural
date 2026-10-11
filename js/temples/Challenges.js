/**
 * Challenges — las pruebas de los templos de retos (P12). Lógica pura (sin Three.js ni DOM):
 * TempleSystem las crea al entrar, les pasa cada fotograma un contexto y lee el resultado.
 *
 *   ctx = { px, pz, alive, spawn(type, x, z) → enemigo, message(text) }
 *   update(dt, ctx) → 'won' | 'lost' | null
 *
 * Tipos: RACE (carrera por puntos de control con tiempo), FIGHT (oleada de goblins), PUZZLE
 * (pisar las runas en orden), SURVIVE (aguantar oleadas un tiempo), EXPLORE (encontrar
 * reliquias escondidas) y TRIAL (runas y guardianes: la del valle del inicio). `status()` da el texto para el HUD.
 */
export const CHALLENGE_TYPES = Object.freeze({
  RACE: { NAME: 'Carrera', ICON: '🏃', HINT: 'Corre por los puntos de luz en orden antes de que acabe el tiempo.' },
  FIGHT: { NAME: 'Pelea', ICON: '⚔️', HINT: 'Derrota a todos los enemigos del templo.' },
  PUZZLE: { NAME: 'Puzzle', ICON: '🧩', HINT: 'Pisa las runas en orden: 1, 2 y 3. Si te equivocas, vuelve a empezar.' },
  SURVIVE: { NAME: 'Supervivencia', ICON: '❄️', HINT: 'Aguanta con vida hasta que se acabe el tiempo.' },
  EXPLORE: { NAME: 'Exploración', ICON: '🧭', HINT: 'Encuentra las reliquias escondidas junto a las columnas (E).' },
  TRIAL: { NAME: 'Prueba del valle', ICON: '🔷', HINT: 'Pisa las runas en orden (1, 2 y 3) y vence a los guardianes que despierten.' },
});

class RaceChallenge {
  constructor({ points, limit, reach = 2.6 }) {
    this.points = points;
    this.limit = limit;
    this.reach = reach;
    this.next = 0;
    this.time = 0;
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    this.time += dt;
    const p = this.points[this.next];
    if (Math.hypot(ctx.px - p.x, ctx.pz - p.z) <= this.reach) {
      this.next++;
      if (this.next >= this.points.length) return 'won';
      ctx.message?.(`🏃 Punto ${this.next} de ${this.points.length}`);
    }
    return this.time > this.limit ? 'lost' : null;
  }

  status() {
    return `🏃 ${this.next}/${this.points.length} · ${Math.max(0, Math.ceil(this.limit - this.time))} s`;
  }
}

class FightChallenge {
  constructor({ spawns }) {
    this.spawns = spawns;
    this.enemies = [];
  }

  start(ctx) {
    this.enemies = this.spawns.map((s) => ctx.spawn(s.type, s.x, s.z)).filter(Boolean);
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    return this.enemies.every((e) => !e.alive) ? 'won' : null;
  }

  status() {
    return `⚔️ Quedan ${this.enemies.filter((e) => e.alive).length}`;
  }
}

class PuzzleChallenge {
  constructor({ plates, order = [0, 1, 2], reach = 1.5 }) {
    this.plates = plates;
    this.order = order;
    this.reach = reach;
    this.step = 0;
    this._on = -1;      // runa que se está pisando (solo cuenta al pisarla, no mientras sigues encima)
    this.mistakes = 0;
  }

  /** Índice de la runa pisada, o -1. */
  _plateAt(x, z) {
    return this.plates.findIndex((p) => Math.hypot(p.x - x, p.z - z) <= this.reach);
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    const on = this._plateAt(ctx.px, ctx.pz);
    if (on !== this._on) {
      this._on = on;
      if (on >= 0) {
        if (on === this.order[this.step]) {
          this.step++;
          if (this.step >= this.order.length) return 'won';
        } else if (this.order.indexOf(on) >= this.step) {
          this.step = 0;
          this.mistakes++;
          ctx.message?.('🧩 Orden equivocado: vuelve a empezar por la runa 1.');
        }
      }
    }
    return null;
  }

  /** ¿Está encendida la runa i? (para dibujarla) */
  lit(i) {
    return this.order.indexOf(i) < this.step;
  }

  status() {
    return `🧩 Runas ${this.step}/${this.order.length}`;
  }
}

class SurviveChallenge {
  constructor({ seconds, every, perWave, enemy, ring }) {
    this.seconds = seconds;
    this.every = every;
    this.perWave = perWave;
    this.enemy = enemy;     // tipo de enemigo de las oleadas (no `type`: ese es el del reto)
    this.ring = ring;       // { x, z, r } donde aparecen
    this.time = 0;
    this._wave = 0;
    this.enemies = [];
  }

  start(ctx) {
    this._spawnWave(ctx);
  }

  _spawnWave(ctx) {
    const { x, z, r } = this.ring;
    for (let i = 0; i < this.perWave; i++) {
      const a = (this._wave * 1.7) + (i / this.perWave) * Math.PI * 2;
      const e = ctx.spawn(this.enemy, x + Math.cos(a) * r, z + Math.sin(a) * r);
      if (e) this.enemies.push(e);
    }
    this._wave++;
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    this.time += dt;
    if (this.time >= this.seconds) return 'won';
    if (this.time >= this._wave * this.every) this._spawnWave(ctx);
    return null;
  }

  status() {
    return `❄️ Aguanta ${Math.max(0, Math.ceil(this.seconds - this.time))} s`;
  }
}

class ExploreChallenge {
  constructor({ relics }) {
    this.relics = relics.map((r) => ({ ...r, found: false }));
  }

  collect(id) {
    const r = this.relics.find((x) => x.id === id && !x.found);
    if (!r) return false;
    r.found = true;
    return true;
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    return this.relics.every((r) => r.found) ? 'won' : null;
  }

  status() {
    return `🧭 Reliquias ${this.relics.filter((r) => r.found).length}/${this.relics.length}`;
  }
}

/**
 * La prueba del templo del Valle del Despertar: primero las runas en orden (como el puzzle) y,
 * al encenderse la tercera, despiertan unos guardianes (slimes) que hay que vencer.
 */
class TrialChallenge {
  constructor({ plates, spawns }) {
    this.puzzle = new PuzzleChallenge({ plates, order: [0, 1, 2] });
    this.plates = plates;
    this.spawns = spawns;
    this.phase = 'runes';
    this.enemies = [];
  }

  lit(i) {
    return this.phase !== 'runes' || this.puzzle.lit(i);
  }

  update(dt, ctx) {
    if (!ctx.alive) return 'lost';
    if (this.phase === 'runes') {
      if (this.puzzle.update(dt, ctx) === 'won') {
        this.phase = 'guardians';
        this.enemies = this.spawns.map((s) => ctx.spawn(s.type, s.x, s.z)).filter(Boolean);
        ctx.message?.('🔷 Las runas se encienden… ¡y despiertan los guardianes del templo!');
        if (!this.enemies.length) return 'won';
      }
      return null;
    }
    return this.enemies.every((e) => !e.alive) ? 'won' : null;
  }

  status() {
    return this.phase === 'runes' ? `🔷 Runas ${this.puzzle.step}/3` : `🔷 Guardianes: quedan ${this.enemies.filter((e) => e.alive).length}`;
  }
}

/**
 * Crea la prueba de un tipo dentro de un recinto circular (centro cx, cz).
 * Los datos (puntos, runas, reliquias) dependen solo del tipo y del recinto: son fijos.
 */
export function createChallenge(type, { cx, cz, cfg }) {
  const ring = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  });
  let c;
  switch (type) {
    case 'RACE':
      c = new RaceChallenge({ points: ring(cfg.RACE.POINTS, cfg.RACE.RADIUS, 0.3).concat(ring(1, 0)), limit: cfg.RACE.TIME });
      break;
    case 'FIGHT':
      c = new FightChallenge({ spawns: cfg.FIGHT.ENEMIES.map((type, i, all) => ({ type, ...ring(all.length, 8, 0.4)[i] })) });
      break;
    case 'PUZZLE':
      c = new PuzzleChallenge({ plates: ring(3, 5, -Math.PI / 2), order: [0, 1, 2] });
      break;
    case 'SURVIVE':
      c = new SurviveChallenge({ seconds: cfg.SURVIVE.TIME, every: cfg.SURVIVE.EVERY, perWave: cfg.SURVIVE.PER_WAVE, enemy: cfg.SURVIVE.ENEMY, ring: { x: cx, z: cz, r: 11 } });
      break;
    case 'TRIAL':
      c = new TrialChallenge({ plates: ring(3, 5, -Math.PI / 2), spawns: (cfg.TRIAL?.ENEMIES ?? ['SLIME', 'SLIME']).map((type, i, all) => ({ type, ...ring(all.length, 9, 0.9)[i] })) });
      break;
    case 'EXPLORE':
      c = new ExploreChallenge({ relics: ring(cfg.EXPLORE.RELICS, 11.5, 0.6).map((p, i) => ({ id: `relic${i}`, ...p })) });
      break;
    default:
      throw new Error(`Reto desconocido: ${type}`);
  }
  c.type = type;
  return c;
}

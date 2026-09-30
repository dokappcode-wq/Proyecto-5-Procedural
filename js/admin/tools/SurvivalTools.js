import { GameEvents } from '../../core/GameEvents.js';

/**
 * Herramientas de depuración de supervivencia (FASE 6).
 */
export function registerSurvivalTools(admin, { health, hunger, thirst, energy, events }) {
  const stats = [
    ['Vida', health],
    ['Hambre', hunger],
    ['Sed', thirst],
    ['Energía', energy],
  ];

  admin.registerTool({
    category: 'Supervivencia',
    type: 'info',
    label: 'Vida / Hambre / Sed / Energía',
    read: () => stats.map(([, s]) => Math.ceil(s.value)).join(' / ') + (health.invulnerable ? ' · invulnerable' : ''),
  });
  for (const [name, stat] of stats) {
    admin.registerTool({ category: 'Supervivencia', label: `Rellenar ${name.toLowerCase()}`, run: () => stat.fill() });
  }
  admin.registerTool({
    category: 'Supervivencia',
    label: 'Rellenar todo',
    run: () => stats.forEach(([, s]) => s.fill()),
  });
  admin.registerTool({
    category: 'Supervivencia',
    type: 'input',
    label: 'Fijar valores',
    placeholder: 'vida, hambre, sed, energía',
    run: (value) => {
      const nums = value.split(/[\s,;]+/).filter(Boolean).map(Number);
      if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) throw new Error('Formato: 4 números');
      stats.forEach(([, s], i) => s.set(nums[i]));
    },
  });
  admin.registerTool({
    category: 'Supervivencia',
    label: 'Invulnerable ON/OFF',
    run: () => (health.invulnerable = !health.invulnerable),
  });
  admin.registerTool({
    category: 'Supervivencia',
    label: 'Recibir 25 de daño',
    run: () => events.emit(GameEvents.PLAYER_DAMAGED, { amount: 25, source: 'ADMIN', sourceName: 'Admin' }),
  });
}

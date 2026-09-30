import { GameEvents } from '../../core/GameEvents.js';

/**
 * Herramientas de depuración de las FASES 7–9: nutrición, equipamiento,
 * fabricación, construcción y sueño. (Los objetos se añaden desde "Inventario".)
 */
export function registerCraftTools(admin, { nutrition, equipment, construction, player, events }) {
  admin.registerTool({
    category: 'Alimentación',
    type: 'info',
    label: 'Dieta (animal / vegetal)',
    read: () => `${nutrition.state} · ${nutrition.animal.toFixed(0)} / ${nutrition.plant.toFixed(0)}`,
  });
  admin.registerTool({ category: 'Alimentación', label: 'Reiniciar dieta', run: () => nutrition.reset() });

  admin.registerTool({
    category: 'Construcción',
    type: 'info',
    label: 'Construcciones / armadura / resistencia al frío',
    read: () => `${construction.structures.length} · ${equipment.slots.BODY ?? 'sin armadura'} · ×${equipment.getColdLossMultiplier()}`,
  });
  for (const type of ['BED', 'SHELTER']) {
    admin.registerTool({
      category: 'Construcción',
      label: `Colocar ${type === 'BED' ? 'cama' : 'refugio'} delante (gratis)`,
      run: () => {
        const p = player.position;
        const x = p.x - Math.sin(player.yaw) * 3.2;
        const z = p.z - Math.cos(player.yaw) * 3.2;
        const check = construction.canPlace(type, x, z);
        if (!check.ok) throw new Error(check.reason);
        construction.addStructure(type, x, z, player.yaw, check.y);
      },
    });
  }
  admin.registerTool({ category: 'Construcción', label: 'Quitar todas las construcciones', run: () => construction.clear() });
  admin.registerTool({
    category: 'Construcción',
    label: 'Dormir ahora (sin cama)',
    run: () => events.emit(GameEvents.SLEEP_REQUEST, { bed: null }),
  });
}

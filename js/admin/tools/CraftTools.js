import { GameEvents } from '../../core/GameEvents.js';

/**
 * Herramientas de depuración de las FASES 7–9: nutrición, equipamiento,
 * construcción modular y sueño. (Los objetos se añaden desde "Inventario".)
 */
export function registerCraftTools(admin, { nutrition, equipment, construction, inventory, events }) {
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
    label: 'Piezas / armadura / pérdida de frío',
    read: () =>
      `${construction.pieces.length} · ${equipment.slots.BODY ?? 'sin armadura'} · ×${equipment.getColdLossMultiplier()}` +
      (construction.freeBuild ? ' · gratis' : ''),
  });
  admin.registerTool({
    category: 'Construcción',
    label: 'Materiales de construcción (+40 🪵 +20 🪨 +6 🧶)',
    run: () => {
      inventory.addItem('WOOD', 40);
      inventory.addItem('STONE', 20);
      inventory.addItem('WOOL', 6);
    },
  });
  admin.registerTool({
    category: 'Construcción',
    label: 'Construcción gratis ON/OFF',
    run: () => (construction.freeBuild = !construction.freeBuild),
  });
  admin.registerTool({ category: 'Construcción', label: 'Quitar todas las construcciones', run: () => construction.clear() });
  admin.registerTool({
    category: 'Construcción',
    label: 'Dormir ahora (sin cama)',
    run: () => events.emit(GameEvents.SLEEP_REQUEST, { bed: null }),
  });
}

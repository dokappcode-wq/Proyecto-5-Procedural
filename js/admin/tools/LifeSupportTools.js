/**
 * Herramientas de depuración del soporte vital (Etapa 4): traje, oxígeno,
 * burbujas y estaciones.
 */
export function registerLifeSupportTools(admin, { lifeSupport, inventory, bubbles, worlds }) {
  const C = 'Soporte vital';
  admin.registerTool({
    category: C,
    type: 'info',
    label: 'Estado',
    read: () => {
      const s = lifeSupport.getState();
      const pct = (r) => `${Math.round(r * 100)} %`;
      return `${s.breathable ? 'hay aire' : 'SIN AIRE'} · pulmones ${pct(s.lungs)} · ` +
        (s.wearing ? `traje: O₂ ${pct(s.oxygen)}, 🔋 ${pct(s.battery)}` : 'sin traje') +
        ` · burbujas en este cuerpo: ${bubbles.list.filter((b) => b.body === worlds.activeId).length}`;
    },
  });
  admin.registerTool({ category: C, label: 'Ponerse / quitarse el traje', run: () => lifeSupport.toggleSuit() });
  admin.registerTool({
    category: C,
    label: 'Llenar oxígeno y batería del traje',
    run: () => {
      lifeSupport.oxygen = 1;
      lifeSupport.battery = 1;
      lifeSupport.lungs = 1;
    },
  });
  admin.registerTool({
    category: C,
    label: 'Dar suministros (burbuja, 3 baterías, piedra y mineral)',
    run: () => {
      inventory.addItem('OXYGEN_BUBBLE', 1);
      inventory.addItem('PLANK_BATTERY_SMALL', 3);
      inventory.addItem('PLANK_BATTERY_SMALL_EMPTY', 1);
      inventory.addItem('STONE', 20);
      inventory.addItem('MINERAL', 20);
    },
  });
}

/**
 * Herramientas de depuración del inventario (FASE 5).
 */
export function registerInventoryTools(admin, { inventory, items }) {
  admin.registerTool({
    category: 'Inventario',
    type: 'info',
    label: 'Contenido',
    read: () => inventory.getAll().map((it) => `${it.ICON}${it.count}`).join(' ') || 'vacío',
  });
  for (const [id, def] of Object.entries(items)) {
    admin.registerTool({ category: 'Inventario', label: `+5 ${def.ICON} ${def.NAME}`, run: () => inventory.addItem(id, 5) });
  }
  admin.registerTool({ category: 'Inventario', label: 'Vaciar inventario', run: () => inventory.clear() });
}

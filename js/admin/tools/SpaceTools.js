/**
 * Herramientas de depuración del cielo (Fase 12) y del espacio (Fase 13).
 */
export function registerSpaceTools(admin, { celestial, space, time, player }) {
  // ---- Cielo ----
  admin.registerTool({
    category: 'Cielo',
    type: 'info',
    label: 'Lunas (altura / iluminada)',
    read: () => celestial.getState()
      .map((m) => `${m.name}: ${m.altitudeDeg.toFixed(0)}° · ${Math.round(m.illumination * 100)} %${m.visible ? '' : ' (bajo el horizonte)'}`)
      .join(' · '),
  });
  for (const id of ['MOON_A', 'MOON_B']) {
    admin.registerTool({
      category: 'Cielo',
      label: `Mirar a la ${id === 'MOON_A' ? 'Luna A' : 'Luna B'}`,
      run: () => {
        const m = celestial.getState().find((s) => s.id === id);
        if (!m.visible) throw new Error(`${m.name} está bajo el horizonte`);
        const d = m.direction;
        player.yaw = Math.atan2(-d.x, -d.z);
        player.pitch = Math.min(1.4, Math.asin(d.y));
      },
    });
  }
  admin.registerTool({
    category: 'Cielo',
    label: 'Ir a una noche con las dos lunas',
    run: () => {
      const h = celestial.findNightWithAllMoons();
      if (h === null) throw new Error('No hay ninguna en los próximos días');
      time.advance(h - time.totalHours);
    },
  });

  // ---- Espacio ----
  admin.registerTool({ category: 'Espacio', type: 'info', label: 'Estado', read: () => space.state });
  admin.registerTool({ category: 'Espacio', label: 'Activar transición al espacio', run: () => space.enter() });
  admin.registerTool({ category: 'Espacio', label: 'Regresar a MUNDO 0', run: () => space.exit() });
}

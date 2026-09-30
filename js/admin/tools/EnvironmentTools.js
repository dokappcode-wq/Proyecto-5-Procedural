/**
 * Herramientas de depuración de tiempo (Fase 11) y temperatura (Fase 10).
 */
const STATE_NAMES = { NORMAL: 'Normal', COLD: 'Frío', FREEZING: 'Congelación', CRITICAL: 'Crítico' };

export function registerEnvironmentTools(admin, { time, temperature }) {
  // ---- Tiempo ----
  admin.registerTool({
    category: 'Tiempo',
    type: 'info',
    label: 'Hora',
    read: () => {
      const s = time.getState();
      const flags = [time.frozen ? 'detenido' : null, time.speed !== 1 ? `×${time.speed}` : null].filter(Boolean).join(', ');
      return `Día ${s.day} · ${s.clock} · ${s.isNight ? 'noche' : 'día'} · luz ${Math.round(s.daylight * 100)} %${flags ? ` (${flags})` : ''}`;
    },
  });
  for (const [label, hour] of [['Amanecer (6:00)', 6], ['Mediodía (13:00)', 13], ['Atardecer (19:30)', 19.5], ['Medianoche (0:00)', 0]]) {
    admin.registerTool({ category: 'Tiempo', label, run: () => time.setTime(hour) });
  }
  admin.registerTool({ category: 'Tiempo', label: '+1 hora', run: () => time.advance(1) });
  admin.registerTool({
    category: 'Tiempo',
    type: 'input',
    label: 'Fijar hora',
    placeholder: '0–24 (p. ej. 21.5)',
    run: (value) => {
      const h = Number(value.replace(',', '.'));
      if (!Number.isFinite(h)) throw new Error('Escribe una hora entre 0 y 24');
      time.setTime(h);
    },
  });
  admin.registerTool({ category: 'Tiempo', label: 'Detener / reanudar reloj', run: () => (time.frozen = !time.frozen) });
  admin.registerTool({
    category: 'Tiempo',
    label: 'Velocidad ×1 / ×20 / ×120',
    run: () => (time.speed = time.speed === 1 ? 20 : time.speed === 20 ? 120 : 1),
  });

  // ---- Temperatura ----
  admin.registerTool({
    category: 'Temperatura',
    type: 'info',
    label: 'Jugador / ambiente',
    read: () => {
      if (temperature.value === null) return '—';
      const d = temperature.details;
      const parts = d
        ? ` [bioma ${d.biome.toFixed(1)} − altura ${d.altitude.toFixed(1)} − noche ${d.night.toFixed(1)}` +
          ` + refugio ${Math.round(d.shelter * 100)} %${d.heated ? ', climatizado' : ''}]`
        : '';
      return `${temperature.value.toFixed(1)} °C (${STATE_NAMES[temperature.state]}) · ambiente ${temperature.ambient.toFixed(1)} °C${parts}` +
        (temperature.immune ? ' · inmune' : '');
    },
  });
  admin.registerTool({ category: 'Temperatura', label: 'Enfriar a −12 °C', run: () => temperature.set(-12) });
  admin.registerTool({ category: 'Temperatura', label: 'Calentar a 20 °C', run: () => temperature.set(20) });
  admin.registerTool({ category: 'Temperatura', label: 'Inmune al frío ON/OFF', run: () => (temperature.immune = !temperature.immune) });
}

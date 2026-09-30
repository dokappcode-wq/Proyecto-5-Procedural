/**
 * Herramientas de depuración del cielo (Fase 12) y del espacio (Fase 13).
 */
export function registerSpaceTools(admin, { celestial, travel, starMap, ship, time, player, worlds, controller, events }) {
  // ---- Cuerpos (viaje directo, sin nave: depuración) ----
  admin.registerTool({ category: 'Cuerpos', type: 'info', label: 'Cuerpo actual', read: () => worlds.profile()?.NAME ?? worlds.activeId });
  for (const [id, name] of [['MUNDO_0', 'MUNDO 0'], ['MOON_A', 'la Luna A'], ['MOON_B', 'la Luna B']]) {
    admin.registerTool({
      category: 'Cuerpos',
      label: `Ir a ${name} (sin nave)`,
      run: () => {
        worlds.setActive(id);
        controller.spawn();
      },
    });
  }

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
  admin.registerTool({ category: 'Espacio', type: 'info', label: 'Estado', read: () => {
    if (!travel.inSpace) return travel.state;
    const n = travel.nav;
    return `en el espacio · ${Math.round(n.speed)} km/s · a ${Math.round(n.distanceFromCenter).toLocaleString('es-ES')} km de MUNDO 0`;
  } });
  admin.registerTool({
    category: 'Espacio',
    label: 'Activar transición al espacio',
    run: () => {
      if (travel.state !== 'SURFACE') throw new Error('Ya estás en el espacio');
      if (!ship.present) throw new Error('La nave no está en este cuerpo');
      ship.hasSpaceNode = true;
      if (!ship.piloting) ship.enterPilot();
      if (ship.state === 'LANDED') ship.ship.y += 60; // la despega directamente
      ship.flight.state = 'FLYING';
      ship.flight.hatchTarget = 0;
      ship.ship.hatch = 0;
      travel.enter();
    },
  });
  admin.registerTool({ category: 'Espacio', label: 'Aterrizar en el cuerpo cercano', run: () => travel.land() });
  for (const [id, name] of [['MOON_A', 'Luna A'], ['MOON_B', 'Luna B'], ['MUNDO_0', 'MUNDO 0']]) {
    admin.registerTool({
      category: 'Espacio',
      label: `Llevar la nave junto a ${name}`,
      run: () => {
        if (!travel.inSpace) throw new Error('Primero sal al espacio');
        const b = travel.nav.survey().bodies.find((x) => x.id === id);
        const body = travel._view.bodyPositions(time.totalHours).find((x) => x.id === id);
        const p = body.position;
        const l = Math.hypot(p.x, p.y, p.z) || 1;
        const dir = id === 'MUNDO_0' ? { x: 1, y: 0, z: 0 } : { x: p.x / l, y: p.y / l, z: p.z / l };
        travel.nav.placeNear(body, dir, body.radiusKm * 0.5);
        void b;
      },
    });
  }
  admin.registerTool({ category: 'Espacio', label: 'Mapa estelar 3D', run: () => events.emit('starMap:request', { open: true }) });
}

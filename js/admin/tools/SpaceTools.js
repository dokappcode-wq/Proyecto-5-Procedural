import { withPrep } from '../../systemdata/SolarSystem.js';

/**
 * Herramientas de depuración del cielo (Fase 12) y del espacio (Fase 13).
 */
export function registerSpaceTools(admin, { system, celestial, travel, starMap, ship, time, player, worlds, controller, events, installSpaceNode, pickups, meteors, lifeSupport, inventory }) {
  // ---- Cuerpos (viaje directo, sin nave: depuración) ----
  admin.registerTool({ category: 'Cuerpos', type: 'info', label: 'Cuerpo actual', read: () => worlds.profile()?.NAME ?? worlds.activeId });
  for (const { id, name } of system.visitable) {
    admin.registerTool({
      category: 'Cuerpos',
      label: `Ir ${withPrep('a', name)} (sin nave)`,
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
  for (const { id, name } of system.moons) {
    admin.registerTool({
      category: 'Cielo',
      label: `Mirar ${withPrep('a', name)}`,
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
    label: 'Ir a una noche con todas las lunas',
    run: () => {
      const h = celestial.findNightWithAllMoons();
      if (h === null) throw new Error('No hay ninguna en los próximos días');
      time.advance(h - time.totalHours);
    },
  });

  // ---- Espacio ----
  admin.registerTool({
    category: 'Espacio',
    label: 'Instalar el nodo espacial (nave ampliada)',
    run: () => {
      if (ship.hasSpaceNode) throw new Error('La nave ya tiene el nodo espacial');
      installSpaceNode();
    },
  });
  admin.registerTool({
    category: 'Espacio',
    label: 'Ir junto al nodo espacial caído',
    run: () => {
      const n = pickups.get('SPACE_NODE');
      if (!n || n.taken) throw new Error('El nodo ya se ha cogido');
      if (worlds.activeId !== n.body) throw new Error(`Está ${withPrep('en', system.nameOf(n.body))}`);
      controller.placeAt(n.x + 3, n.z + 3);
    },
  });
  admin.registerTool({ category: 'Espacio', type: 'info', label: 'Estado', read: () => {
    if (!travel.inSpace) return travel.state;
    const n = travel.nav;
    return `en el espacio · ${Math.round(n.speed)} km/s · a ${Math.round(n.distanceFromCenter).toLocaleString('es-ES')} km ${withPrep('de', system.home.name)}`;
  } });
  admin.registerTool({
    category: 'Espacio',
    label: 'Activar transición al espacio',
    run: () => {
      if (travel.state !== 'SURFACE') throw new Error('Ya estás en el espacio');
      if (!ship.present) throw new Error('La nave no está en este cuerpo');
      if (!ship.hasSpaceNode) installSpaceNode();
      if (!ship.piloting) ship.enterPilot();
      if (ship.state === 'LANDED') ship.ship.y += 60; // la despega directamente
      ship.flight.state = 'FLYING';
      ship.flight.hatchTarget = 0;
      ship.ship.hatch = 0;
      travel.enter();
    },
  });
  admin.registerTool({ category: 'Espacio', label: 'Aterrizar en el cuerpo cercano', run: () => travel.land() });
  for (const { id, name } of system.visitable) {
    admin.registerTool({
      category: 'Espacio',
      label: `Llevar la nave junto ${withPrep('a', name)}`,
      run: () => {
        if (!travel.inSpace) throw new Error('Primero sal al espacio');
        const b = travel.nav.survey().bodies.find((x) => x.id === id);
        const body = travel._view.bodyPositions(time.totalHours).find((x) => x.id === id);
        const p = body.position;
        const l = Math.hypot(p.x, p.y, p.z) || 1;
        const dir = system.isHome(id) ? { x: 1, y: 0, z: 0 } : { x: p.x / l, y: p.y / l, z: p.z / l };
        travel.nav.placeNear(body, dir, body.radiusKm * 0.5);
        void b;
      },
    });
  }
  // ---- Meteoritos y paseo espacial (Etapa 5) ----
  admin.registerTool({
    category: 'Espacio',
    label: 'Meteorito junto a la nave (a 120 m)',
    run: () => {
      if (!travel.inSpace) throw new Error('Primero sal al espacio');
      const f = travel.nav.forward;
      const m = meteors.spawn(f, 0.5);
      const d = m.radius / 1000 + 0.12;
      travel.nav.pos = { x: m.position.x - f.x * d, y: m.position.y - f.y * d, z: m.position.z - f.z * d };
      travel.nav.speed = 0;
    },
  });
  admin.registerTool({
    category: 'Espacio',
    label: 'Salir al exterior con traje (EVA)',
    run: () => {
      if (!travel.inSpace) throw new Error('Primero sal al espacio');
      if (ship.piloting) ship.exitPilot();
      if (!lifeSupport.wearing) lifeSupport.toggleSuit();
      const s = ship.ship;
      player.teleport(s.x, s.y - 3, s.z); // bajo el casco: fuera de la nave
    },
  });
  // ---- Nodo galáctico y fin de la demo (Etapa 6) ----
  admin.registerTool({
    category: 'Espacio',
    label: 'Instalar el nodo galáctico',
    run: () => {
      if (!ship.isExplorer) throw new Error('Primero instala el nodo espacial');
      const slot = Object.entries(ship.installed).find(([, t]) => !t)?.[0];
      if (!slot) throw new Error('No hay ranuras libres');
      inventory.addItem('GALACTIC_NODE', 1);
      events.emit('ship:galacticNode', { slot });
    },
  });
  admin.registerTool({
    category: 'Espacio',
    label: 'Llevar la nave al borde del sistema',
    run: () => {
      if (!travel.inSpace) throw new Error('Primero sal al espacio');
      const n = travel.nav;
      const c = n.zone.center;
      const d = n.distanceFromCenter || 1;
      const k = (n.zone.radius * 0.97) / d;
      const rel = { x: (n.pos.x - c.x) * k, y: (n.pos.y - c.y) * k, z: (n.pos.z - c.z) * k };
      n.pos = { x: c.x + rel.x, y: c.y + rel.y, z: c.z + rel.z };
      n.yaw = Math.atan2(-rel.x, -rel.z); // mirando hacia fuera de la estrella (forward = −sin, −cos)
      n.pitch = 0;
    },
  });
  admin.registerTool({ category: 'Espacio', label: 'Mapa estelar 3D', run: () => events.emit('starMap:request', { open: true }) });
}

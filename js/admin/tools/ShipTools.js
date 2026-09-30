import * as Layout from '../../ship/ShipLayout.js';

/**
 * Herramientas de depuración de la nave.
 */
const FLIGHT_NAMES = { LANDED: 'en tierra', TAKING_OFF: 'despegando', FLYING: 'en vuelo', LANDING: 'aterrizando' };

export function registerShipTools(admin, { ship, player, controller, inventory, world, events }) {
  admin.registerTool({
    category: 'Nave',
    type: 'info',
    label: 'Estado',
    read: () => {
      const t = ship.getTelemetry();
      return `${FLIGHT_NAMES[t.flight]} · (${t.position.x.toFixed(0)}, ${t.position.z.toFixed(0)}) · altura ${t.altitude.toFixed(1)} m · ` +
        `batería ${Math.round(t.charge * 100)} % · compuerta ${t.hatch === 'OPEN' ? 'abierta' : 'cerrada'}${t.piloting ? ' · pilotando' : ''}`;
    },
  });
  admin.registerTool({
    category: 'Nave',
    label: 'Ir a la nave',
    run: () => {
      if (ship.piloting) return;
      const s = ship.ship;
      const [x, z] = Layout.toWorld(s, 0, 10.5); // detrás de la cola, junto a la rampa
      controller.placeAt(x, z);
      player.yaw = s.yaw;
    },
  });
  admin.registerTool({
    category: 'Nave',
    label: 'Traer la nave aquí',
    run: () => {
      if (ship.piloting || ship.state !== 'LANDED') throw new Error('Solo con la nave en tierra y sin piloto');
      const p = player.position;
      // Se posa delante del jugador, con la cola (la rampa) hacia él.
      const yaw = player.yaw;
      const dist = 14;
      ship.placeLanded(p.x - Math.sin(player.yaw) * dist, p.z - Math.cos(player.yaw) * dist, yaw);
    },
  });
  admin.registerTool({ category: 'Nave', label: 'Volver al lugar de aterrizaje', run: () => {
    if (ship.piloting) throw new Error('Levántate del asiento primero');
    const site = world.getLandingSite();
    ship.placeLanded(site.x, site.z, site.yaw);
  } });
  admin.registerTool({ category: 'Nave', label: 'Recargar baterías', run: () => ship.batteries.fillAll(1) });
  admin.registerTool({ category: 'Nave', label: 'Baterías al 5 %', run: () => ship.batteries.fillAll(0.05) });
  admin.registerTool({
    category: 'Nave',
    label: '+1 batería plank pequeña',
    run: () => inventory.addItem(ship.batteries._cfg.ITEM, 1),
  });
}

/**
 * Herramientas de depuración del "mundo vivo" (FASE 4): agua, recursos y animales.
 */
export function registerLifeTools(admin, { world, animals, player, controller, species }) {
  const pos = () => player.position;

  admin.registerTool({
    category: 'Mundo vivo',
    type: 'info',
    label: 'Charcas / agua más cercana',
    read: () => {
      const n = world.water.nearestPond(pos().x, pos().z);
      return `${world.water.ponds.length} · ${n ? n.distance.toFixed(0) + ' m' : '—'}`;
    },
  });
  admin.registerTool({
    category: 'Mundo vivo',
    type: 'info',
    label: 'Recursos a 30 m',
    read: () => {
      const counts = {};
      for (const n of world.resources.getNodesNear(pos().x, pos().z, 30)) counts[n.type] = (counts[n.type] ?? 0) + 1;
      return Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ') || '—';
    },
  });
  admin.registerTool({
    category: 'Mundo vivo',
    type: 'info',
    label: 'Animales (activos / total)',
    read: () => `${animals.activeCount} / ${animals.animals.length} · ${animals.herds.length} rebaños`,
  });
  admin.registerTool({
    category: 'Mundo vivo',
    type: 'info',
    label: 'Temperamentos (huir/curioso/neutral)',
    read: () => {
      const t = animals.getTemperamentStats().temperament;
      return `${t.FLEE ?? 0} / ${t.CURIOUS ?? 0} / ${t.NEUTRAL ?? 0}`;
    },
  });
  admin.registerTool({
    category: 'Mundo vivo',
    type: 'info',
    label: 'Animal más cercano',
    read: () => {
      const a = animals
        .getAnimalsNear(pos().x, pos().z, 40)
        .sort((u, v) => Math.hypot(u.x - pos().x, u.z - pos().z) - Math.hypot(v.x - pos().x, v.z - pos().z))[0];
      if (!a) return '—';
      return `${a.def.NAME} · ${a.temperament}/${a.hitReaction} · ${a.state} · vida ${a.health}`;
    },
  });
  admin.registerTool({
    category: 'Mundo vivo',
    label: 'Ir al agua más cercana',
    run: () => {
      const n = world.water.nearestPond(pos().x, pos().z);
      if (!n) throw new Error('No hay charcas en esta seed');
      const p = n.pond;
      const a = Math.atan2(pos().z - p.z, pos().x - p.x);
      const r = p.radius * 1.6 + 2;
      controller.placeAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    },
  });
  for (const id of Object.keys(species)) {
    admin.registerTool({
      category: 'Mundo vivo',
      label: `Ir a ${species[id].NAME_PLURAL.toLowerCase()} más cercanos`,
      run: () => {
        const n = animals.nearestHerd(id, pos().x, pos().z);
        if (!n) throw new Error('No hay rebaños de esa especie');
        const target = n.herd.members.find((a) => !a.removed) ?? n.herd;
        controller.placeAt(target.x + 12, target.z + 12);
      },
    });
  }
}

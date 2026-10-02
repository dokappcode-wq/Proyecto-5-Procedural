import { WorldSeed } from '../../world/WorldSeed.js';

/**
 * Herramientas de depuración del mundo procedural:
 * seed, regeneración, biomas e información de generación.
 */
export function registerWorldTools(admin, { world, player, controller }) {
  const at = () => world.describeAt(player.position.x, player.position.z);

  admin.registerTool({ category: 'Mundo', type: 'info', label: 'Planeta', read: () => world.getInfo().planet });
  admin.registerTool({ category: 'Mundo', type: 'info', label: 'Seed', read: () => world.getInfo().seedText });
  admin.registerTool({
    category: 'Mundo',
    type: 'info',
    label: 'Seed numérica',
    read: () => String(world.getInfo().seedValue),
  });
  admin.registerTool({
    category: 'Mundo',
    type: 'input',
    label: 'Cambiar seed',
    placeholder: 'texto o número',
    run: (value) => {
      if (!value.trim()) throw new Error('Escribe una seed');
      world.generate(value);
    },
  });
  admin.registerTool({
    category: 'Mundo',
    label: 'Regenerar (misma seed)',
    run: () => world.generate(world.getInfo().seedText),
  });
  admin.registerTool({
    category: 'Mundo',
    label: 'Seed aleatoria',
    run: () => world.generate(WorldSeed.randomText()),
  });

  admin.registerTool({ category: 'Mundo', type: 'info', label: 'Bioma actual', read: () => at().biome });
  admin.registerTool({
    category: 'Mundo',
    type: 'info',
    label: 'Altura del terreno',
    read: () => `${at().height.toFixed(2)} m`,
  });
  admin.registerTool({
    category: 'Mundo',
    type: 'info',
    label: 'Factor montaña',
    read: () => at().mountain.toFixed(2),
  });

  // ---- Biomas --------------------------------------------------------------
  admin.registerTool({
    category: 'Biomas',
    type: 'info',
    label: 'Pesos de bioma',
    read: () => {
      const w = at().biomeInfo.weights;
      return Object.entries(w).filter(([, v]) => v > 0.005).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
    },
  });
  admin.registerTool({
    category: 'Biomas',
    type: 'info',
    label: 'Temperatura base del bioma',
    read: () => `${at().biomeInfo.temperature.toFixed(1)} °C`,
  });
  for (const id of world.biomes.ids) {
    admin.registerTool({
      category: 'Biomas',
      label: `Ir a ${world.biomes.get(id).NAME} más cercano`,
      run: () => {
        const p = world.findNearestBiome(id, player.position.x, player.position.z, { maxRadius: world.worldSize, minWeight: 0.6 });
        if (!p) throw new Error('No se ha encontrado ese bioma en esta seed');
        controller.placeAt(p.x, p.z);
      },
    });
  }

  admin.registerTool({
    category: 'Generación',
    type: 'info',
    label: 'Tamaño',
    read: () => {
      const i = world.getInfo();
      return `${i.worldSize} m · ${i.chunkCount} chunks de ${i.chunkSize} m`;
    },
  });
  admin.registerTool({
    category: 'Generación',
    type: 'info',
    label: 'Chunks (malla / datos / cola)',
    read: () => {
      const i = world.getInfo();
      return `${i.chunkMeshesLoaded} / ${i.chunkDataCached} / ${i.chunkMeshesPending}`;
    },
  });
  admin.registerTool({
    category: 'Generación',
    type: 'info',
    label: 'Spawn (x, z)',
    read: () => {
      const s = world.getInfo().spawn;
      return `${s.x.toFixed(1)}, ${s.z.toFixed(1)}`;
    },
  });
  admin.registerTool({
    category: 'Generación',
    type: 'info',
    label: 'Tiempo de generación',
    read: () => `${world.getInfo().generationMs.toFixed(1)} ms`,
  });
  admin.registerTool({
    category: 'Generación',
    type: 'info',
    label: 'Sub-seeds',
    read: () =>
      Object.entries(world.getInfo().subSeeds)
        .map(([k, v]) => `${k}:${v.toString(16)}`)
        .join(' '),
  });
}

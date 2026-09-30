import { WorldSeed } from '../../world/WorldSeed.js';

/**
 * Herramientas de depuración del mundo procedural (FASE 2):
 * seed, regeneración e información de generación.
 */
export function registerWorldTools(admin, { world, player }) {
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

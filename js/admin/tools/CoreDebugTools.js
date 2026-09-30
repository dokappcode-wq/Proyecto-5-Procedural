/**
 * Herramientas de depuración básicas: jugador y cámara.
 *
 * Cada fase añade su propio archivo en admin/tools/ (WorldTools, SurvivalTools,
 * InventoryTools, EnvironmentTools, ShipTools, SpaceTools...) con una función
 * register*(admin, deps).
 */
export function registerCoreDebugTools(admin, { player, controller, camera, loop = null, renderer = null }) {
  const fmt = (n) => n.toFixed(2);

  // ---- Rendimiento (Fase 14) --------------------------------------------------
  if (loop && renderer) {
    admin.registerTool({
      category: 'Rendimiento',
      type: 'info',
      label: 'FPS · dibujos · triángulos',
      read: () => {
        const r = renderer.info.render;
        return `${Math.round(loop.fps)} fps · ${r.calls} dibujos · ${(r.triangles / 1000).toFixed(0)} k triángulos`;
      },
    });
    admin.registerTool({
      category: 'Rendimiento',
      type: 'info',
      label: 'Memoria GPU (geometrías / texturas)',
      read: () => `${renderer.info.memory.geometries} / ${renderer.info.memory.textures}`,
    });
  }

  // ---- Jugador -------------------------------------------------------------
  admin.registerTool({
    category: 'Jugador',
    type: 'info',
    label: 'Posición (x, z)',
    read: () => `${fmt(player.position.x)}, ${fmt(player.position.z)}`,
  });
  admin.registerTool({
    category: 'Jugador',
    type: 'info',
    label: 'Altura (y)',
    read: () => fmt(player.position.y),
  });
  admin.registerTool({
    category: 'Jugador',
    type: 'info',
    label: 'Estado',
    read: () => {
      const s = player.state;
      if (s.isFlying) return 'volando';
      if (!s.onGround) return 'en el aire';
      return s.isRunning ? 'corriendo' : s.isMoving ? 'caminando' : 'quieto';
    },
  });
  admin.registerTool({
    category: 'Jugador',
    label: 'Vuelo ON/OFF',
    run: () => controller.setFlying(!player.state.isFlying),
  });
  admin.registerTool({
    category: 'Jugador',
    label: 'Volver al spawn',
    run: () => controller.spawn(),
  });
  admin.registerTool({
    category: 'Jugador',
    type: 'input',
    label: 'Teletransportar',
    placeholder: 'x, z',
    run: (value) => {
      const [x, z] = value.split(/[\s,;]+/).filter(Boolean).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('Formato: x, z');
      controller.placeAt(x, z);
    },
  });

  // ---- Cámara --------------------------------------------------------------
  admin.registerTool({
    category: 'Cámara',
    type: 'info',
    label: 'Modo',
    read: () => camera.mode,
  });
  admin.registerTool({
    category: 'Cámara',
    label: 'Alternar 1ª / 3ª persona',
    run: () => camera.toggleMode(),
  });
}

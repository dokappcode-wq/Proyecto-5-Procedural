# MUNDO 0 — Prototipo procedural de supervivencia y exploración

Prototipo conceptual 3D en navegador: HTML + CSS + JavaScript (ES modules) + Three.js/WebGL.
Sin motores externos y sin paso de compilación.

**Estado actual: FASE 5** — inventario y recogida: talar árboles, picar rocas, coger manzanas y
golpear animales (carne, lana, cuero). Cada animal tiene un temperamento (huir / curiosidad /
neutral) y una reacción al golpe (huir / defenderse). Sobre las Fases 1–4: mundo finito por seed
con biomas, recursos, charcas y rebaños, en estilo low-poly.

## Cómo ejecutarlo

Los módulos ES no se cargan desde `file://`, así que hace falta un servidor estático local:

```bash
npm start                        # usa npx http-server en http://localhost:8080
# o bien
python3 -m http.server 8080
```

Abre `http://localhost:8080` y pulsa **Entrar en MUNDO 0**.

- Seed por URL: `http://localhost:8080/?seed=loquesea` (la misma seed produce el mismo mundo).
- Tests sin navegador (reproducibilidad, secuencia Admin): `npm test`.

## Controles

| Tecla | Acción |
|---|---|
| `W A S D` / flechas | Moverse |
| `Shift` | Correr |
| `Espacio` | Saltar (en vuelo: subir) |
| `C` | Bajar (solo en vuelo) |
| Ratón | Mirar (clic en el juego para capturarlo, `Esc` para liberarlo) |
| `V` | Alternar 1ª / 3ª persona |
| `E` | Recoger (talar, picar, coger manzanas) |
| Clic izquierdo / `F` | Golpear animal (o recoger) |
| Rueda | Distancia de cámara en 3ª persona |
| `H` | Mostrar/ocultar ayuda |
| `a` `d` `m` `i` `n` | Modo Admin (secuencia, máx. 2 s entre teclas) |

Todas las teclas se configuran en `js/config/GameConfig.js` → `INPUT.KEYBINDINGS`.

## Arquitectura

```
index.html              importmap → lib/three (Three.js r186 incluido localmente)
css/style.css
lib/three/              Three.js (MIT) — sin CDN, versión fija
js/
├── main.js             Raíz de composición: crea sistemas, inyecta dependencias, fija el orden
├── config/GameConfig.js  TODOS los valores ajustables (secciones por sistema)
├── core/
│   ├── EventBus.js     Pub/sub entre sistemas (sin llamadas directas)
│   ├── GameEvents.js   Catálogo de eventos
│   ├── GameLoop.js     Bucle: update(dt) ordenado → render → lateUpdate
│   ├── InputManager.js Acciones con nombre, ratón, rueda, bloqueo por causas
│   ├── RenderContext.js Renderer, escena, cámara, resize
│   ├── SeededRandom.js Hash de texto, sub-seeds y PRNG (mulberry32)
│   └── MathUtils.js    smoothstep, clamp01
├── world/
│   ├── WorldGenerator.js    Mundo finito: seed, caché de alturas, spawn — interfaz de terreno
│   ├── WorldSeed.js         Seed + sub-seeds (terrain, biome, resource, animal, celestial, spawn)
│   ├── TerrainGenerator.js  h(x, z) determinista por capas (sin Three.js)
│   ├── noise/SimplexNoise.js  Ruido Simplex 2D con seed (fBm, ridged)
│   ├── ChunkManager.js      Carga/descarga progresiva por CAPAS (terreno, recursos)
│   ├── TerrainMesher.js     Alturas de chunk → BufferGeometry (índice compartido)
│   ├── BiomeSystem.js       Pesos de bioma por punto, bioma dominante, temperatura base
│   ├── BiomeColorizer.js    Color por vértice según bioma, pendiente, nieve/hielo y curvatura
│   ├── BiomeTracker.js      Bioma actual del jugador (con histéresis) → evento de cambio
│   ├── SkyDome.js           Cielo con degradado y disco solar (niebla = color del horizonte)
│   ├── WaterSystem.js       Charcas: generación, excavación del terreno, consultas de agua
│   ├── ResourceSystem.js    Árboles/rocas/arbustos/hierba por chunk, colisiones, retirada
│   ├── props/PropMesher.js  Plantillas low-poly y fusión por chunk (1 llamada de dibujo)
│   ├── DiscoveryTracker.js  "Has encontrado agua / cabras…" (primer encuentro)
│   └── SceneLighting.js     Luz ambiente + sol con sombras que siguen al jugador
├── animals/
│   ├── AnimalSystem.js      Rebaños por seed, simulación y dibujo solo cerca del jugador
│   ├── Animal.js            Estados + temperamento (huir/curioso/neutral) + reacción al golpe
│   ├── Deer.js / Goat.js / Cow.js  Especies (modelo + ajustes de comportamiento)
│   └── AnimalRenderer.js    InstancedMesh cuerpo + patas animadas (2 draw calls/especie)
├── render/PartsBuilder.js   Geometría low-poly por piezas con color por vértice
├── inventory/InventorySystem.js   AddItem/RemoveItem/HasItem/GetItemCount (sin Three.js)
├── interaction/InteractionSystem.js  Objetivo de la mira + recoger / golpear
├── player/
│   ├── Player.js            Estado del jugador (posición, mirada, flags)
│   ├── PlayerController.js  Entrada → física (gravedad, salto, escalones, colisión)
│   └── PlayerModel.js       Personaje de bloques animado
├── camera/CameraSystem.js   1ª/3ª persona con transición suave
├── admin/
│   ├── AdminSystem.js       Activación por secuencia + registro de herramientas
│   ├── AdminPanel.js        Vista DOM del panel
│   ├── KeySequenceDetector.js
│   └── tools/               CoreDebugTools, WorldTools, LifeTools, InventoryTools
└── ui/UIManager.js          HUD provisional (reacciona a eventos)
tests/                       Tests de Node (`npm test`)
```

Principios:

- **Sin GameManager gigante.** `main.js` solo compone; cada sistema tiene una responsabilidad.
- **Interfaz de terreno.** Jugador y cámara solo usan `getHeightAt(x, z)`, `getBounds()`,
  `getSpawnPoint()` y `describeAt(x, z)`, que implementa `WorldGenerator`.
- **Reproducibilidad.** Nada de la generación usa `Math.random()`: todo deriva de la seed a
  través de sub-seeds independientes (cambiar el terreno no altera animales ni lunas).
- **Planetas futuros.** Los parámetros del relieve están en un perfil de planeta
  (`GameConfig.PLANETS.MUNDO_0`); otro planeta = otro perfil.
- **Biomas por pesos.** Cada punto tiene pesos por bioma (suman 1): relieve y color se mezclan
  en las fronteras. Las Montañas Heladas siguen al relieve; Bosque/Explanada salen de la
  sub-seed `biome`. El jugador aparece siempre en Explanada. Cada bioma define en configuración
  su nombre, temperatura base (para la Fase 10), escala de relieve y colores.
- **Estilo visual.** Low-poly facetado (`RENDER.TERRAIN_FLAT_SHADING`), tone mapping neutro,
  cielo y niebla del mismo color de horizonte, sol bajo para marcar el relieve.
- **Mundo vivo.** Recursos colocados por chunk con la sub-seed `resource` (el contenido de un
  chunk no depende del orden de visita) y fusionados en una malla por chunk. Cada recurso sabe
  qué dará al recogerlo (Fase 5). Charcas excavadas en el terreno, siempre una cerca del inicio.
  Animales por rebaños con la sub-seed `animal`; solo se simulan/dibujan los cercanos.
- **Animales con carácter.** Cada animal recibe al azar (derivado de la seed y según las
  probabilidades de su especie) un temperamento ante el jugador y una reacción al golpe. Los
  ataques emiten `PLAYER_DAMAGED`, que en la Fase 6 consumirá HealthSystem.
- **Interacción desacoplada.** InteractionSystem solo decide el objetivo y delega en
  ResourceSystem.harvest(), AnimalSystem.hitAnimal() e InventorySystem.
- **Mundo finito.** 1024 × 1024 m en chunks de 64 m. Los datos de altura se generan bajo demanda
  y se guardan; solo existen mallas en un radio de 4 chunks. El borde desciende a un mar y el
  jugador no puede salir del área jugable.
- **La lógica del jugador no depende de la cámara.** El jugador expone ojos + yaw/pitch;
  la cámara decide dónde colocarse. Ocultar el cuerpo en 1ª persona se hace por evento.
- **Admin extensible.** Cada fase registra sus herramientas con `admin.registerTool()`.
- **Configuración centralizada.** Cada sistema recibe solo su sección de `GameConfig`.

Depuración desde la consola del navegador: `window.__MUNDO0__` expone los sistemas.

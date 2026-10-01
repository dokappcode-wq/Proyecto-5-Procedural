# Mundo Cero — Prototipo procedural de supervivencia y exploración

Prototipo conceptual 3D en navegador: HTML + CSS + JavaScript (ES modules) + Three.js/WebGL.
Sin motores externos y sin paso de compilación.

**Estado actual: v1.5.0 — nuevos tipos de terreno (archipiélago, mundo oceánico, altiplano, dunas), nadar y bucear, y flora y fauna con nombre, tamaño, color y carácter propios. Antes: el Edén es el tutorial: al terminarlo, la nave recibe el nodo de velocidad-luz y salta por el hiperespacio a los sistemas del catálogo (el primero, Kappa). Además: las 14 fases, la ampliación del sistema solar (etapas E1–E6 y la IA, con final de demo) y los bloques 1a y 1b de los sistemas solares importables: el juego se construye a partir de un sistema descrito en JSON, con regiones de 0,5 a 20 km, varios planetas y crucero interplanetario.**

Nombre provisional del juego: **Mundo Cero**. El planeta de la campaña es **El Jardín del Edén** (antes "MUNDO 0"), con sus dos lunas.

| Fase | Contenido |
|---|---|
| 1–2 | Motor base: jugador, cámara 1ª/3ª persona, mundo finito procedural por seed |
| 3 | Biomas por pesos: Explanada, Bosque y Montañas Heladas (estilo low-poly) |
| 4 | Mundo vivo: árboles, rocas, charcas, ciervos, cabras y vacas |
| 5 | Inventario, recogida y animales con temperamento y reacción al golpe |
| 6 | Supervivencia: vida, hambre, sed y energía |
| 7–9 | Dieta equilibrada, odre, armadura, cama, fabricación y construcción modular |
| 10 | Temperatura oculta: frío, congelación, escarcha progresiva y daño |
| 11 | Día y noche: sol, crepúsculos, estrellas, noches más frías, dormir adelanta el reloj |
| 12 | Sistema celestial: sol, Luna A y Luna B en el cielo, con fases y luz de luna |
| 13 | Espacio: salir del planeta con la nave, ver el Jardín del Edén y las lunas desde fuera, regresar |
| 14 | Modo Admin plegable con buscador, interfaz revisada y limpieza general |
| + | Nave pequeña: compuerta, laboratorio, sala de controles, vuelo, mapa, puesto de carga, reloj |
| E1 | Varios cuerpos: el Jardín del Edén, Luna A (clara) y Luna B (rojiza), procedurales, con estado propio |
| E2 | Espacio explorable: se pilota la nave (cámara detrás) entre el Jardín del Edén y las lunas |
| E3 | Nodo espacial caído en el Jardín del Edén (con mapa); al instalarlo la nave se amplía |
| IA | Nodo de IA en la sala de controles: IA con el nombre que quieras, datos del sistema y avisos de la nave |
| E5 | Meteoritos procedurales en el espacio: no se aterriza; paseo espacial con traje y jetpack de gas, gravedad propia (se camina alrededor) y minería de cristales |
| E6 | Nodo galáctico en una luna, salto fallido al salir del sistema, cápsulas de escape y fin de la demo |
| E4 | Aire y asfixia, traje espacial con oxígeno y batería plank, cofre lunar, burbuja de oxígeno, estaciones de carga y de oxígeno, construir en las lunas |
| 1d | Importar sistemas solares: panel con archivo, arrastrar o pegar; comprobación segura (solo JSON, 256 KB, nada se ejecuta), vista previa, avisos de claves ignoradas, ideas no soportadas, errores con *Copiar error para Claude* y *Copiar guía del formato*; guardados en el navegador (IndexedDB) para jugarlos o borrarlos, y como destinos del hiperespacio |
| K | Sistema Kappa: Thalassa (mundo oceánico), Pontos (solo mar, sin una isla, con una ola gigante cada 24 h) y Ferrum (enorme desierto rojo de dunas). Generador `open_ocean`, nave que amerriza y `water.giant_wave` |
| 1c | Generadores `archipelago`, `ocean_world`, `highlands` y `dunes`; nadar y bucear (capacidad del motor: cada sistema la activa o ajusta con `water.swim/dive/visibility_m`; bajo el agua no se respira sin traje); fauna con `name`, `size`, `color`, `temperament` y `biome`; flora con `color`, `fruit_color` y `size` |
| HS | Hiperespacio: al terminar el tutorial (el Edén) la IA convierte el nodo galáctico en un nodo de velocidad-luz. En el borde de cualquier sistema, la IA pregunta a qué sistema ir (panel de navegación con el catálogo `systems/catalogo.json`); cada salto gasta 1 batería de la nave y la partida (mochila, traje, nave, baterías) viaja contigo |
| 1b | Regiones de tamaño real (enano 0,5 km · pequeño 1 · mediano 5 · grande 10 · enorme 20) con caché de terreno que descarta lo más antiguo; varios planetas por sistema alrededor de una estrella, todas las lunas visitables, animales en cada cuerpo con fauna, crucero interplanetario y rumbo automático que rodea los planetas |
| 1a | Sistemas solares como datos: catálogo del motor, esquema v1, lectura segura de JSON, validador con rutas de error, compilador. El Jardín del Edén vive en `systems/jardin-del-eden.system.json` y cada partida tiene una semilla numérica aleatoria |

## Cómo ejecutarlo

Los módulos ES no se cargan desde `file://`, así que hace falta un servidor estático local:

```bash
npm start                        # usa npx http-server en http://localhost:8080
# o bien
python3 -m http.server 8080
```

Abre `http://localhost:8080` y pulsa **Entrar en el Jardín del Edén**.

- Cada partida empieza con una **semilla numérica aleatoria** (se ve arriba a la izquierda).
- Semilla fija por URL: `http://localhost:8080/?seed=12345` (la misma semilla produce el mismo planeta y las mismas lunas).
- Catálogo de sistemas a los que se salta: `systems/catalogo.json` (id, archivo, nombre, descripción). Para añadir un sistema: su `systems/<archivo>.system.json` y una entrada en el catálogo.
- Otro sistema de la carpeta `systems/`: `http://localhost:8080/?system=kappa` (sistema de prueba con tres planetas: enano, mediano y enorme).
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
| En el agua: `Espacio` · `C` · `Shift` | Subir · bucear · nadar más rápido (sin traje, bajo el agua se aguanta la respiración) |
| `E` | Recoger (talar, picar, coger manzanas) / beber (mirando al agua) |
| Clic izquierdo / `F` | Golpear animal (o recoger) |
| `1`–`9` | Seleccionar objeto de la barra |
| Clic derecho / `R` | Usar el objeto seleccionado: comer, beber del odre, llenarlo (mirando al agua), equipar |
| `Tab` | Panel de fabricación (odre, armadura) |
| `B` | Modo construcción: `1`–`0` pieza · clic colocar · clic derecho quitar · `Q` girar |
| `E` sobre una puerta / cama | Abrir o cerrar / dormir |
| `E` en la nave | Botón de la compuerta, puerta, asiento del piloto, mapa, puesto de carga, reloj |
| A los mandos: `T` / `G` / `L` | Despegar o aterrizar / compuerta / recoger o sacar patas |
| A los mandos: `W` `S` · `A` `D` · `Espacio` `C` · `Shift` | Adelante/atrás · girar · subir/bajar · turbo |
| A los mandos: ratón / rueda / `E` | Girar la cámara / distancia / levantarse (en el aire la nave se queda flotando) |
| Reloj de la nave + clic derecho / `R` | Ver dónde está la nave (distancia, dirección, estado) |
| A los mandos: `O` | Salir al espacio (con el nodo espacial; en vuelo, compuerta cerrada, a más de 60 m) |
| En el espacio: `W`/`S` · `A`/`D` · `Espacio`/`C` · `Shift` | Acelerar/frenar · girar · cabecear · impulso |
| En el espacio: `1`–`9` · `Shift` · `T` · `M` | Rumbo automático (primero los planetas, después las lunas del planeta cercano y el meteorito) · impulso; lejos de los planetas, crucero interplanetario · aterrizar al llegar · mapa estelar 3D |
| Mapa de la señal + clic derecho / `R` | Abrir el mapa con la posición del nodo espacial |
| Burbuja de oxígeno + clic derecho / `R` | Desplegarla delante (`E` en el generador: poner/quitar batería, recogerla) |
| Batería plank + clic derecho / `R` (con el traje) | Cambiar la batería del traje |
| En el espacio, a los mandos: `4` | Rumbo al meteorito más cercano (se detiene a ~120 m) |
| Paseo espacial: `W`/`S` · `A`/`D` · `Espacio`/`C` · `Shift` | Jetpack adelante/atrás · lados · subir/bajar · más empuje (sobre un meteorito: caminar y saltar) |
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
├── config/GameConfig.js  Valores ajustables del motor (secciones por sistema)
├── systemdata/           Sistemas solares como DATOS (nunca código)
│   ├── Catalog.js           Lo que el motor sabe construir: generadores, flora, fauna, tamaños, estrellas, límites
│   ├── Schema.js            Esquema v1 derivado del catálogo (exportable a JSON Schema)
│   ├── SafeJson.js          Lectura segura: solo JSON, 256 KB, profundidad, sin __proto__
│   ├── Validator.js         Errores con ruta · claves desconocidas ignoradas con aviso
│   ├── Migrations.js        Versiones del formato
│   ├── SystemCompiler.js    JSON validado → perfiles del motor (determinista)
│   ├── SystemLoader.js      Tubería completa + informe "Copiar error para Claude"
│   └── SolarSystem.js       El sistema en juego: cuerpo de inicio, lunas, nombres, teclas de rumbo
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
├── inventory/
│   ├── InventorySystem.js   AddItem/RemoveItem/HasItem/GetItemCount (sin Three.js)
│   ├── HotbarSystem.js      Objeto seleccionado (teclas 1–9)
│   ├── ItemUseSystem.js     "Usar": delega en nutrición, odre, equipamiento o construcción
│   └── EquipmentSystem.js   Armadura (ranura BODY) → multiplicador de pérdida de frío
├── time/
│   ├── TimeSystem.js        Reloj, día, dirección del sol, luz de día, frío nocturno (sin Three.js)
│   └── AtmosphereSystem.js  Aplica la hora: sol/luna, luz ambiente, cielo, estrellas, niebla
├── celestial/
│   ├── CelestialCatalog.js  Lunas del sistema + seed: órbitas, fases (sin Three.js)
│   └── CelestialSystem.js   Lunas en el cielo (cráteres, fases por la luz del sol), luz de luna
├── space/
│   ├── SpaceSystem.js       Transición superficie ↔ espacio, cámara orbital, enfoque
│   ├── SpaceScene.js        Escena espacial: planeta, nubes, atmósfera, lunas, sol, estrellas
│   └── PlanetTexture.js     Textura del planeta: mapa real de la región + resto inventado por seed
├── ship/
│   ├── ShipSystem.js        Nave: compone vuelo, modelo, mandos, interacción, colisiones, refugio
│   ├── ShipLayout.js        Forma: salas, colisiones, suelos, rampa, ranuras (sin Three.js)
│   ├── ShipFlight.js        Vuelo: despegar, volar, flotar, aterrizar (también sola) (sin Three.js)
│   ├── BatteryBank.js       Puesto de carga: baterías plank pequeñas (sin Three.js)
│   └── ShipModel.js         Modelo low-poly con compuerta, puerta, patas y luces móviles
├── nutrition/NutritionSystem.js  Equilibrio comida animal/vegetal (sin Three.js)
├── crafting/CraftingSystem.js    Recetas de GameConfig.RECIPES (sin Three.js)
├── construction/
│   ├── ConstructionSystem.js     Modo construcción: apuntar, anclar, validar, colocar/quitar, puertas
│   ├── BuildRules.js             Reglas puras: formas, rejilla, colisiones, superficies, apoyo, refugio
│   └── BuildModels.js            Modelos low-poly de cada pieza
├── interaction/InteractionSystem.js  Objetivo de la mira + recoger / golpear
├── player/
│   ├── Player.js            Estado del jugador (posición, mirada, flags)
│   ├── VitalStat.js         Base de las estadísticas: valor, máximo, umbrales, eventos
│   ├── HealthSystem.js      Vida: daño (evento), caídas, curación, muerte, reaparición
│   ├── HungerSystem.js      Hambre: desgaste; a 0 hace daño vía evento
│   ├── ThirstSystem.js      Sed: desgaste, beber (evento PLAYER_DRANK)
│   ├── EnergySystem.js      Energía: tiempo + actividad; limita correr y velocidad
│   ├── SleepSystem.js       Dormir: energía, coste de hambre/sed; TimeSystem adelanta el reloj
│   ├── TemperatureSystem.js Temperatura oculta: frío, congelación, daño (sin Three.js)
│   ├── PlayerController.js  Entrada → física (gravedad, salto, escalones, colisión)
│   └── PlayerModel.js       Personaje de bloques animado
├── camera/CameraSystem.js   1ª/3ª persona con transición suave
├── admin/
│   ├── AdminSystem.js       Activación por secuencia + registro de herramientas
│   ├── AdminPanel.js        Vista DOM del panel
│   ├── KeySequenceDetector.js
│   └── tools/               Core, World, Life, Inventory, Survival y Craft tools
├── ui/UIManager.js          HUD provisional (reacciona a eventos): reloj, escarcha, avisos
├── ui/CraftingPanel.js      Panel de fabricación (pide fabricar con CRAFT_REQUEST)
├── ui/ModalPanel.js         Base de los paneles que liberan el ratón
├── ui/ShipMapPanel.js       Mapa de la región + mapa planetario (lunas) · PlanetMapRenderer.js
├── ui/ShipChargerPanel.js   Puesto de carga · ShipPilotHUD.js mandos · ShipWatchHUD.js reloj
├── ui/SpaceHUD.js           Fundidos, etiquetas y panel del espacio
systems/                     Sistemas solares en JSON (jardin-del-eden.system.json = la campaña)
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
- **Supervivencia por eventos.** Cada estadística es un sistema independiente. Todo el daño
  (animales, hambre, sed, caídas y, en la Fase 10, frío) llega a HealthSystem por el evento
  `PLAYER_DAMAGED`; la UI solo escucha `PLAYER_STAT_CHANGED` / `PLAYER_STAT_LEVEL`.
- **Objetos por datos.** Cada objeto declara en `GameConfig.ITEMS` qué hace al usarlo (`USE`);
  recetas en `RECIPES`; piezas de construcción (nombre, icono, coste) en `BUILD.PIECES`.
- **Construcción modular.** Rejilla de 2 m: suelos/escaleras/tejados en casillas, paredes/puertas/
  ventanas/vallas en bordes, pilares en esquinas, muebles libres. Se ancla a lo que se apunta
  (varios pisos). Se camina sobre suelos y escaleras; paredes, vallas y puertas cerradas bloquean
  al jugador y a los animales; `getShelterAt()` dirá a la temperatura (Fase 10) si estás a cubierto.
  Nueva pieza = forma en `BuildRules` + modelo en `BuildModels` + entrada en `BUILD.PIECES`.
- **Nutrición separada del hambre.** El hambre es cuánto has comido; NutritionSystem, qué.
  Con dieta desequilibrada el hambre baja más rápido y la vida no se regenera.
- **Interacción desacoplada.** InteractionSystem solo decide el objetivo y delega en
  ResourceSystem.harvest(), AnimalSystem.hitAnimal() e InventorySystem.
- **Mundo finito.** 1024 × 1024 m en chunks de 64 m. Los datos de altura se generan bajo demanda
  y se guardan; solo existen mallas en un radio de 4 chunks. El borde desciende a un mar y el
  jugador no puede salir del área jugable.
- **La lógica del jugador no depende de la cámara.** El jugador expone ojos + yaw/pitch;
  la cámara decide dónde colocarse. Ocultar el cuerpo en 1ª persona se hace por evento.
- **Temperatura oculta (Fase 10).** Ambiente = bioma − altura − noche + refugio; la temperatura
  del jugador se acerca a ella poco a poco (la armadura multiplica la pérdida por 0,7). Estados
  Normal → Frío → Congelación → Crítico; solo emite eventos: la escarcha y la bruma las dibuja la
  UI y la distancia de visión la reduce AtmosphereSystem, siempre de forma gradual.
- **Día y noche (Fase 11).** TimeSystem solo calcula (hora, sol, luz, frío nocturno) y
  AtmosphereSystem lo aplica. Dormir adelanta el reloj.
- **Cielo (Fase 12).** Las lunas salen y se ponen con la rotación del planeta y avanzan en su
  órbita (cada día salen más tarde; la Luna B solo cada 5 días). Sus fases salen solas: cada
  esfera se ilumina con la dirección real del sol. De noche la luz viene de la luna visible.
- **Espacio (Fase 13).** Escena aparte con el mismo renderer (`RenderContext.setActive`): la
  superficie queda congelada y se recupera igual al volver. Misma seed, mismas lunas y misma
  hora que en el cielo; la isla del mapa mira al sol a mediodía.
- **Nave.** Forma, vuelo y baterías son lógica pura probada en Node; las colisiones se resuelven
  en coordenadas locales de la nave (sirven con cualquier orientación y a cualquier altura).
  Construcciones y nave comparten la misma interfaz (`surfaceAt`, `blocksAt`, `ceilingAt`,
  `resolveCollisions`, `getShelterAt`), así el jugador, la cámara, los animales y la temperatura
  las tratan igual. Nueva tecnología = entrada en `SHIP.TECHNOLOGIES` + ranura en `SHIP.INSTALLED`.
- **Admin extensible.** Cada fase registra sus herramientas con `admin.registerTool()`.
- **Configuración centralizada.** Cada sistema recibe solo su sección de `GameConfig`.

Depuración desde la consola del navegador: `window.__MUNDO0__` expone los sistemas.

## Cómo probar las últimas fases

- **Importar sistemas (1d)**: en la pantalla de inicio pulsa *📥 Importar sistema solar* (o Admin →
  Mundo → *Importar sistema solar…*, o el botón del panel de hiperespacio). *Copiar guía del formato*
  copia las instrucciones para pedirle a Claude un sistema. Pega su JSON (o arrastra el `.json`) y
  pulsa *Comprobar*: verás los planetas, lunas, tamaños y tipos de terreno, los avisos y las ideas
  que el motor aún no permite. Si hay errores, *Copiar error para Claude* deja un texto listo para
  pegárselo. *Guardar* lo deja en este navegador; *Jugar* abre `?system=import:<id>`. Los guardados
  aparecen también en la navegación hiperespacial (saltar a ellos gasta 1 batería y te llevas la partida).
- **Kappa**: abre `?system=kappa` (o salta desde el Edén). `2` Thalassa: casi todo agua con pocas islas.
  `3` Pontos: solo mar; la nave amerriza y flota; sal por la rampa y nada (`Espacio` junto a la rampa
  para volver a subir). Cada 24 h de juego (a las 15:00) cruza una ola gigante de 20 m: la IA avisa una
  hora antes; quien nada sube con ella y es arrastrado; dentro de la nave estás a salvo (sube y baja
  con el agua). Admin → Mundo → *Provocar la ola gigante ahora*. `4` Ferrum: dunas rojas, sin aire, 1,6 g.
- **Hiperespacio**: termina el tutorial (nodo galáctico → salto fallido → cápsula) o usa Admin →
  Espacio → *Completar el tutorial (nodo de velocidad-luz)*. Sal al espacio y aléjate de la
  estrella (o Admin → *Llevar la nave al borde del sistema* y avanza con `W`): la IA pregunta
  a qué sistema ir. Elige *Sistema Kappa*: se gasta 1 batería, se ve el túnel del hiperespacio
  y apareces en el espacio de Kappa con tu nave y tu mochila. Desde Kappa puedes volver al
  mismo Edén (se conserva su semilla).
- **Varios planetas (1b)**: abre `?system=kappa`. Instala el nodo espacial (Admin → Espacio),
  sal al espacio y pulsa `2` (Thalassa): mantén `W` + `Shift` y, lejos de los planetas, el HUD
  marca 🚀 *Crucero interplanetario* (hasta 90 000 km/s); frena solo al llegar. Thalassa mide 5 km,
  tiene mar, cabras y ciervos y dos lunas en su cielo. `3` lleva a Ferrum: 20 km, rojo, sin aire,
  1,6 g (ponte el traje). Si un planeta queda en medio, el rumbo automático lo rodea. El límite
  del sistema se mide desde la estrella.
- **Sistemas como datos (1a)**: el juego carga `systems/jardin-del-eden.system.json`, lo valida
  y lo compila. Recarga dos veces: la semilla (arriba a la izquierda) cambia cada partida. Con
  `?seed=12345` el planeta y las lunas son siempre los mismos. Cambia en el JSON, por ejemplo,
  `"name"` de una luna o `"gravity"` y recarga: el juego usa los datos nuevos. Si rompes el JSON,
  la pantalla de error dice qué línea falla. `npm test` comprueba que el JSON reproduce
  exactamente el planeta y las lunas de antes y prueba archivos maliciosos.
- **Nave**: aparece aterrizada a 20–45 m del inicio (el mapa la marca). Botón rojo bajo la cola
  → `E` abre la compuerta; sube por la rampa. Dentro: mapa, puesto de carga, ranuras libres,
  reloj en la mesa del laboratorio; la puerta lleva a la sala de controles.
- **Vuelo**: `E` en el asiento → `G` cierra la compuerta → `T` despega → `L` recoge patas →
  `W/A/S/D`, `Espacio`/`C`. `L` saca patas y `T` aterriza (necesita un claro sin árboles).
- **Flotar y saltar**: en el aire pulsa `E` para levantarte; la nave queda quieta gastando
  batería. Abre la compuerta con el botón interior y baja por la rampa: al dejar la nave, busca
  un sitio despejado y aterriza sola. ¡La caída hace daño!
- **Frío**: Admin → Tiempo → Medianoche y sube a las Montañas Heladas (o Admin → Temperatura).
  Con la armadura de cuero te enfrías más despacio; dentro de la nave cerrada, no.
- **Lunas**: Admin → Cielo → "Ir a una noche con las dos lunas" y "Mirar a la Luna A/B".
- **Nodo espacial**: al entrar recibes un 📜 *Mapa de la señal* (selecciónalo y clic derecho / `R`).
  El nodo cae en un sitio distinto según la seed (160–320 m del inicio) y un haz de luz azul lo
  señala. `E` para cogerlo; en la nave, `E` sobre una ranura libre lo instala. La nave crece: alas,
  cuatro propulsores y cinco salas (mandos · estar con sofá cama · laboratorio + máquinas ·
  cápsulas de escape · cámara de descompresión con la compuerta). Atajos: Admin → Espacio.
- **Espacio**: con el nodo, vuela por encima de 60 m y pulsa `O`. `1`/`2`/`3` fijan el rumbo;
  al acercarte, `T` aterriza en esa luna (o entra en el Jardín del Edén). Puedes levantarte y recorrer la nave.
- **Descompresión**: fuera del aire (espacio, lunas), cierra la puerta interior, usa el panel de la
  cámara para vaciarla y solo entonces abre la compuerta. Si la abres con la cámara presurizada
  estando dentro, sales disparado (en el espacio, mueres).

- **IA de la nave**: `E` sobre el nodo de IA (ojo rosa en la sala de controles). Ponle nombre
  (se recuerda en el navegador) y pregúntale por el Jardín del Edén, las lunas, el sistema, la nave, el
  soporte vital, dónde estás o qué hacer. Además avisa sola: batería al 50/25/10 %, llegada a
  una luna, salida al espacio, descompresión, límite del sistema, falta de aire.
- **Traje y oxígeno**: en el laboratorio de la nave ampliada, `E` en la taquilla pone o quita el
  traje (con jetpack) y `E` en la estación de oxígeno llena su depósito. Sin aire aguantas la
  respiración 15 s (fila 🫁 Aire) y luego te asfixias. El traje gasta oxígeno fuera y batería
  siempre (sin batería no da aire ni calor).
- **Lunas**: al llegar a la primera luna aparece un 📦 cofre (haz amarillo) con la burbuja de
  oxígeno y 3 baterías. Construir (`B`): en las lunas la madera se paga con piedra y la lana con
  mineral (pica las rocas con cristales); en vez de valla y cama hay estación de carga (carga una
  batería vacía en 60 s) y estación de oxígeno. Atajos: Admin → Soporte vital.

- **Meteoritos**: se detectan pronto, a 250–700 km por delante del rumbo (el primero a los 2 s de salir al espacio); la IA avisa, el panel muestra la distancia y una flecha ámbar en el borde de la pantalla indica dónde están si no se ven. A los
  mandos pulsa `4`: la nave apunta, frena y se detiene a ~120 m (no se puede aterrizar en ellos).
  Levántate, ponte el traje, cierra la puerta interior, vacía la cámara con su panel y abre la
  compuerta. Baja de la rampa: estás en ingravidez. El jetpack empuja hacia donde miras; cerca
  del meteorito su gravedad te atrae y caminas alrededor de él. `E` en los cristales azules da
  mineral. Para volver, acércate al pie de la rampa (te agarras solo). Atajos: Admin → Espacio →
  "Meteorito junto a la nave" / "Salir al exterior con traje (EVA)".

- **Nodo galáctico y final**: la IA avisa de una señal galáctica al llegar a la luna que la
  tiene (según la seed, haz violeta). Instálalo en una ranura libre y vuela más allá de 65 000 km
  del Jardín del Edén (Shift = impulso). El salto falla: alarma roja, la nave no responde. Ve a la sala de
  cápsulas, `E` en una cápsula → Evacuar al Jardín del Edén → pantalla de fin de la demo. Al seguir,
  estás en el Jardín del Edén junto a la nave (con el nodo espacial) y el planeta como estaba.
  Atajos: Admin → Espacio → "Instalar el nodo galáctico" y "Llevar la nave al borde del sistema".
- **Cápsulas (uso normal)**: desde la nave, al Jardín del Edén o a una luna a menos de 45 000 km
  (las lunas orbitan: a veces están cerca y a veces no). La IA trae la nave detrás. Hay 2.

Limitaciones: las baterías no se
recargan todavía (Admin → Nave → Recargar); la nave no choca con árboles en vuelo; la
temperatura no se muestra como número (es oculta; el Admin sí la muestra).

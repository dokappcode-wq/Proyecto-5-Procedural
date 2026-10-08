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
| SV | Supervivencia: fabricar lleva tiempo (cola, se puede cancelar); piedra y madera refinadas; mesa de refinería (cuero refinado, ropa de cuero y odre); telarañas entre árboles (5–10 telarañas, 5 = 1 cuerda); árboles de 3 de madera; romper lo construido a golpes; energía que se gasta al esforzarse (correr, escalar, golpear) y se recupera descansando; escalar pendientes de más de 40°; el agua solo se lleva en el odre; HUD limpio |
| RJ | Reloj de pulsera: `Tab` (fabricación) e `I` (inventario) abren un menú tecnológico con pestañas, buscador, categorías, rejilla de recetas, detalle con ingredientes y la columna «Tú» (ropa, día y hora, vida, hambre, sed, energía, protección del frío); la cámara se acerca a la muñeca y el reloj da la hora. Árboles más grandes que se talan a golpes (un trozo de madera por golpe, astillas y el árbol cae). Se empieza desnudo, con tres hojas |
| INV | Inventario por huecos (tecla `I`): barra rápida 9×1 + mochila 9×3, pilas de hasta 100, ropa en 5 ranuras (cabeza, pecho, piernas, pies, manos). Conjunto de cuero fabricable (gorro, camiseta, pantalones, zapatillas, guantes) que abriga sumando hasta un 30 %. Lo que no cabe cae al suelo en una bolsa |
| 1d | Importar sistemas solares: panel con archivo, arrastrar o pegar; comprobación segura (solo JSON, 256 KB, nada se ejecuta), vista previa, avisos de claves ignoradas, ideas no soportadas, errores con *Copiar error para Claude* y *Copiar prompt para Claude*; guardados en el navegador (IndexedDB) para jugarlos o borrarlos, y como destinos del hiperespacio |
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
| `N` | Silenciar / activar el sonido |
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
├── audio/
│   ├── AudioSystem.js  Efectos posicionales, ambiente, eco de cueva, motor y láser; volúmenes y N (silenciar)
│   ├── Synth.js        Recetas de sonido con WebAudio (osciladores, ruido filtrado, envolventes)
│   ├── Music.js        Música generativa por estado de ánimo (día, noche, cueva, jefe, espacio)
│   └── AudioMath.js    Partes puras: volúmenes guardados, superficie de los pasos, panorama, ánimo
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

- **Sonido (v1.22)**: todo se genera con WebAudio, sin archivos de audio. Empieza a sonar con el primer clic o tecla;
  `N` silencia o activa (se recuerda en el navegador).
  - **Efectos**: pasos según el suelo (hierba, piedra en cuevas y montañas, nieve, arena, madera de lo construido,
    metal en la nave, agua al nadar), golpes al talar y picar, árbol que cae, roca que se desmorona, puñetazos,
    armas (arco, tirachinas, escudo), comer, beber, recoger, fabricar, construir, romper piezas, puertas y cofres,
    daño, caídas, chapuzón y burbujas. Los sonidos del mundo se oyen a izquierda o derecha y bajan con la distancia.
  - **Criaturas**: gólems (pisadas, gruñidos, se desmoronan), goblins (parloteo, chillidos), slimes (chapoteo,
    revientan), vacas, cabras y ciervos. **Jefe**: despierta entre rocas, ruge, golpe al suelo, rocas, carga y
    zumbido del láser, siseo del cristal al rojo, grietas y estallido final.
  - **Ambiente**: viento (más fuerte en lo alto y en la nieve), mar con olas, ríos y charcas cerca, cascadas en la
    sala del gólem, eco y goteo en las cuevas, pájaros de día, grillos y búhos de noche; bajo el agua todo suena
    apagado. La nave zumba al volar.
  - **Música generativa** (nunca se repite igual): día cálido, noche tranquila, cueva misteriosa, pelea contra el
    jefe con percusión y espacio (también en el menú de inicio). Fuera de la pelea toca a ratos y descansa.
- **Animaciones y estructuras (v1.21)**:
  - **Armas en 3ª persona**: cada arma sale del puño hacia delante (el escudo, en el antebrazo) y cambia la pose
    de reposo. Golpes con poses clave: tajo en diagonal (espada, antorcha), de arriba abajo (hacha, pico), directo
    (puño); además agacharse a coger, beber, soltar la goma o la cuerda y empujar con el escudo. **Nadar**: braza
    boca abajo al moverse y pataleo quieto. En 1ª persona, un golpe distinto por arma.
  - **Enemigos**: transiciones suaves y reacción al golpe; gólem pesado con golpe a dos manos; goblin que corre,
    se agacha y salta al atacar, se rasca y mira alrededor; slime que se aplasta.
  - **Animales**: rodillas, cabeza que baja a pastar y se levanta alerta, cola, paso en diagonal y galope al huir;
    ciervo con cuernas, vaca con manchas y cuernos, cabra lanuda con barba.
  - **Estructuras**: todas las piezas de construcción con más detalle (tablas, vigas, clavos, sillares, tejas,
    herrajes…) sin salirse de su colisión; torre del ermitaño de sillares, centro de investigación con fachada,
    placas solares y antena, y base goblin con puerta, banderolas, choza en el árbol y asador.
- **Mejoras (v1.20)**:
  - **Cuevas**: se recorren sin atascos. El suelo es continuo en las uniones (antes había escalones invisibles de
    hasta 1 m al entrar en las cámaras), las paredes dibujadas coinciden con la colisión, el fondo es pared, las menas
    quedan metidas en la pared, los árboles de arriba no estorban dentro y las bocas de montaña se suben andando.
  - **Gólem gigante, «guardián del altar»** (según la hoja de diseño): la sala es un altar redondo con gradas sobre el
    agua, cataratas en las esquinas, el techo abierto con haces de luz y muros bajos para cubrirse. Despierta de
    rodillas en el altar al abrir el Cofre N. Solo se le daña en el **cristal azul del pecho**. Ataques: **golpe al
    suelo** (onda: sáltala o esquívala), **lanza rocas** (marca roja en el suelo; muévete o cúbrete y la roca da en el
    muro; dejan piedras para el tirachinas) y **láser del cristal** (te persigue: corre o ponte tras un muro). Después
    del láser el cristal queda **al rojo** unos segundos: doble daño. A mitad de vida ruge (**fase 2**): más rápido,
    se mueve por el altar y encadena ataques. Al final el cristal estalla y se desmorona.
  - **Protagonista** nuevo (explorador con flequillo, chaqueta, bufanda roja y mochila al vestirse; codos y rodillas;
    andar, correr, saltar, aterrizar, respirar y parpadear). **Mano en 1ª persona** con manga, dedos y reloj, impulso
    y tajo con herramientas, directo con el puño, inercia al girar y la otra mano tensando el tirachinas o el arco.
  - **Herramientas** (hacha, pico, espada, tirachinas de rama, arco recurvado, antorcha, escudo) más detalladas.
  - **Nave**: morro afilado, aristas biseladas, ventanas sueltas, alerones con luces, deriva, toberas y patas nuevas.
  - **Personajes**: gólems de roca con musgo y un cristal en el pecho, goblins con orejas en punta, nariz, colmillos,
    codos, rodillas y porra con clavos; slimes con burbujas; el ermitaño con capa, barba larga y bastón retorcido.
- **Historia, segunda parte (v1.19)**:
  - Tras las 24 h de escaneo, Nova encuentra la nave (te da el mapa 📜 y la marca en la brújula; se enciende su faro).
    La nave está averiada: humo en los propulsores, no despega y no tiene baterías.
  - Al llegar, Nova entra y se conecta a su panel (la IA de la nave pasa a ser ella): diagnóstico, receta de la
    **mesa de elaboración** (antes no se conoce) y el **centro de investigación** marcado.
  - Centro de investigación: la puerta pide contraseña y Nova la introduce por el reloj. Dentro: laboratorio,
    dormitorio, taller con una mesa de elaboración ya montada, notas y el búnker con la trampilla abierta.
  - Mazmorra: cuesta abajo, dos cámaras con construcciones abandonadas y 6 gólems; al fondo, la sala de las cascadas
    con el **Cofre N** (4 pilas mini-plack) y un tirachinas en el suelo (por si no llevas arco).
  - Al abrir el cofre caen rocas que tapan la salida y se levanta el **gólem gigante** (300 de vida; desde la v1.20,
    con los ataques de la hoja de diseño: ver arriba). Derrotado, se abre la salida y da **2 propulsores**. Si mueres,
    la pelea vuelve a empezar al entrar en la sala.
  - Reparar la nave (E en la parte de atrás): 2 propulsores, placa de navegación (mesa de elaboración), 4 baterías y
    el nodo espacial. Después, despega (T), sube y sal al espacio (O): **fin de la demo** (se puede seguir jugando).
  - Admin → Historia: ir a cada lugar y acabar el escáner de Nova.
- **Historia, primera parte (v1.18)** (partida nueva en el Edén):
  - La cápsula se estrella, la compuerta sale despedida y el personaje salta fuera.
  - Al coger el reloj: nombre (el de la futura IA) y color (9 colores; tiñe la interfaz y se cambia en el reloj,
    columna «Tú» → ⌚ Nombre y color del reloj). Luego una transmisión que se corta y la elección tutorial / juego libre.
  - Tutorial: pasos con flecha (madera, piedras, fabricar, telaraña, manzanas, guardar, ir a la torre). `K` lo salta.
  - Torre del ermitaño (luz cálida a lo lejos): escalera de caracol por fuera; arriba, a oscuras, el ermitaño da la
    clave A1. Al cogerla se une al reloj y aparece la brújula (`J` la oculta).
  - Nodo espacial (pedestal con una caja y dos anillas): sin A1 está sellado. Al cogerlo despiertan 4 gólems y suben
    los muros hasta derrotarlos; después cae otra cápsula del cielo.
  - En la cápsula está Nova (con el nombre del reloj): se presenta, te escanea y lanza un escáner de 24 h para
    encontrar la nave; mientras, te sigue y cambia de cara (normal, feliz, preocupada, enfadada, triste).
  - Antes de cada evento se guarda la partida sola.
- **Enemigos (v1.17)**. Nada aparece a menos de 256 m (4 chunks) del inicio. Todos avisan antes de golpear (levantan los
  brazos o el mazo): un paso atrás, esquivar (toque de `Shift`) o el escudo los paran.
  - **Gólems** (30 de vida, 25 de daño, lentos): montones de piedras en el suelo y en las cámaras de las cuevas; al acercarte
    las piedras se juntan y te atacan. Sueltan piedra y a veces mineral sin refinar. Si te alejas, vuelven y se duermen.
  - **Slimes** (10 de vida, 10 de daño): salen de noche cerca de ti y se deshacen al amanecer. Sueltan slime.
  - **Goblins** (20 de vida, 20 de daño, corren como tú andando): en **bases** alrededor de un árbol grande (empalizada,
    chozas, hoguera, tótem; 3–5 goblins) y en **equipos de exploración** que recorren el planeta con un **jefe goblin**
    negro (40 de vida, 30 de daño). Sueltan cuero, madera y 1/3 de las veces una moneda; el jefe, además, hierro refinado.
    Al limpiar una base aparece su botín junto al árbol.
  - Admin → Enemigos: crear uno delante e ir a la base, el equipo o el gólem más cercano.
- **Cuevas (v1.16)**: 12 subterráneas (un agujero en el suelo de llanuras y bosques, rodeado de rocas, con una rampa que
  baja) y 8 de montaña (en las laderas, entran hacia dentro de la montaña). Ninguna a menos de 180 m del inicio. Son
  túneles de 85–245 m que bajan 25–40 m, con cámaras anchas cada cierto tramo; se recorren andando (sin escalones).
  Dentro, cuanto más hondo más oscuro: solo alumbran las **antorchas** (en la mano o clavadas) y las **flores luminosas**.
  Para ir directo: Admin → Jugador → «Ir a la cueva subterránea / de montaña más cercana».
- **Menas** (con el ⛏️ pico seleccionado, clic mantenido): **carbón** en la entrada (3), **cobre** por todo el túnel (3),
  **hierro** más adentro y más escaso (2), **diamante** muy raro al fondo (1). **Flor luminosa**: se coge con `E`.
  El horno funde el mineral con carbón (cobre/hierro/diamante refinados) y la arena en cristal.
- **Construcción por objetos**: cada pieza (suelo, pared, puerta, cofre, horno…) se fabrica en el reloj (`Tab`,
  categoría Construcción o Estaciones). Seleccionada en la barra se coloca con clic (`Q` gira); en la mochila, clic sobre
  ella → **🔨 Colocar**. Al romperla vuelve al inventario. `B` sigue abriendo el modo construcción con las piezas que lleves.
- **Cofre** (6 maderas refinadas): `E` lo abre junto a tu inventario; Shift+clic mueve entre los dos. Si se rompe,
  lo que tenía cae en una bolsa. Se guarda con la partida.
- **Horno** (10 piedras refinadas + 2 maderas refinadas): con carbón funde cobre, hierro, diamante y arena (→ cristal).
  **Mesa de elaboración** (5 hierro refinado + 5 cobre refinado): placa de navegación, espadas de cobre/hierro,
  escudos, flechas de cobre/hierro y armaduras de cobre y de malla.
- **Arena**: montones en la playa (`E`).
- **Armas**: espada básica (10), de cobre (12) y de hierro (15). **Tirachinas** (dispara piedras, 5 de daño) y **arco**
  (daño de la flecha: 10 normal, 15 cobre, 20 hierro; `X` cambia de flecha). Clic derecho mantenido apunta (zoom en
  1ª persona, cámara al hombro en 3ª), clic izquierdo mantenido tensa y al soltar dispara.
- **Escudos** (ranura «Escudo» del reloj): con el escudo puesto, clic derecho mantenido bloquea los golpes de frente
  (gasta aguante: cobre 50, hierro 100). Bloqueando no se ataca.
- **Antorcha** (1 madera + 1 carbón): en la mano ilumina; `R` / clic derecho y luego clic la clava en el suelo (también
  dentro de las cuevas) y sigue iluminando; después vuelves a llevar la siguiente en la mano.
- **Guardar partida**: en el reloj (`Tab` o `I`), columna «Tú», botón **💾 Guardar partida**. También se guarda sola
  cada 5 minutos (solo en tierra, en el planeta de inicio). En el menú de inicio aparece **▶ Continuar partida**.
  Se guarda: inventario, ropa, vida/hambre/sed/estamina, niveles, la hora, dónde estás, la nave, lo talado y recogido,
  lo construido y las bolsas del suelo.
- **Mano en 1ª persona** (`V`): se ve la mano y lo que llevas (hacha, pico…), que se balancea al andar y golpea.
  En 3ª persona la herramienta va en la mano del personaje.
- **Agacharse** con `C` (otra vez para levantarse): más bajo y más lento. **Esquivar**: un toque rápido de `Shift`
  te lanza hacia donde pulsas (atrás si no pulsas nada); gasta 10 de estamina y durante el salto no te alcanzan los ataques.
- **Puño**: 2 de daño. Vida de los animales: ciervo 10, cabra 14, vaca 16.
- **Defensa**: cada prenda tiene defensa (cuero: gorro 1, camiseta 3, pantalones 2, zapatillas 1, guantes 1). Cada punto
  quita un 1,5 % del daño de los ataques (no de caídas, hambre o frío). Se ve en «Tú» → 🛡️ Defensa.
- **Hacha y pico**: aguantan 400 golpes; con el hacha un árbol cae en 3 s y con el pico una roca se rompe en 3 s.
- **Menú de inicio**: la cápsula de salvamento flota en órbita sobre el planeta. «Entrar al mundo» la hace caer
  (gira el escudo, reentrada con plasma y chispas, fogonazo) y el juego empieza junto a la **cápsula estrellada**
  (volcada, humeando, con la compuerta arrancada). Al llegar por el hiperespacio no hay caída.
- **El reloj de pulsera**: está en la compuerta de la cápsula (brilla, tiene un haz de luz y el letrero «⌚ TU RELOJ · E»).
  Sin él `Tab` no abre la fabricación (la `I` sí abre la mochila). Con `E` se coge: aparece en la muñeca y ya se fabrica.
- **La nave**: en un sitio al azar de lo alto de las **Montañas Heladas** (a 350–1300 m del inicio), sobre una explanada
  nevada. Tras coger el reloj, un haz de luz blanco marca dónde está hasta que llegas a ella. Allí arriba hace mucho frío.
- **Edén de 5 km** (antes 1 km) con tres biomas nuevos: **Playa** (franja de arena en la costa), **Río** (ríos de agua
  dulce: se nada en ellos y se bebe con `E` o se llena el odre) y **Montaña** (montañas bajas sin nieve, con pinos y
  rocas). En el JSON de un sistema son las zonas `beach`, `river` y `mountain`, que se activan con
  `terrain.params.beaches`, `rivers` y `low_mountains` (0 = no existen; así los demás sistemas no cambian).
  Admin → Biomas → «Ir a … más cercano» para visitarlos.
- **Niveles**: recoger (1 XP por unidad), talar un árbol (12), romper una roca (12), recoger una telaraña (4),
  fabricar (según lo que tarda) y cazar (20) dan experiencia. Cada nivel da 1 punto: en el reloj (`Tab`), columna
  «Tú», pulsa **+** en Vida (+10), Estamina (+10), Daño (+8 % de daño y de rapidez al talar/picar) o Velocidad (+3 %).
  Los niveles viajan contigo por el hiperespacio.
- **Ritmo de golpes**: talar, picar y romper van a un ritmo fijo; hacer clic muchas veces no es más rápido que mantenerlo.
- **Fabricar con tiempo**: en `Tab` cada receta dice cuánto tarda (⏱); al fabricar entra en la cola
  «Fabricando» (barra de progreso; clic en ella para cancelar y recuperar los materiales) y sigue aunque cierres el menú.
  Piedra refinada (4 🪨, 5 s), madera refinada (2 🪵, 4 s), cuerda (5 🕸️), hacha y pico (3 maderas refinadas + 2 piedras
  refinadas + 2 cuerdas cada uno, 15 s; aguantan 60 golpes, una barra bajo el icono lo muestra, y al gastarse se rompen) y **mesa de refinería**
  (4 piedras refinadas + 2 maderas refinadas, 15 s). Selecciona la mesa en la barra y clic derecho / `R` para
  colocarla (modo construcción); `E` sobre ella abre su pestaña: cuero refinado (1 cuero, 8 s), ropa de cuero
  y odre (con cuero refinado). En `Tab` esas recetas salen bloqueadas (🛠️).
- **Telarañas**: en los bosques, tendidas entre dos árboles cercanos (a la altura de la cabeza); mantén el clic sobre ellas (1,5 s) y dan 5–10 🕸️.
- **Romper lo construido**: apunta a una pieza y mantén el clic (3 s; con hacha o pico, la mitad): se rompe y devuelve los materiales.
- **Energía**: ya no baja sola. Correr, nadar deprisa, escalar, saltar y golpear la gastan; parado se recupera en
  unos segundos (más despacio con hambre o sed). Agotado no puedes correr, escalar ni golpear hasta recuperar un 25 %.
- **Escalar**: camina contra una pendiente de más de 40° y el personaje trepa (brazos arriba, gasta mucha energía);
  parado se queda agarrado; sin energía resbala hacia abajo. `Espacio` se suelta.
- **Agua**: solo se lleva dentro del odre (3 por odre); sin odre no se puede llevar agua (sí beber en una fuente con `E`).
- **Talar**: apunta al tronco y **mantén el clic** (o `F`): el personaje golpea sin parar (sin letreros en pantalla)
  y la madera va saliendo; con el puño un árbol tarda 15 s. Con el 🪓 hacha de piedra seleccionada
  en la barra cae antes (6 s) y da la misma madera.
- **Rocas**: con `E` coges sus piedras sueltas (vuelven con el tiempo). A puñetazos no se rompen y te haces
  daño; con el ⛏️ pico de piedra seleccionado, manteniendo el clic se rompen (6 s) y dan 5 🪨.
- **Tirar objetos**: `Q` tira una unidad del objeto seleccionado; en el inventario, coge algo con el ratón y
  déjalo en «Tirar al suelo» (o haz clic fuera del menú). Cae en una 🎒 bolsa (E para recogerla). Si el
  inventario está lleno, lo que recoges también se queda en el suelo en una bolsa.
- **Reloj de pulsera**: `Tab` levanta la muñeca (el reloj marca la hora), la cámara se pone delante del personaje y se abre
  FABRICACIÓN: busca, filtra por categoría, clic en una receta para ver ingredientes y *Fabricar* (o doble clic).
  `I` abre la pestaña INVENTARIO del mismo menú; la otra tecla cambia de pestaña y `Esc` cierra.
- **Desnudo**: al empezar no llevas ropa, solo tres hojas (pecho y entrepierna). Al ponerte camiseta o
  pantalones de cuero, las hojas de esa zona desaparecen (mírate con `V`).
- **Inventario (I)**: pulsa `I`. Arriba la mochila (9×3) y debajo la barra rápida (9×1, teclas 1–9);
  a la izquierda las 5 ranuras de ropa. Clic: coger/dejar/juntar/cambiar · clic derecho: coger la
  mitad o dejar una · Shift+clic: mover entre barra y mochila (o ponerse/quitarse la ropa). Cada
  hueco guarda hasta 100 unidades (la ropa, 1). Fabrica la ropa con cuero (`Tab`): gorro 1, camiseta 3,
  pantalones 2, zapatillas 2, guantes 1; también se pone con clic derecho/`R` desde la barra. Si el
  inventario se llena, lo que sobra cae en una 🎒 bolsa delante de ti (E para cogerla).
- **Importar sistemas (1d)**: en la pantalla de inicio pulsa *📥 Importar sistema solar* (o Admin →
  Mundo → *Importar sistema solar…*, o el botón del panel de hiperespacio). El prompt también está en
  `systems/PROMPT_PARA_CLAUDE.txt` (se regenera con `npm run prompt`). *Copiar prompt para Claude*
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

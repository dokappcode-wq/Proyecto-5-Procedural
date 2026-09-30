# MUNDO 0 — Prototipo procedural de supervivencia y exploración

Prototipo conceptual 3D en navegador: HTML + CSS + JavaScript (ES modules) + Three.js/WebGL.
Sin motores externos y sin paso de compilación.

**Estado actual: v1.0.0 — las 14 fases completas.**

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
| 13 | Espacio: salir del planeta con la nave, ver MUNDO 0 y las lunas desde fuera, regresar |
| 14 | Modo Admin plegable con buscador, interfaz revisada y limpieza general |
| + | Nave pequeña: compuerta, laboratorio, sala de controles, vuelo, mapa, puesto de carga, reloj |
| E1 | Varios cuerpos: MUNDO 0, Luna A (clara) y Luna B (rojiza), procedurales, con estado propio |
| E2 | Espacio explorable: se pilota la nave (cámara detrás) entre MUNDO 0 y las lunas |
| E3 | Nodo espacial caído en MUNDO 0 (con mapa); al instalarlo la nave se amplía |

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
| En el espacio: `1` `2` `3` · `T` · `M` | Rumbo automático a MUNDO 0 / Luna A / Luna B · aterrizar al llegar · mapa estelar 3D |
| Mapa de la señal + clic derecho / `R` | Abrir el mapa con la posición del nodo espacial |
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
├── inventory/
│   ├── InventorySystem.js   AddItem/RemoveItem/HasItem/GetItemCount (sin Three.js)
│   ├── HotbarSystem.js      Objeto seleccionado (teclas 1–9)
│   ├── ItemUseSystem.js     "Usar": delega en nutrición, odre, equipamiento o construcción
│   └── EquipmentSystem.js   Armadura (ranura BODY) → multiplicador de pérdida de frío
├── time/
│   ├── TimeSystem.js        Reloj, día, dirección del sol, luz de día, frío nocturno (sin Three.js)
│   └── AtmosphereSystem.js  Aplica la hora: sol/luna, luz ambiente, cielo, estrellas, niebla
├── celestial/
│   ├── CelestialCatalog.js  Lunas A y B por seed + configuración, órbitas, fases (sin Three.js)
│   └── CelestialSystem.js   Lunas en el cielo (cráteres, fases por la luz del sol), luz de luna
├── space/
│   ├── SpaceSystem.js       Transición superficie ↔ espacio, cámara orbital, enfoque
│   ├── SpaceScene.js        Escena espacial: planeta, nubes, atmósfera, lunas, sol, estrellas
│   └── PlanetTexture.js     Textura del planeta: mapa real de MUNDO 0 + resto inventado por seed
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
├── ui/ShipMapPanel.js       Mapa de MUNDO 0 + mapa planetario (lunas) · PlanetMapRenderer.js
├── ui/ShipChargerPanel.js   Puesto de carga · ShipPilotHUD.js mandos · ShipWatchHUD.js reloj
├── ui/SpaceHUD.js           Fundidos, etiquetas y panel del espacio
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
  al acercarte, `T` aterriza en esa luna (o entra en MUNDO 0). Puedes levantarte y recorrer la nave.
- **Descompresión**: fuera del aire (espacio, lunas), cierra la puerta interior, usa el panel de la
  cámara para vaciarla y solo entonces abre la compuerta. Si la abres con la cámara presurizada
  estando dentro, sales disparado (en el espacio, mueres).

Limitaciones: todavía no hay traje ni oxígeno (la taquilla y la estación de oxígeno del
laboratorio aún no funcionan), ni meteoritos, nodo galáctico o cápsulas de escape operativas
(etapas siguientes); las baterías no se
recargan todavía (Admin → Nave → Recargar); la nave no choca con árboles en vuelo; la
temperatura no se muestra como número (es oculta; el Admin sí la muestra).

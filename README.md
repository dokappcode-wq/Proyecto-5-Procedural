# MUNDO 0 — Prototipo procedural de supervivencia y exploración

Prototipo conceptual 3D en navegador: HTML + CSS + JavaScript (ES modules) + Three.js/WebGL.
Sin motores externos y sin paso de compilación.

**Estado actual: FASE 1** — escena 3D, jugador, movimiento, salto, carrera, cámara en 1ª/3ª persona
y modo Admin preparado. El mundo es todavía provisional (suelo plano con bloques de prueba);
la generación procedural llega en la Fase 2.

## Cómo ejecutarlo

Los módulos ES no se cargan desde `file://`, así que hace falta un servidor estático local:

```bash
npm start                        # usa npx http-server en http://localhost:8080
# o bien
python3 -m http.server 8080
```

Abre `http://localhost:8080` y pulsa **Entrar en MUNDO 0**.

## Controles

| Tecla | Acción |
|---|---|
| `W A S D` / flechas | Moverse |
| `Shift` | Correr |
| `Espacio` | Saltar (en vuelo: subir) |
| `C` | Bajar (solo en vuelo) |
| Ratón | Mirar (clic en el juego para capturarlo, `Esc` para liberarlo) |
| `V` | Alternar 1ª / 3ª persona |
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
│   └── RenderContext.js Renderer, escena, cámara, resize
├── world/
│   ├── PlaceholderWorld.js  Mundo provisional (Fase 1) — interfaz de terreno
│   └── SceneLighting.js     Luz ambiente + sol con sombras que siguen al jugador
├── player/
│   ├── Player.js            Estado del jugador (posición, mirada, flags)
│   ├── PlayerController.js  Entrada → física (gravedad, salto, escalones, colisión)
│   └── PlayerModel.js       Personaje de bloques animado
├── camera/CameraSystem.js   1ª/3ª persona con transición suave
├── admin/
│   ├── AdminSystem.js       Activación por secuencia + registro de herramientas
│   ├── AdminPanel.js        Vista DOM del panel
│   ├── KeySequenceDetector.js
│   └── tools/CoreDebugTools.js  Herramientas de la Fase 1
└── ui/UIManager.js          HUD provisional (reacciona a eventos)
```

Principios:

- **Sin GameManager gigante.** `main.js` solo compone; cada sistema tiene una responsabilidad.
- **Interfaz de terreno.** Jugador y cámara solo usan `getHeightAt(x, z)`, `getBounds()`,
  `getSpawnPoint()` y `describeAt(x, z)`. El generador procedural de la Fase 2 implementará
  la misma interfaz y sustituirá a `PlaceholderWorld` sin tocar jugador ni cámara.
- **La lógica del jugador no depende de la cámara.** El jugador expone ojos + yaw/pitch;
  la cámara decide dónde colocarse. Ocultar el cuerpo en 1ª persona se hace por evento.
- **Admin extensible.** Cada fase registra sus herramientas con `admin.registerTool()`.
- **Configuración centralizada.** Cada sistema recibe solo su sección de `GameConfig`.

Depuración desde la consola del navegador: `window.__MUNDO0__` expone los sistemas.

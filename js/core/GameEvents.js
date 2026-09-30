/**
 * Catálogo de eventos. Tenerlos en un único sitio evita errores tipográficos
 * y documenta qué se comunica entre sistemas.
 */
export const GameEvents = Object.freeze({
  // Flujo de juego
  GAME_STARTED: 'game:started',
  POINTER_LOCK_CHANGED: 'input:pointerLockChanged', // { locked }

  // Cámara
  CAMERA_MODE_CHANGED: 'camera:modeChanged',        // { mode }
  CAMERA_BODY_VISIBILITY: 'camera:bodyVisibility',  // { visible }

  // Jugador
  PLAYER_JUMPED: 'player:jumped',
  PLAYER_LANDED: 'player:landed',                   // { fallSpeed }
  PLAYER_FLY_CHANGED: 'player:flyChanged',          // { flying }

  // Admin
  ADMIN_MODE_CHANGED: 'admin:modeChanged',          // { active }
  ADMIN_PANEL_TOGGLED: 'admin:panelToggled',        // { open }

  // UI
  UI_MESSAGE: 'ui:message',                         // { text, type? }
});

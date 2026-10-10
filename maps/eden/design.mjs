/**
 * El Jardín del Edén — diseño del mapa (lo lee la herramienta tools/map/bake.mjs, que
 * esculpe el relieve, lo erosiona y guarda el resultado en maps/eden/; el juego carga
 * eso, no este archivo).
 *
 * Coordenadas en metros: x hacia el este, z hacia el SUR (el norte es −z). La región
 * mide 4096 m de lado (de −2048 a 2048). Alturas sobre el nivel del mar (0).
 *
 * Una isla de unos 3,3 km: al norte la Cordillera Helada (Pico Albo, 175 m) cae al mar
 * en acantilados y esconde el Lago Helado; de ella baja el Río Plateado por la Garganta
 * del Velo (con su gran cascada) hasta el Lago Espejo, en el centro, y sigue serpenteando
 * hasta el delta de la Playa Larga. Al oeste, el Bosque Antiguo y el Pinar de las Brumas;
 * al este, la Sierra Gris y la Meseta del Observatorio; al sur, las Colinas Doradas, la
 * Laguna Turquesa y las Marismas.
 */

export const EDEN = {
  id: 'eden',
  name: 'El Jardín del Edén',
  half: 2048,
  cell: 2,
  seed: 4401,
  snowLine: 84,

  // ---- Costa -------------------------------------------------------------------------
  // Contorno de la isla en el sentido de las agujas del reloj, empezando por el norte.
  // type: beach (playa), cliff (acantilado, `top` m), rocky (rocas), marsh (marisma).
  coast: [
    { x: -200, z: -1650, type: 'cliff', top: 44 },
    { x: 150, z: -1700, type: 'cliff', top: 52 },
    { x: 520, z: -1650, type: 'cliff', top: 46 },
    { x: 640, z: -1565, type: 'rocky' }, // Cala del Norte
    { x: 720, z: -1505, type: 'beach' },
    { x: 800, z: -1560, type: 'rocky' },
    { x: 930, z: -1600, type: 'cliff', top: 40 },
    { x: 1120, z: -1560, type: 'cliff', top: 36 },
    { x: 1300, z: -1520, type: 'rocky' }, // Cabo Escarcha
    { x: 1380, z: -1420, type: 'rocky' },
    { x: 1300, z: -1300, type: 'cliff', top: 30 },
    { x: 1380, z: -1120, type: 'cliff', top: 30 },
    { x: 1520, z: -900, type: 'cliff', top: 32 },
    { x: 1560, z: -640, type: 'cliff', top: 30 },
    { x: 1650, z: -380, type: 'cliff', top: 28 },
    { x: 1610, z: -160, type: 'cliff', top: 26 },
    { x: 1460, z: 20, type: 'rocky' },
    { x: 1300, z: 90, type: 'beach' }, // Bahía del Alba
    { x: 1170, z: 200, type: 'beach' },
    { x: 1150, z: 330, type: 'beach' },
    { x: 1250, z: 450, type: 'rocky' },
    { x: 1430, z: 560, type: 'cliff', top: 22 },
    { x: 1520, z: 760, type: 'rocky' },
    { x: 1480, z: 930, type: 'rocky' }, // Península del Faro
    { x: 1600, z: 1040, type: 'rocky' },
    { x: 1680, z: 1120, type: 'cliff', top: 18 },
    { x: 1620, z: 1190, type: 'rocky' },
    { x: 1480, z: 1150, type: 'beach' },
    { x: 1330, z: 1180, type: 'beach' },
    { x: 1200, z: 1290, type: 'beach' },
    { x: 1010, z: 1410, type: 'beach' }, // delta del Plateado
    { x: 760, z: 1490, type: 'beach' },
    { x: 520, z: 1545, type: 'beach' },
    { x: 320, z: 1605, type: 'rocky' }, // Arco del Mar
    { x: 140, z: 1635, type: 'rocky' },
    { x: -60, z: 1600, type: 'beach' }, // cordón de la Laguna Turquesa
    { x: -300, z: 1625, type: 'beach' },
    { x: -520, z: 1575, type: 'beach' },
    { x: -720, z: 1500, type: 'marsh' }, // Marismas del Sur
    { x: -920, z: 1450, type: 'marsh' },
    { x: -1100, z: 1390, type: 'marsh' },
    { x: -1230, z: 1240, type: 'marsh' },
    { x: -1250, z: 1060, type: 'rocky' },
    { x: -1200, z: 900, type: 'rocky' }, // Bahía del Poniente
    { x: -1260, z: 760, type: 'beach' },
    { x: -1330, z: 640, type: 'beach' },
    { x: -1430, z: 560, type: 'rocky' },
    { x: -1540, z: 450, type: 'cliff', top: 24 },
    { x: -1600, z: 280, type: 'cliff', top: 30 },
    { x: -1615, z: 60, type: 'cliff', top: 32 },
    { x: -1590, z: -200, type: 'cliff', top: 28 },
    { x: -1555, z: -330, type: 'rocky' }, // Cala del Poniente
    { x: -1500, z: -390, type: 'beach' },
    { x: -1560, z: -440, type: 'rocky' },
    { x: -1720, z: -520, type: 'rocky' }, // Cabo Poniente
    { x: -1700, z: -620, type: 'cliff', top: 26 },
    { x: -1520, z: -720, type: 'rocky' },
    { x: -1400, z: -930, type: 'cliff', top: 30 },
    { x: -1250, z: -1130, type: 'cliff', top: 36 },
    // Fiordo Gris: entrante estrecho entre acantilados, con una playita al fondo.
    { x: -1150, z: -1205, type: 'cliff', top: 40 },
    { x: -1010, z: -1110, type: 'cliff', top: 40 },
    { x: -890, z: -1035, type: 'rocky' },
    { x: -845, z: -1075, type: 'beach' },
    { x: -925, z: -1160, type: 'cliff', top: 46 },
    { x: -1065, z: -1265, type: 'cliff', top: 46 },
    { x: -1170, z: -1345, type: 'cliff', top: 42 },
    { x: -985, z: -1465, type: 'cliff', top: 46 },
    { x: -700, z: -1560, type: 'cliff', top: 46 },
    { x: -450, z: -1610, type: 'cliff', top: 46 },
  ],


  // Islotes (polígonos pequeños con su propio perfil).
  islets: [
    {
      id: 'ISLA_FARO', name: 'Isla del Faro', type: 'rocky', top: 16,
      points: [{ x: 1730, z: 1200 }, { x: 1840, z: 1180 }, { x: 1900, z: 1260 }, { x: 1870, z: 1350 }, { x: 1770, z: 1370 }, { x: 1710, z: 1300 }],
    },
    {
      id: 'ISLOTE_GAVIOTAS', name: 'Islote de las Gaviotas', type: 'cliff', top: 14,
      points: [{ x: -1790, z: -260 }, { x: -1730, z: -300 }, { x: -1690, z: -240 }, { x: -1720, z: -180 }, { x: -1780, z: -190 }],
    },
  ],

  // Agujas de roca en el mar (los Centinelas) y la del Arco del Mar.
  stacks: [
    { x: 175, z: 1735, r: 16, h: 26 },
    { x: 245, z: 1770, r: 12, h: 19 },
    { x: 120, z: 1790, r: 9, h: 14 },
    { x: -1700, z: 420, r: 14, h: 22 },
    { x: -1720, z: 470, r: 9, h: 13 },
  ],

  // ---- Relieve ----------------------------------------------------------------------
  // Altura de base tierra adentro (se mezclan por distancia) y ondulación.
  base: [
    { x: -120, z: 420, h: 15 },
    { x: 40, z: 100, h: 16 },
    { x: 40, z: -80, h: 16 },
    { x: -800, z: 0, h: 22 },
    { x: -1150, z: 450, h: 20 },
    { x: -800, z: -700, h: 42 },
    { x: -300, z: -800, h: 52 },
    { x: 300, z: -700, h: 48 },
    { x: 700, z: -350, h: 38 },
    { x: 600, z: 200, h: 26 },
    { x: 1000, z: 600, h: 16 },
    { x: 500, z: 1000, h: 8 },
    { x: -250, z: 1100, h: 6 },
    { x: -800, z: 1150, h: 2 },
    { x: 1150, z: -800, h: 46 },
    { x: -1300, z: -200, h: 30 },
  ],
  undulation: { amplitude: 5, frequency: 1 / 260, hills: 7, hillFrequency: 1 / 110 },

  // Cordilleras: crestas con altura (h) y anchura (w) en cada punto. rough: crestas y
  // barrancos (ruido "ridged"); snow: lleva nieve por encima de snowLine.
  ranges: [
    {
      id: 'CORDILLERA_HELADA', name: 'Cordillera Helada', rough: 0.55, snow: true,
      points: [
        { x: -1000, z: -1180, h: 70, w: 210 },
        { x: -760, z: -1260, h: 118, w: 280 },
        { x: -440, z: -1240, h: 150, w: 320 },
        { x: -130, z: -1240, h: 172, w: 330 },
        { x: 180, z: -1260, h: 156, w: 320 },
        { x: 520, z: -1200, h: 140, w: 300 },
        { x: 820, z: -1100, h: 118, w: 270 },
        { x: 1080, z: -980, h: 86, w: 230 },
      ],
    },
    // Espolón sur del Pico Albo: el Collado de la Nave está en su lomo.
    {
      id: 'ESPOLON_NAVE', name: 'Espolón del Collado', rough: 0.45, snow: true,
      points: [
        { x: 160, z: -1180, h: 140, w: 170 },
        { x: 290, z: -1060, h: 112, w: 150 },
        { x: 360, z: -930, h: 96, w: 140 },
        { x: 420, z: -820, h: 70, w: 130 },
      ],
    },
    {
      id: 'SIERRA_GRIS', name: 'Sierra Gris', rough: 0.6,
      points: [
        { x: 980, z: -860, h: 78, w: 200 },
        { x: 1160, z: -620, h: 92, w: 220 },
        { x: 1230, z: -330, h: 96, w: 230 },
        { x: 1250, z: -40, h: 84, w: 220 },
        { x: 1180, z: 260, h: 64, w: 190 },
        { x: 1080, z: 430, h: 40, w: 150 },
      ],
    },
    // Estribaciones: lomas entre la cordillera y el valle.
    {
      id: 'ESTRIBACIONES', name: 'Estribaciones', rough: 0.6,
      points: [
        { x: -620, z: -900, h: 72, w: 170 },
        { x: -380, z: -860, h: 80, w: 160 },
        { x: 20, z: -760, h: 66, w: 150 },
        { x: 250, z: -720, h: 60, w: 150 },
        { x: 620, z: -820, h: 72, w: 160 },
      ],
    },
  // Lomas del pinar (noroeste): bajas y redondeadas.
    {
      id: 'LOMAS_BRUMAS', name: 'Lomas de las Brumas', rough: 0.3,
      points: [
        { x: -1380, z: -760, h: 58, w: 200 },
        { x: -1120, z: -620, h: 66, w: 220 },
        { x: -860, z: -560, h: 56, w: 200 },
        { x: -620, z: -560, h: 46, w: 170 },
      ],
    },
  ],

  peaks: [
    { id: 'PICO_ALBO', name: 'Pico Albo', x: -130, z: -1270, h: 34, r: 120, rough: 0.5 },
    { id: 'PICO_CUERVO', name: 'Pico del Cuervo', x: 560, z: -1230, h: 22, r: 100, rough: 0.5 },
    { id: 'TORRE_GRIS', name: 'Torreón Gris', x: 1230, z: -360, h: 18, r: 90, rough: 0.6 },
  ],

  // Cerros redondeados (sumados al relieve).
  hills: [
    { id: 'CERRO_ERMITANO', name: 'Cerro del Ermitaño', x: -420, z: 30, h: 15, r: 80 },
    { id: 'CERRO_ANILLO', name: 'Cerro del Anillo', x: 640, z: 140, h: 16, r: 120 },
    { id: 'CERRO_ROCIO', name: 'Cerro del Rocío', x: 230, z: 650, h: 14, r: 90 },
    { x: -1050, z: 250, h: 10, r: 110 },
    { x: 860, z: 820, h: 9, r: 120 },
    { x: -150, z: 1000, h: 7, r: 100 },
    { x: -1350, z: 500, h: 12, r: 130 },
    { x: 420, z: 380, h: 6, r: 90 },
    { x: 1700, z: 1220, h: 0, r: 1 },
  ],

  // Mesetas: cima llana (top) con bordes en cortado (edge m).
  plateaus: [
    {
      id: 'MESETA_OBSERVATORIO', name: 'Meseta del Observatorio', top: 50, edge: 22,
      points: [{ x: 700, z: -620 }, { x: 860, z: -650 }, { x: 1000, z: -580 }, { x: 1040, z: -430 }, { x: 960, z: -330 }, { x: 790, z: -340 }, { x: 690, z: -440 }],
    },
  ],

  // Gargantas: el río se encaja entre paredes casi verticales (w: anchura del fondo).
  gorges: [
    {
      id: 'GARGANTA_VELO', name: 'Garganta del Velo', wall: 0.75,
      points: [{ x: -215, z: -790, w: 26 }, { x: -205, z: -735, w: 34 }, { x: -170, z: -640, w: 30 }, { x: -150, z: -540, w: 28 }, { x: -125, z: -460, w: 26 }],
    },
  ],

  // ---- Agua dulce ------------------------------------------------------------------
  // Ríos: nivel del agua (level) y anchura (w) en cada punto; fall: cascada en ese tramo.
  rivers: [
    {
      id: 'RIO_PLATEADO', name: 'Río Plateado', valley: 0.7,
      points: [
        { x: -240, z: -925, level: 100, w: 4 },
        { x: -228, z: -862, level: 96, w: 5 },
        { x: -216, z: -800, level: 92, w: 6, fall: true }, // Cascada del Velo
        { x: -211, z: -768, level: 63, w: 11 },
        { x: -204, z: -735, level: 62.5, w: 8 },
        { x: -170, z: -640, level: 57, w: 7 },
        { x: -150, z: -540, level: 50, w: 7 },
        { x: -125, z: -462, level: 44, w: 7, fall: true }, // Saltos del Pino
        { x: -112, z: -440, level: 35, w: 8 },
        { x: -88, z: -360, level: 32, w: 8 },
        { x: -60, z: -270, level: 25, w: 8 },
        { x: -32, z: -205, level: 18, w: 8 },
        { x: -12, z: -168, level: 14.2, w: 9 },
      ],
    },
    {
      id: 'RIO_PLATEADO_BAJO', name: 'Río Plateado',
      points: [
        { x: 190, z: 32, level: 13.9, w: 9 },
        { x: 262, z: 128, level: 12.8, w: 10 },
        { x: 330, z: 232, level: 11.8, w: 10 },
        { x: 296, z: 330, level: 11, w: 10 },
        { x: 358, z: 425, level: 10.2, w: 11 },
        { x: 470, z: 498, level: 9.3, w: 11 },
        { x: 522, z: 622, level: 8.3, w: 11 },
        { x: 470, z: 742, level: 7.3, w: 12 },
        { x: 560, z: 845, level: 6.2, w: 12 },
        { x: 690, z: 902, level: 5.1, w: 13 },
        { x: 782, z: 1012, level: 3.9, w: 14 },
        { x: 862, z: 1132, level: 2.6, w: 15 },
        { x: 930, z: 1262, level: 1.3, w: 17 },
        { x: 988, z: 1362, level: 0.35, w: 22 },
        { x: 1015, z: 1440, level: 0.05, w: 28 },
      ],
    },
    {
      id: 'ARROYO_BOSQUE', name: 'Arroyo del Bosque', valley: 0.22,
      points: [
        { x: -905, z: -262, level: 38, w: 2.5 },
        { x: -765, z: -238, level: 33, w: 3 },
        { x: -622, z: -182, level: 27.5, w: 3.5 },
        { x: -482, z: -148, level: 22, w: 4 },
        { x: -332, z: -108, level: 17.5, w: 4.5 },
        { x: -205, z: -92, level: 14.6, w: 5 },
        { x: -118, z: -98, level: 14.2, w: 5 },
      ],
    },
    {
      id: 'ARROYO_ALBA', name: 'Arroyo del Alba', valley: 0.5,
      points: [
        { x: 1290, z: -175, level: 54, w: 2.5 },
        { x: 1375, z: -212, level: 46, w: 3 },
        { x: 1462, z: -226, level: 36, w: 3.5 },
        { x: 1540, z: -228, level: 28.5, w: 4, fall: true }, // Salto del Alba: cae al mar
        { x: 1640, z: -232, level: 0, w: 4 },
      ],
    },
    // Canales de la marisma.
    {
      id: 'CANAL_MARISMA', name: 'Canales de la Marisma',
      points: [
        { x: -560, z: 1120, level: 1.1, w: 3 }, { x: -660, z: 1210, level: 0.9, w: 4 }, { x: -760, z: 1250, level: 0.7, w: 5 },
        { x: -860, z: 1330, level: 0.4, w: 6 }, { x: -930, z: 1420, level: 0.05, w: 8 },
      ],
    },
  ],

  // Lagos: contorno (en el sentido de las agujas) y nivel del agua. ice: helado (se camina).
  lakes: [
    {
      id: 'LAGO_ESPEJO', name: 'Lago Espejo', level: 14, depth: 4,
      points: [
        { x: -80, z: -152 }, { x: 18, z: -178 }, { x: 118, z: -150 }, { x: 188, z: -92 }, { x: 212, z: -10 },
        { x: 175, z: 42 }, { x: 70, z: 55 }, { x: -25, z: 22 }, { x: -98, z: -36 }, { x: -122, z: -100 },
      ],
    },
    {
      id: 'LAGO_HELADO', name: 'Lago Helado', level: 103, depth: 2, ice: true,
      points: [
        { x: -330, z: -1060 }, { x: -250, z: -1085 }, { x: -170, z: -1050 }, { x: -160, z: -985 },
        { x: -215, z: -942 }, { x: -300, z: -950 }, { x: -345, z: -1000 },
      ],
    },
    {
      id: 'CHARCA_ROCIO', name: 'Charca del Rocío', level: 15.2, depth: 1.6,
      points: [{ x: 22, z: 452 }, { x: 52, z: 448 }, { x: 70, z: 470 }, { x: 58, z: 494 }, { x: 28, z: 496 }, { x: 12, z: 474 }],
    },
    {
      id: 'OJO_EDEN', name: 'Ojo del Edén', level: 6, depth: 6, sinkhole: 9,
      points: Array.from({ length: 14 }, (_, i) => ({ x: -560 + Math.cos((i / 14) * Math.PI * 2) * 15, z: 660 + Math.sin((i / 14) * Math.PI * 2) * 15 })),
    },
    // Termas del Collado: pozas escalonadas de agua caliente.
    { id: 'TERMA_1', name: 'Termas del Collado', level: 53.2, depth: 1.2, hot: true, points: ring(520, -735, 11, 9) },
    { id: 'TERMA_2', name: 'Termas del Collado', level: 51.6, depth: 1.1, hot: true, points: ring(541, -712, 8, 9) },
    { id: 'TERMA_3', name: 'Termas del Collado', level: 50.1, depth: 1, hot: true, points: ring(528, -690, 9, 9) },
    { id: 'TERMA_4', name: 'Termas del Collado', level: 48.6, depth: 1, hot: true, points: ring(553, -668, 7, 9) },
    // Pozas de la marisma.
    { id: 'POZA_MARISMA_1', name: 'Pozas de la Marisma', level: 0.9, depth: 1, points: ring(-780, 1120, 26, 11) },
    { id: 'POZA_MARISMA_2', name: 'Pozas de la Marisma', level: 0.8, depth: 1, points: ring(-1010, 1080, 20, 10) },
    // Charcas del bosque y de las colinas.
    { id: 'CHARCA_BOSQUE', name: 'Charca del Musgo', level: 23, depth: 1.4, points: ring(-1020, 80, 14, 10) },
    { id: 'CHARCA_COLINAS', name: 'Abrevadero', level: 22.5, depth: 1.2, points: ring(880, 240, 12, 9) },
    { id: 'CHARCA_PINAR', name: 'Charca de las Brumas', level: 49, depth: 1.4, points: ring(-1000, -820, 16, 10) },
  ],

  // Laguna de agua de mar tras un cordón de arena (con su bocana).
  lagoon: {
    id: 'LAGUNA_TURQUESA', name: 'Laguna Turquesa', depth: 2.2,
    points: [
      { x: -420, z: 1385 }, { x: -250, z: 1330 }, { x: -80, z: 1352 }, { x: 70, z: 1420 }, { x: 108, z: 1492 },
      { x: 10, z: 1530 }, { x: -200, z: 1522 }, { x: -380, z: 1488 },
    ],
    mouth: [{ x: 75, z: 1480 }, { x: 125, z: 1560 }, { x: 150, z: 1650 }],
  },

  // ---- Caminos ------------------------------------------------------------------------
  // Sendas de tierra que unen los lugares (se suavizan y se ven en el mapa).
  roads: [
    {
      id: 'CAMINO_REAL', name: 'Camino Viejo', w: 3.2,
      points: [{ x: -120, z: 470 }, { x: -60, z: 330 }, { x: 0, z: 200 }, { x: 120, z: 100 }, { x: 290, z: 40 }, { x: 470, z: 70 }, { x: 600, z: 115 }],
    },
    {
      id: 'SENDA_ERMITANO', name: 'Senda del Ermitaño', w: 2.6,
      points: [{ x: -60, z: 330 }, { x: -200, z: 250 }, { x: -320, z: 140 }, { x: -400, z: 55 }],
    },
    {
      id: 'CAMINO_OBSERVATORIO', name: 'Camino del Observatorio', w: 3.6,
      points: [{ x: 600, z: 115 }, { x: 720, z: 20 }, { x: 760, z: -120 }, { x: 740, z: -250 }, { x: 790, z: -330 }, { x: 850, z: -430 }],
    },
    {
      id: 'SENDA_COLLADO', name: 'Senda del Collado', w: 2.4,
      points: [
        { x: 740, z: -250 }, { x: 620, z: -420 }, { x: 560, z: -560 }, { x: 540, z: -640 }, { x: 470, z: -700 },
        { x: 520, z: -760 }, { x: 430, z: -800 }, { x: 470, z: -860 }, { x: 390, z: -890 }, { x: 345, z: -935 },
      ],
    },
    {
      id: 'SENDA_SUR', name: 'Senda de la Laguna', w: 2.4,
      points: [{ x: -120, z: 470 }, { x: -200, z: 640 }, { x: -260, z: 860 }, { x: -230, z: 1080 }, { x: -170, z: 1300 }],
    },
  ],

  // ---- Lugares --------------------------------------------------------------------------
  // Lugares de la historia (con su explanada) y el inicio.
  spawn: { x: -120, z: 470, yaw: 0.6 },
  // Cicatriz del choque de la cápsula: tierra quemada y árboles tumbados.
  scar: [{ x: -470, z: 230, w: 5 }, { x: -330, z: 320, w: 7 }, { x: -200, z: 410, w: 8 }, { x: -128, z: 462, w: 6 }],
  landing: { x: 345, z: -960, yaw: Math.PI * 0.08, r: 15, blend: 14 },
  sites: [
    { kind: 'HERMIT_TOWER', x: -420, z: 40, r: 10, blend: 10, yaw: -1.2 },
    { kind: 'MERCHANT', x: -74, z: 351, r: 9, blend: 6, yaw: 2.6 }, // P8: puesto del mercader junto al Camino Real
    { kind: 'NODE_ARENA', x: 640, z: 140, r: 20, blend: 14, yaw: 0.3 },
    { kind: 'RESEARCH_CENTER', x: 850, z: -480, r: 26, blend: 12, yaw: 0 },
    // Bases goblin: claros del bosque y de los linderos.
    { kind: 'GOBLIN_BASE', x: -900, z: -110, r: 17, blend: 10, yaw: 0.4 },
    { kind: 'GOBLIN_BASE', x: -1150, z: 440, r: 17, blend: 10, yaw: 2.2 },
    { kind: 'GOBLIN_BASE', x: -660, z: -640, r: 17, blend: 10, yaw: 1.1 },
    { kind: 'GOBLIN_BASE', x: 1010, z: 600, r: 17, blend: 10, yaw: -0.8 },
    { kind: 'GOBLIN_BASE', x: 330, z: 1060, r: 17, blend: 10, yaw: 3.0 },
    { kind: 'GOBLIN_BASE', x: -500, z: 1010, r: 17, blend: 10, yaw: 0.2 },
    { kind: 'GOBLIN_BASE', x: 1150, z: -1060, r: 17, blend: 10, yaw: -2.4 },
    // Gólems: roquedales, ruinas y montañas.
    ...[
      [300, -300], [470, -150], [980, -780], [1060, -120], [1140, 160], [960, 300], [-300, -520], [-640, -440],
      [-960, -560], [190, -1060], [-470, -1150], [660, -1000], [-1120, -860], [720, -640], [1290, -620], [380, -560],
      [-1300, 120], [-260, 860], [1300, 860], [-60, -620],
    ].map(([x, z]) => ({ kind: 'GOLEMS', x, z, r: 5 })),
  ],

  // Lugares con nombre (para el mapa, los avisos y la decoración).
  pois: [
    { id: 'CASCADA_VELO', name: 'Cascada del Velo', x: -214, z: -785, kind: 'waterfall' },
    { id: 'SALTO_ALBA', name: 'Salto del Alba', x: 1560, z: -228, kind: 'waterfall' },
    { id: 'EL_ABUELO', name: 'El Abuelo', x: -820, z: 140, kind: 'bigTree' },
    { id: 'RUINAS', name: 'Ruinas del Viejo Jardín', x: -260, z: 880, kind: 'ruins', r: 34 },
    { id: 'FARO_ROTO', name: 'Faro Roto', x: 1810, z: 1275, kind: 'lighthouse' },
    { id: 'ARCO_MAR', name: 'Arco del Mar', x: 345, z: 1625, kind: 'arch' },
    { id: 'CENTINELAS', name: 'Los Centinelas', x: 180, z: 1755, kind: 'stacks' },
    { id: 'TERMAS', name: 'Termas del Collado', x: 535, z: -705, kind: 'springs' },
    { id: 'MIRADOR', name: 'Mirador del Poniente', x: -1560, z: -120, kind: 'viewpoint' },
    { id: 'CANTERA', name: 'Cantera de los Gólems', x: 1060, z: -150, kind: 'quarry', r: 40 },
    { id: 'PUENTE', name: 'Puente de Piedra', x: -60, z: -262, kind: 'bridge' },
    { id: 'HUERTO', name: 'Huerto Silvestre', x: 820, z: 420, kind: 'orchard', r: 110 },
    { id: 'PLAYA_FIORDO', name: 'Playa del Fiordo', x: -870, z: -1065, kind: 'cove' },
  ],

  // ---- Cuevas ---------------------------------------------------------------------------
  // Cada cueva: recorrido principal desde la boca (x, z, r: radio, d: metros que baja el
  // suelo respecto a la boca, name: sala con nombre) y ramales que salen de un nodo
  // (from). kind: UNDERGROUND (agujero en el suelo), MOUNTAIN (en una ladera), SEA (al
  // pie de un acantilado). theme: el ambiente (colores, decoración, luz y menas).
  caves: [
    {
      id: 'CUEVA_ROCIO', name: 'Cueva del Rocío', kind: 'UNDERGROUND', theme: 'roots',
      ores: { COAL: 4, COPPER: 0.5, IRON: 0.12, DIAMOND: 0, FLOWERS: 3, GOLD: 0.08, CRYSTAL: 0 },
      path: [
        { x: 210, z: 700, r: 3.4, d: 0 }, { x: 214, z: 689, r: 3.2, d: 2.4 }, { x: 220, z: 678, r: 3.1, d: 4.8 },
        { x: 228, z: 666, r: 3, d: 7 }, { x: 238, z: 654, r: 3.4, d: 8.6 },
        { x: 251, z: 640, r: 6.6, d: 9.4, name: 'Sala de las Raíces' },
        { x: 264, z: 628, r: 5, d: 9.8 }, { x: 277, z: 619, r: 3, d: 10.6 }, { x: 291, z: 611, r: 3, d: 11.4 },
        { x: 305, z: 603, r: 5.6, d: 12, name: 'Pozo del Rocío' },
      ],
      branches: [
        { from: 5, path: [{ x: 241, z: 627, r: 2.9, d: 9.8 }, { x: 233, z: 613, r: 2.8, d: 10.2 }, { x: 226, z: 599, r: 4.2, d: 10.4, name: 'Gruta de las Luciérnagas' }] },
      ],
    },
    {
      id: 'MINA_VIEJA', name: 'Mina Vieja', kind: 'MOUNTAIN', theme: 'mine',
      ores: { COAL: 5, COPPER: 0.55, IRON: 0.38, DIAMOND: 0, FLOWERS: 0, GOLD: 0.5, CRYSTAL: 0.05 },
      path: [
        { x: 1116, z: -62, r: 3.2, d: 0 }, { x: 1128, z: -64, r: 3, d: 0.5 }, { x: 1141, z: -66, r: 3, d: 1 },
        { x: 1155, z: -68, r: 3, d: 1.5 }, { x: 1170, z: -70, r: 5.6, d: 2, name: 'Sala de la Vagoneta' },
        { x: 1186, z: -72, r: 3, d: 2.6 }, { x: 1202, z: -74, r: 3, d: 3.2 }, { x: 1218, z: -78, r: 3, d: 4 },
        { x: 1234, z: -82, r: 6, d: 4.8, name: 'Pozo Maestro' },
        { x: 1250, z: -86, r: 3, d: 5.6 }, { x: 1264, z: -90, r: 3, d: 6.4 },
        { x: 1278, z: -94, r: 5, d: 7.2, name: 'Veta del Hierro' },
      ],
      branches: [
        { from: 4, path: [{ x: 1172, z: -88, r: 2.8, d: 2.6 }, { x: 1176, z: -106, r: 2.8, d: 3.2 }, { x: 1182, z: -124, r: 2.8, d: 4 }, { x: 1190, z: -140, r: 4.5, d: 4.6, name: 'Galería Norte' }] },
        { from: 8, path: [{ x: 1236, z: -64, r: 2.8, d: 5.4 }, { x: 1240, z: -48, r: 2.8, d: 6.2 }, { x: 1244, z: -32, r: 2.8, d: 7 }, { x: 1250, z: -18, r: 4.5, d: 7.6, name: 'El Derrumbe' }] },
      ],
    },
    {
      id: 'GRUTA_CRISTAL', name: 'Gruta de Cristal', kind: 'MOUNTAIN', theme: 'crystal',
      ores: { COAL: 1, COPPER: 0.2, IRON: 0.25, DIAMOND: 0.22, FLOWERS: 0, GOLD: 0.12, CRYSTAL: 0.85 },
      path: [
        { x: 1000, z: -760, r: 3.2, d: 0 }, { x: 1012, z: -752, r: 3, d: 0.6 }, { x: 1026, z: -744, r: 3, d: 1.4 },
        { x: 1040, z: -736, r: 3.2, d: 2.4 }, { x: 1056, z: -726, r: 6.8, d: 3.4, name: 'Salón Amatista' },
        { x: 1070, z: -716, r: 3, d: 4.2 }, { x: 1084, z: -706, r: 3, d: 5.2 }, { x: 1098, z: -698, r: 3.2, d: 6.4 },
        { x: 1114, z: -688, r: 7.2, d: 7.6, name: 'Corazón de Cristal' },
      ],
      branches: [
        { from: 4, path: [{ x: 1060, z: -742, r: 2.6, d: 3.8 }, { x: 1070, z: -756, r: 2.6, d: 4.4 }, { x: 1082, z: -768, r: 4.6, d: 5, name: 'Cámara del Eco' }] },
      ],
    },
    {
      id: 'GRUTA_HIELO', name: 'Gruta de Hielo', kind: 'MOUNTAIN', theme: 'ice',
      ores: { COAL: 1, COPPER: 0.1, IRON: 0.4, DIAMOND: 0.1, FLOWERS: 0, GOLD: 0.15, CRYSTAL: 0.4 },
      path: [
        { x: -556, z: -1098, r: 3.4, d: 0 }, { x: -556, z: -1112, r: 3.2, d: 0.5 }, { x: -554, z: -1126, r: 3.2, d: 1.2 },
        { x: -552, z: -1140, r: 3.4, d: 2 }, { x: -548, z: -1158, r: 7.2, d: 2.8, name: 'Catedral de Hielo' },
        { x: -544, z: -1176, r: 3, d: 3.6 }, { x: -542, z: -1192, r: 3, d: 4.4 },
        { x: -540, z: -1208, r: 5.6, d: 5.2, name: 'Cascada Helada' },
      ],
      branches: [
        { from: 4, path: [{ x: -566, z: -1162, r: 2.8, d: 3.2 }, { x: -582, z: -1168, r: 2.8, d: 3.8 }, { x: -598, z: -1176, r: 4.6, d: 4.4, name: 'Nido de Carámbanos' }] },
      ],
    },
    {
      id: 'BOSQUE_SETAS', name: 'Bosque de Setas', kind: 'UNDERGROUND', theme: 'mushroom',
      ores: { COAL: 3, COPPER: 0.3, IRON: 0.1, DIAMOND: 0, FLOWERS: 6, GOLD: 0.06, CRYSTAL: 0.15 },
      path: [
        { x: -605, z: 632, r: 3.4, d: 0 }, { x: -600, z: 645, r: 3.2, d: 2.4 }, { x: -594, z: 658, r: 3, d: 4.8 },
        { x: -588, z: 672, r: 3.2, d: 7 }, { x: -580, z: 690, r: 7.6, d: 8.6, name: 'Bosque de Setas' },
        { x: -571, z: 707, r: 3.2, d: 9.4 }, { x: -561, z: 721, r: 3.2, d: 10.2 },
        { x: -550, z: 736, r: 6.2, d: 10.8, name: 'Lago Escondido' },
      ],
      branches: [
        { from: 4, path: [{ x: -596, z: 702, r: 2.8, d: 9 }, { x: -610, z: 713, r: 2.8, d: 9.4 }, { x: -622, z: 724, r: 4.6, d: 9.8, name: 'Rincón de las Esporas' }] },
      ],
    },
    {
      id: 'CUEVA_MAR', name: 'Cueva del Mar', kind: 'SEA', theme: 'sea',
      ores: { COAL: 1, COPPER: 0.25, IRON: 0.08, DIAMOND: 0, FLOWERS: 0, GOLD: 0.3, CRYSTAL: 0.08 },
      path: [
        { x: -1680, z: 118, r: 3.8, d: 0 }, { x: -1660, z: 118, r: 3.8, d: 0 }, { x: -1640, z: 119, r: 3.8, d: 0 },
        { x: -1622, z: 120, r: 3.8, d: 0 }, { x: -1606, z: 122, r: 4, d: 0 }, { x: -1592, z: 124, r: 4, d: 0 },
        { x: -1576, z: 128, r: 6.6, d: 0, name: 'Gruta de las Mareas' },
        { x: -1560, z: 132, r: 3.2, d: 0.2 }, { x: -1545, z: 136, r: 3.2, d: 0.4 },
        { x: -1530, z: 140, r: 5, d: 0.6, name: 'Nido de Conchas' },
      ],
      branches: [],
    },
  ],

  // ---- Regiones ----------------------------------------------------------------------
  // Zonas con nombre: bioma, suelo y vegetación. Gana la primera que contiene el punto;
  // la costa (playas), los ríos y la nieve se deciden después por reglas.
  regions: [
    { id: 'TERMAS', name: 'Termas del Collado', biome: 'MOUNTAINS', ground: 'alpine', flora: 'alpine', points: ring(535, -705, 70, 10) },
    { id: 'HUERTO', name: 'Huerto Silvestre', biome: 'PLAINS', ground: 'meadow', flora: 'orchard', points: ring(820, 420, 115, 12) },
    { id: 'RUINAS', name: 'Ruinas del Viejo Jardín', biome: 'PLAINS', ground: 'meadow', flora: 'meadow', points: ring(-260, 880, 70, 10) },
    { id: 'ISLA_FARO', name: 'Isla del Faro', biome: 'BEACH', ground: 'rocky', flora: 'scrub', points: ring(1810, 1280, 130, 10) },
    { id: 'MESETA', name: 'Meseta del Observatorio', biome: 'MOUNTAINS', ground: 'dry', flora: 'scrub', points: [{ x: 680, z: -650 }, { x: 1010, z: -620 }, { x: 1060, z: -420 }, { x: 960, z: -310 }, { x: 760, z: -320 }, { x: 670, z: -450 }] },
    {
      id: 'CORDILLERA', name: 'Cordillera Helada', biome: 'FROZEN_MOUNTAINS', ground: 'alpine', flora: 'alpine',
      points: [{ x: -1250, z: -1700 }, { x: 1200, z: -1700 }, { x: 1300, z: -1080 }, { x: 900, z: -900 }, { x: 600, z: -860 }, { x: 260, z: -800 }, { x: -60, z: -860 }, { x: -420, z: -900 }, { x: -760, z: -980 }, { x: -1000, z: -1000 }, { x: -1300, z: -1150 }],
    },
    {
      id: 'SIERRA_GRIS', name: 'Sierra Gris', biome: 'MOUNTAINS', ground: 'rocky', flora: 'mountain',
      points: [{ x: 900, z: -960 }, { x: 1500, z: -1100 }, { x: 1700, z: -300 }, { x: 1600, z: 450 }, { x: 1150, z: 520 }, { x: 1000, z: 200 }, { x: 1040, z: -300 }, { x: 960, z: -700 }],
    },
    {
      id: 'GARGANTA', name: 'Garganta del Velo', biome: 'MOUNTAINS', ground: 'rocky', flora: 'mountain',
      points: [{ x: -290, z: -830 }, { x: -140, z: -830 }, { x: -60, z: -460 }, { x: -200, z: -420 }],
    },
    {
      id: 'PINAR', name: 'Pinar de las Brumas', biome: 'FOREST', ground: 'pine', flora: 'pine',
      points: [{ x: -1420, z: -1060 }, { x: -760, z: -980 }, { x: -420, z: -900 }, { x: -300, z: -700 }, { x: -420, z: -420 }, { x: -1000, z: -380 }, { x: -1600, z: -480 }, { x: -1560, z: -820 }],
    },
    {
      id: 'BOSQUE_ANTIGUO', name: 'Bosque Antiguo', biome: 'FOREST', ground: 'forest', flora: 'oak',
      points: [{ x: -1600, z: -480 }, { x: -1000, z: -380 }, { x: -470, z: -330 }, { x: -470, z: -130 }, { x: -560, z: 220 }, { x: -520, z: 560 }, { x: -880, z: 820 }, { x: -1350, z: 780 }, { x: -1620, z: 300 }],
    },
    {
      id: 'LAGO_ESPEJO', name: 'Lago Espejo', biome: 'RIVER', ground: 'lush', flora: 'lakeside',
      points: [{ x: -220, z: -260 }, { x: 120, z: -280 }, { x: 320, z: -120 }, { x: 300, z: 120 }, { x: 60, z: 160 }, { x: -260, z: 60 }],
    },
    {
      id: 'COLINAS', name: 'Colinas Doradas', biome: 'PLAINS', ground: 'dry', flora: 'savanna',
      points: [{ x: 300, z: -300 }, { x: 760, z: -300 }, { x: 1000, z: -200 }, { x: 1040, z: 200 }, { x: 1150, z: 520 }, { x: 980, z: 800 }, { x: 600, z: 760 }, { x: 330, z: 520 }, { x: 260, z: 200 }],
    },
    {
      id: 'CORDILLERA_FALDAS', name: 'Faldas de la Cordillera', biome: 'MOUNTAINS', ground: 'foothill', flora: 'mountain',
      points: [{ x: -420, z: -900 }, { x: -60, z: -860 }, { x: 260, z: -800 }, { x: 600, z: -860 }, { x: 900, z: -900 }, { x: 760, z: -620 }, { x: 420, z: -420 }, { x: 120, z: -320 }, { x: -60, z: -460 }, { x: -300, z: -700 }],
    },
    {
      id: 'MARISMAS', name: 'Marismas del Sur', biome: 'RIVER', ground: 'marsh', flora: 'marsh',
      points: [{ x: -560, z: 1020 }, { x: -1250, z: 960 }, { x: -1300, z: 1200 }, { x: -900, z: 1500 }, { x: -600, z: 1500 }],
    },
    {
      id: 'ACANTILADOS', name: 'Acantilados del Poniente', biome: 'PLAINS', ground: 'windswept', flora: 'scrub',
      points: [{ x: -1700, z: -480 }, { x: -1480, z: -480 }, { x: -1440, z: 780 }, { x: -1500, z: 900 }, { x: -1750, z: 600 }],
    },
    {
      id: 'BOSQUE_SUR', name: 'Bosque del Sur', biome: 'FOREST', ground: 'forest', flora: 'mixed',
      points: [{ x: -520, z: 760 }, { x: 0, z: 980 }, { x: 420, z: 960 }, { x: 640, z: 1240 }, { x: 200, z: 1340 }, { x: -480, z: 1200 }],
    },
    {
      id: 'FIORDO', name: 'Fiordo Gris', biome: 'MOUNTAINS', ground: 'rocky', flora: 'pine',
      points: [{ x: -1300, z: -1420 }, { x: -820, z: -1000 }, { x: -760, z: -1120 }, { x: -1100, z: -1500 }],
    },
    {
      id: 'VALLE', name: 'Valle del Despertar', biome: 'PLAINS', ground: 'meadow', flora: 'meadow',
      points: [{ x: -520, z: 120 }, { x: -260, z: 60 }, { x: 60, z: 160 }, { x: 330, z: 300 }, { x: 420, z: 700 }, { x: 0, z: 960 }, { x: -520, z: 760 }],
    },
    {
      id: 'COSTA_ESTE', name: 'Costa del Alba', biome: 'PLAINS', ground: 'meadow', flora: 'scrub',
      points: [{ x: 1000, z: 200 }, { x: 1600, z: 450 }, { x: 1600, z: 1100 }, { x: 980, z: 800 }],
    },
    {
      id: 'PLAYA_LARGA', name: 'Playa Larga', biome: 'BEACH', ground: 'sand', flora: 'beach',
      points: [{ x: 640, z: 1240 }, { x: 980, z: 800 }, { x: 1600, z: 1100 }, { x: 1100, z: 1600 }, { x: 400, z: 1700 }],
    },
    {
      id: 'LAGUNA', name: 'Laguna Turquesa', biome: 'BEACH', ground: 'sand', flora: 'beach',
      points: [{ x: -600, z: 1250 }, { x: -480, z: 1200 }, { x: 200, z: 1340 }, { x: 400, z: 1700 }, { x: -600, z: 1700 }],
    },
  ],
  // Fuera de toda región: valle con pradera.
  defaultRegion: { id: 'VALLE', biome: 'PLAINS', ground: 'meadow', flora: 'meadow' },
};

/** Contorno aproximadamente circular (para pozas y regiones pequeñas). */
function ring(cx, cz, r, n) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(i * 2.3 + cx * 0.01);
    return { x: cx + Math.cos(a) * r * k, z: cz + Math.sin(a) * r * k };
  });
}

/**
 * Permite importar en los tests módulos que usan Three.js (WorldGenerator…):
 * registra el hook que resuelve 'three' a lib/three. Importar este archivo ANTES
 * (con import dinámico) que los módulos que lo necesitan.
 */
import { register } from 'node:module';

register('./three-hooks.mjs', import.meta.url);

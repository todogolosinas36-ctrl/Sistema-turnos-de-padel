/**
 * Parte B del modulo: algoritmos puros de dominio.
 *
 * Ninguna funcion de este archivo toca la red, el DOM ni el reloj. Todas son
 * deterministas salvo donde se inyecta un PRNG (`rng`), lo que las hace
 * testeables y permite reproducir un sorteo con la misma semilla.
 *
 * ```ts
 * import { generarZonas, generarFixtureZonas, calcularTablaPosiciones } from '@/modules/torneos/lib';
 * ```
 */

export * from './utils';
export * from './generarZonas';
export * from './generarFixtureZonas';
export * from './calcularTablaPosiciones';
export * from './generarPlayoffs';
export * from './bracket';
export * from './cronograma';
export * from './validacion';

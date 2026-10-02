/**
 * Fixture round-robin de la fase de zonas.
 *
 * Todos contra todos dentro de la zona, repartido en rondas equilibradas con el
 * metodo del circulo (BERCHTOLD):
 *   - Si el numero de parejas es impar se agrega un BYE ficticio para que el
 *     circulo quede par.
 *   - En cada ronda se empareja el primero con el ultimo, el segundo con el
 *     anteultimo, etc.
 *   - Entre rondas se rota la lista manteniendo fijo al primero.
 *
 * Zona de 3 -> 2 rondas, 3 partidos:
 *   R1: P2 vs P3      R2: P1 vs P3      R3: P1 vs P2
 * Zona de 4 -> 3 rondas, 6 partidos (2 por ronda).
 *
 * El orden de los partidos dentro de la zona es el del round robin; la
 * `orden_fixture` global se calcula como el offset de la zona + posicion, para
 * que la vista de zonas los ordene igual que la base.
 */

import type { Fase, PartidoGenerado, ZonaConParejas } from '../types';
import { ValidacionError } from '../errors';

/** Numero maximo de parejas por zona que soporta el metodo del circulo. */
const MAX_PAREJAS_POR_ZONA = 16;

export interface OpcionesFixtureZonas {
  /**
   * Rondas por las que se repite el round robin (normalmente 1).
   * 2 = "doble round robin" (cada pareja juega el partido dos veces).
   */
  rondas?: number;
}

/**
 * Genera todos los partidos de la fase de zonas.
 *
 * @param zonas  Zonas con sus parejas ya sorteadas.
 * @returns Partidos sin `id` (lo asigna la base) y con `zona_nombre` en vez de
 *          `zona_id`, listos para `reemplazar_fixture`.
 *
 * @example
 *   const partidos = generarFixtureZonas([{ ...zonaA, parejas: [p1, p2, p3] }]);
 *   // -> 3 partidos, todos en zona A
 */
export function generarFixtureZonas(
  zonas: readonly ZonaConParejas[],
  opciones: OpcionesFixtureZonas = {},
): PartidoGenerado[] {
  const { rondas: repeticiones = 1 } = opciones;

  if (!Array.isArray(zonas)) {
    throw new ValidacionError('entrada_invalida', 'Se esperaba un arreglo de zonas.');
  }
  if (!Number.isInteger(repeticiones) || repeticiones < 1) {
    throw new ValidacionError('entrada_invalida', 'La cantidad de rondas debe ser un entero >= 1.');
  }

  const partidos: PartidoGenerado[] = [];
  let ordenGlobal = 0;

  for (const zona of zonas) {
    const parejas = (zona.parejas ?? []).filter(Boolean);
    const n = parejas.length;

    if (n < 2) {
      // Una zona de 1 no tiene partidos. No es un error: el sorteador genera
      // zonas de 2 en casos borde y la UI debe poder mostrarla.
      continue;
    }
    if (n > MAX_PAREJAS_POR_ZONA) {
      throw new ValidacionError(
        'zona_muy_grande',
        `La zona "${zona.nombre}" tiene ${n} parejas y el maximo por zona es ${MAX_PAREJAS_POR_ZONA}.`,
      );
    }

    for (const par of generarRoundRobin(n)) {
      for (let rep = 0; rep < repeticiones; rep++) {
        const p1 = parejas[par.a];
        const p2 = parejas[par.b];
        if (!p1 || !p2) continue;
        ordenGlobal += 1;
        partidos.push({
          zona_nombre: zona.nombre,
          ronda: par.ronda,
          orden: ordenGlobal,
          orden_fixture: ordenGlobal,
          fase: 'zona' as Fase,
          pareja_1_id: p1.id,
          pareja_2_id: p2.id,
        });
      }
    }
  }

  return partidos;
}

/**
 * Agenda de emparejamientos de una ronda-all contra todos de `n` elementos.
 * Devuelve indices sobre la lista de parejas, no los objetos.
 *
 * @returns `{ ronda, a, b }[]` con C(n, 2) entradas en general.
 */
export function generarRoundRobin(n: number): { ronda: number; a: number; b: number }[] {
  // BYE = -1. Con n impar agregamos un bye para que el circulo sea par.
  const circulo: number[] = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) circulo.push(-1);

  const total = circulo.length; // siempre par
  const rondas = total - 1;
  const emparejamientos: { ronda: number; a: number; b: number }[] = [];

  for (let ronda = 1; ronda <= rondas; ronda++) {
    for (let i = 0; i < total / 2; i++) {
      const a = circulo[i];
      const b = circulo[total - 1 - i];
      if (a === -1 || b === -1) continue; // bye: no genera partido
      // Guardamos el menor indice primero: el orden de las columnas del score
      // debe ser estable (siempre "el de arriba" vs "el de abajo").
      emparejamientos.push({ ronda, a: Math.min(a, b), b: Math.max(a, b) });
    }

    // Rotacion keeping el primero fijo.
    circulo.splice(1, 0, circulo.pop() as number);
  }

  return emparejamientos;
}

/**
 * Cantidad de partidos que genera una zona de `n` parejas.
 * Se usa para mostrar "se crearan N partidos" antes de confirmar.
 */
export function cantidadPartidosZona(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

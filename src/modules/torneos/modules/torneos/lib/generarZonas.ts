/**
 * Sorteador de zonas (fase de grupos).
 *
 * Reglas:
 *  - Solo entran las parejas habilitadas: `estado_pago` en {pagado, sena}.
 *  - Las habilitadas se mezclan con Fisher-Yates (PRNG inyectable, semilla
 *    persistible para poder reproducir el sorteo).
 *  - Se reparten en zonas de 3. Si el total NO es multiplo exacto de 3, se
 *    agregan zonas de 4 para que no queden parejas sueltas.
 *
 * Ejemplos del reparto:
 *    6 -> [3, 3]              9 -> [3, 3, 3]           12 -> [3, 3, 3, 3]
 *    7 -> [4, 3]              10 -> [4, 3, 3]          11 -> [4, 4, 3]
 *    4 -> [4]                 8 -> [4, 4]             13 -> [4, 3, 3, 3]
 *
 * Casos borde que no admiten zonas de 3/4 (5 parejas) se resuelven con una
 * zona de 3 y una de 2; la de 2 juega un solo partido (partido definitorio) y
 * la tabla la marca explicitamente como incompleta.
 */

import type { Pareja, ZonaSorteada } from '../types';
import { ValidacionError } from '../errors';
import { barajar, nombreZona } from './utils';

/** Estados de pago que habilitan a la pareja a entrar al sorteo. */
export const ESTADOS_PAGO_HABILITADOS: ReadonlySet<Pareja['estado_pago']> = new Set<Pareja['estado_pago']>([
  'pagado',
  'sena',
]);

/** Tamanos de zona preferidos, en el orden en que se intentan. */
const TAMANOS_PREFERIDOS = [3, 4];
/** Se agrega el 2 como ultimo recurso para no dejar parejas sueltas. */
const TAMANOS_FALLBACK = [3, 4, 2];

/** Par de zonasmaximo soportado por el bracket (16 zonas -> 32 clasificados). */
export const MAX_ZONAS = 16;

export interface OpcionesSorteo {
  /**
   * PRNG inyectable. Se pasa `crearRng(semilla)` para hacer el sorteo
   * reproducible. Por defecto `Math.random`.
   */
  rng?: () => number;
  /** Si es false, se sortean TODAS las parejas aunque esten pendientes de pago. */
  soloHabilitadas?: boolean;
}

export interface ResultadoSorteo {
  zonas: ZonaSorteada[];
  /** Parejas que quedaron afuera y por que. */
  excluidas: { pareja: Pareja; motivo: 'pago_pendiente' }[];
  /** Semilla efectiva usada, para persistirla y poder auditar el sorteo. */
  semillaUsada: number | null;
}

/** ¿Esta pareja tiene el pago habilitada para jugar la fase de zonas? */
export function puedeParticiparEnSorteo(pareja: Pick<Pareja, 'estado_pago'>): boolean {
  return ESTADOS_PAGO_HABILITADOS.has(pareja.estado_pago);
}

/**
 * Reparte `total` parejas en zonas de tamao 3 (y 4 si hace falta).
 * Devuelve el arreglo de tamanos, ordenado de mayor a menor.
 * @throws ValidacionError si `total < 2`.
 */
export function resolverTamanosZona(total: number): number[] {
  if (!Number.isInteger(total) || total < 2) {
    throw new ValidacionError(
      'pocas_parejas',
      `Se necesitan al menos 2 parejas para sortear zonas (recibidas: ${total}).`,
      { parejas: `Minimo 2 parejas habilitadas.` },
    );
  }

  return (
    buscarDistribucion(total, TAMANOS_PREFERIDOS) ??
    buscarDistribucion(total, TAMANOS_FALLBACK) ??
    // Solo alcanzable si `total` es 1, que ya se valido arriba.
    [total]
  );
}

/**
 * DFS con memoizacion de restos imposibles. Devuelve la primer combinacion
 * valida, ordenada de mayor a menor, o `null` si no existe.
 *
 * Con `permitidos = [3, 4]` y `total = 7` la primera solucion que encuentra es
 * `[4, 3]`: las zonas de 4 quedan primero, que es la convencion en padel.
 */
function buscarDistribucion(total: number, permitidos: number[]): number[] | null {
  let solucion: number[] | null = null;
  const imposibles = new Set<number>();

  const visitar = (restante: number, actual: number[]): void => {
    if (solucion) return;
    if (restante === 0) {
      solucion = [...actual].sort((a, b) => b - a);
      return;
    }
    if (imposibles.has(restante)) return;

    for (const tamano of permitidos) {
      if (tamano > restante) continue;
      actual.push(tamano);
      visitar(restante - tamano, actual);
      actual.pop();
      if (solucion) return;
    }

    // Ningun camino desde este resto llega a 0.
    imposibles.add(restante);
  };

  visitar(total, []);
  return solucion;
}

/**
 * Sortea las zonas de una categoria.
 *
 * @param parejas  Todas las parejas de la categoria (el filtro de pago se
 *                 aplica aqui, no lo tiene que hacer el llamador).
 * @returns zonas con su nombre y sus parejas, mas el detalle de exclusiones.
 *
 * @example
 *   const { zonas } = generarZonas(parejas, { rng: crearRng(42) });
 *   // -> [{ nombre: 'Zona A', orden: 1, parejas: [...] }, ...]
 */
export function generarZonas(parejas: readonly Pareja[], opciones: OpcionesSorteo = {}): ResultadoSorteo {
  const { rng = Math.random, soloHabilitadas = true } = opciones;

  if (!parejas) throw new ValidacionError('entrada_invalida', 'La lista de parejas es obligatoria.');

  const habilitadas: Pareja[] = [];
  const excluidas: ResultadoSorteo['excluidas'] = [];

  for (const pareja of parejas) {
    if (soloHabilitadas && !puedeParticiparEnSorteo(pareja)) {
      excluidas.push({ pareja, motivo: 'pago_pendiente' });
    } else {
      habilitadas.push(pareja);
    }
  }

  const tamanos = resolverTamanosZona(habilitadas.length);

  if (tamanos.length > MAX_ZONAS) {
    throw new ValidacionError(
      'demasiadas_zonas',
      `Se generaron ${tamanos.length} zonas y el maximo soportado es ${MAX_ZONAS}. ` +
        `Reduce la cantidad de parejas o el limite de la categoria.`,
    );
  }

  const mezcla = barajar(habilitadas, rng);

  const zonas: ZonaSorteada[] = [];
  let cursor = 0;
  tamanos.forEach((tamano, indice) => {
    zonas.push({
      nombre: nombreZona(indice),
      orden: indice + 1,
      parejas: mezcla.slice(cursor, cursor + tamano),
    });
    cursor += tamano;
  });

  return { zonas, excluidas, semillaUsada: null };
}

/**
 * Comprobaciones previas al botón "Sortear Zonas". La UI las usa para deshabilitar
 * la acción y explicar por qué, sin lanzar excepciones.
 */
export function analizarSorteo(parejas: readonly Pareja[]): {
  habilitado: boolean;
  habilitadas: number;
  pendientes: number;
  zonasEstimadas: number;
  motivo: string | null;
} {
  const habilitadas = parejas.filter(puedeParticiparEnSorteo).length;
  const pendientes = parejas.length - habilitadas;

  if (habilitadas < 2) {
    return {
      habilitado: false,
      habilitadas,
      pendientes,
      zonasEstimadas: 0,
      motivo:
        habilitadas === 0
          ? 'No hay parejas con pago confirmado. Marca al menos 2 como "Pagado" o "Seña".'
          : 'Se necesita al menos 1 pareja más con pago confirmado para sortear.',
    };
  }

  const tamanos = resolverTamanosZona(habilitadas);

  if (tamanos.length > MAX_ZONAS) {
    return {
      habilitado: false,
      habilitadas,
      pendientes,
      zonasEstimadas: tamanos.length,
      motivo: `Se generarian ${tamanos.length} zonas y el maximo soportado es ${MAX_ZONAS}.`,
    };
  }

  return {
    habilitado: true,
    habilitadas,
    pendientes,
    zonasEstimadas: tamanos.length,
    motivo: null,
  };
}

/**
 * ¿Se puede generar el cuadro eliminatorio a partir de la tabla actual?
 * Requiere >= 2 zonas con al menos 2 parejas cada una.
 */
export function puedeGenerarPlayoffs(numeroZonas: number): boolean {
  return numeroZonas >= 2 && numeroZonas <= MAX_ZONAS;
}

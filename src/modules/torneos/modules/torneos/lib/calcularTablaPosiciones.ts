/**
 * Tabla de posiciones automatica de una zona (o del total de una categoria).
 *
 * Calcula por cada pareja, a partir de los sets cargados:
 *   PJ  partidos jugados
 *   PG / PP
 *   SA / SC   sets a favor / en contra   -> difSets
 *   GA / GB   games a favor / en contra -> difGames
 *
 * Criterio de orden (identico al de la vista `torneo.v_posiciones_zona`, para
 * que la UI y la base nunca discrepen):
 *   1. PG desc
 *   2. difSets desc
 *   3. difGames desc
 *   4. SA desc
 *   5. GA desc
 *   6. j1_nombre asc  (desempate estable y deterministico)
 *
 * Reglas de conteo:
 *  - Un partido cuenta como disputado en cuanto tiene al menos un set cargado.
 *  - Las diferencias (sets/games) solo suman partidos disputados: un 6-0
 *    cargado a medias no debe dominar el criterio de desempate.
 *  - El ganador NO se toma de `partido.ganador_id` sino de los sets. Si la base
 *    quedó desincronizada, se cae al `ganador_id` como respaldo.
 */

import type { Pareja, Partido, TablaFila } from '../types';
import { normalizarTexto } from './utils';

/** Sets ganados por cada lado a partir de los sets cargados. */
export interface Sets {
  p1: number;
  p2: number;
  gamesP1: number;
  gamesP2: number;
}

/** Suma los sets y games de cada lado. Solo cuenta los sets efectivamente cargados. */
export function calcularSets(partido: Pick<
  Partido,
  'set1_p1' | 'set1_p2' | 'set2_p1' | 'set2_p2' | 'set3_p1' | 'set3_p2'
>): Sets {
  let p1 = 0;
  let p2 = 0;
  let gamesP1 = 0;
  let gamesP2 = 0;

  const pares: [number | null, number | null][] = [
    [partido.set1_p1, partido.set1_p2],
    [partido.set2_p1, partido.set2_p2],
    [partido.set3_p1, partido.set3_p2],
  ];

  for (const [a, b] of pares) {
    if (a == null || b == null) continue;
    gamesP1 += a;
    gamesP2 += b;
    if (a > b) p1 += 1;
    else if (b > a) p2 += 1;
  }

  return { p1, p2, gamesP1, gamesP2 };
}

/** ¿Hay al menos un set cargado? */
export function estaDisputado(
  partido: Pick<Partido, 'set1_p1' | 'set2_p1' | 'set3_p1'>,
): boolean {
  return partido.set1_p1 != null || partido.set2_p1 != null || partido.set3_p1 != null;
}

/**
 * Deriva el ganador desde los sets.
 * @returns null si el partido no esta disputado o queda empatado a sets.
 */
export function ganadorDesdeSets(partido: Partido): string | null {
  if (!estaDisputado(partido)) return null;
  const { p1, p2 } = calcularSets(partido);
  if (p1 === p2) return null;
  return p1 > p2 ? partido.pareja_1_id : partido.pareja_2_id;
}

/**
 * Ganador efectivo de un partido. Prefiere los sets (fuente de verdad) y cae
 * al `ganador_id` persistido solo si los sets son ambiguos (partido cargado a
 * medias con walkover, por ejemplo).
 */
export function ganadorDe(partido: Partido): string | null {
  const porSets = ganadorDesdeSets(partido);
  if (porSets) return porSets;

  if (!estaDisputado(partido)) return null;

  const { p1, p2 } = calcularSets(partido);
  if (p1 === p2 && partido.ganador_id) return partido.ganador_id;

  return null;
}

/** ¿El partido tiene un ganador? (para pintar la fila del bracket) */
export function estaResuelto(partido: Partido): boolean {
  return ganadorDe(partido) != null;
}

/** Clave interna para las parejas todavia no sorteadas. */
const SIN_ZONA = '__sin_zona__';

interface Acumulador {
  zona_id: string | null;
  pareja: Pareja;
  pj: number;
  pg: number;
  pp: number;
  sa: number;
  sc: number;
  ga: number;
  gb: number;
  difSets: number;
  difGames: number;
  pendientes: number;
}

/**
 * Calcula la tabla de posiciones.
 *
 * @param partidos  Partidos de la fase `zona` (los de otras fases se ignoran).
 * @param parejas   Todas las parejas de la categoria. Las que no jugaron
 *                  ningun partido aparecen con PJ 0.
 *
 * @returns filas ordenadas, con `posicion` starting en 1 y `clasificado` en los
 *          dos primeros (para el cruce del cuadro).
 *
 * @example
 *   const tabla = calcularTablaPosiciones(partidos, parejas);
 *   tabla[0].difSets // diferencia de sets del lider
 */
export function calcularTablaPosiciones(
  partidos: readonly Partido[],
  parejas: readonly Pareja[],
  /** Cuántos clasifican por zona. Clave = zona_id. Si no se pasa, clasifica 2 por zona. */
  clasificadosPorZona?: ReadonlyMap<string, number>,
): TablaFila[] {
  const porPareja = new Map<string, Acumulador>();
  /**
   * zona_id -> nombre. Se arma con el campo opcional `zona_nombre` que traen
   * los partidos cuando el repositorio hace el embed `torneo_zonas(nombre)`.
   */
  const nombresZona = new Map<string, string>();

  // 1. Registrar todas las parejas de la categoria (aunque no hayan jugado).
  for (const pareja of parejas) {
    porPareja.set(pareja.id, {
      zona_id: null,
      pareja,
      pj: 0,
      pg: 0,
      pp: 0,
      sa: 0,
      sc: 0,
      ga: 0,
      gb: 0,
      difSets: 0,
      difGames: 0,
      pendientes: 0,
    });
  }

  const nombreDeZona = (zonaId: string | null): string | null => {
    if (!zonaId) return null;
    return nombresZona.get(zonaId) ?? zonaId;
  };

  // 2. Acumular partido por partido.
  for (const partido of partidos ?? []) {
    if (partido.fase !== 'zona') continue;
    if (!partido.pareja_1_id || !partido.pareja_2_id) continue;

    if (partido.zona_id && partido.zona_nombre) {
      nombresZona.set(partido.zona_id, partido.zona_nombre);
    }

    const ganador = ganadorDe(partido);
    const disputado = estaDisputado(partido);
    const sets = calcularSets(partido);

    const lados: [string, 'p1' | 'p2'][] = [
      [partido.pareja_1_id, 'p1'],
      [partido.pareja_2_id, 'p2'],
    ];

    for (const [parejaId, lado] of lados) {
      const acc = porPareja.get(parejaId);
      if (!acc) continue; // pareja no incluida en la listareceived

      if (partido.zona_id) acc.zona_id = partido.zona_id;

      acc.pj += 1;
      if (ganador === parejaId) acc.pg += 1;
      else if (ganador != null) acc.pp += 1;
      if (!disputado) acc.pendientes += 1;

      if (!disputado) continue;

      const setsGanados = lado === 'p1' ? sets.p1 : sets.p2;
      const setsPerdidos = lado === 'p1' ? sets.p2 : sets.p1;
      const gamesGanados = lado === 'p1' ? sets.gamesP1 : sets.gamesP2;
      const gamesPerdidos = lado === 'p1' ? sets.gamesP2 : sets.gamesP1;

      acc.sa += setsGanados;
      acc.sc += setsPerdidos;
      acc.ga += gamesGanados;
      acc.gb += gamesPerdidos;
      acc.difSets += setsGanados - setsPerdidos;
      acc.difGames += gamesGanados - gamesPerdidos;
    }
  }

  // 3. Mapear y ordenar.
  const filas: TablaFila[] = [...porPareja.values()].map((acc) => ({
    posicion: 0,
    clasificado: false,
    zona_id: acc.zona_id,
    zona: nombreDeZona(acc.zona_id),
    pareja: acc.pareja,
    pj: acc.pj,
    pg: acc.pg,
    pp: acc.pp,
    sa: acc.sa,
    sc: acc.sc,
    difSets: acc.difSets,
    ga: acc.ga,
    gb: acc.gb,
    difGames: acc.difGames,
    ratioSets: acc.sc > 0 ? round4(acc.sa / acc.sc) : 0,
    pendientes: acc.pendientes,
  }));

  // 4. Ordenar y numerar dentro de cada zona.
  //
  // Las posiciones se asignan POR ZONA (el 1° de la Zona A compite con el 1° de
  // la Zona B, no con el 2° de la Zona A). El array devuelto sale ordenado por
  // zona y, dentro de cada zona, por posición, que es como lo consume la UI.
  const porZona = new Map<string, TablaFila[]>();
  for (const fila of filas) {
    const clave = fila.zona_id ?? SIN_ZONA;
    const lista = porZona.get(clave);
    if (lista) lista.push(fila);
    else porZona.set(clave, [fila]);
  }

  const ordenadas: TablaFila[] = [];
  for (const [clave, lista] of porZona) {
    lista.sort(compararTabla);
    const cupo = clasificadosPorZona?.get(clave) ?? 2;
    lista.forEach((fila, i) => {
      fila.posicion = i + 1;
      fila.clasificado = i < cupo;
    });
    ordenadas.push(...lista);
  }

  return ordenadas;
}

/** Comparador del criterio de ordenamiento (exportado para tests). */
export function compararTabla(a: TablaFila, b: TablaFila): number {
  if (b.pg !== a.pg) return b.pg - a.pg;
  if (b.difSets !== a.difSets) return b.difSets - a.difSets;
  if (b.difGames !== a.difGames) return b.difGames - a.difGames;
  if (b.sa !== a.sa) return b.sa - a.sa;
  if (b.ga !== a.ga) return b.ga - a.ga;
  return normalizarTexto(a.pareja.j1_nombre).localeCompare(normalizarTexto(b.pareja.j1_nombre));
}

/**
 * Extrae los clasificados de las tablas, listos para `generarPlayoffs`.
 * Solo incluye zonas completas (con al menos 2 filas) y con los 2 primeros
 * posiciones definidas.
 */
export function extraerClasificados(
  tablas: readonly TablaFila[],
  clasificadosPorZona?: ReadonlyMap<string, number>,
): { zona: string; primero: Pareja; segundo: Pareja; extras?: Pareja[] }[] {
  // Agrupar por zona_id para poder leer clasificadosPorZona correctamente
  const porZona = new Map<string, TablaFila[]>();

  for (const fila of tablas) {
    const key = fila.zona_id;
    if (!key) continue;
    if (!porZona.has(key)) porZona.set(key, []);
    porZona.get(key)!.push(fila);
  }

  const out: { zona: string; primero: Pareja; segundo: Pareja; extras?: Pareja[] }[] = [];

  for (const [zonaId, filas] of porZona) {
    if (filas.length < 2) continue;
    const ordenadas = [...filas].sort((a, b) => a.posicion - b.posicion);
    const cupo = clasificadosPorZona?.get(zonaId) ?? 2;
    const extras = cupo > 2 ? ordenadas.slice(2, cupo).map(f => f.pareja) : undefined;
    const zonaNombre = ordenadas[0].zona ?? zonaId;
    
    out.push({
      zona: zonaNombre,
      primero: ordenadas[0].pareja,
      segundo: ordenadas[1].pareja,
      ...(extras && extras.length > 0 ? { extras } : {}),
    });
  }

  return out.sort((a, b) => a.zona.localeCompare(b.zona));
}

/**
 * ¿La zona tiene todos sus partidos resueltos? (para habilitar el botón de cuadro)
 */
export function zonaEstaCompleta(
  tabla: readonly TablaFila[],
  totalPartidosEsperados: number,
): boolean {
  if (tabla.length < 2) return false;
  const pendientes = tabla.reduce((acc, f) => acc + f.pendientes, 0) / 2;
  return pendientes === 0 && totalPartidosEsperados >= 1;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

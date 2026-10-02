/**
 * Estructura del bracket para renderizar.
 *
 * `generarPlayoffs` devuelve una lista plana; la UI necesita el arbol por
 * rondas (columnas) y, dentro de cada ronda, los partidos ordenados de arriba
 * abajo. Este modulo arma esa vista sin volver a calcular cruces.
 */

import type { Fase, Partido, PartidoGenerado } from '../types';
import { ganadorDe } from './calcularTablaPosiciones';

export interface PartidoBracket {
  partido: Partido;
  /** Posicion vertical (0-indexada) dentro de la ronda, para el layout. */
  indice: number;
  /** Cuantos partidos de esta ronda alimentan el slot. */
  alimentadoPor: number;
  /** Rondas que faltan para coronarse campeon. */
  rondasRestantes: number;
  esBye: boolean;
  hayGanador: boolean;
}

export interface RondaBracket {
  ronda: number;
  fase: Fase;
  partidos: PartidoBracket[];
}

export interface Bracket {
  rondas: RondaBracket[];
  /** Ganador del torneo, si la final ya se resolvio. */
  campeon: string | null;
}

/** Campos de un partido generado (sin persistir) o persistido. */
type PartidoLike = PartidoGenerado | Partido;

const esPersistido = (p: PartidoLike): p is Partido => Boolean((p as Partido).id);

/** Normaliza un partido generado o persistido a un `Partido` "virtual" estable. */
function aVirtual(p: PartidoLike): Partido {
  if (esPersistido(p)) return p;
  const g = p as PartidoGenerado;
  return {
    id: '',
    categoria_id: '',
    zona_id: null,
    zona_nombre: g.zona_nombre,
    ronda: g.ronda,
    orden_fixture: g.orden_fixture,
    fase: g.fase,
    pareja_1_id: g.pareja_1_id,
    pareja_2_id: g.pareja_2_id,
    set1_p1: null,
    set1_p2: null,
    set2_p1: null,
    set2_p2: null,
    set3_p1: null,
    set3_p2: null,
    ganador_id: null,
    cancha_id: null,
    horario: null,
    resultado_nota: null,
    created_at: '',
    updated_at: '',
  };
}

/**
 * Agrupa los partidos del eliminatorio en rondas ordenadas.
 *
 * @param partidos  Partidos con `fase !== 'zona'`.
 * @returns Rondas de la primera a la ultima, cada una con sus partidos en orden
 *          de `orden_fixture`, y el campeon si la final ya se resolvio.
 *
 * @example
 *   const { rondas } = construirBracket(partidosPlayoff);
 *   rondas[0].fase // 'cuartos'
 */
export function construirBracket(partidos: readonly PartidoLike[]): Bracket {
  const limpio = partidos
    .filter((p) => p.fase !== 'zona')
    .map(aVirtual);

  if (limpio.length === 0) return { rondas: [], campeon: null };

  // 1. Agrupar por ronda (las zonas no tienen ronda asignada en el eliminatorio).
  const porRonda = new Map<number, Partido[]>();
  for (const p of limpio) {
    const r = p.ronda ?? 1;
    if (!porRonda.has(r)) porRonda.set(r, []);
    porRonda.get(r)!.push(p);
  }

  const numerosRonda = [...porRonda.keys()].sort((a, b) => a - b);
  const totalRondas = numerosRonda.length;

  // 2. Armar las columnas del bracket.
  const rondas: RondaBracket[] = numerosRonda.map((ronda) => {
    const partidos = (porRonda.get(ronda) ?? []).sort(
      (a, b) => (a.orden_fixture ?? 0) - (b.orden_fixture ?? 0),
    );

    return {
      ronda,
      fase: partidos[0]?.fase ?? 'final',
      partidos: partidos.map((partido, indice) => ({
        partido,
        indice,
        alimentadoPor: ronda === 1 ? 0 : 2,
        rondasRestantes: totalRondas - ronda,
        esBye: partido.pareja_1_id == null || partido.pareja_2_id == null,
        hayGanador: ganadorDe(partido) != null,
      })),
    };
  });

  // 3. Campeon: el ganador de la ultima ronda.
  const ultima = rondas[rondas.length - 1];
  const partidoFinal = ultima?.partidos[0]?.partido;
  const campeon = partidoFinal ? ganadorDe(partidoFinal) : null;

  return { rondas, campeon };
}

/**
 * Emparejamientos teoricos de una ronda siguiente.
 * El partido (r+1, orden k) recibe a los ganadores de (r, 2k-1) y (r, 2k).
 *
 * @returns mapa `id del partido destino -> [ids de los partidos origen]`.
 *          Se usa en la UI para dibujar las lineas del bracket.
 */
export function slotsOrigen(
  rondaSiguiente: readonly PartidoBracket[],
  rondaActual: readonly PartidoBracket[],
): Map<string, string[]> {
  const origen = new Map<string, string[]>();

  for (const slot of rondaSiguiente) {
    const destino = 2 * slot.indice; // 0-indexado
    const fuentes = [rondaActual[destino]?.partido.id, rondaActual[destino + 1]?.partido.id].filter(
      (id): id is string => Boolean(id),
    );
    origen.set(slot.partido.id, fuentes);
  }

  return origen;
}

/**
 * Progreso del torneo en una categoria, para los badges del header.
 * @returns fases completadas / total.
 */
export function progresoEliminatorio(partidos: readonly PartidoLike[]): {
  faseActual: Fase | null;
  jugados: number;
  total: number;
  completo: boolean;
} {
  const bracket = construirBracket(partidos);
  const todos = bracket.rondas.flatMap((r) => r.partidos.map((p) => p.partido));
  // Los BYEs no se juegan: no cuentan como pendientes.
  const jugables = todos.filter((p) => p.pareja_1_id && p.pareja_2_id);
  const jugados = jugables.filter((p) => ganadorDe(p) != null).length;

  const pendiente = bracket.rondas.find((r) =>
    r.partidos.some((p) => p.partido.pareja_1_id && p.partido.pareja_2_id && ganadorDe(p.partido) == null),
  );

  return {
    faseActual: pendiente?.fase ?? null,
    jugados,
    total: jugables.length,
    completo: jugables.length > 0 && jugados === jugables.length,
  };
}

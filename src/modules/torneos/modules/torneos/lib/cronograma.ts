/**
 * Cronograma: deteccion de conflictos y construccion de la grilla por cancha.
 *
 * Tres invariantes que el modulo garantiza antes de dar por buena una agenda:
 *   1. Una cancha no puede tener dos partidos simultaneos.
 *   2. Una pareja no puede jugar dos partidos a la vez (ni en canchas distintas).
 *   3. Una misma pareja debe tener al menos `descanso_min_entre_partidos` entre
 *      partido y partido.
 * Ademas se valida que el slot caiga dentro del horario y los dias habilitados
 * del torneo.
 *
 * Todas las funciones son puras: reciben los partidos ya con `cancha_id` y
 * `horario` resueltos y devuelven informacion. La UI usa los conflictos para
 * bloquear el guardado y para pintar de rojo las tarjetas.
 */

import type {
  Cancha,
  Conflicto,
  Pareja,
  PartidoAgenda,
  SlotHorario,
  Torneo,
} from '../types';

/** Minutos de juego por defecto (padel: 1 set + changeover). */
export const DURACION_PARTIDO_MIN = 75;

/* -------------------------------------------------------------------------- */
/* Helpers de tiempo                                                            */
/* -------------------------------------------------------------------------- */

export function sumarMinutos(fecha: Date, n: number): Date {
  return new Date(fecha.getTime() + n * 60_000);
}

/** Minutos transcurridos entre dos instantes, redondeados. */
export function duracionMinutos(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 60_000);
}

/** Dia de la semana en la convencion de la base: 1 = lunes ... 7 = domingo. */
export function diaSemana(fecha: Date): number {
  return fecha.getDay() === 0 ? 7 : fecha.getDay();
}

/** true si los intervalos [iniA, finA) y [iniB, finB) se pisan. */
export function seSolapan(iniA: Date, finA: Date, iniB: Date, finB: Date): boolean {
  return iniA.getTime() < finB.getTime() && iniB.getTime() < finA.getTime();
}

/** "14:30" -> 870 */
export function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* -------------------------------------------------------------------------- */
/* Normalizacion de partidos con horario                                        */
/* -------------------------------------------------------------------------- */

export interface IntervaloPartido {
  partido: PartidoAgenda;
  inicio: Date;
  fin: Date;
}

/** Calcula `inicio`/`fin` de cada partido agendado y los ordena por hora. */
export function aIntervalos(
  partidos: readonly PartidoAgenda[],
  duracionMin: number = DURACION_PARTIDO_MIN,
): IntervaloPartido[] {
  return partidos
    .filter((p) => p.horario != null)
    .map((p) => {
      const inicio = p.inicio ?? new Date(p.horario as string);
      const fin = p.fin ?? sumarMinutos(inicio, duracionMin);
      return { partido: p, inicio, fin };
    })
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

/** Ids de las parejas que comparten al menos un jugador entre dos partidos. */
export function parejasCompartidas(a: PartidoAgenda, b: PartidoAgenda): string[] {
  const idsA = [a.pareja_1_id, a.pareja_2_id].filter((x): x is string => Boolean(x));
  const idsB = [b.pareja_1_id, b.pareja_2_id].filter((x): x is string => Boolean(x));
  return idsA.filter((id) => idsB.includes(id));
}

/* -------------------------------------------------------------------------- */
/* Deteccion de conflictos                                                     */
/* -------------------------------------------------------------------------- */

export interface OpcionesValidacion {
  /** Duracion de cada partido en minutos (default 75). */
  duracionMin?: number;
  /** Descanso minimo entre partidos de una misma pareja (default 30). */
  descansoMin?: number;
  /** Horario y dias jugables del torneo. Si se omite, no se validan. */
  torneo?: Pick<Torneo, 'hora_inicio' | 'hora_fin' | 'dias_juego'> | null;
}

/**
 * Devuelve todos los conflictos de la agenda, los `error` primero.
 * Los errores bloquean el guardado; las advertencias solo avisan.
 *
 * @param partidos  Partidos con `cancha_id`, `horario`, `inicio` y `fin`.
 * @param parejas   Solo para poder nombrar a los jugadores en el mensaje.
 *
 * @example
 *   const conflictos = validarCronograma(agenda, { descansoMin: 30 });
 *   if (conflictos.some(c => c.severidad === 'error')) { /* no guardar *\/ }
 */
export function validarCronograma(
  partidos: readonly PartidoAgenda[],
  opciones: OpcionesValidacion = {},
  parejas: readonly Pareja[] = [],
): Conflicto[] {
  const {
    duracionMin = DURACION_PARTIDO_MIN,
    descansoMin = 30,
    torneo = null,
  } = opciones;

  const conflictos: Conflicto[] = [];
  const intervalos = aIntervalos(partidos, duracionMin);

  const nombreDe = (id: string | null): string => {
    if (!id) return 'Pareja desconocida';
    const p = parejas.find((x) => x.id === id);
    return p ? `${p.j1_nombre} / ${p.j2_nombre}` : 'Pareja desconocida';
  };

  for (let i = 0; i < intervalos.length; i++) {
    const a = intervalos[i];

    for (let j = i + 1; j < intervalos.length; j++) {
      const b = intervalos[j];
      const solapan = seSolapan(a.inicio, a.fin, b.inicio, b.fin);
      const compartidas = parejasCompartidas(a.partido, b.partido);

      // 1. Misma cancha ocupada dos veces a la vez.
      if (
        solapan &&
        a.partido.cancha_id &&
        a.partido.cancha_id === b.partido.cancha_id
      ) {
        conflictos.push({
          tipo: 'cancha_superpuesta',
          severidad: 'error',
          partidoIds: [a.partido.id, b.partido.id],
          mensaje:
            `Doble reserva en la misma cancha entre las ${formatearHora(a.inicio)} ` +
            `y las ${formatearHora(b.inicio)}.`,
        });
      }

      // 2. Una pareja no puede jugar dos partidos a la vez.
      if (solapan && compartidas.length > 0) {
        for (const parejaId of compartidas) {
          conflictos.push({
            tipo: 'pareja_doble',
            severidad: 'error',
            partidoIds: [a.partido.id, b.partido.id],
            mensaje: `${nombreDe(parejaId)} no puede jugar dos partidos a la vez.`,
          });
        }
      }

      // 3. Descanso insuficiente entre dos partidos de la misma pareja.
      if (!solapan && compartidas.length > 0 && a.fin <= b.inicio) {
        const hueco = duracionMinutos(a.fin, b.inicio);
        if (hueco < descansoMin) {
          for (const parejaId of compartidas) {
            conflictos.push({
              tipo: 'descanso_insuficiente',
              severidad: 'error',
              partidoIds: [a.partido.id, b.partido.id],
              mensaje:
                `${nombreDe(parejaId)} tiene solo ${hueco} min de descanso entre las ` +
                `${formatearHora(a.inicio)} y las ${formatearHora(b.inicio)} ` +
                `(minimo ${descansoMin}).`,
            });
          }
        }
      }
    }

    // 4. Slot fuera del horario o del dia configurado en el torneo.
    if (!torneo) continue;

    const inicioMin = a.inicio.getHours() * 60 + a.inicio.getMinutes();
    const finMin = inicioMin + duracionMin;

    if (!torneo.dias_juego.includes(diaSemana(a.inicio))) {
      conflictos.push({
        tipo: 'dia_no_jugable',
        severidad: 'advertencia',
        partidoIds: [a.partido.id, a.partido.id],
        mensaje: `${a.inicio.toLocaleDateString('es-AR')} no es un dia de juego del torneo.`,
      });
    }

    if (inicioMin < minutosDeHora(torneo.hora_inicio) || finMin > minutosDeHora(torneo.hora_fin)) {
      conflictos.push({
        tipo: 'fuera_de_horario',
        severidad: 'advertencia',
        partidoIds: [a.partido.id, a.partido.id],
        mensaje:
          `El partido de las ${formatearHora(a.inicio)} cae fuera del horario del torneo ` +
          `(${torneo.hora_inicio} a ${torneo.hora_fin}).`,
      });
    }
  }

  // Errores primero, luego advertencias.
  return conflictos.sort((x, y) =>
    x.severidad === y.severidad ? 0 : x.severidad === 'error' ? -1 : 1,
  );
}

/* -------------------------------------------------------------------------- */
/* Generacion de slots libres                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Arma la grilla de slots posibles: canchas activas x dias x franjas.
 *
 * @param fechas  Dias concretos (YYYY-MM-DD). Si se omite, se usa el rango
 *                fecha_inicio..fecha_fin del torneo.
 */
export function generarSlots(
  torneo: Pick<
    Torneo,
    'fecha_inicio' | 'fecha_fin' | 'dias_juego' | 'hora_inicio' | 'hora_fin' | 'duracion_partido_min'
  >,
  canchas: readonly Cancha[],
  fechas?: readonly string[],
): SlotHorario[] {
  const duracion = torneo.duracion_partido_min || DURACION_PARTIDO_MIN;
  const desdeMin = minutosDeHora(torneo.hora_inicio);
  const hastaMin = minutosDeHora(torneo.hora_fin);

  const dias = fechas?.length
    ? [...fechas]
    : diasDelRango(torneo.fecha_inicio, torneo.fecha_fin, torneo.dias_juego);

  const slots: SlotHorario[] = [];

  for (const fecha of dias) {
    const base = new Date(`${fecha}T00:00:00`);
    if (Number.isNaN(base.getTime())) continue;
    if (!torneo.dias_juego.includes(diaSemana(base))) continue;

    for (const cancha of canchas) {
      if (!cancha.activa) continue;
      for (let m = desdeMin; m + duracion <= hastaMin; m += duracion) {
        const inicio = new Date(base);
        inicio.setHours(Math.floor(m / 60), m % 60, 0, 0);
        slots.push({ cancha_id: cancha.id, inicio, fin: sumarMinutos(inicio, duracion) });
      }
    }
  }

  return slots;
}

/** Lista de dias jugables (YYYY-MM-DD) dentro del rango, con tope de 400 dias. */
export function diasDelRango(
  desde: string,
  hasta: string,
  diasHabiles: readonly number[],
): string[] {
  const out: string[] = [];
  const actual = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(actual.getTime()) || Number.isNaN(fin.getTime())) return out;

  for (let guard = 0; guard < 400 && actual <= fin; guard++) {
    if (diasHabiles.includes(diaSemana(actual))) out.push(actual.toISOString().slice(0, 10));
    actual.setDate(actual.getDate() + 1);
  }

  return out;
}

/**
 * Primer slot libre para un partido, respetando ocupacion de cancha, doble
 * booking de la pareja y descanso minimo.
 *
 * @param slot      Slot a probar.
 * @param parejaIds Parejas que van a jugar ese partido.
 * @param partidos  Partidos ya agendados (se ignoran los del propio partido).
 *
 * @returns El slot si esta libre, o `null`.
 */
export function buscarSlotLibre(
  slot: SlotHorario,
  parejaIds: readonly string[],
  partidos: readonly PartidoAgenda[],
  opciones: { descansoMin?: number; duracionMin?: number } = {},
): SlotHorario | null {
  const { descansoMin = 30, duracionMin = DURACION_PARTIDO_MIN } = opciones;
  const otros = partidos.filter((p) => p.id && p.horario != null);

  // 1. La cancha tiene que estar libre.
  const ocupadoEnCancha = otros.filter(
    (p) =>
      p.cancha_id === slot.cancha_id &&
      seSolapan(
        slot.inicio,
        slot.fin,
        p.inicio ?? new Date(p.horario as string),
        p.fin ?? sumarMinutos(p.inicio ?? new Date(p.horario as string), duracionMin),
      ),
  );
  if (ocupadoEnCancha.length > 0) return null;

  // 2. Ninguna de las parejas puede estar jugando.
  for (const p of otros) {
    const comparten = parejaIds.some((id) => [p.pareja_1_id, p.pareja_2_id].includes(id));
    if (!comparten) continue;

    const inicio = p.inicio ?? new Date(p.horario as string);
    const fin = p.fin ?? sumarMinutos(inicio, duracionMin);

    if (seSolapan(slot.inicio, slot.fin, inicio, fin)) return null;

    // Descanso: si el partido agendado termina antes que el slot, el hueco es
    // slot.inicio - fin; si el slot es anterior, el hueco es inicio - slot.fin.
    const hueco =
      fin <= slot.inicio
        ? duracionMinutos(fin, slot.inicio)
        : duracionMinutos(slot.fin, inicio);

    if (hueco >= 0 && hueco < descansoMin) return null;
  }

  return slot;
}

/* -------------------------------------------------------------------------- */
/* Grilla visual (timeline por cancha)                                         */
/* -------------------------------------------------------------------------- */

export interface CeldaGrilla {
  partido: PartidoAgenda;
  inicio: Date;
  fin: Date;
  /** Minutos desde las 00:00 del dia, para calcular el desplazamiento visual. */
  offsetMin: number;
  duracionMin: number;
}

export interface ColumnaCancha {
  cancha: Cancha;
  celdas: CeldaGrilla[];
  total: number;
}

/**
 * Arma la grilla del cronograma agrupada por cancha y ordenada por hora.
 * Las canchas sin partidos tambien se devuelven, para mostrarlas vacias.
 */
export function construirGrilla(
  partidos: readonly PartidoAgenda[],
  canchas: readonly Cancha[],
  duracionMin: number = DURACION_PARTIDO_MIN,
): ColumnaCancha[] {
  const porCancha = new Map<string, CeldaGrilla[]>();

  for (const p of partidos) {
    if (!p.horario || !p.cancha_id) continue;
    const inicio = p.inicio ?? new Date(p.horario);
    const fin = p.fin ?? sumarMinutos(inicio, duracionMin);
    if (!porCancha.has(p.cancha_id)) porCancha.set(p.cancha_id, []);
    porCancha.get(p.cancha_id)!.push({
      partido: p,
      inicio,
      fin,
      offsetMin: inicio.getHours() * 60 + inicio.getMinutes(),
      duracionMin: duracionMinutos(inicio, fin),
    });
  }

  return canchas.map((cancha) => {
    const celdas = (porCancha.get(cancha.id) ?? []).sort(
      (a, b) => a.inicio.getTime() - b.inicio.getTime(),
    );
    return { cancha, celdas, total: celdas.length };
  });
}

/**
 * Resumen rapido para los badges del header.
 *
 * Ojo con los argumentos: hay que pasar el TOTAL de partidos jugables y los
 * agendados por separado. Si se pasa la lista ya filtrada por `horario`,
 * `sinHorario` siempre da 0.
 *
 * @param partidosTotales    Partidos con las dos parejas definidas (con y sin turno).
 * @param partidosAgendados  Partidos que ya tienen `horario`.
 * @param conflictos         Salida de `validarCronograma`.
 */
export function resumenCronograma(
  partidosTotales: number,
  partidosAgendados: number,
  conflictos: readonly Conflicto[],
): {
  conHorario: number;
  sinHorario: number;
  errores: number;
  advertencias: number;
} {
  return {
    conHorario: partidosAgendados,
    sinHorario: Math.max(partidosTotales - partidosAgendados, 0),
    errores: conflictos.filter((c) => c.severidad === 'error').length,
    advertencias: conflictos.filter((c) => c.severidad === 'advertencia').length,
  };
}

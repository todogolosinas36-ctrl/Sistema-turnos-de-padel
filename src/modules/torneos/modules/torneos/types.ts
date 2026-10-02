/**
 * Tipos de dominio del modulo de Torneos.
 *
 * Son la contraparte TypeScript de las tablas `torneo_*`. Cada interfaz refleja
 * una fila de la base tal cual la devuelve PostgREST (snake_case, sin
 * transformaciones intermedias). Los algoritmos de `lib/` son puros y solo
 * necesitan los campos que declaran.
 */

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export type EstadoTorneo = 'borrador' | 'en_curso' | 'finalizado';

/** `sena` sin tilde por compatibilidad con el CHECK de la base. La UI muestra "Seña". */
export type EstadoPago = 'pendiente' | 'pagado' | 'sena';

/**
 * `dieciseisavos` es una extension del spec original: sin el, el cuadro no
 * podria representar torneos de mas de 8 zonas. Los 5 valores pedidos siguen
 * siendo validos.
 */
export type Fase = 'zona' | 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'final';

export const FASES: readonly Fase[] = [
  'zona',
  'dieciseisavos',
  'octavos',
  'cuartos',
  'semifinal',
  'final',
] as const;

/** Orden de avance de las fases eliminatorias (menor = antes). */
export const ORDEN_FASE: Record<Exclude<Fase, 'zona'>, number> = {
  dieciseisavos: 0,
  octavos: 1,
  cuartos: 2,
  semifinal: 3,
  final: 4,
};

/* -------------------------------------------------------------------------- */
/* Entidades                                                                   */
/* -------------------------------------------------------------------------- */

export interface Torneo {
  id: string;
  nombre: string;
  fecha_inicio: string; // YYYY-MM-DD
  fecha_fin: string; // YYYY-MM-DD
  estado: EstadoTorneo;
  dias_juego: number[]; // 1 = lunes ... 7 = domingo
  hora_inicio: string; // HH:MM
  hora_fin: string; // HH:MM
  duracion_partido_min: number;
  descanso_min_entre_partidos: number;
  allow_byes: boolean;
  notas: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TorneoCategoria {
  id: string;
  torneo_id: string;
  nombre: string;
  orden: number;
  precio_inscripcion: number; // numeric -> number
  semilla: number | null;
  maximo_parejas: number | null;
  created_at: string;
  updated_at: string;
}

export interface Pareja {
  id: string;
  categoria_id: string;
  j1_nombre: string;
  j1_telefono: string;
  j2_nombre: string;
  j2_telefono: string;
  estado_pago: EstadoPago;
  monto_abonado: number;
  restriccion_horaria: string | null;
  origen: 'web' | 'mostrador' | 'importacion';
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Zona {
  id: string;
  categoria_id: string;
  nombre: string;
  orden: number;
  created_at: string;
}

/** Zona + sus parejas. Es la entrada de `generarFixtureZonas`. */
export interface ZonaConParejas extends Zona {
  parejas: Pareja[];
}

export interface Partido {
  id: string;
  categoria_id: string;
  zona_id: string | null;
  /**
   * Nombre de la zona. NO existe en la tabla: lo agrega el repositorio con un
   * embed `torneo_zonas(nombre)` para que `calcularTablaPosiciones` pueda
   * devolver la columna `zona` sin un segundo round-trip.
   */
  zona_nombre?: string | null;
  ronda: number | null;
  orden_fixture: number;
  fase: Fase;
  pareja_1_id: string | null;
  pareja_2_id: string | null;
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  set3_p1: number | null;
  set3_p2: number | null;
  ganador_id: string | null;
  cancha_id: string | null;
  horario: string | null;
  resultado_nota: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cancha {
  id: string;
  nombre: string;
  tipo: 'padel' | 'tenis' | 'multi';
  superficie: 'cesped' | 'dura' | 'vidrio' | null;
  capacidad: number;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Salidas de los algoritmos                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Partido de dominio *antes* de persistir: sin `id` (lo asigna la base) y con
 * `zona_nombre` en lugar de `zona_id`, porque las zonas todavia no tienen id.
 * Es lo que consumen las funciones RPC `reemplazar_*`.
 */
export interface PartidoGenerado {
  zona_nombre: string | null;
  ronda: number;
  orden: number;
  orden_fixture: number;
  fase: Fase;
  pareja_1_id: string | null;
  pareja_2_id: string | null;
}

/** Zona recien sorteada, todavia sin id de base. */
export interface ZonaSorteada {
  nombre: string;
  orden: number;
  parejas: Pareja[];
}

/** Una fila de la tabla de posiciones. */
export interface TablaFila {
  posicion: number;
  clasificado: boolean;
  zona_id: string | null;
  zona: string | null;
  pareja: Pareja;
  pj: number;
  pg: number;
  pp: number;
  /** Sets ganados (a favor). */
  sa: number;
  /** Sets perdidos (en contra). */
  sc: number;
  difSets: number;
  /** Games ganados (a favor). */
  ga: number;
  /** Games perdidos (en contra). */
  gb: number;
  difGames: number;
  ratioSets: number;
  /** Partidos todavia sin resultado dentro de la zona. */
  pendientes: number;
}

/** Entrada de `generarPlayoffs`. */
export interface ClasificadoZona {
  zona: string;
  primero: Pareja;
  segundo: Pareja;
  /** Clasificados adicionales (3°, 4°, etc.) si la zona clasifica más de 2. */
  extras?: Pareja[];
}

/* -------------------------------------------------------------------------- */
/* Cronograma                                                                  */
/* -------------------------------------------------------------------------- */

export type TipoConflicto =
  | 'cancha_superpuesta'
  | 'pareja_doble'
  | 'descanso_insuficiente'
  | 'fuera_de_horario'
  | 'dia_no_jugable';

export interface Conflicto {
  tipo: TipoConflicto;
  severidad: 'error' | 'advertencia';
  partidoIds: [string, string];
  mensaje: string;
}

export interface SlotHorario {
  cancha_id: string;
  inicio: Date;
  fin: Date;
}

export interface PartidoAgenda extends Partido {
  pareja_1: Pareja | null;
  pareja_2: Pareja | null;
  cancha: Cancha | null;
  /** ISO local con offset, ya resuelto a los valores de la base. */
  inicio: Date | null;
  fin: Date | null;
}

/* -------------------------------------------------------------------------- */
/* Formularios                                                                 */
/* -------------------------------------------------------------------------- */

/** Payload de `InscripcionesTab` / `ParejaFormModal`. */
export interface ParejaInput {
  j1_nombre: string;
  j1_telefono: string;
  j2_nombre: string;
  j2_telefono: string;
  estado_pago: EstadoPago;
  monto_abonado: number;
  restriccion_horaria?: string | null;
  notas?: string | null;
}

/** Payload de `ScoreForm`. */
export interface ResultadoInput {
  set1_p1: number | null;
  set1_p2: number | null;
  set2_p1: number | null;
  set2_p2: number | null;
  set3_p1: number | null;
  set3_p2: number | null;
}

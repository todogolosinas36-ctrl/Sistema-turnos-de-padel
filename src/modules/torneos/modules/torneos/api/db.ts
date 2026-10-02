/**
 * Base de datos generica del modulo.
 *
 * Todo el acceso a Supabase pasa por acá: cada metodo devuelve un
 * `Resultado<T>` en vez de lanzar excepciones, para que los hooks puedan
 * manejar el estado asincrono sin try/catch en cada componente.
 *
 * Hay dos motivos para no usar `supabase.from('torneo_x')` directamente en los
 * componentes:
 *   1. El SQL vive en el esquema `torneo`, no en `public`. Centralizarlo permite
 *      reapuntar el modulo a otro esquema (o a tablas de tu sistema) tocando un
 *      solo archivo.
 *   2. Los nombres de columna snake_case se convierten a camelCase en un solo
 *      lugar, y los `numeric` de Postgres se castean a `number` (si no, un
 *      `monto_abonado: numeric` llega como string y rompe las sumas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as clientePorDefecto } from '../../../lib/supabase';
import type {
  Cancha,
  EstadoPago,
  EstadoTorneo,
  Fase,
  Pareja,
  ParejaInput,
  Partido,
  ResultadoInput,
  Torneo,
  TorneoCategoria,
  ZonaConParejas,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Resultado                                                                    */
/* -------------------------------------------------------------------------- */

export interface ErrorTorneo {
  mensaje: string;
  codigo?: string;
  detalle?: unknown;
}

export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorTorneo };

export const ok = <T,>(data: T): Resultado<T> => ({ ok: true, data });

export const fallo = <T,>(mensaje: string, codigo?: string, detalle?: unknown): Resultado<T> => ({
  ok: false,
  error: { mensaje, codigo, detalle },
});

/** Traduce los errores de PostgREST a algo mostrable. */
function desdeErrorPostgrest<T>(error: { message: string; code?: string; details?: string } | null): Resultado<T> {
  if (!error) return fallo<T>('Error desconocido de Supabase.');

  const codigo = error.code ?? '';
  let mensaje = error.message;

  // Traducciones de los errores que lanzan nuestras funciones de dominio.
  if (error.message.includes('Sin permisos')) {
    mensaje = 'No tenés permisos para modificar este torneo.';
  } else if (error.message.includes('No se puede generar el cuadro')) {
    mensaje = error.message; // ya es un mensaje de negocio claro
  } else if (codigo === '23505') {
    mensaje = 'Ya existe un registro con esos datos (nombre duplicado o pareja repetida).';
  } else if (codigo === '23503') {
    mensaje = 'No se pudo completar la operación: una referencia no existe o está en uso.';
  } else if (codigo === '23514' || codigo === 'P0001') {
    mensaje = error.message;
  } else if (codigo === '42501') {
    mensaje = 'No tenés permisos para realizar esta operación.';
  }

  return fallo<T>(mensaje, codigo, error.details);
}

/**
 * Envuelve una consulta de PostgREST.
 *
 * El builder de supabase-js devuelve tipos que dependen de la forma de la
 * tabla en tiempo de generacion de tipos; acao se castea a `T` para que cada
 * metodo declare su propia forma de fila.
 */
async function ejecutar<T>(operacion: PromiseLike<{ data: unknown; error: ErrorPostgrestLike | null }>): Promise<Resultado<T>> {
  try {
    const { data, error } = await operacion;
    if (error) return desdeErrorPostgrest<T>(error);
    return ok(data as T);
  } catch (e) {
    return fallo<T>(e instanceof Error ? e.message : 'Error de red.', 'network', e);
  }
}

/** Igual que `ejecutar`, pero devuelve `null` en lugar de fallar. */
async function ejecutarOpcional<T>(
  operacion: PromiseLike<{ data: unknown; error: ErrorPostgrestLike | null }>,
): Promise<Resultado<T | null>> {
  try {
    const { data, error } = await operacion;
    if (error) return desdeErrorPostgrest<T | null>(error);
    return ok((data as T) ?? null);
  } catch (e) {
    return fallo<T | null>(e instanceof Error ? e.message : 'Error de red.', 'network', e);
  }
}

type ErrorPostgrestLike = { message: string; code?: string; details?: string };

/** Resultado de una llamada RPC tipada. */
async function ejecutarRpc<T>(
  rpc: PromiseLike<{ data: unknown; error: ErrorPostgrestLike | null }>,
): Promise<Resultado<T>> {
  return ejecutar<T>(rpc);
}

/* -------------------------------------------------------------------------- */
/* Mapeo filas -> dominio                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Postgres devuelve los `numeric` como string para no perder precision.
 * Sin este casteo, `monto_abonado` seria "100.00" (string) y toda suma
 * concatenaria. Ademas `precio_inscripcion`.
 */
function num(valor: unknown, porDefecto = 0): number {
  if (valor === null || valor === undefined) return porDefecto;
  const n = Number(valor);
  return Number.isFinite(n) ? n : porDefecto;
}

export const aTorneo = (r: any): Torneo => ({
  ...r,
  dias_juego: Array.isArray(r.dias_juego) ? r.dias_juego.map(Number) : [],
  duracion_partido_min: num(r.duracion_partido_min, 75),
  descanso_min_entre_partidos: num(r.descanso_min_entre_partidos, 30),
  allow_byes: Boolean(r.allow_byes),
});

export const aCategoria = (r: any): TorneoCategoria => ({
  ...r,
  precio_inscripcion: num(r.precio_inscripcion),
  maximo_parejas: r.maximo_parejas == null ? null : num(r.maximo_parejas),
  semilla: r.semilla == null ? null : num(r.semilla),
});

export const aPareja = (r: any): Pareja => ({
  ...r,
  monto_abonado: num(r.monto_abonado),
  estado_pago: (r.estado_pago ?? 'pendiente') as EstadoPago,
});

export const aPartido = (r: any): Partido => ({
  ...r,
  ronda: r.ronda == null ? null : num(r.ronda),
  orden_fixture: num(r.orden_fixture),
  fase: r.fase as Fase,
});

export const aCancha = (r: any): Cancha => ({
  ...r,
  capacidad: num(r.capacidad, 4),
  activa: Boolean(r.activa),
});

/* -------------------------------------------------------------------------- */
/* Cliente parametrizable                                                      */
/* -------------------------------------------------------------------------- */

export interface DbOpciones {
  /** Esquema de Postgres donde viven las tablas `torneo_*`. */
  esquema?: string;
  /** Cliente a usar. Por defecto el singleton de `src/lib/supabase`. */
  cliente?: SupabaseClient;
}

/**
 * Fábrica de acceso a datos. Devuelve un objeto con los mismos metodos, para
 * poder inyectar un cliente falso en tests o un cliente con otro token.
 */

export function crearDb(opciones: DbOpciones = {}) {
  const esquema = opciones.esquema ?? 'torneo';
  const sb = opciones.cliente ?? clientePorDefecto;
  const t = (tabla: string) => sb.schema(esquema).from(tabla);

  /** Fila cruda tal como la devuelve PostgREST. */
  type Fila = Record<string, any>;

  return {
    esquema,
    cliente: sb,

    /* ==================================================================== */
    /* Torneos                                                              */
    /* ==================================================================== */

    async listarTorneos(filtros: { estado?: EstadoTorneo } = {}): Promise<Resultado<Torneo[]>> {
      let q = t('torneos').select('*').order('fecha_inicio', { ascending: false });
      if (filtros.estado) q = q.eq('estado', filtros.estado);
      const r = await ejecutar<Fila[]>(q);
      return r.ok ? ok((r.data ?? []).map(aTorneo)) : r;
    },

    async obtenerTorneo(id: string): Promise<Resultado<Torneo | null>> {
      const r = await ejecutarOpcional<Fila>(t('torneos').select('*').eq('id', id).maybeSingle());
      return r.ok ? ok(r.data ? aTorneo(r.data) : null) : r;
    },

    async crearTorneo(input: {
      nombre: string;
      fecha_inicio: string;
      fecha_fin: string;
      estado?: EstadoTorneo;
      dias_juego?: number[];
      hora_inicio?: string;
      hora_fin?: string;
      duracion_partido_min?: number;
      descanso_min_entre_partidos?: number;
      allow_byes?: boolean;
      notas?: string | null;
    }): Promise<Resultado<Torneo>> {
      const usuario = await sb.auth.getUser();
      const r = await ejecutar<Fila>(
        t('torneos')
          .insert({ ...input, created_by: usuario.data.user?.id ?? null })
          .select()
          .single(),
      );
      return r.ok ? ok(aTorneo(r.data)) : r;
    },

    async actualizarTorneo(id: string, cambios: Partial<Torneo>): Promise<Resultado<Torneo>> {
      const r = await ejecutar<Fila>(t('torneos').update(cambios).eq('id', id).select().single());
      return r.ok ? ok(aTorneo(r.data)) : r;
    },

    /* ==================================================================== */
    /* Categorias                                                           */
    /* ==================================================================== */

    async listarCategorias(torneoId: string): Promise<Resultado<TorneoCategoria[]>> {
      const r = await ejecutar<Fila[]>(
        t('torneo_categorias').select('*').eq('torneo_id', torneoId).order('orden'),
      );
      return r.ok ? ok((r.data ?? []).map(aCategoria)) : r;
    },

    async crearCategoria(input: {
      torneo_id: string;
      nombre: string;
      orden?: number;
      precio_inscripcion?: number;
      maximo_parejas?: number | null;
    }): Promise<Resultado<TorneoCategoria>> {
      const r = await ejecutar<Fila>(t('torneo_categorias').insert(input).select().single());
      return r.ok ? ok(aCategoria(r.data)) : r;
    },

    async actualizarCategoria(
      id: string,
      cambios: Partial<TorneoCategoria>,
    ): Promise<Resultado<TorneoCategoria>> {
      const r = await ejecutar<Fila>(t('torneo_categorias').update(cambios).eq('id', id).select().single());
      return r.ok ? ok(aCategoria(r.data)) : r;
    },

    async eliminarCategoria(id: string): Promise<Resultado<null>> {
      const r = await ejecutar<null>(t('torneo_categorias').delete().eq('id', id).select('id'));
      return r.ok ? ok(null) : r;
    },

    /* ==================================================================== */
    /* Parejas                                                              */
    /* ==================================================================== */

    async listarParejas(categoriaId: string): Promise<Resultado<Pareja[]>> {
      const r = await ejecutar<Fila[]>(
        t('torneo_parejas').select('*').eq('categoria_id', categoriaId).order('created_at'),
      );
      return r.ok ? ok((r.data ?? []).map(aPareja)) : r;
    },

    async crearPareja(categoriaId: string, input: ParejaInput): Promise<Resultado<Pareja>> {
      const r = await ejecutar<Fila>(
        t('torneo_parejas')
          .insert({
            categoria_id: categoriaId,
            j1_nombre: input.j1_nombre.trim(),
            j1_telefono: input.j1_telefono.trim(),
            j2_nombre: input.j2_nombre.trim(),
            j2_telefono: input.j2_telefono.trim(),
            estado_pago: input.estado_pago,
            monto_abonado: input.monto_abonado,
            restriccion_horaria: input.restriccion_horaria?.trim() || null,
            notas: input.notas?.trim() || null,
          })
          .select()
          .single(),
      );
      return r.ok ? ok(aPareja(r.data)) : r;
    },

    async actualizarPareja(id: string, cambios: Partial<ParejaInput>): Promise<Resultado<Pareja>> {
      const limpio: Record<string, unknown> = { ...cambios };
      if (typeof limpio.j1_nombre === 'string') limpio.j1_nombre = limpio.j1_nombre.trim();
      if (typeof limpio.j2_nombre === 'string') limpio.j2_nombre = limpio.j2_nombre.trim();
      if (typeof limpio.j1_telefono === 'string') limpio.j1_telefono = limpio.j1_telefono.trim();
      if (typeof limpio.j2_telefono === 'string') limpio.j2_telefono = limpio.j2_telefono.trim();
      if ('restriccion_horaria' in limpio) {
        limpio.restriccion_horaria = (cambios.restriccion_horaria ?? '').trim() || null;
      }
      if ('notas' in limpio) limpio.notas = (cambios.notas ?? '').trim() || null;

      const r = await ejecutar<Fila>(t('torneo_parejas').update(limpio).eq('id', id).select().single());
      return r.ok ? ok(aPareja(r.data)) : r;
    },

    /** Cambio rápido de estado de pago (el toggle de la tabla). */
    async cambiarEstadoPago(
      id: string,
      estado: EstadoPago,
      montoAbonado?: number,
    ): Promise<Resultado<Pareja>> {
      const cambios: Record<string, unknown> = { estado_pago: estado };
      if (montoAbonado !== undefined) cambios.monto_abonado = montoAbonado;
      const r = await ejecutar<Fila>(t('torneo_parejas').update(cambios).eq('id', id).select().single());
      return r.ok ? ok(aPareja(r.data)) : r;
    },

    async eliminarPareja(id: string): Promise<Resultado<null>> {
      const r = await ejecutar<null>(t('torneo_parejas').delete().eq('id', id).select('id'));
      return r.ok ? ok(null) : r;
    },

    /* ==================================================================== */
    /* Zonas y fixture de zonas                                              */
    /* ==================================================================== */

    async listarZonas(categoriaId: string): Promise<Resultado<ZonaConParejas[]>> {
      const zonasRes = await ejecutar<Fila[]>(
        t('torneo_zonas').select('*').eq('categoria_id', categoriaId).order('orden'),
      );
      if (!zonasRes.ok) return zonasRes;

      const zonas = zonasRes.data ?? [];
      if (zonas.length === 0) return ok([]);

      // Embed del reverse: trae la pareja completa en una sola consulta.
      const pzRes = await ejecutar<Fila[]>(
        t('torneo_parejas_zonas')
          .select('zona_id, pareja:torneo_parejas(*)')
          .in('zona_id', zonas.map((z) => z.id)),
      );
      if (!pzRes.ok) return pzRes;

      const porZona = new Map<string, Pareja[]>();
      for (const fila of pzRes.data ?? []) {
        const lista = porZona.get(fila.zona_id) ?? [];
        // El embed viene como objeto o como arreglo segun la relacion 1:N.
        const pareja: Fila | undefined = Array.isArray(fila.pareja) ? fila.pareja[0] : fila.pareja;
        if (pareja) lista.push(aPareja(pareja));
        porZona.set(fila.zona_id, lista);
      }

      return ok(
        zonas.map((z) => ({
          id: z.id,
          categoria_id: z.categoria_id ?? categoriaId,
          nombre: z.nombre,
          orden: num(z.orden),
          created_at: z.created_at ?? '',
          parejas: porZona.get(z.id) ?? [],
        })),
      );
    },

    async listarPartidos(categoriaId: string, filtroFase?: Fase): Promise<Resultado<Partido[]>> {
      let q = t('torneo_partidos')
        .select('*, zona:torneo_zonas(nombre)')
        .eq('categoria_id', categoriaId)
        .order('orden_fixture');
      if (filtroFase) q = q.eq('fase', filtroFase);

      const r = await ejecutar<Fila[]>(q);
      if (!r.ok) return r;

      // Aplana el embed de zona a `zona_nombre` para que los algoritmos puros
      // puedan devolver la columna `zona` sin un segundo round-trip.
      return ok(
        (r.data ?? []).map((fila) => {
          const zona = Array.isArray(fila.zona) ? fila.zona[0] : fila.zona;
          return aPartido({ ...fila, zona_id: fila.zona_id, zona_nombre: zona?.nombre ?? null });
        }),
      );
    },

    /** Salida de `generarZonas`: se persiste entera y en una transaccion. */
    async guardarZonas(
      categoriaId: string,
      zonas: { nombre: string; orden: number; parejas: { id: string }[] }[],
    ): Promise<Resultado<null>> {
      const payload = zonas.map((z) => ({
        nombre: z.nombre,
        orden: z.orden,
        parejas: z.parejas.map((p) => ({ id: p.id })),
      }));
      const r = await ejecutarRpc<null>(
        sb.schema(esquema).rpc('reemplazar_zonas' as any, { p_categoria_id: categoriaId, p_zonas: payload }),
      );
      return r.ok ? ok(null) : r;
    },

    /** Salida de `generarFixtureZonas`. */
    async guardarFixtureZonas(
      categoriaId: string,
      partidos: {
        zona_nombre: string | null;
        ronda: number;
        orden: number;
        pareja_1_id: string | null;
        pareja_2_id: string | null;
      }[],
    ): Promise<Resultado<number>> {
      const payload = partidos.map((p) => ({
        zona: p.zona_nombre,
        ronda: p.ronda,
        orden: p.orden,
        pareja_1_id: p.pareja_1_id,
        pareja_2_id: p.pareja_2_id,
      }));
      return ejecutarRpc<number>(
        sb.schema(esquema).rpc('reemplazar_fixture' as any, { p_categoria_id: categoriaId, p_partidos: payload }),
      );
    },

    /** Salida de `generarPlayoffs`: el bracket completo, con slots vacios. */
    async guardarPlayoffs(
      categoriaId: string,
      partidos: {
        ronda: number;
        orden: number;
        orden_fixture: number;
        fase: Fase;
        pareja_1_id: string | null;
        pareja_2_id: string | null;
      }[],
    ): Promise<Resultado<number>> {
      const payload = partidos.map((p) => ({
        fase: p.fase,
        ronda: p.ronda,
        orden: p.orden,
        orden_fixture: p.orden_fixture,
        // '' -> NULL en SQL: los slots vacios de las rondas futuras.
        pareja_1_id: p.pareja_1_id ?? '',
        pareja_2_id: p.pareja_2_id ?? '',
      }));
      return ejecutarRpc<number>(
        sb.schema(esquema).rpc('reemplazar_playoffs' as any, { p_categoria_id: categoriaId, p_partidos: payload }),
      );
    },

    /**
     * Carga un resultado. La RPC valida las reglas de padel, deriva el ganador
     * de los sets y (si es eliminatorio) lo propaga a la ronda siguiente.
     */
    async registrarResultado(
      partidoId: string,
      resultado: ResultadoInput,
    ): Promise<Resultado<string | null>> {
      return ejecutarRpc<string | null>(
        sb.schema(esquema).rpc('registrar_resultado' as any, {
          p_partido_id: partidoId,
          p_set1_p1: resultado.set1_p1,
          p_set1_p2: resultado.set1_p2,
          p_set2_p1: resultado.set2_p1,
          p_set2_p2: resultado.set2_p2,
          p_set3_p1: resultado.set3_p1,
          p_set3_p2: resultado.set3_p2,
        }),
      );
    },

    /** Re-lanza el avance de ganadores (util si se editaron partidos a mano). */
    async avanzarGanadores(categoriaId: string): Promise<Resultado<number>> {
      return ejecutarRpc<number>(sb.schema(esquema).rpc('avanzar_ganadores' as any, { p_categoria_id: categoriaId }));
    },

    /**
     * Asignacion masiva de cancha + horario.
     *
     * El upsert usa `id` (la PK) y no `partido_id`: el objeto de entrada se
     * mapea porque `partido_id` no es una columna de la tabla y el INSERT
     * fallaría en runtime.
     */
    async guardarAgenda(
      asignaciones: { partido_id: string; cancha_id: string | null; horario: string | null }[],
    ): Promise<Resultado<null>> {
      if (asignaciones.length === 0) return ok(null);
      const filas = asignaciones.map((a) => ({
        id: a.partido_id,
        cancha_id: a.cancha_id,
        horario: a.horario,
      }));
      const r = await ejecutar<Fila[]>(t('torneo_partidos').upsert(filas, { onConflict: 'id' }));
      return r.ok ? ok(null) : r;
    },

    /* ==================================================================== */
    /* Canchas                                                              */
    /* ==================================================================== */

    async listarCanchas(soloActivas = true): Promise<Resultado<Cancha[]>> {
      let q = t('canchas').select('*').order('nombre');
      if (soloActivas) q = q.eq('activa', true);
      const r = await ejecutar<Fila[]>(q);
      return r.ok ? ok((r.data ?? []).map(aCancha)) : r;
    },

    async crearCancha(input: {
      nombre: string;
      tipo?: string;
      superficie?: string | null;
    }): Promise<Resultado<Cancha>> {
      const r = await ejecutar<Fila>(t('canchas').insert(input).select().single());
      return r.ok ? ok(aCancha(r.data)) : r;
    },

    /* ==================================================================== */
    /* Organizadores (base de las politicas RLS)                            */
    /* ==================================================================== */

    async agregarOrganizador(
      torneoId: string,
      userId: string,
      rol = 'organizador',
    ): Promise<Resultado<null>> {
      const r = await ejecutar<null>(t('torneo_organizadores').insert({ torneo_id: torneoId, user_id: userId, rol }));
      return r.ok ? ok(null) : r;
    },

    async soyOrganizador(torneoId: string): Promise<boolean> {
      const { data } = await t('torneo_organizadores').select('rol').eq('torneo_id', torneoId).limit(1);
      return Boolean(data && data.length > 0);
    },
  };
}

/** Instancia por defecto, usada por los hooks. */
export type DbTorneos = ReturnType<typeof crearDb>;
export const db: DbTorneos = crearDb();

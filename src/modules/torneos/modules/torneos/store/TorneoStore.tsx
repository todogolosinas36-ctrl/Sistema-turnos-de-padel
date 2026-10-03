/**
 * Estado compartido del modulo de Torneos.
 *
 * Un unico provider con reducer: las pestanas (Inscripciones, Zonas, Cuadro,
 * Cronograma) leen del mismo lugar, asi que cargar un resultado en Zonas
 * actualiza de inmediato el Cuadro y el Cronograma sin prop drilling.
 *
 * Decisiones:
 *  - Las acciones devuelven `Resultado<T>` en vez de lanzar, para que cada
 *    componente maneje el error sin try/catch.
 *  - Las mutaciones optimistas hacen rollback si la base rechaza el cambio.
 *  - Los efectos descartan respuestas de peticiones ya canceladas (evita el
 *    clasico "setState after unmount" al cambiar de categoria rapido).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { db, type DbTorneos, type Resultado } from '../api/db';
import type {
  Cancha,
  EstadoPago,
  EstadoTorneo,
  Pareja,
  ParejaInput,
  Partido,
  PartidoAgenda,
  ResultadoInput,
  TablaFila,
  ClasificadoZona,
  Torneo,
  TorneoCategoria,
  ZonaConParejas,
} from '../types';
import {
  calcularTablaPosiciones,
  extraerClasificados,
  generarFixtureZonas,
  generarPlayoffs,
  generarZonas,
  validarResultado,
  type ResultadoSorteo,
} from '../lib';

/* -------------------------------------------------------------------------- */
/* Estado                                                                      */
/* -------------------------------------------------------------------------- */

export type TabActiva = 'inscripciones' | 'zonas' | 'cuadro' | 'cronograma';

export const TABS: { id: TabActiva; etiqueta: string }[] = [
  { id: 'inscripciones', etiqueta: 'Inscripciones' },
  { id: 'zonas', etiqueta: 'Zonas' },
  { id: 'cuadro', etiqueta: 'Cuadro' },
  { id: 'cronograma', etiqueta: 'Cronograma' },
];

export interface EstadoModulo {
  torneos: Torneo[];
  torneo: Torneo | null;
  categorias: TorneoCategoria[];
  categoria: TorneoCategoria | null;
  parejas: Pareja[];
  zonas: ZonaConParejas[];
  partidosZona: Partido[];
  partidosPlayoff: Partido[];
  canchas: Cancha[];
  tab: TabActiva;
  cargando: boolean;
  guardando: boolean;
  error: string | null;
  aviso: string | null;
}

type Accion =
  | { tipo: 'torneos/cargados'; torneos: Torneo[] }
  | { tipo: 'torneo/seleccionado'; torneo: Torneo | null }
  | { tipo: 'categorias/cargadas'; categorias: TorneoCategoria[] }
  | { tipo: 'categoria/seleccionada'; categoria: TorneoCategoria | null }
  | { tipo: 'parejas/cargadas'; parejas: Pareja[] }
  | { tipo: 'zonas/cargadas'; zonas: ZonaConParejas[] }
  | { tipo: 'partidos/cargados'; zona: Partido[]; playoff: Partido[] }
  | { tipo: 'canchas/cargadas'; canchas: Cancha[] }
  | { tipo: 'tab'; tab: TabActiva }
  | { tipo: 'cargando'; cargando: boolean }
  | { tipo: 'guardando'; guardando: boolean }
  | { tipo: 'error'; error: string | null }
  | { tipo: 'aviso'; aviso: string | null };

const estadoInicial: EstadoModulo = {
  torneos: [],
  torneo: null,
  categorias: [],
  categoria: null,
  parejas: [],
  zonas: [],
  partidosZona: [],
  partidosPlayoff: [],
  canchas: [],
  tab: 'inscripciones',
  cargando: false,
  guardando: false,
  error: null,
  aviso: null,
};

function reducer(estado: EstadoModulo, accion: Accion): EstadoModulo {
  switch (accion.tipo) {
    case 'torneos/cargados':
      return { ...estado, torneos: accion.torneos };
    case 'torneo/seleccionado':
      // Cambiar de torneo invalida todo lo que depende de el.
      return {
        ...estado,
        torneo: accion.torneo,
        categorias: [],
        categoria: null,
        parejas: [],
        zonas: [],
        partidosZona: [],
        partidosPlayoff: [],
        tab: 'inscripciones',
      };
    case 'categorias/cargadas':
      return { ...estado, categorias: accion.categorias };
    case 'categoria/seleccionada':
      return {
        ...estado,
        categoria: accion.categoria,
        parejas: [],
        zonas: [],
        partidosZona: [],
        partidosPlayoff: [],
      };
    case 'parejas/cargadas':
      return { ...estado, parejas: accion.parejas };
    case 'zonas/cargadas':
      return { ...estado, zonas: accion.zonas };
    case 'partidos/cargados':
      return { ...estado, partidosZona: accion.zona, partidosPlayoff: accion.playoff };
    case 'canchas/cargadas':
      return { ...estado, canchas: accion.canchas };
    case 'tab':
      return { ...estado, tab: accion.tab };
    case 'cargando':
      return { ...estado, cargando: accion.cargando };
    case 'guardando':
      return { ...estado, guardando: accion.guardando };
    case 'error':
      return { ...estado, error: accion.error };
    case 'aviso':
      return { ...estado, aviso: accion.aviso };
    default:
      return estado;
  }
}

/* -------------------------------------------------------------------------- */
/* Contexto                                                                    */
/* -------------------------------------------------------------------------- */

export interface AccionesTorneo {
  refrescarTorneos: () => Promise<void>;
  seleccionarTorneo: (id: string | null) => Promise<void>;
  crearTorneo: (input: Parameters<DbTorneos['crearTorneo']>[0]) => Promise<Resultado<Torneo>>;
  cambiarEstadoTorneo: (estado: EstadoTorneo) => Promise<Resultado<Torneo>>;

  seleccionarCategoria: (id: string | null) => void;
  refrescarCategoria: () => Promise<void>;
  crearCategoria: (nombre: string, precio: number) => Promise<Resultado<TorneoCategoria>>;

  crearPareja: (input: ParejaInput) => Promise<Resultado<Pareja>>;
  actualizarPareja: (id: string, cambios: Partial<ParejaInput>) => Promise<Resultado<Pareja>>;
  cambiarEstadoPago: (id: string, estado: EstadoPago, monto?: number) => Promise<Resultado<Pareja>>;
  eliminarPareja: (id: string) => Promise<Resultado<null>>;

  /** Sorteo + fixture de zonas, en dos pasos atomicos. */
  sortearZonas: () => Promise<Resultado<ResultadoSorteo>>;
  generarFixtureZonas: () => Promise<Resultado<number>>;
  /** @param clasificadosPorZona  Mapa zona_id -> cuántos clasifican (default 2). */
  generarCuadroPlayoffs: (clasificadosPorZona?: Map<string, number>) => Promise<Resultado<number>>;

  registrarResultado: (partidoId: string, resultado: ResultadoInput) => Promise<Resultado<string | null>>;
  guardarAgenda: (
    asignaciones: { partido_id: string; cancha_id: string | null; horario: string | null }[],
  ) => Promise<Resultado<null>>;

  setTab: (tab: TabActiva) => void;
  setAviso: (aviso: string | null) => void;
  limpiarError: () => void;
}

export interface ContextoTorneo extends EstadoModulo {
  acciones: AccionesTorneo;
  /** Tablas de posiciones de la categoria activa, ya calculadas. */
  tablas: TablaFila[];
  /** 1° y 2° de cada zona, listos para el cruce. */
  clasificados: ClasificadoZona[];
  /** Partidos de zona agrupados por `zona_id`. */
  partidosPorZona: Map<string, Partido[]>;
  /** Partidos con horario, resueltos a nombres de pareja y cancha. */
  agenda: PartidoAgenda[];
  /** Partidos que todavia no tienen ni cancha ni horario. */
  sinAgendar: Partido[];
  refrescar: () => Promise<void>;
}

const TorneoCtx = createContext<ContextoTorneo | null>(null);

/* -------------------------------------------------------------------------- */
/* Provider                                                                    */
/* -------------------------------------------------------------------------- */

export interface TorneoProviderProps {
  children: ReactNode;
  /** Inyectable para tests o para usar un cliente con otro token. */
  db?: DbTorneos;
  /** Torneo inicial (deep link `?torneo=<uuid>`). */
  torneoInicialId?: string | null;
}

export function TorneoProvider({ children, db: dbInyectado, torneoInicialId = null }: TorneoProviderProps) {
  const [estado, dispatch] = useReducer(reducer, estadoInicial);
  const store = useMemo(() => dbInyectado ?? db, [dbInyectado]);

  // Marca de la categoria en curso: descarta respuestas tardias.
  const categoriaEnCurso = useRef<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const setTab = useCallback((tab: TabActiva) => dispatch({ tipo: 'tab', tab }), []);
  const setAviso = useCallback((aviso: string | null) => dispatch({ tipo: 'aviso', aviso }), []);
  const limpiarError = useCallback(() => dispatch({ tipo: 'error', error: null }), []);

  /** Si el Resultado es fallido, lo publica en el estado. Devuelve true si fallo. */
  const propagarError = useCallback(<T,>(r: Resultado<T>): boolean => {
    if (r.ok) {
      dispatch({ tipo: 'error', error: null });
      return false;
    }
    dispatch({ tipo: 'error', error: r.error.mensaje });
    return true;
  }, []);

  /* ------------------------------------------------------------------ */
  /* Cargas                                                              */
  /* ------------------------------------------------------------------ */

  const refrescarTorneos = useCallback(async () => {
    dispatch({ tipo: 'cargando', cargando: true });
    const r = await store.listarTorneos();
    if (!montado.current) return;

    if (r.ok) dispatch({ tipo: 'torneos/cargados', torneos: r.data });
    else dispatch({ tipo: 'error', error: r.error.mensaje });
    dispatch({ tipo: 'cargando', cargando: false });
  }, [store]);

  const refrescarCategoria = useCallback(async () => {
    const categoria = estado.categoria;
    if (!categoria) return;

    const marca = categoria.id;
    categoriaEnCurso.current = marca;
    dispatch({ tipo: 'cargando', cargando: true });

    const [parejas, zonas, partidos, canchas] = await Promise.all([
      store.listarParejas(marca),
      store.listarZonas(marca),
      store.listarPartidos(marca),
      store.listarCanchas(),
    ]);

    // La categoria cambio mientras esperaba: se descarta todo.
    if (!montado.current || categoriaEnCurso.current !== marca) return;

    if (parejas.ok) dispatch({ tipo: 'parejas/cargadas', parejas: parejas.data });
    if (zonas.ok) dispatch({ tipo: 'zonas/cargadas', zonas: zonas.data });
    if (partidos.ok) {
      dispatch({
        tipo: 'partidos/cargados',
        zona: partidos.data.filter((p) => p.fase === 'zona'),
        playoff: partidos.data.filter((p) => p.fase !== 'zona'),
      });
    }
    if (canchas.ok) dispatch({ tipo: 'canchas/cargadas', canchas: canchas.data });

    const fallido = [parejas, zonas, partidos, canchas].find((x) => !x.ok);
    dispatch({ tipo: 'error', error: fallido && !fallido.ok ? fallido.error.mensaje : null });
    dispatch({ tipo: 'cargando', cargando: false });
  }, [estado.categoria, store]);

  const seleccionarTorneo = useCallback(
    async (id: string | null) => {
      if (!id) {
        dispatch({ tipo: 'torneo/seleccionado', torneo: null });
        return;
      }

      categoriaEnCurso.current = null;
      dispatch({ tipo: 'cargando', cargando: true });

      const [torneo, categorias] = await Promise.all([
        store.obtenerTorneo(id),
        store.listarCategorias(id),
      ]);
      if (!montado.current) return;

      if (torneo.ok) dispatch({ tipo: 'torneo/seleccionado', torneo: torneo.data });
      else dispatch({ tipo: 'error', error: torneo.error.mensaje });

      if (categorias.ok) {
        dispatch({ tipo: 'categorias/cargadas', categorias: categorias.data });
        // Selecciona la primera categoria: es lo que el usuario espera ver.
        const primera = categorias.data[0] ?? null;
        categoriaEnCurso.current = primera?.id ?? null;
        dispatch({ tipo: 'categoria/seleccionada', categoria: primera });
      } else {
        dispatch({ tipo: 'error', error: categorias.error.mensaje });
      }

      dispatch({ tipo: 'cargando', cargando: false });
    },
    [store],
  );

  const refrescar = useCallback(async () => {
    await refrescarTorneos();
    if (estado.categoria) await refrescarCategoria();
  }, [refrescarTorneos, refrescarCategoria, estado.categoria]);

  /* ------------------------------------------------------------------ */
  /* Efectos                                                             */
  /* ------------------------------------------------------------------ */

  // Carga inicial de la lista de torneos.
  useEffect(() => {
    void refrescarTorneos();
  }, [refrescarTorneos]);

  // Deep link: si viene un torneo por URL, lo selecciona.
  const torneoInicialAplicado = useRef(false);
  useEffect(() => {
    if (torneoInicialAplicado.current || !torneoInicialId) return;
    torneoInicialAplicado.current = true;
    void seleccionarTorneo(torneoInicialId);
  }, [torneoInicialId, seleccionarTorneo]);

  // Al cambiar la categoria activa, se recargan sus datos.
  const categoriaId = estado.categoria?.id ?? null;
  useEffect(() => {
    if (categoriaId) void refrescarCategoria();
    else categoriaEnCurso.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId]);

  const seleccionarCategoria = useCallback(
    (id: string | null) => {
      categoriaEnCurso.current = id;
      const encontrada = id ? estado.categorias.find((c) => c.id === id) ?? null : null;
      dispatch({ tipo: 'categoria/seleccionada', categoria: encontrada });
    },
    [estado.categorias],
  );

  /* ------------------------------------------------------------------ */
  /* Mutaciones: torneo y categorias                                     */
  /* ------------------------------------------------------------------ */

  const crearTorneo = useCallback(
    async (input: Parameters<DbTorneos['crearTorneo']>[0]) => {
      dispatch({ tipo: 'guardando', guardando: true });
      const r = await store.crearTorneo(input);
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      if (r.ok) await refrescarTorneos();
      return r;
    },
    [store, refrescarTorneos, propagarError],
  );

  const cambiarEstadoTorneo = useCallback(
    async (nuevo: EstadoTorneo) => {
      const actual = estado.torneo;
      if (!actual) return sinContexto<Torneo>();

      dispatch({ tipo: 'guardando', guardando: true });
      const r = await store.actualizarTorneo(actual.id, { estado: nuevo });
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      if (r.ok) dispatch({ tipo: 'torneo/seleccionado', torneo: r.data });
      return r;
    },
    [estado.torneo, store, propagarError],
  );

  const crearCategoria = useCallback(
    async (nombre: string, precio: number) => {
      const torneo = estado.torneo;
      if (!torneo) return sinContexto<TorneoCategoria>();

      dispatch({ tipo: 'guardando', guardando: true });
      const r = await store.crearCategoria({
        torneo_id: torneo.id,
        nombre,
        precio_inscripcion: precio,
        orden: estado.categorias.length + 1,
      });
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);

      if (r.ok) {
        const cats = await store.listarCategorias(torneo.id);
        if (cats.ok) dispatch({ tipo: 'categorias/cargadas', categorias: cats.data });
      }
      return r;
    },
    [estado.torneo, estado.categorias.length, store, propagarError],
  );

  /* ------------------------------------------------------------------ */
  /* Mutaciones: parejas                                                 */
  /* ------------------------------------------------------------------ */

  const crearPareja = useCallback(
    async (input: ParejaInput) => {
      const categoria = estado.categoria;
      if (!categoria) return sinContexto<Pareja>();

      dispatch({ tipo: 'guardando', guardando: true });
      const r = await store.crearPareja(categoria.id, input);
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);

      if (r.ok) {
        // Optimista: la fila aparece ya en la tabla sin esperar el refetch.
        dispatch({ tipo: 'parejas/cargadas', parejas: [...estado.parejas, r.data] });
      }
      return r;
    },
    [estado.categoria, estado.parejas, store, propagarError],
  );

  const actualizarPareja = useCallback(
    async (id: string, cambios: Partial<ParejaInput>) => {
      dispatch({ tipo: 'guardando', guardando: true });
      const previo = estado.parejas;

      // Optimista con rollback.
      dispatch({
        tipo: 'parejas/cargadas',
        parejas: previo.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
      });

      const r = await store.actualizarPareja(id, cambios);
      if (!r.ok) dispatch({ tipo: 'parejas/cargadas', parejas: previo });
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      return r;
    },
    [estado.parejas, store, propagarError],
  );

  const cambiarEstadoPago = useCallback(
    async (id: string, estadoPago: EstadoPago, monto?: number) => {
      const pareja = estado.parejas.find((p) => p.id === id);
      if (!pareja) return sinContexto<Pareja>('La pareja ya no existe. Actualizá la lista.');

      dispatch({ tipo: 'guardando', guardando: true });
      const previo = estado.parejas;

      dispatch({
        tipo: 'parejas/cargadas',
        parejas: previo.map((p) =>
          p.id === id ? { ...p, estado_pago: estadoPago, ...(monto !== undefined ? { monto_abonado: monto } : {}) } : p,
        ),
      });

      const r = await store.cambiarEstadoPago(id, estadoPago, monto);
      if (!r.ok) dispatch({ tipo: 'parejas/cargadas', parejas: previo }); // rollback
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      return r;
    },
    [estado.parejas, store, propagarError],
  );

  const eliminarPareja = useCallback(
    async (id: string) => {
      const previo = estado.parejas;
      dispatch({ tipo: 'parejas/cargadas', parejas: previo.filter((p) => p.id !== id) });

      const r = await store.eliminarPareja(id);
      if (!r.ok) dispatch({ tipo: 'parejas/cargadas', parejas: previo }); // rollback
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      return r;
    },
    [estado.parejas, store, propagarError],
  );

  /* ------------------------------------------------------------------ */
  /* Sorteo, fixture y cuadro                                            */
  /* ------------------------------------------------------------------ */

  const sortearZonas = useCallback(async (): Promise<Resultado<ResultadoSorteo>> => {
    const categoria = estado.categoria;
    if (!categoria) return sinContexto<ResultadoSorteo>();

    dispatch({ tipo: 'guardando', guardando: true });

    // 1. Algoritmo puro en el cliente: valida antes de tocar la base.
    let sorteo: ResultadoSorteo;
    try {
      sorteo = generarZonas(estado.parejas);
    } catch (e) {
      dispatch({ tipo: 'guardando', guardando: false });
      const r = sinContexto<ResultadoSorteo>(e instanceof Error ? e.message : 'No se pudo sortear.');
      dispatch({ tipo: 'error', error: r.ok ? null : r.error.mensaje });
      return r;
    }

    // 2. Persistencia atomica de zonas + pertenencias.
    const rZonas = await store.guardarZonas(categoria.id, sorteo.zonas);
    if (propagarError(rZonas)) {
      dispatch({ tipo: 'guardando', guardando: false });
      return fallar<ResultadoSorteo>(rZonas);
    }

    // 3. Fixture round-robin de cada zona recien sorteada.
    const fixture = generarFixtureZonas(
      sorteo.zonas.map((z) => ({
        id: '',
        categoria_id: categoria.id,
        nombre: z.nombre,
        orden: z.orden,
        created_at: '',
        parejas: z.parejas,
      })),
    );

    const rFixture = await store.guardarFixtureZonas(categoria.id, fixture);
    if (propagarError(rFixture)) {
      dispatch({ tipo: 'guardando', guardando: false });
      return fallar<ResultadoSorteo>(rFixture);
    }

    await refrescarCategoria();
    dispatch({ tipo: 'guardando', guardando: false });
    dispatch({
      tipo: 'aviso',
      aviso:
        `Zonas generadas: ${sorteo.zonas.length} con ${fixture.length} partidos. ` +
        (sorteo.excluidas.length > 0
          ? `${sorteo.excluidas.length} pareja(s) quedaron afuera por pago pendiente.`
          : 'Todas las parejas participated.'),
    });

    return { ok: true, data: sorteo };
  }, [estado.categoria, estado.parejas, store, propagarError, refrescarCategoria]);

  const generarFixture = useCallback(async () => {
    const categoria = estado.categoria;
    if (!categoria) return sinContexto<number>();
    if (estado.zonas.length === 0) {
      return sinContexto<number>('Todavia no hay zonas sorteadas en esta categoría.');
    }

    dispatch({ tipo: 'guardando', guardando: true });

    const fixture = generarFixtureZonas(estado.zonas);
    const r = await store.guardarFixtureZonas(categoria.id, fixture);

    dispatch({ tipo: 'guardando', guardando: false });
    propagarError(r);
    if (r.ok) await refrescarCategoria();
    return r;
  }, [estado.categoria, estado.zonas, store, propagarError, refrescarCategoria]);

  const generarCuadroPlayoffs = useCallback(async (clasificadosPorZona?: Map<string, number>): Promise<Resultado<number>> => {
    const categoria = estado.categoria;
    if (!categoria) return sinContexto<number>();

    dispatch({ tipo: 'guardando', guardando: true });

    // 1. Tabla de posiciones con clasificación configurable.
    const tablas = calcularTablaPosiciones(estado.partidosZona, estado.parejas, clasificadosPorZona);
    const clasificados = extraerClasificados(tablas, clasificadosPorZona);

    if (clasificados.length < 2) {
      dispatch({ tipo: 'guardando', guardando: false });
      const error = sinContexto<number>(
        'Se necesitan al menos 2 zonas con clasificados definidos. ' +
          'Cargá los resultados de la fase de zonas antes de generar el cuadro.',
      );
      dispatch({ tipo: 'error', error: error.ok ? null : error.error.mensaje });
      return { ok: false, error: { mensaje: error.ok ? '' : error.error.mensaje, codigo: 'pocas_zonas' } };
    }

    // 2. Cruces simétricos (ahora con soporte para extras).
    const { partidos } = generarPlayoffs(clasificados);

    // 3. Persistencia atómica del bracket completo (con slots vacíos).
    const r = await store.guardarPlayoffs(categoria.id, partidos);

    dispatch({ tipo: 'guardando', guardando: false });
    propagarError(r);
    if (r.ok) {
      await refrescarCategoria();
      dispatch({ tipo: 'tab', tab: 'cuadro' });
    }
    return r;
  }, [estado.categoria, estado.partidosZona, estado.parejas, store, propagarError, refrescarCategoria]);

  /* ------------------------------------------------------------------ */
  /* Resultados y agenda                                                 */
  /* ------------------------------------------------------------------ */

  const registrarResultado = useCallback(
    async (partidoId: string, resultado: ResultadoInput): Promise<Resultado<string | null>> => {
      // Validacion local primero: evita un round-trip por errores obvios.
      const errores = validarResultado(resultado);
      if (Object.keys(errores).length > 0) {
        const mensaje = Object.values(errores)[0];
        dispatch({ tipo: 'error', error: mensaje });
        return { ok: false, error: { mensaje, codigo: 'resultado_invalido', detalle: errores } };
      }

      dispatch({ tipo: 'guardando', guardando: true });
      const r = await store.registrarResultado(partidoId, resultado);
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      if (r.ok) await refrescarCategoria(); // el ganador pudo avanzar de ronda
      return r;
    },
    [store, propagarError, refrescarCategoria],
  );

  const guardarAgenda = useCallback(
    async (asignaciones: { partido_id: string; cancha_id: string | null; horario: string | null }[]) => {
      dispatch({ tipo: 'guardando', guardando: true });
      const torneoInfo = estado.torneo && estado.categoria ? {
        nombre_torneo: estado.torneo.nombre,
        categoria_nombre: estado.categoria.nombre,
        duracion_minutos: estado.torneo.duracion_partido_min ?? 90
      } : undefined;
      const r = await store.guardarAgenda(asignaciones, torneoInfo);
      dispatch({ tipo: 'guardando', guardando: false });
      propagarError(r);
      if (r.ok) await refrescarCategoria();
      return r;
    },
    [store, propagarError, refrescarCategoria, estado.torneo, estado.categoria],
  );

  /* ------------------------------------------------------------------ */
  /* Valores derivados                                                   */
  /* ------------------------------------------------------------------ */

  const tablas = useMemo(
    () => calcularTablaPosiciones(estado.partidosZona, estado.parejas),
    [estado.partidosZona, estado.parejas],
  );

  const clasificados = useMemo(() => extraerClasificados(tablas), [tablas]);

  const partidosPorZona = useMemo(() => {
    const mapa = new Map<string, Partido[]>();
    for (const p of estado.partidosZona) {
      if (!p.zona_id) continue;
      const lista = mapa.get(p.zona_id) ?? [];
      lista.push(p);
      mapa.set(p.zona_id, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => (a.ronda ?? 0) - (b.ronda ?? 0) || a.orden_fixture - b.orden_fixture);
    }
    return mapa;
  }, [estado.partidosZona]);

  const agenda = useMemo<PartidoAgenda[]>(() => {
    const porPareja = new Map(estado.parejas.map((p) => [p.id, p]));
    const porCancha = new Map(estado.canchas.map((c) => [c.id, c]));
    const duracion = (estado.torneo?.duracion_partido_min ?? 75) * 60_000;

    return [...estado.partidosZona, ...estado.partidosPlayoff]
      .filter((p) => p.horario != null)
      .map((p) => {
        const inicio = new Date(p.horario as string);
        return {
          ...p,
          pareja_1: p.pareja_1_id ? porPareja.get(p.pareja_1_id) ?? null : null,
          pareja_2: p.pareja_2_id ? porPareja.get(p.pareja_2_id) ?? null : null,
          cancha: p.cancha_id ? porCancha.get(p.cancha_id) ?? null : null,
          inicio,
          fin: new Date(inicio.getTime() + duracion),
        };
      });
  }, [estado.partidosZona, estado.partidosPlayoff, estado.parejas, estado.canchas, estado.torneo]);

  const sinAgendar = useMemo(
    () =>
      [...estado.partidosZona, ...estado.partidosPlayoff].filter(
        (p) => p.horario == null && p.pareja_1_id && p.pareja_2_id,
      ),
    [estado.partidosZona, estado.partidosPlayoff],
  );

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  const acciones = useMemo<AccionesTorneo>(
    () => ({
      refrescarTorneos,
      seleccionarTorneo,
      crearTorneo,
      cambiarEstadoTorneo,
      seleccionarCategoria,
      refrescarCategoria,
      crearCategoria,
      crearPareja,
      actualizarPareja,
      cambiarEstadoPago,
      eliminarPareja,
      sortearZonas,
      generarFixtureZonas: generarFixture,
      generarCuadroPlayoffs,
      registrarResultado,
      guardarAgenda,
      setTab,
      setAviso,
      limpiarError,
    }),
    [
      refrescarTorneos,
      seleccionarTorneo,
      crearTorneo,
      cambiarEstadoTorneo,
      seleccionarCategoria,
      refrescarCategoria,
      crearCategoria,
      crearPareja,
      actualizarPareja,
      cambiarEstadoPago,
      eliminarPareja,
      sortearZonas,
      generarFixture,
      generarCuadroPlayoffs,
      registrarResultado,
      guardarAgenda,
      setTab,
      setAviso,
      limpiarError,
    ],
  );

  const valor = useMemo<ContextoTorneo>(
    () => ({ ...estado, acciones, tablas, clasificados, partidosPorZona, agenda, sinAgendar, refrescar }),
    [estado, acciones, tablas, clasificados, partidosPorZona, agenda, sinAgendar, refrescar],
  );

  return <TorneoCtx.Provider value={valor}>{children}</TorneoCtx.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/** Acceso al store. Lanza si se usa fuera del provider (error de integracion). */
export function useTorneo(): ContextoTorneo {
  const ctx = useContext(TorneoCtx);
  if (!ctx) throw new Error('useTorneo debe usarse dentro de <TorneoProvider>.');
  return ctx;
}

/** Atajo para leer solo las acciones (no dispara re-renders por el estado). */
export function useTorneoAcciones(): AccionesTorneo {
  return useTorneo().acciones;
}

/* -------------------------------------------------------------------------- */
/* Utilidades internas                                                          */
/* -------------------------------------------------------------------------- */

function sinContexto<T>(mensaje = 'Seleccioná un torneo y una categoría primero.'): Resultado<T> {
  return { ok: false, error: { mensaje, codigo: 'sin_contexto' } };
}

/**
 * Reetiqueta un Resultado fallido con otro tipo de salida.
 * Evita `return r` cuando el valor de `data` no coincide (p. ej. una RPC que
 * devuelve `null` dentro de una accion que devuelve `ResultadoSorteo`).
 */
function fallar<T>(r: Resultado<unknown>): Resultado<T> {
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: false, error: { mensaje: 'Error inesperado.', codigo: 'desconocido' } };
}

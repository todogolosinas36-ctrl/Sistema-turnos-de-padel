/**
 * Smoke tests de montaje.
 *
 * Montan el dashboard completo contra un repositorio falso que devuelve datos
 * realistas (4 categorías worth de parejas, zonas con fixture y resultados).
 * Objetivo: detectar errores de runtime (hooks mal cableados, props inexistentes,
 * renderizados que rompen) que el typechecker no ve.
 *
 * Para eso se usa `crearDb({ cliente: stub })` con un cliente de Supabase falso
 * en lugar de una implementación a mano: se ejercita también la capa de mapeo.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearDb, type DbTorneos } from './api/db';
import { TorneoProvider } from './store/TorneoStore';
import { TorneoDashboard } from './components/TorneoDashboard';
import type {
  Cancha,
  Pareja,
  Partido,
  Torneo,
  TorneoCategoria,
} from './types';

/* -------------------------------------------------------------------------- */
/* Datos de prueba                                                             */
/* -------------------------------------------------------------------------- */

const TORNEO: Torneo = {
  id: 't1',
  nombre: 'Open de Prueba',
  fecha_inicio: '2026-03-09',
  fecha_fin: '2026-03-15',
  estado: 'en_curso',
  dias_juego: [1, 2, 3, 4, 5, 6, 7],
  hora_inicio: '09:00',
  hora_fin: '22:00',
  duracion_partido_min: 75,
  descanso_min_entre_partidos: 30,
  allow_byes: true,
  notas: null,
  created_by: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
};

const CATEGORIAS: TorneoCategoria[] = [
  {
    id: 'cat-1',
    torneo_id: 't1',
    nombre: '7ma Caballeros',
    orden: 1,
    precio_inscripcion: 25000,
    semilla: null,
    maximo_parejas: 32,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'cat-2',
    torneo_id: 't1',
    nombre: '5ta Damas',
    orden: 2,
    precio_inscripcion: 18000,
    semilla: null,
    maximo_parejas: 24,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
];

const NOMBRES = [
  'Ana Gómez', 'Luis Pérez', 'Sofía Díaz', 'Diego Torres', 'María López',
  'Juan Ruiz', 'Carla Núñez', 'Pedro Silva', 'Lucía Vega', 'Mateo Cruz',
  'Julieta Paz', 'Bruno Ramos', 'Elena Moyano', 'Nico Ávila', 'Rocío Ledesma',
];

const PAREJAS: Pareja[] = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i + 1}`,
  categoria_id: 'cat-1',
  j1_nombre: NOMBRES[i],
  j1_telefono: '11 5555-0000',
  j2_nombre: NOMBRES[(i + 1) % NOMBRES.length],
  j2_telefono: '11 5555-0001',
  estado_pago: i < 10 ? 'pagado' : i === 10 ? 'sena' : 'pendiente',
  monto_abonado: i < 10 ? 25000 : i === 10 ? 10000 : 0,
  restriccion_horaria: i === 0 ? 'No puede jugar antes de las 18 h' : null,
  origen: 'web',
  notas: null,
  created_at: '2026-03-02T00:00:00Z',
  updated_at: '2026-03-02T00:00:00Z',
}));

/** 2 zonas de 3 parejas, con todos los partidos resueltos. */
const ZONAS = [
  { id: 'zA', categoria_id: 'cat-1', nombre: 'Zona A', orden: 1, created_at: '', parejas: PAREJAS.slice(0, 3) },
  { id: 'zB', categoria_id: 'cat-1', nombre: 'Zona B', orden: 2, created_at: '', parejas: PAREJAS.slice(3, 6) },
];

const PARTIDOS_ZONA: Partido[] = [
  mk('mz1', 'zA', 1, 1, 'p1', 'p2', 6, 4, 6, 3),
  mk('mz2', 'zA', 2, 2, 'p2', 'p3', 4, 6, 3, 6),
  mk('mz3', 'zA', 3, 3, 'p1', 'p3', 7, 6, 7, 5),
  mk('mz4', 'zB', 1, 4, 'p4', 'p5', 6, 0, 6, 0),
  mk('mz5', 'zB', 2, 5, 'p5', 'p6', 2, 6, 4, 6),
  mk('mz6', 'zB', 3, 6, 'p4', 'p6', 6, 2, 6, 1),
];

const CANCHAS: Cancha[] = [
  {
    id: 'c1',
    nombre: 'Cancha 1',
    tipo: 'padel',
    superficie: 'cesped',
    capacidad: 4,
    activa: true,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'c2',
    nombre: 'Cancha 2',
    tipo: 'padel',
    superficie: 'dura',
    capacidad: 4,
    activa: true,
    created_at: '',
    updated_at: '',
  },
];

function mk(
  id: string,
  zona_id: string | null,
  ronda: number,
  orden: number,
  p1: string,
  p2: string,
  s1p1: number | null,
  s1p2: number | null,
  s2p1: number | null,
  s2p2: number | null,
): Partido {
  return {
    id,
    categoria_id: 'cat-1',
    zona_id,
    zona_nombre: zona_id === 'zA' ? 'Zona A' : zona_id === 'zB' ? 'Zona B' : null,
    ronda,
    orden_fixture: orden,
    fase: zona_id ? 'zona' : 'cuartos',
    pareja_1_id: p1,
    pareja_2_id: p2,
    set1_p1: s1p1,
    set1_p2: s1p2,
    set2_p1: s2p1,
    set2_p2: s2p2,
    set3_p1: null,
    set3_p2: null,
    ganador_id: s1p1 === null ? null : s1p1 > s1p2! ? p1 : p2,
    cancha_id: null,
    horario: null,
    resultado_nota: null,
    created_at: '',
    updated_at: '',
  };
}

/** Cuadro eliminatorio: 2 cuartos -> semifinal -> final (aún vacía). */
const PARTIDOS_PLAYOFF: Partido[] = [
  mkPlayoff('mo1', 1, 1, 'cuartos', 'p1', 'p4', 6, 0, 6, 0),
  mkPlayoff('mo2', 1, 2, 'cuartos', 'p2', 'p3', null, null, null, null),
  mkPlayoff('mo3', 2, 1, 'semifinal', 'p1', null, null, null, null, null),
  mkPlayoff('mo4', 3, 1, 'final', null, null, null, null, null, null),
];

function mkPlayoff(
  id: string,
  ronda: number,
  orden: number,
  fase: Partido['fase'],
  p1: string | null,
  p2: string | null,
  s1p1: number | null,
  s1p2: number | null,
  s2p1: number | null,
  s2p2: number | null,
): Partido {
  return {
    id,
    categoria_id: 'cat-1',
    zona_id: null,
    zona_nombre: null,
    ronda,
    orden_fixture: orden,
    fase,
    pareja_1_id: p1,
    pareja_2_id: p2,
    set1_p1: s1p1,
    set1_p2: s1p2,
    set2_p1: s2p1,
    set2_p2: s2p2,
    set3_p1: null,
    set3_p2: null,
    ganador_id: s1p1 === null || p1 === null ? null : s1p1 > s1p2! ? p1 : p2,
    cancha_id: null,
    horario: null,
    resultado_nota: null,
    created_at: '',
    updated_at: '',
  };
}

/* -------------------------------------------------------------------------- */
/* Cliente falso                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Stub del cliente de Supabase. Cada `from()` devuelve un builder encadenable
 * que resuelve con las filas que le pide el repositorio.
 */
function clienteFalso(): SupabaseClient {
  const partidos = [...PARTIDOS_ZONA, ...PARTIDOS_PLAYOFF].map((p) => ({
    ...p,
    // El repositorio pide `select('*, zona:torneo_zonas(nombre)')` y después
    // aplana el embed a `zona_nombre`, así que el stub debe devolver la anidada.
    zona: p.zona_id ? { nombre: p.zona_nombre } : null,
  }));

  const tablas: Record<string, any[]> = {
    torneos: [TORNEO],
    torneo_categorias: CATEGORIAS,
    torneo_parejas: PAREJAS,
    torneo_zonas: ZONAS.map(({ parejas: _p, ...z }) => z),
    torneo_parejas_zonas: ZONAS.flatMap((z) =>
      z.parejas.map((p) => ({
        zona_id: z.id,
        pareja_id: p.id,
        pareja: { ...p, monto_abonado: String(p.monto_abonado) },
      })),
    ),
    torneo_partidos: partidos,
    canchas: CANCHAS,
    torneo_organizadores: [],
  };

  const builder = (tablaCompleta: string) => {
    // El repositorio siempre califica el esquema: `torneo.torneo_parejas`.
    const tabla = tablaCompleta.split('.').pop() as string;
    const filas = tablas[tabla] ?? [];

    const q: Record<string, any> = {
      // Filtros y orden encadenables: se ignoran, los datos ya vienen filtrados.
      select: () => q,
      eq: () => q,
      in: () => q,
      order: () => q,
      maybeSingle: () => Promise.resolve({ data: filas[0] ?? null, error: null }),
      insert: () => q,
      update: () => q,
      upsert: () => q,
      delete: () => q,
      single: () => Promise.resolve({ data: filas[0] ?? null, error: null }),
      then: (resolve: any) => resolve({ data: filas, error: null }),
    };
    return q;
  };

  return {
    from: (t: string) => builder(t),
    rpc: () => Promise.resolve({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
  } as unknown as SupabaseClient;
}

function dbDePrueba(): DbTorneos {
  return crearDb({ cliente: clienteFalso() });
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

function montar() {
  return render(
    <TorneoProvider db={dbDePrueba()} torneoInicialId="t1">
      <TorneoDashboard />
    </TorneoProvider>,
  );
}

describe('TorneoDashboard (montaje)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // `globals: false` en la config de vitest desactiva el auto-cleanup de
  // testing-library: sin esto el DOM de un test se filtra al siguiente.
  afterEach(() => cleanup());

  it('carga el torneo y muestra sus categorías como pestañas', async () => {
    montar();

    expect(await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /7ma Caballeros/ })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /5ta Damas/ })).toBeTruthy();
  });

  it('muestra la tabla de inscripciones con badges de pago y saldos', async () => {
    montar();

    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    // 12 parejas en la categoría.
    await waitFor(() => expect(screen.getByText('Ana Gómez')).toBeTruthy());
    expect(screen.getAllByText('Juan Ruiz').length).toBeGreaterThan(0);

    // Un toggle por fila: 10 "pagado" (que ofrecen dar de baja) y 2 por cobrar.
    expect(screen.getAllByTitle('Marcar como pendiente').length).toBe(10);
    expect(screen.getAllByTitle('Marcar como pagado').length).toBe(2);

    // Resumen de cobro: falta cobrar = 2 pendientes * 25000.
    expect(screen.getByText('Falta cobrar')).toBeTruthy();
  });

  it('navega a la pestaña Zonas y muestra tablas de posiciones por zona', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click(await screen.findByRole('button', { name: /^Zonas/ }));

    await waitFor(() => expect(screen.getByText('Zona A')).toBeTruthy());
    expect(screen.getByText('Zona B')).toBeTruthy();

    // Las columnas de la tabla de posiciones están presente.
    expect(screen.getAllByTitle('Partidos ganados').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Diferencia de games').length).toBeGreaterThan(0);
  });

  it('navega a Cuadro y renderiza el bracket con las rondas', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click(await screen.findByRole('button', { name: /^Cuadro/ }));

    // El bracket se dibuja completo: 4 cuartos, 2 semis y la final.
    await waitFor(() => expect(screen.getAllByText('Cuartos').length).toBeGreaterThan(0));
    expect(screen.getByText('Semifinal')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
    // El badge de progreso también dice "2/4 partidos".
    expect(screen.getAllByText(/2 partidos/).length).toBeGreaterThan(0);
  });

  it('navega a Cronograma y ofrece la asignación automática', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click(await screen.findByRole('button', { name: /^Cronograma/ }));

    // Botón en la barra de acciones y también en el estado vacío.
    await waitFor(() =>
      expect(screen.getAllByText('Completar automáticamente').length).toBeGreaterThan(0),
    );
    expect(screen.getByText('Todavía no hay partidos con horario')).toBeTruthy();
    // 6 partidos de zona + 2 del cuadro (los que ya tienen ambas parejas) esperan turno.
    // El badge arma el texto con varios nodos ("0 con horario · 8 pendientes"), así
    // que se verifica sobre el textContent del documento en vez de una regex.
    expect(document.body.textContent).toContain('8 pendientes');
  });

  it('abre el formulario de inscripción con el modal accesible', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click((await screen.findAllByRole('button', { name: /Inscribir pareja/ }))[0]);

    const dialogo = await screen.findByRole('dialog');
    // Aparece como título del modal y como botón del pie.
    expect(within(dialogo).getAllByText('Inscribir pareja').length).toBeGreaterThan(0);
    // Hay un campo de nombre por jugador.
    expect(within(dialogo).getAllByLabelText(/Nombre y apellido/).length).toBe(2);
    expect(within(dialogo).getAllByLabelText(/Teléfono/).length).toBe(2);
    expect(within(dialogo).getByText(/Falta/)).toBeTruthy();
  });

  it('valida el formulario: no deja enviar una pareja incompleta', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click((await screen.findAllByRole('button', { name: /Inscribir pareja/ }))[0]);
    const dialogo = await screen.findByRole('dialog');

    fireEvent.click(within(dialogo).getByRole('button', { name: /Inscribir pareja/ }));

    await waitFor(() =>
      expect(within(dialogo).getByText(/Ingresá el nombre del jugador 1/)).toBeTruthy(),
    );
    // Los dos teléfonos están vacíos.
    expect(within(dialogo).getAllByText(/Teléfono inválido/).length).toBe(2);
  });

  it('cierra el modal con Escape', async () => {
    montar();
    await screen.findByRole('heading', { level: 1, name: 'Open de Prueba' });

    fireEvent.click((await screen.findAllByRole('button', { name: /Inscribir pareja/ }))[0]);
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

/* -------------------------------------------------------------------------- */
/* Capa de mapeo (sin montar React)                                            */
/* -------------------------------------------------------------------------- */

describe('mapeo de numeric', () => {
  it('convierte los numeric de Postgres (que llegan como string) a number', async () => {
    const db = dbDePrueba();

    // El stub entrega monto_abonado como string a proposito.
    const parejas = await db.listarParejas('cat-1');
    expect(parejas.ok).toBe(true);
    if (!parejas.ok) return;

    expect(typeof parejas.data[0].monto_abonado).toBe('number');
    expect(parejas.data[0].monto_abonado).toBe(25000);

    // Y se puede sumar sin concatenar.
    const total = parejas.data.reduce((a, p) => a + p.monto_abonado, 0);
    expect(total).toBe(260000);
  });

  it('aplana el embed de zona a zona_nombre', async () => {
    const db = dbDePrueba();
    const partidos = await db.listarPartidos('cat-1');
    expect(partidos.ok).toBe(true);
    if (!partidos.ok) return;

    const deZona = partidos.data.find((p) => p.id === 'mz1');
    expect(deZona?.zona_nombre).toBe('Zona A');
  });

  it('agrupa las parejas por zona', async () => {
    const db = dbDePrueba();
    const zonas = await db.listarZonas('cat-1');
    expect(zonas.ok).toBe(true);
    if (!zonas.ok) return;

    expect(zonas.data).toHaveLength(2);
    expect(zonas.data[0].parejas).toHaveLength(3);
    expect(zonas.data[0].parejas[0].monto_abonado).toBe(25000);
  });
});

/**
 * TorneoDashboard — layout principal del modulo.
 *
 * Estructura:
 *   Selector de torneo  +  estado  +  acciones globales
 *   Barra de pestañas por CATEGORÍA (una por línea de juego: "7ma", "5ta"…)
 *   Barra de sub-pestañas (Inscripciones / Zonas / Cuadro / Cronograma)
 *   Contenido de la sub-pestaña activa
 *
 * El componente no pide datos: todo sale del `TorneoProvider`, asi que las
 * pestañas comparten estado sin prop drilling y una recarga en Zonas impacta
 * al Cuadro y al Cronograma al instante.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Trophy, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useTorneo, TABS, type TabActiva } from '../store/TorneoStore';
import type { EstadoTorneo, Pareja, Partido, Torneo, ZonaConParejas } from '../types';
import { progresoEliminatorio } from '../lib';
import { InscripcionesTab } from './InscripcionesTab';
import { ZonasView } from './ZonasView';
import { PlayoffBracket } from './PlayoffBracket';
import { CronogramaGeneral } from './CronogramaGeneral';
import { Alerta, Badge, Button, Card, Input, Modal, Spinner } from './ui';

/* -------------------------------------------------------------------------- */

export interface TorneoDashboardProps {
  /** Si viene `false`, el selector de torneo se oculta (deep link a uno fijo). */
  mostrarSelectorTorneo?: boolean;
}

export function TorneoDashboard({ mostrarSelectorTorneo = true }: TorneoDashboardProps) {
  const {
    torneos,
    torneo,
    categorias,
    categoria,
    parejas,
    zonas,
    partidosPlayoff,
    tab,
    acciones,
    cargando,
    guardando,
    error,
    aviso,
  } = useTorneo();

  const [modalTorneo, setModalTorneo] = useState(false);
  const [modalCategoria, setModalCategoria] = useState(false);
  const [modalEliminarOpen, setModalEliminarOpen] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const progreso = useMemo(() => progresoEliminatorio(partidosPlayoff), [partidosPlayoff]);

  const confirmarEliminarTorneo = async () => {
    if (!torneo) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const { error: rpcError } = await supabase.rpc('eliminar_torneo_forzado', { p_torneo_id: torneo.id });
      if (rpcError) {
        console.error('Error al eliminar torneo:', rpcError);
        setErrorEliminar(rpcError.message);
      } else {
        setModalEliminarOpen(false);
        await acciones.seleccionarTorneo(null);
        await acciones.refrescarTorneos();
        acciones.setAviso('Torneo eliminado correctamente.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorEliminar(err.message || 'Error inesperado al eliminar.');
    } finally {
      setEliminando(false);
    }
  };

  if (cargando && torneos.length === 0 && !torneo) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-slate-400">
        <Spinner className="h-6 w-6" />
        <span className="text-sm">Cargando torneos…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ------------------------------------------------------------ */}
      {/* Header                                                        */}
      {/* ------------------------------------------------------------ */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Gestión de Torneos de Pádel
              </p>
              <h1 className="mt-0.5 truncate text-2xl sm:text-3xl font-extrabold text-slate-900">
                {torneo ? torneo.nombre : 'Seleccioná un torneo'}
              </h1>
              {torneo && (
                <p className="mt-1 text-sm font-medium text-slate-600">
                  {formatearRango(torneo)} · {ETIQUETA_ESTADO[torneo.estado]}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {mostrarSelectorTorneo && (
                <select
                  aria-label="Seleccionar torneo"
                  value={torneo?.id ?? ''}
                  onChange={(e) => void acciones.seleccionarTorneo(e.target.value || null)}
                  className="h-10 sm:h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                >
                  <option value="">— Mis Torneos —</option>
                  {torneos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              )}

              {torneo && (
                <select
                  aria-label="Estado del torneo"
                  value={torneo.estado}
                  onChange={(e) => void acciones.cambiarEstadoTorneo(e.target.value as EstadoTorneo)}
                  disabled={guardando}
                  className="h-10 sm:h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm disabled:opacity-50"
                >
                  {(Object.keys(ETIQUETA_ESTADO) as EstadoTorneo[]).map((e) => (
                    <option key={e} value={e}>
                      {ETIQUETA_ESTADO[e]}
                    </option>
                  ))}
                </select>
              )}

              {torneo && (
                <button
                  onClick={() => setModalEliminarOpen(true)}
                  title="Eliminar Torneo"
                  className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold h-10 sm:h-11 px-3 rounded-xl text-sm flex items-center justify-center transition-all active:scale-95 shadow-sm"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}

              <button
                onClick={() => setModalTorneo(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 h-10 sm:h-11 rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Plus className="w-5 h-5 shrink-0" />
                <span className="hidden sm:inline">Nuevo Torneo</span>
                <span className="sm:hidden">Nuevo</span>
              </button>
            </div>
          </div>

          {/* Tabs por categoría */}
          {torneo && categorias.length > 0 && (
            <nav aria-label="Categorías" className="mt-6 flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
              {categorias.map((c) => {
                const activa = c.id === categoria?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => acciones.seleccionarCategoria(c.id)}
                    className={[
                      'shrink-0',
                      activa
                        ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-200 rounded-xl px-4 py-2 text-sm flex items-center gap-2 transition-all'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl px-4 py-2 text-sm flex items-center gap-2 transition-colors',
                    ].join(' ')}
                  >
                    {c.nombre}
                    <span
                      className={
                        activa
                          ? 'bg-blue-700/60 text-blue-100 text-xs px-2 py-0.5 rounded-lg font-medium'
                          : 'text-slate-500 text-xs'
                      }
                    >
                      {c.precio_inscripcion > 0 ? formatearPrecio(c.precio_inscripcion) : '—'}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setModalCategoria(true)}
                className="shrink-0 border-2 border-dashed border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-500 font-semibold rounded-xl px-3.5 py-1.5 text-sm flex items-center gap-1.5 transition-all ml-1"
              >
                + Categoría
              </button>
            </nav>
          )}
        </div>
      </header>

      {/* ------------------------------------------------------------ */}
      {/* Contenido                                                     */}
      {/* ------------------------------------------------------------ */}
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        {/* Avisos globales */}
        {error && (
          <div className="mb-4">
            <Alerta tono="error" onCerrar={acciones.limpiarError}>
              {error}
            </Alerta>
          </div>
        )}
        {aviso && (
          <div className="mb-4">
            <Alerta tono="exito" onCerrar={() => acciones.setAviso(null)}>
              {aviso}
            </Alerta>
          </div>
        )}

        {!torneo ? (
          <Card className="p-10 text-center flex flex-col items-center justify-center min-h-[400px] border border-slate-200 shadow-sm rounded-2xl bg-white">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">Todavía no hay ningún torneo</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 font-medium">
              Creá el primer torneo para poder habilitar las categorías y abrir las inscripciones al público.
            </p>
            <button 
              className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95"
              onClick={() => setModalTorneo(true)}
            >
              <Plus className="w-5 h-5" />
              Crear el primer torneo
            </button>
          </Card>
        ) : categorias.length === 0 ? (
          <Card className="p-10 text-center">
            <h2 className="text-base font-semibold text-slate-700">Este torneo todavía no tiene categorías</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Las categorías son las líneas de juego ("7ma Caballeros", "5ta Damas"…). Cada una lleva sus
              parejas, sus zonas y su cuadro eliminatorio, completamente independiente de las demás.
            </p>
            <Button variante="primario" className="mt-4" onClick={() => setModalCategoria(true)}>
              Crear categoría
            </Button>
          </Card>
        ) : !categoria ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-slate-500">Elegí una categoría de las pestañas superiores.</p>
          </Card>
        ) : (
          <>
            {/* Sub-tabs + resumen */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <nav aria-label="Secciones" className="flex gap-1 rounded-lg bg-slate-200/70 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => acciones.setTab(t.id as TabActiva)}
                    className={[
                      'relative flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition',
                      tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                    ].join(' ')}
                  >
                    {t.etiqueta}
                    {contadorDe(t.id, { parejas, zonas, partidosPlayoff })}
                  </button>
                ))}
              </nav>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Badge tono="neutro">{parejas.length} parejas</Badge>
                <Badge tono="neutro">{zonas.length} zonas</Badge>
                {partidosPlayoff.length > 0 && (
                  <Badge tono={progreso.completo ? 'exito' : 'advertencia'}>
                    {progreso.jugados}/{progreso.total} playoffs
                  </Badge>
                )}
                {guardando && <Spinner className="h-4 w-4 text-cancha-600" />}
              </div>
            </div>

            {tab === 'inscripciones' && <InscripcionesTab />}
            {tab === 'zonas' && <ZonasView />}
            {tab === 'cuadro' && <PlayoffBracket />}
            {tab === 'cronograma' && <CronogramaGeneral />}
          </>
        )}
      </main>

      {/* Modales de alta */}
      <FormTorneoModal abierto={modalTorneo} onCerrar={() => setModalTorneo(false)} onCrear={acciones.crearTorneo} />
      <FormCategoriaModal
        abierto={modalCategoria}
        onCerrar={() => setModalCategoria(false)}
        onCrear={acciones.crearCategoria}
      />

      {/* Modal de confirmación para eliminar torneo */}
      {modalEliminarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => { if (!eliminando) { setModalEliminarOpen(false); setErrorEliminar(null); } }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Eliminar Torneo</h3>
              <p className="text-sm text-slate-600 leading-relaxed mt-2 mb-6">
                ¿Estás seguro de que deseas eliminar <strong>{torneo?.nombre}</strong> y todos sus partidos/categorías? Esta acción no se puede deshacer.
              </p>
              {errorEliminar && (
                <div className="w-full mb-4 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-left">
                  {errorEliminar}
                </div>
              )}
              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  onClick={() => { setModalEliminarOpen(false); setErrorEliminar(null); }}
                  disabled={eliminando}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors flex-1 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarEliminarTorneo}
                  disabled={eliminando}
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-sm shadow-red-200 transition-colors flex-1 flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {eliminando ? (
                    <>
                      <Spinner className="w-4 h-4" />
                      Eliminando…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Eliminar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contadores de las sub-pestañas                                              */
/* -------------------------------------------------------------------------- */

function contadorDe(
  tab: TabActiva,
  ctx: {
    parejas: Pareja[];
    zonas: ZonaConParejas[];
    partidosPlayoff: Partido[];
  },
): ReactNode {
  switch (tab) {
    case 'inscripciones':
      return ctx.parejas.length > 0 ? (
        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600">
          {ctx.parejas.length}
        </span>
      ) : null;
    case 'zonas':
      return ctx.zonas.length > 0 ? (
        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600">
          {ctx.zonas.length}
        </span>
      ) : null;
    case 'cuadro':
      return ctx.partidosPlayoff.length > 0 ? (
        <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold tabular-nums text-slate-600">
          {ctx.partidosPlayoff.length}
        </span>
      ) : null;
    case 'cronograma':
      return null;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Formularios de alta (torneo y categoría)                                     */
/* -------------------------------------------------------------------------- */

function FormTorneoModal({
  abierto,
  onCerrar,
  onCrear,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (input: Parameters<ReturnType<typeof useTorneo>['acciones']['crearTorneo']>[0]) => Promise<{
    ok: boolean;
    error?: { mensaje: string };
  }>;
}) {
  const [nombre, setNombre] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [horaInicio, setHoraInicio] = useState('09:00');
  const [horaFin, setHoraFin] = useState('22:00');
  const [diasJuego, setDiasJuego] = useState<number[]>([5, 6, 7]); // Viernes, Sábado, Domingo
  const [duracionPartido, setDuracionPartido] = useState('75');
  const [descanso, setDescanso] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const hoy = new Date().toISOString().slice(0, 10);
    setNombre('');
    setDesde(hoy);
    setHasta(hoy);
    setHoraInicio('09:00');
    setHoraFin('22:00');
    setDiasJuego([5, 6, 7]);
    setDuracionPartido('75');
    setDescanso('30');
    setError(null);
  }, [abierto]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Ingresá un nombre.');
    if (!desde || !hasta) return setError('Completá las fechas.');
    if (hasta < desde) return setError('La fecha de fin no puede ser anterior a la de inicio.');
    if (horaFin <= horaInicio) return setError('La hora de fin debe ser posterior a la de inicio.');

    setEnviando(true);
    const r = await onCrear({
      nombre: nombre.trim(),
      fecha_inicio: desde,
      fecha_fin: hasta,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      dias_juego: diasJuego,
      duracion_partido_min: Number(duracionPartido) || 75,
      descanso_min_entre_partidos: Number(descanso) || 30,
    });
    setEnviando(false);

    if (r.ok) onCerrar();
    else setError(r.error?.mensaje ?? 'No se pudo crear el torneo.');
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Nuevo torneo"
      descripcion="Después vas a poder crear las categorías (7ma, 5ta, etc.)."
      pie={
        <>
          <Button variante="fantasma" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variante="primario" type="submit" form="form-torneo" cargando={enviando}>
            Crear torneo
          </Button>
        </>
      }
    >
      <form id="form-torneo" onSubmit={enviar} className="space-y-4" noValidate>
        {error && <Alerta tono="error">{error}</Alerta>}
        <Input
          label="Nombre del torneo"
          placeholder="Open de Primavera 2026"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          requerido
          autoFocus
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha de inicio" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Fecha de fin" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Horario de apertura"
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            ayuda="Apertura del club para inicio de cronograma."
          />
          <Input label="Horario de cierre" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Duración del partido (min)"
            type="number"
            value={duracionPartido}
            onChange={(e) => setDuracionPartido(e.target.value)}
          />
          <Input
            label="Descanso entre partidos (min)"
            type="number"
            value={descanso}
            onChange={(e) => setDescanso(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-slate-800">Días de juego</label>
          <div className="flex flex-wrap gap-2">
            {[{ id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' }, { id: 4, label: 'J' }, { id: 5, label: 'V' }, { id: 6, label: 'S' }, { id: 7, label: 'D' }].map(dia => (
              <label
                key={dia.id}
                className={`flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold cursor-pointer transition-colors ${diasJuego.includes(dia.id) ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600'}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={diasJuego.includes(dia.id)}
                  onChange={(e) => {
                    if (e.target.checked) setDiasJuego([...diasJuego, dia.id]);
                    else setDiasJuego(diasJuego.filter(d => d !== dia.id));
                  }}
                />
                {dia.label}
              </label>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function FormCategoriaModal({
  abierto,
  onCerrar,
  onCrear,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCrear: (nombre: string, precio: number) => Promise<{ ok: boolean; error?: { mensaje: string } }>;
}) {
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setPrecio('0');
    setError(null);
  }, [abierto]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return setError('Ingresá el nombre de la categoría.');

    setEnviando(true);
    const r = await onCrear(nombre.trim(), Number(precio) || 0);
    setEnviando(false);

    if (r.ok) onCerrar();
    else setError(r.error?.mensaje ?? 'No se pudo crear la categoría.');
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="sm"
      titulo="Nueva categoría"
      descripcion="Cada categoría tiene sus propias parejas, zonas y cuadro eliminatorio."
      pie={
        <>
          <Button variante="fantasma" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variante="primario" type="submit" form="form-categoria" cargando={enviando}>
            Crear categoría
          </Button>
        </>
      }
    >
      <form id="form-categoria" onSubmit={enviar} className="space-y-4" noValidate>
        {error && <Alerta tono="error">{error}</Alerta>}
        <Input
          label="Nombre"
          placeholder="7ma Caballeros"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          requerido
          autoFocus
        />
        <Input
          label="Precio de inscripción"
          type="number"
          min={0}
          step={0.01}
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          ayuda="Se usa para calcular el saldo pendiente de cada pareja."
        />
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                   */
/* -------------------------------------------------------------------------- */

const ETIQUETA_ESTADO: Record<EstadoTorneo, string> = {
  borrador: 'Borrador',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
};

function formatearRango(t: Torneo): string {
  const opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  const inicio = new Date(`${t.fecha_inicio}T00:00:00`).toLocaleDateString('es-AR', opciones);
  if (t.fecha_inicio === t.fecha_fin) return inicio;
  const fin = new Date(`${t.fecha_fin}T00:00:00`).toLocaleDateString('es-AR', opciones);
  return `${inicio} – ${fin}`;
}

function formatearPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor);
}

function IconoLapiz() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49l2.65 2.65L8.6 18.05l-3.53.88.88-3.53L16.86 4.49z" />
    </svg>
  );
}

export default TorneoDashboard;

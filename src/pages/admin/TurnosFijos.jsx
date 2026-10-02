import { useState, useMemo } from 'react';
import { useTurnos } from '../../context/TurnosContext';
import {
  Plus,
  Trash2,
  CalendarRange,
  Clock,
  Phone,
  CheckCircle2,
  AlertTriangle,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Franjas de 2 horas dentro del horario de operación. */
const obtenerHorariosFijos = (incluyeManana) => {
  const startHour = incluyeManana ? 8 : 14;
  const horarios = [];
  for (let h = startHour; h <= 22; h += 2) {
    horarios.push(`${h.toString().padStart(2, '0')}:00`);
  }
  return horarios;
};

export default function TurnosFijos() {
  const {
    turnosFijos,
    agregarTurnoFijo,
    actualizarTurnoFijo,
    eliminarTurnoFijo,
    canchasActivas,
    incluyeManana,
    modoLocal,
  } = useTurnos();

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Se recalcula cuando cambia la configuración de horarios
  const horariosDisponibles = useMemo(
    () => obtenerHorariosFijos(incluyeManana),
    [incluyeManana]
  );

  // Formulario nuevo turno fijo
  const [formDia, setFormDia] = useState('Lunes');
  const [formHorario, setFormHorario] = useState('14:00');
  const [formCanchaId, setFormCanchaId] = useState('');
  const [formCliente, setFormCliente] = useState('');
  const [formTelefono, setFormTelefono] = useState('');

  const resetForm = () => {
    setFormDia('Lunes');
    setFormHorario(horariosDisponibles[0] || '14:00');
    setFormCanchaId(canchasActivas[0]?.id || '');
    setFormCliente('');
    setFormTelefono('');
  };

  const abrirModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!formCliente.trim() || !formCanchaId) return;

    setGuardando(true);
    try {
      await agregarTurnoFijo({
        dia: formDia,
        horario: formHorario,
        duracion: 120,
        cancha_id: formCanchaId,
        cliente: formCliente.trim(),
        telefono: formTelefono.trim(),
        activo: true,
      });
      resetForm();
      setModalOpen(false);
    } catch (err) {
      console.error('[TurnosFijos] No se pudo guardar el abono:', err);
      alert('No se pudo guardar el abono. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (id) => {
    try {
      await eliminarTurnoFijo(id);
    } catch (err) {
      console.error('[TurnosFijos] No se pudo eliminar el abono:', err);
      alert('No se pudo eliminar el abono.');
    } finally {
      setConfirmDelete(null);
    }
  };

  /** Pausar / reanudar un abono sin perder su historial. */
  const toggleActivo = async (turno) => {
    try {
      await actualizarTurnoFijo(turno.id, { activo: !turno.activo });
    } catch (err) {
      console.error('[TurnosFijos] No se pudo cambiar el estado del abono:', err);
      alert('No se pudo actualizar el abono.');
    }
  };

  const nombreCanchaDe = (canchaId) =>
    canchasActivas.find((c) => c.id === canchaId)?.nombre || '—';

  const colorCanchaDe = (canchaId) =>
    canchasActivas.find((c) => c.id === canchaId)?.color_identificador || '#a1a1aa';

  const activos = turnosFijos.filter((t) => t.activo !== false);
  const pausados = turnosFijos.filter((t) => t.activo === false);

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full pb-10">
      {/* ─── Cabecera ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
       

        <button
          type="button"
          onClick={abrirModal}
          disabled={canchasActivas.length === 0}
          className="bg-punto-brand text-white px-6 py-3 sm:py-2.5 rounded-lg font-bold shadow-sm hover:bg-punto-hover transition-all flex items-center justify-center gap-2 w-full sm:w-auto active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Turno Fijo</span>
        </button>
      </div>

      {canchasActivas.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 font-medium">
            No hay canchas cargadas. Creá al menos una en la tabla <code className="font-mono">canchas</code> de
            Supabase antes de generar abonos.
          </p>
        </div>
      )}

      {modoLocal && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 font-medium">
            Sin Supabase: los abonos se guardan sólo en este navegador.
          </p>
        </div>
      )}

      {/* ─── Tabla de Turnos Fijos ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {turnosFijos.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-6">
            <CalendarRange className="w-12 h-12 text-slate-300 stroke-1 mb-3" />
            <p className="font-bold text-slate-700 text-sm">No hay turnos fijos registrados</p>
            <p className="text-xs text-slate-400 mt-1">
              Creá el primer abono con el botón &quot;Nuevo Turno Fijo&quot; para reservar un horario recurrente.
            </p>
          </div>
        ) : (
          <>
            {/* ─── Mobile: lista de cards (<sm) ─── */}
            <div className="sm:hidden divide-y divide-zinc-100">
              {turnosFijos.map((turno) => (
                <div
                  key={turno.id}
                  className={`p-4 flex items-start gap-3 active:bg-zinc-50 transition-colors ${
                    turno.activo === false ? 'opacity-55' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CalendarRange className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-sm leading-tight">
                      Todos los {turno.dia}
                      {turno.activo === false && (
                        <span className="ml-2 text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          Pausado
                        </span>
                      )}
                    </p>
                    <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">
                      {turno.horario} hs
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded ml-1.5">
                        {turno.duracion_minutos} min
                      </span>
                    </p>
                    <p className="text-xs font-semibold text-slate-700 mt-1.5 truncate capitalize">
                      {turno.cliente}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: colorCanchaDe(turno.cancha_id) }}
                        />
                        {nombreCanchaDe(turno.cancha_id)}
                      </span>
                      {turno.telefono && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {turno.telefono}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActivo(turno)}
                      aria-label={turno.activo === false ? 'Reanudar abono' : 'Pausar abono'}
                      title={turno.activo === false ? 'Reanudar' : 'Pausar'}
                      className="w-9 h-9 rounded-lg text-amber-600 hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center"
                    >
                      {turno.activo === false ? (
                        <PlayCircle className="w-4 h-4" />
                      ) : (
                        <PauseCircle className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(turno)}
                      aria-label={`Eliminar abono de ${turno.cliente}`}
                      className="w-9 h-9 rounded-lg text-red-500 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* ─── Desktop: tabla (sm+) ─── */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-zinc-200">
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Día de la Semana
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Horario
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Cancha
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Cliente
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Teléfono
                  </th>
                  <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {turnosFijos.map((turno) => (
                  <tr
                    key={turno.id}
                    className={`hover:bg-zinc-50 transition-colors group ${
                      turno.activo === false ? 'opacity-55' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <CalendarRange className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">
                          Todos los {turno.dia}
                        </span>
                        {turno.activo === false && (
                          <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            Pausado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{turno.horario} hs</span>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded ml-1">
                          {turno.duracion_minutos} min
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: colorCanchaDe(turno.cancha_id) }}
                        />
                        {nombreCanchaDe(turno.cancha_id)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
                          {turno.cliente.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-bold text-slate-900 text-sm capitalize">{turno.cliente}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500 font-medium">{turno.telefono || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => toggleActivo(turno)}
                          aria-label={turno.activo === false ? 'Reanudar abono' : 'Pausar abono'}
                          title={turno.activo === false ? 'Reanudar' : 'Pausar'}
                          className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                        >
                          {turno.activo === false ? (
                            <PlayCircle className="w-4 h-4" />
                          ) : (
                            <PauseCircle className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(turno)}
                          aria-label="Eliminar turno fijo"
                          className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {/* Resumen rápido */}
      <div className="flex items-start sm:items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 sm:px-5 py-3.5">
        <CalendarRange className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
        <p className="text-xs text-slate-500 font-medium">
          <span className="font-bold text-slate-700">
            {activos.length} abono{activos.length !== 1 ? 's' : ''} activo{activos.length !== 1 ? 's' : ''}
          </span>
          {pausados.length > 0 && (
            <>
              {' · '}
              <span className="font-bold text-amber-700">
                {pausados.length} pausado{pausados.length !== 1 ? 's' : ''}
              </span>
            </>
          )}
          . Los abonos se generan cada semana en bloques de 2 horas (120 min) y aparecen en la Grilla Diaria del cajero.
        </p>
      </div>

      {/* ─── Modal Nuevo Turno Fijo ─── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain-smooth pb-safe animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden">
              <div className="w-11 h-1.5 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-5">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Nuevo Turno Fijo</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configurá una reserva recurrente semanal de 2 horas (120 min).
                </p>
              </div>
              <button
                type="button"
                onClick={() => { resetForm(); setModalOpen(false); }}
                aria-label="Cerrar"
                className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={guardar} className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Día</label>
                  <select
                    value={formDia}
                    onChange={(e) => setFormDia(e.target.value)}
                    className={inputCls}
                  >
                    {DIAS_SEMANA.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Horario (2 hs)
                  </label>
                  {/* 3. Selector limpio con saltos exactos de 2 horas */}
                  <select
                    value={formHorario}
                    onChange={(e) => setFormHorario(e.target.value)}
                    className={inputCls}
                  >
                    {horariosDisponibles.map((h) => (
                      <option key={h} value={h}>
                        {h} hs
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cancha</label>
                <select
                  value={formCanchaId}
                  onChange={(e) => setFormCanchaId(e.target.value)}
                  className={inputCls}
                >
                  {canchasActivas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre del Cliente</label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={formCliente}
                  onChange={(e) => setFormCliente(e.target.value)}
                  placeholder="Nombre y Apellido"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
                  placeholder="381 xxx xxxx"
                  className={inputCls}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { resetForm(); setModalOpen(false); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || !formCanchaId}
                  className="flex-[2] py-3.5 sm:py-3 rounded-xl bg-punto-brand text-white text-sm font-bold hover:bg-punto-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {guardando ? 'Guardando…' : 'Crear Abono (2 hs)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Confirmar Eliminación ─── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 pb-safe animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 text-base">
                  Eliminar Turno Fijo
                </h3>
                <p className="text-xs text-slate-500">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-sm text-slate-700 space-y-1 mb-5">
              <p>
                <span className="text-slate-500">Cliente:</span>{' '}
                <span className="font-bold text-slate-900">{confirmDelete.cliente}</span>
              </p>
              <p>
                <span className="text-slate-500">Horario:</span>{' '}
                <span className="font-bold text-slate-900">
                  Todos los {confirmDelete.dia} a las {confirmDelete.horario} hs (2 hs)
                </span>
              </p>
              <p>
                <span className="text-slate-500">Cancha:</span>{' '}
                <span className="font-bold text-slate-900">
                  {nombreCanchaDe(confirmDelete.cancha_id)}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 sm:flex-none px-4 py-3.5 sm:py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => eliminar(confirmDelete.id)}
                className="flex-1 sm:flex-none px-4 py-3.5 sm:py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

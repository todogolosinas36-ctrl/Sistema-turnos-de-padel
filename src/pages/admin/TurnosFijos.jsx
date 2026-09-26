import { useState, useMemo } from 'react';
import { useTurnos } from '../../context/TurnosContext';
import {
  Plus,
  Trash2,
  CalendarRange,
  Clock,
  MapPin,
  User,
  Phone,
  X,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const CANCHAS_OPCIONES = ['Alfombra Roja', 'Alfombra Verde'];

// 1. Generador de horarios con fraccionamiento estricto de 2 horas (120 min)
const obtenerHorariosFijos = () => {
  const incluyeManana = localStorage.getItem('puntoexe-manana') === 'true';
  const startHour = incluyeManana ? 8 : 14;
  const horarios = [];
  for (let h = startHour; h <= 22; h += 2) {
    horarios.push(`${h.toString().padStart(2, '0')}:00`);
  }
  return horarios;
};

export default function TurnosFijos() {
  const { turnosFijos, setTurnosFijos } = useTurnos();

  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Recalcular horarios disponibles respetando la configuración
  const horariosDisponibles = useMemo(() => obtenerHorariosFijos(), [modalOpen]);

  // Formulario nuevo turno fijo
  const [formDia, setFormDia] = useState('Lunes');
  const [formHorario, setFormHorario] = useState('14:00');
  const [formCancha, setFormCancha] = useState('Alfombra Roja');
  const [formCliente, setFormCliente] = useState('');
  const [formTelefono, setFormTelefono] = useState('');

  const resetForm = () => {
    setFormDia('Lunes');
    setFormHorario(horariosDisponibles[0] || '14:00');
    setFormCancha('Alfombra Roja');
    setFormCliente('');
    setFormTelefono('');
  };

  // 2. Guardar Turno Fijo con duración estricta de 120 minutos (2 horas)
  const agregarTurnoFijo = (e) => {
    e.preventDefault();
    if (!formCliente.trim()) return;
    const nuevo = {
      id: Date.now(),
      dia: formDia,
      horario: formHorario,
      cancha: formCancha,
      cliente: formCliente.trim(),
      telefono: formTelefono.trim(),
      duracion: 120,
      duracion_minutos: 120,
      activo: true,
    };
    setTurnosFijos((prev) => [...prev, nuevo]);
    resetForm();
    setModalOpen(false);
  };

  const eliminarTurno = (id) => {
    setTurnosFijos((prev) => prev.filter((t) => t.id !== id));
    setConfirmDelete(null);
  };

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full pb-10">
      {/* ─── Cabecera ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            Turnos Fijos
          </h1>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormHorario(horariosDisponibles[0] || '14:00');
            setModalOpen(true);
          }}
          className="bg-punto-brand text-white px-6 py-3 sm:py-2.5 rounded-lg font-bold shadow-sm hover:bg-punto-hover transition-all flex items-center justify-center gap-2 w-full sm:w-auto active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Turno Fijo</span>
        </button>
      </div>

      {/* ─── Tabla de Turnos Fijos ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {turnosFijos.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-6">
            <CalendarRange className="w-12 h-12 text-slate-300 stroke-1 mb-3" />
            <p className="font-bold text-slate-700 text-sm">No hay turnos fijos registrados</p>
            <p className="text-xs text-slate-400 mt-1">
              Creá el primer abono con el botón "Nuevo Turno Fijo" para reservar un horario recurrente.
            </p>
          </div>
        ) : (
          <>
            {/* ─── Mobile: lista de cards (<sm) ─── */}
            <div className="sm:hidden divide-y divide-zinc-100">
              {turnosFijos.map((turno) => (
                <div
                  key={turno.id}
                  className="p-4 flex items-start gap-3 active:bg-zinc-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <CalendarRange className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 text-sm leading-tight">
                      Todos los {turno.dia}
                    </p>
                    <p className="text-sm font-bold text-slate-700 mt-1 tabular-nums">
                      {turno.horario} hs
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded ml-1.5">
                        {turno.duracion || turno.duracion_minutos || 120} min
                      </span>
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1.5 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            turno.cancha === 'Alfombra Roja' ? 'bg-red-500' : 'bg-green-500'
                          }`}
                        />
                        {turno.cancha}
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

                  <button
                    type="button"
                    onClick={() => setConfirmDelete(turno)}
                    aria-label={`Eliminar abono de ${turno.cliente}`}
                    className="w-9 h-9 shrink-0 rounded-lg text-red-500 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
                    className="hover:bg-zinc-50 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <CalendarRange className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">
                          Todos los {turno.dia}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{turno.horario} hs</span>
                        <span className="text-[10px] font-semibold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded ml-1">
                          {turno.duracion || turno.duracion_minutos || 120} min
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            turno.cancha === 'Alfombra Roja' ? 'bg-red-500' : 'bg-green-500'
                          }`}
                        />
                        {turno.cancha}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-black shrink-0">
                          {turno.cliente.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-bold text-slate-900 text-sm">{turno.cliente}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-500 font-medium">{turno.telefono || '—'}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(turno)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                        title="Eliminar turno fijo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
          <span className="font-bold text-slate-700">{turnosFijos.length} abono{turnosFijos.length !== 1 ? 's' : ''}</span> configurado{turnosFijos.length !== 1 ? 's' : ''}.
          Los turnos fijos se generan cada semana en bloques de 2 horas (120 minutos) y aparecen en la Grilla Diaria del cajero.
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

            <form onSubmit={agregarTurnoFijo} className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
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
                  value={formCancha}
                  onChange={(e) => setFormCancha(e.target.value)}
                  className={inputCls}
                >
                  {CANCHAS_OPCIONES.map((c) => <option key={c} value={c}>{c}</option>)}
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
                  className="flex-[2] py-3 rounded-xl bg-punto-brand text-white text-sm font-bold hover:bg-punto-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Crear Abono (2 hs)
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
                <span className="font-bold text-slate-900">{confirmDelete.cancha}</span>
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
                onClick={() => eliminarTurno(confirmDelete.id)}
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

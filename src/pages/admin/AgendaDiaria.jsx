import { useState, useEffect, useMemo } from 'react';
import { generarBloquesHorarios, hoyISO, sumarDias } from '../../utils/dateHelpers';
import { calcularHoraFin } from '../../utils/timeCalculations';
import { useTurnos } from '../../context/TurnosContext';
import ModalCobro from '../../components/ModalCobro';
import {
  Plus, DollarSign, MoreVertical,
  Trash2, RefreshCw, Calendar, X, ChevronLeft, ChevronRight,
} from 'lucide-react';

const DURACION = 30;

/* La grilla se arma dinámicamente según cuántas canchas haya: antes estaba
   cableada a 2 (grid de 3 columnas y headers "Cancha 1/2"), así que una
   tercera cancha no aparecía nunca. */
const grillaDe = (cantCanchas) => {
  const fracciones = Array(cantCanchas).fill('1fr').join(' ');
  const anchoHora = cantCanchas > 2 ? '44px' : '52px';
  return {
    celdas: `grid-cols-[${anchoHora}_${fracciones}]`,
    completo: `sm:grid-cols-[80px_${fracciones}]`,
    anchoHora,
  };
};

/* ─── Estilos por estado del turno (Estética Premium SaaS) ─── */
const ESTADO_ESTILOS = {
  pagado: {
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    label: 'Pagado ✓',
  },
  confirmado: {
    border: 'border-l-blue-500',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
    label: 'Confirmado',
  },
  abono: {
    border: 'border-l-violet-500',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
    label: 'Abono Fijo',
  },
  pendiente: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    label: 'Pendiente / Seña',
  },
};

/* ─── Modal de carga rápida ─── */
function ModalCargaRapida({ bloque, cancha, fecha, turnos, horaApertura, precioBase, onClose, onConfirm }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [duracion, setDuracion] = useState('90');
  const [horaInicio, setHoraInicio] = useState(bloque);
  const [saving, setSaving] = useState(false);

  const [h, m] = horaInicio.split(':').map(Number);
  const maxDuracion = 1440 - (h * 60 + m);

  useEffect(() => {
    if (parseInt(duracion, 10) > maxDuracion) {
      setDuracion(maxDuracion >= 90 ? '90' : '60');
    }
  }, [horaInicio, maxDuracion, duracion]);

  const horaFin = calcularHoraFin(horaInicio, parseInt(duracion, 10));

  const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, mins] = timeStr.substring(0, 5).split(':').map(Number);
    return hours * 60 + mins;
  };

  const isOverlapping = (hInicio, hFin) => {
    const minStart1 = toMinutes(hInicio);
    const minEnd1 = toMinutes(hFin);
    return turnos.some((t) => {
      const minStart2 = toMinutes(t.hora_inicio);
      const minEnd2 = toMinutes(t.hora_fin);
      return Math.max(minStart1, minStart2) < Math.min(minEnd1, minEnd2);
    });
  };

  const haySuperposicion = isOverlapping(horaInicio, horaFin);
  const horariosPosibles = generarBloquesHorarios(horaApertura, '23:30', 30).filter(b => {
    const [bh, bm] = b.split(':').map(Number);
    return bh * 60 + bm + 60 <= 1440;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (haySuperposicion) return;
    setSaving(true);
    try {
      await onConfirm({
        cancha_id: cancha.id,
        cancha_nombre: cancha.nombre,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        duracion_minutos: parseInt(duracion, 10),
        cliente_nombre: nombre.trim(),
        cliente_apellido: '',
        cliente_telefono: telefono.trim(),
        estado: 'confirmado',
        origen: 'admin',
        total_base_cancha: precioBase || null,
      });
    } catch (err) {
      console.error('[Agenda] No se pudo crear el turno:', err);
      alert('No se pudo guardar el turno. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all';

  return (
    <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden max-h-[92dvh] overflow-y-auto overscroll-contain-smooth animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center sticky top-0 z-10">
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Nuevo Turno
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-lg leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {/* Handle de arrastre (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0.5">
          <div className="w-11 h-1.5 bg-slate-200 rounded-full" />
        </div>

        <div className="p-4 sm:p-6 flex flex-col gap-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <div className="bg-indigo-50 text-indigo-800 p-3 rounded-lg font-bold flex flex-col gap-1 text-center">
            <span>{cancha.nombre}</span>
            <span className="text-sm opacity-80">{fecha}</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Horario de Inicio</label>
              <select
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
              >
                {horariosPosibles.map((h) => {
                  const s2 = toMinutes(h);
                  const isOccupied = turnos.some((t) => {
                    const ts = toMinutes(t.hora_inicio);
                    const te = toMinutes(t.hora_fin);
                    return Math.max(s2, ts) < Math.min(s2 + 30, te);
                  });
                  return (
                    <option key={h} value={h} disabled={isOccupied}>
                      {h} hs {isOccupied ? '(Ocupado)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Duración</label>
              <select
                value={duracion}
                onChange={(e) => setDuracion(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
              >
                <option value="60" disabled={maxDuracion < 60}>60 minutos</option>
                <option value="90" disabled={maxDuracion < 90}>90 minutos</option>
                <option value="120" disabled={maxDuracion < 120}>120 minutos</option>
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre</label>
                <input autoFocus type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Teléfono</label>
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" className={inputCls} />
              </div>
            </div>
            
            {haySuperposicion && (
              <p className="text-xs text-red-500 font-bold text-center">
                ⚠️ La reserva se superpone con un turno existente.
              </p>
            )}

            <button
              type="submit"
              disabled={saving || haySuperposicion}
              className="mt-2 w-full py-4 sm:py-3.5 rounded-xl bg-punto-brand text-white text-sm font-black hover:bg-punto-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando…</> : 'Confirmar Reserva'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Popover de acciones del bloque ocupado ─── */
function BloqueAcciones({ turno, onCobrar, onCancelar, onClose }) {
  const [cobrando, setCobrando] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const estaPagado = turno.estado === 'pagado' || Boolean(turno.pagado) || Boolean(turno.cobrado_el);

  const horaInicio = turno.hora_inicio?.substring(0, 5) || '';
  const horaFin = calcularHoraFin(horaInicio, turno.duracion_minutos || 90);
  const horarioTexto = horaInicio && horaFin ? `${horaInicio} - ${horaFin} hs` : horaInicio ? `${horaInicio} hs` : '';
  const nombreCliente = `${turno.cliente_nombre || 'Cliente'} ${turno.cliente_apellido || ''}`.trim();

  const handleCobrar = async () => {
    setCobrando(true);
    await onCobrar();
    setCobrando(false);
    onClose();
  };

  const handleCancelar = async () => {
    if (estaPagado) return;
    if (!confirm(`¿Cancelar el turno de ${nombreCliente}?`)) return;
    setCancelando(true);
    await onCancelar();
    setCancelando(false);
    onClose();
  };

  const cabeceraContexto = (
    <div className="border-b border-gray-100 pb-3 mb-1 px-4 pt-4 text-left">
      <p className="font-bold text-gray-800 text-sm truncate leading-tight capitalize">
        {nombreCliente}
      </p>
      <p className="text-xs text-gray-500 mt-1 tabular-nums flex items-center gap-1.5 flex-wrap">
        <span>{horarioTexto}</span>
        {(turno.cancha_nombre || turno.cancha) && (
          <>
            <span className="text-gray-300">•</span>
            <span className="uppercase font-medium text-[11px] text-gray-400">
              {turno.cancha_nombre || turno.cancha}
            </span>
          </>
        )}
      </p>
    </div>
  );

  const listaBotones = (
    <div className="flex flex-col py-1">
      {!estaPagado && (
        <button
          type="button"
          onClick={handleCobrar}
          disabled={cobrando}
          className="flex items-center gap-3 w-full text-left px-4 py-3 transition-colors text-sm font-medium text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 cursor-pointer disabled:opacity-50"
        >
          {cobrando ? (
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          ) : (
            <DollarSign className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span>Cobrar Turno</span>
        </button>
      )}

      <button
        type="button"
        onClick={handleCancelar}
        disabled={estaPagado || cancelando}
        className={`flex items-center gap-3 w-full text-left px-4 py-3 transition-colors text-sm font-medium ${
          estaPagado
            ? 'text-gray-400 cursor-not-allowed opacity-50 pointer-events-none'
            : 'text-red-600 hover:bg-red-50 active:bg-red-100 cursor-pointer disabled:opacity-50'
        }`}
      >
        {cancelando ? (
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          <Trash2 className="w-4 h-4 shrink-0" />
        )}
        <span>{estaPagado ? 'No cancelable (Pagado)' : 'Cancelar Turno'}</span>
      </button>

      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-3 w-full text-left px-4 py-3 transition-colors text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
      >
        <X className="w-4 h-4 shrink-0 text-gray-400" />
        <span>Cerrar</span>
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-zinc-950/40 sm:bg-zinc-950/30 backdrop-blur-[2px] animate-in fade-in duration-150 p-0 sm:p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      {/* ─── Mobile: bottom sheet ─── */}
      <div
        className="sm:hidden w-full bg-white rounded-t-3xl shadow-2xl border-t border-gray-100 overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom,0px))] animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-11 h-1.5 bg-slate-200 rounded-full" />
        </div>
        {cabeceraContexto}
        {listaBotones}
      </div>

      {/* ─── Desktop: popover centrado ─── */}
      <div
        className="hidden sm:block absolute z-50 bg-white rounded-xl shadow-xl border border-gray-100 min-w-[220px] max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {cabeceraContexto}
        {listaBotones}
      </div>
    </div>
  );
}

/* ─── Bloque Ocupado (dentro de la celda) ─── */
const calcularHoraFinReal = (horaInicio, duracionMinutos) => {
  if (!horaInicio || !duracionMinutos) return '';
  const [horas, minutos] = horaInicio.split(':').map(Number);
  const totalMinutos = minutos + parseInt(duracionMinutos, 10);
  const horasExtra = Math.floor(totalMinutos / 60);
  const minutosFinales = totalMinutos % 60;
  const horasFinales = horas + horasExtra;
  
  const horasStr = horasFinales.toString().padStart(2, '0');
  const minutosStr = minutosFinales.toString().padStart(2, '0');
  return `${horasStr}:${minutosStr}`;
};

function BloqueOcupado({ turno, colorHex, onAbrirCobro }) {
  const { cambiarEstado } = useTurnos();
  const [showMenu, setShowMenu] = useState(false);
  const estado = turno.estado;

  const estilos = ESTADO_ESTILOS[estado] || ESTADO_ESTILOS.confirmado;

  const handleCobrar = async () => {
    setShowMenu(false);
    onAbrirCobro(turno);
  };

  const handleCancelar = async () => {
    await cambiarEstado(turno.id, 'cancelado');
  };

  const span = (turno.duracion_minutos || 90) / 30;
  const heightPercent = span * 100;

  const esAbono = Boolean(turno.es_fijo);
  const esPagado = turno.estado === 'pagado';
  const esPendiente = turno.estado === 'pendiente' || turno.estado === 'seña' || turno.estado === 'con_seña';

  let configEstado = ESTADO_ESTILOS.confirmado;
  if (esAbono) {
    configEstado = ESTADO_ESTILOS.abono;
  } else if (esPagado) {
    configEstado = ESTADO_ESTILOS.pagado;
  } else if (esPendiente) {
    configEstado = ESTADO_ESTILOS.pendiente;
  }

  return (
    <>
      <div
        className={`absolute left-0 right-0 top-0 m-0.5 sm:m-1 bg-white border border-slate-200 rounded-xl p-1 sm:p-2 flex flex-col items-center justify-center text-center border-l-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden z-10 select-none animate-fade-in ${configEstado.border}`}
        style={{ height: `calc(${heightPercent}% - 6px)` }}
        onClick={() => {
          if (turno.estado !== 'pagado') {
            onAbrirCobro(turno);
          } else {
            setShowMenu(true);
          }
        }}
      >
        {/* Nombre del jugador */}
        <p className="font-bold text-slate-800 text-xs sm:text-sm truncate w-full leading-tight capitalize">
          {turno.cliente_nombre} {turno.cliente_apellido}
        </p>

        {/* Horario */}
        <div className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 tabular-nums leading-none">
          {turno.hora_inicio?.substring(0, 5)} -{' '}
          {calcularHoraFinReal(turno.hora_inicio?.substring(0, 5), turno.duracion_minutos || 90)}
        </div>

        {/* Cancha (redundante en mobile: la columna ya la identifica) */}
        {span >= 3 && (
          <div className="hidden sm:block text-[10px] text-slate-400 uppercase font-medium mt-0.5 truncate w-full leading-none">
            {turno.cancha_nombre || turno.cancha}
          </div>
        )}

        {/* Estado / Badge diferenciador */}
        <span
          className={`mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit leading-none shadow-2xs ${configEstado.badge}`}
        >
          {configEstado.label}
        </span>

        {/* Botón de menú */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
          aria-label="Acciones del turno"
          className="absolute top-1 right-1 sm:top-2 sm:right-2 w-7 sm:w-6 h-7 sm:h-6 rounded-lg flex items-center justify-center opacity-70 sm:opacity-40 hover:opacity-100 transition-opacity bg-white hover:bg-slate-100 active:scale-90 shadow-2xs"
        >
          <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      {showMenu && (
        <BloqueAcciones
          turno={{ ...turno, estado }}
          onCobrar={handleCobrar}
          onCancelar={handleCancelar}
          onClose={() => setShowMenu(false)}
        />
      )}
    </>
  );
}

/* ─── AgendaDiaria (Matriz) ─── */
export default function AgendaDiaria({ fecha: fechaProp }) {
  const {
    obtenerTurnosDelDia,
    agregarTurno,
    cambiarEstado,
    canchasActivas,
    incluyeManana,
    loading: cargandoContexto,
    recargar,
    precioBaseCancha,
  } = useTurnos();

  const [fecha, setFecha] = useState(fechaProp ?? hoyISO);
  const [modal, setModal] = useState(null);
  const [turnoParaCobro, setTurnoParaCobro] = useState(null);

  const horaApertura = incluyeManana ? '08:00' : '14:00';
  const bloques = useMemo(
    () => generarBloquesHorarios(horaApertura, '23:30', DURACION),
    [horaApertura]
  );

  const canchas = canchasActivas;
  const grilla = grillaDe(canchas.length);
  const loading = cargandoContexto;

  const turnosDelDia = useMemo(() => obtenerTurnosDelDia(fecha), [obtenerTurnosDelDia, fecha]);

  /* Las canchas vienen de la base con su UUID real: ya no hace falta adivinar
     a qué columna pertenece un turno comparando el texto del nombre. */
  const turnosPorCancha = useMemo(() => {
    const mapa = {};
    for (const cancha of canchas) {
      mapa[cancha.id] = turnosDelDia.filter(
        (t) => t.cancha_id === cancha.id || t.cancha_nombre === cancha.nombre
      );
    }
    return mapa;
  }, [canchas, turnosDelDia]);

  // Navegación de fecha
  const cambiarDia = (delta) => setFecha((f) => sumarDias(f, delta));

  const fechaFormateada = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const fechaCap = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1);

  // Estadísticas
  const totalTurnos = Object.values(turnosPorCancha).flat().length;
  const totalSlots = bloques.length * canchas.length;

  return (
    <div className="flex flex-col gap-4 sm:gap-6 flex-1 min-h-0">
      {/* ─── Contenedor Principal de la Matriz ─── */}
      <div className="flex flex-col flex-1 min-h-[440px] bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* ─── Cabecera Superior (Controles) ─── */}
        <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-wrap justify-between items-center bg-slate-50 gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Flechas de navegación */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => cambiarDia(-1)}
                aria-label="Día anterior"
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-600 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => cambiarDia(1)}
                aria-label="Día siguiente"
                className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-600 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Fecha actual con selector */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <Calendar className="hidden sm:block w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                aria-label="Seleccionar fecha"
                className="min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 sm:px-3 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              />
              <span className="hidden sm:inline text-sm font-medium text-slate-500">
                {fechaCap}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Stats rápidos */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
              <span className="text-slate-700">{totalTurnos}/{totalSlots}</span>
              <span>ocupados</span>
              <span className="text-slate-300">|</span>
              <span className={totalTurnos > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                {totalSlots > 0 ? Math.round((totalTurnos / totalSlots) * 100) : 0}%
              </span>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={recargar}
              disabled={loading}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-600 transition-all disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Botón Nuevo Turno */}
            <button
              type="button"
              onClick={() => {
                const firstFreeBlock = bloques[0];
                const firstCancha = canchas[0];
                const targetKey = firstCancha?.id;
                setModal({
                  bloque: firstFreeBlock,
                  cancha: firstCancha,
                  turnos: turnosPorCancha[targetKey] || []
                });
              }}
              className="bg-punto-brand hover:bg-punto-hover text-white text-sm font-bold px-4 py-2 rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Turno
            </button>
          </div>
        </div>

        {/* ─── Loading ─── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
            <p className="text-xs font-semibold text-slate-400">Cargando agenda…</p>
          </div>
        ) : (
          /* ─── Matriz: scroll vertical + horizontal en mobile ─── */
          <div className="flex-1 overflow-auto overscroll-contain-smooth">
            <div
              key={fecha}
              className="min-w-full w-max flex flex-col animate-fade-in"
            >
              {/* ─── Cabeceras de la Matriz (X-Axis) ─── */}
              <div className="flex flex-row sticky top-0 z-20 bg-white shadow-sm border-b border-slate-200 min-w-full">
                <div className="sticky top-0 left-0 z-30 bg-white border-r border-slate-200 py-1 sm:py-1.5 px-2 flex items-center justify-center w-24 shrink-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Hora
                  </span>
                </div>

                {canchas.map((cancha, i) => (
                  <div
                    key={cancha.id}
                    className={`flex-1 min-w-[140px] py-1 sm:py-1.5 px-2 text-center bg-white ${
                      i < canchas.length - 1 ? 'border-r border-slate-200' : ''
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1.5 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 shadow-2xs ${cancha.colorHex ? '' : cancha.dot || 'bg-red-500'}`}
                        style={cancha.colorHex ? { backgroundColor: cancha.colorHex } : undefined}
                      />
                      <span className="font-semibold text-gray-700 tracking-wide text-xs sm:text-sm truncate uppercase leading-tight">
                        {cancha.nombre || 'Cancha'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
                      {turnosPorCancha[cancha.dbId || cancha.id]?.length || 0} turnos
                    </p>
                  </div>
                ))}
              </div>

              {/* ─── Cuerpo de la Matriz (Filas de horario) ─── */}
              {bloques.map((bloque) => {
                const horaFin = calcularHoraFin(bloque, DURACION);

                return (
                  <div key={bloque} className="flex flex-row border-b border-slate-100 min-w-full">
                    {/* Celda de Hora (fija al scrollear en horizontal) */}
                    <div className="sticky left-0 z-10 border-r border-slate-100 px-1 py-0.5 sm:py-1 flex flex-col items-center justify-center bg-white/95 backdrop-blur-xs w-24 shrink-0">
                      <span className="text-xs font-semibold text-slate-600 tabular-nums leading-none">
                        {bloque}
                      </span>
                      <span className="text-[10px] text-slate-400 tabular-nums leading-none mt-0.5">
                        {horaFin}
                      </span>
                    </div>

                    {/* Celdas de Canchas */}
                    {canchas.map((cancha, i) => {
                      const turnosCancha = turnosPorCancha[cancha.id] ?? [];
                      const turno = turnosCancha.find(
                        (t) => t.hora_inicio?.substring(0, 5) === bloque
                      );

                      return (
                        <div
                          key={cancha.id}
                          className={`flex-1 min-w-[140px] relative min-h-[36px] sm:min-h-[40px] ${
                            !turno
                              ? 'group cursor-pointer transition-colors duration-200 hover:bg-slate-50'
                              : ''
                          } ${
                            i < canchas.length - 1 ? 'border-r border-slate-100' : ''
                          } ${turno ? 'z-10' : 'z-0'}`}
                          onClick={() => {
                            if (!turno) {
                              setModal({ bloque, cancha, turnos: turnosCancha });
                            }
                          }}
                        >
                          {turno ? (
                            <BloqueOcupado
                              turno={turno}
                              colorHex={cancha.color_identificador}
                              onAbrirCobro={setTurnoParaCobro}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 text-sm font-medium">
                                + Reservar
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Leyenda ─── */}
      <div className="flex items-center gap-x-4 gap-y-2 px-1 flex-wrap shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border border-slate-200 border-l-[3px] border-l-emerald-500 bg-white shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Pagado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border border-slate-200 border-l-[3px] border-l-blue-500 bg-white shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Confirmado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border border-slate-200 border-l-[3px] border-l-violet-500 bg-white shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Abono (Fijo)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm border border-slate-200 border-l-[3px] border-l-amber-500 bg-white shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Pendiente / Seña</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-100 border border-dashed border-slate-300" />
          <span className="text-xs font-semibold text-slate-500">Libre</span>
        </div>
      </div>

      {/* ─── Modal Carga Rápida ─── */}
      {modal && (
        <ModalCargaRapida
          bloque={modal.bloque}
          cancha={modal.cancha}
          fecha={fecha}
          turnos={modal.turnos}
          horaApertura={horaApertura}
          precioBase={precioBaseCancha}
          onClose={() => setModal(null)}
          onConfirm={async (nuevoTurno) => {
            await agregarTurno(nuevoTurno);
            setModal(null);
          }}
        />
      )}

      {/* ─── Modal Cobro Inteligente (Split Payment) ─── */}
      <ModalCobro
        isOpen={!!turnoParaCobro}
        turno={turnoParaCobro}
        onClose={() => setTurnoParaCobro(null)}
        onConfirmarCobro={async (turnoId, detalleCobro) => {
          setTurnoParaCobro(null);
          try {
            await cambiarEstado(turnoId, 'pagado', detalleCobro || {});
          } catch (err) {
            console.error('[Agenda] No se pudo registrar el cobro:', err);
          }
        }}
      />
    </div>
  );
}

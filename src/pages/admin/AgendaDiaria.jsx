import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { generarBloquesHorarios, hoyISO, sumarDias } from '../../utils/dateHelpers';
import { calcularHoraFin } from '../../utils/timeCalculations';
import { useTurnos } from '../../context/TurnosContext';
import { supabase } from '../../lib/supabaseClient';
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

/* ─── Estilos por estado del turno ─── */
const ESTADO_ESTILOS = {
  pagado: {
    card:  'bg-emerald-100 border-emerald-300 text-emerald-900',
    badge: 'bg-emerald-200/70 text-emerald-900 border border-emerald-300',
    label: 'Pagado ✓',
  },
  pago_parcial: {
    card:  'bg-orange-100 border-orange-300 text-orange-900',
    badge: 'bg-orange-200/70 text-orange-900 border border-orange-300',
    label: 'Pago Parcial',
  },
  confirmado: {
    card:  'bg-blue-100 border-blue-300 text-blue-900',
    badge: 'bg-blue-200/70 text-blue-900 border border-blue-300',
    label: 'Confirmado',
  },
  abono: {
    card:  'bg-purple-100 border-purple-300 text-purple-900',
    badge: 'bg-purple-200/70 text-purple-900 border border-purple-300',
    label: 'Abono Fijo',
  },
  abono_pagado: {
    card:  'bg-purple-100 border-purple-300 text-purple-900',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    label: 'Abono Pagado ✓',
  },
  abono_parcial: {
    card:  'bg-purple-100 border-purple-300 text-purple-900',
    badge: 'bg-orange-100 text-orange-800 border-orange-300',
    label: 'Abono Parcial',
  },
  pendiente: {
    card:  'bg-pink-100 border-pink-300 text-pink-900',
    badge: 'bg-pink-200/70 text-pink-900 border border-pink-300',
    label: 'Pendiente / Seña',
  },
  torneo: {
    card:  'bg-indigo-100 border-indigo-300 text-indigo-900',
    badge: 'bg-indigo-200/70 text-indigo-900 border border-indigo-300',
    label: 'Torneo',
  },
};

/**
 * Detecta si un turno tiene pago parcial:
 * al menos un jugador del detalle_cobro está marcado como pagado
 * pero no todos lo están (el turno no está en estado 'pagado' final).
 */
const detectarPagoParcial = (turno) => {
  if (!Array.isArray(turno.detalle_cobro) || turno.detalle_cobro.length === 0) return false;
  if (turno.estado === 'pagado') return false;
  const pagados = turno.detalle_cobro.filter((j) => j.pagado).length;
  return pagados > 0 && pagados < turno.detalle_cobro.length;
};

/** Texto del indicador de jugadores: "2/4 pagaron" */
const textoJugadoresPagados = (turno) => {
  if (!Array.isArray(turno.detalle_cobro) || turno.detalle_cobro.length === 0) return null;
  const total = turno.detalle_cobro.length;
  const pagados = turno.detalle_cobro.filter((j) => j.pagado).length;
  if (pagados === 0) return null;
  return `${pagados}/${total} pagaron`;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-zinc-950/50 backdrop-blur-[2px] animate-in fade-in duration-150 p-0 sm:p-4"
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
    </div>,
    document.body
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

/* ─── Helper: convierte "HH:MM" a milisegundos desde epoch (fecha base) ─── */
const horarioAMs = (fechaISO, horaStr) => {
  if (!fechaISO || !horaStr) return 0;
  const [h, m] = horaStr.substring(0, 5).split(':').map(Number);
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

function BloqueOcupado({ turno, colorHex, onAbrirCobro }) {
  const { cambiarEstado } = useTurnos();
  const [showMenu, setShowMenu] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const intervalRef = useRef(null);
  const estado = turno.estado;

  const estilos = ESTADO_ESTILOS[estado] || ESTADO_ESTILOS.confirmado;

  /* ── Calcular progreso en vivo ── */
  const fechaTurno = turno.fecha; // "YYYY-MM-DD"
  const horaInicioStr = turno.hora_inicio?.substring(0, 5);
  const durMin = turno.duracion_minutos || 90;
  const horaFinStr = calcularHoraFinReal(horaInicioStr, durMin);

  const startMs = horarioAMs(fechaTurno, horaInicioStr);
  const endMs   = horarioAMs(fechaTurno, horaFinStr);
  const totalMs = endMs - startMs;

  const progreso = totalMs > 0
    ? Math.min(100, Math.max(0, ((currentTime - startMs) / totalMs) * 100))
    : 0;

  const tiempoCompleto = currentTime >= endMs && endMs > 0;
  const enCurso = currentTime >= startMs && currentTime < endMs && endMs > 0;

  /* ── Intervalo: actualizar cada 60 seg mientras el turno esté en curso ── */
  useEffect(() => {
    if (!enCurso && !tiempoCompleto) return;
    intervalRef.current = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60_000);
    return () => clearInterval(intervalRef.current);
  }, [enCurso, tiempoCompleto]);

  const handleCobrar = async () => {
    setShowMenu(false);
    onAbrirCobro(turno);
  };

  const handleCancelar = async () => {
    await cambiarEstado(turno.id, 'cancelado');
  };

  const span = durMin / 30;
  const heightPercent = span * 100;

  const esAbono = Boolean(turno.es_fijo);
  const esPagado = turno.estado === 'pagado' || Boolean(turno.pagado) || Boolean(turno.cobrado_el);
  const esPendiente = turno.estado === 'pendiente' || turno.estado === 'seña' || turno.estado === 'con_seña';
  const esPagoParcial = detectarPagoParcial(turno);
  const textoSplit = textoJugadoresPagados(turno);

  const esTorneo = turno.estado === 'torneo' || turno.origen === 'torneo';

  let configEstado = ESTADO_ESTILOS.confirmado;
  if (esTorneo) {
    configEstado = ESTADO_ESTILOS.torneo;
  } else if (esAbono && esPagado) {
    configEstado = ESTADO_ESTILOS.abono_pagado;
  } else if (esAbono && esPagoParcial) {
    configEstado = ESTADO_ESTILOS.abono_parcial;
  } else if (esAbono) {
    configEstado = ESTADO_ESTILOS.abono;
  } else if (esPagado) {
    configEstado = ESTADO_ESTILOS.pagado;
  } else if (esPagoParcial) {
    configEstado = ESTADO_ESTILOS.pago_parcial;
  } else if (esPendiente) {
    configEstado = ESTADO_ESTILOS.pendiente;
  }

  return (
    <>
      <div
        className={`absolute left-0 right-0 top-0 m-0.5 sm:m-1 border rounded-xl p-1 sm:p-2 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden select-none animate-fade-in ${configEstado.card} ${showMenu ? 'z-[60] shadow-lg scale-[1.02]' : 'z-10'} ${esTorneo ? 'cursor-not-allowed pointer-events-none' : ''}`}
        style={{ height: `calc(${heightPercent}% - 6px)` }}
        onClick={() => {
          if (esTorneo) return; // Bloqueo de Torneo no es clickeable
          if (turno.estado !== 'pagado') {
            onAbrirCobro(turno);
          } else {
            setShowMenu(true);
          }
        }}
      >
        {/* ── Anillo de progreso circular (top-right) ── */}
        {enCurso && (
          <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center z-20 pointer-events-none">
            <svg
              viewBox="0 0 28 28"
              className="-rotate-90 w-full h-full"
              aria-hidden="true"
            >
              {/* Pista de fondo */}
              <circle
                cx="14" cy="14" r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                className="opacity-20"
              />
              {/* Arco de progreso */}
              <circle
                cx="14" cy="14" r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="opacity-70 transition-all duration-[60000ms] ease-linear"
                strokeDasharray={62.83}
                strokeDashoffset={62.83 * (1 - progreso / 100)}
              />
            </svg>
          </div>
        )}

        {/* ── Badge "Tiempo Completo" (reemplaza al anillo cuando llega a 100%) ── */}
        {tiempoCompleto && (
          <div className="absolute top-1 right-1 z-20 pointer-events-none">
            <span className="inline-flex items-center gap-0.5 bg-red-50 text-red-600 border border-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm animate-pulse leading-none">
              ⏱️ Tiempo Completo
            </span>
          </div>
        )}

        {/* Nombre del jugador */}
        <p className="relative z-10 font-bold text-current text-xs sm:text-sm truncate w-full leading-tight capitalize">
          {turno.cliente_nombre} {turno.cliente_apellido}
        </p>

        {/* Horario */}
        <div className="relative z-10 text-[10px] sm:text-[11px] font-medium mt-0.5 tabular-nums leading-none opacity-75">
          {horaInicioStr} -{' '}
          {horaFinStr}
        </div>

        {/* Cancha (redundante en mobile) */}
        {span >= 3 && (
          <div className="relative z-10 hidden sm:block text-[10px] uppercase font-medium mt-0.5 truncate w-full leading-none opacity-60">
            {turno.cancha_nombre || turno.cancha}
          </div>
        )}

        {/* Estado / Badge diferenciador */}
        <span
          className={`relative z-10 mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full w-fit leading-none ${configEstado.badge}`}
        >
          {configEstado.label}
        </span>

        {/* Indicador de jugadores pagados (solo en pago parcial) */}
        {esPagoParcial && textoSplit && (
          <span className="relative z-10 text-[9px] font-medium leading-none mt-0.5 opacity-75">
            {textoSplit}
          </span>
        )}

        {/* Botón de menú (top-left para no colisionar con el anillo) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMenu(true); }}
          aria-label="Acciones del turno"
          className="absolute top-1 left-1 sm:top-2 sm:left-2 w-6 h-6 rounded-lg flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity bg-white/40 hover:bg-white/70 active:scale-90 z-20"
        >
          <MoreVertical className="w-3 h-3 text-current" />
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

/* ─── Helper: indica si un bloque de 30 min ya caducó (solo aplica al día de hoy) ─── */
const esBloqueVencido = (fechaISO, horaInicioBloque) => {
  const ahora = new Date();
  const hoy = ahora.toISOString().slice(0, 10);
  if (fechaISO !== hoy) return false; // solo bloquear en el día de hoy
  const [h, m] = horaInicioBloque.split(':').map(Number);
  const bloqueDate = new Date();
  bloqueDate.setHours(h, m, 0, 0);
  return bloqueDate < ahora;
};

/* ─── AgendaDiaria (Matriz) ─── */
export default function AgendaDiaria({ fecha: fechaProp }) {
  const {
    obtenerTurnosDelDia,
    agregarTurno,
    cambiarEstado,
    canchas,
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

  useEffect(() => {
    // Si la fecha seleccionada es hoy o cualquier otra, recargamos la info con recargar() de ser necesario
    // pero con recargar() se hace un fetch genérico.
    const canalGrilla = supabase
      .channel(`grilla-admin-live-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          console.log('⚡ [GRILLA LIVE] Cambio recibido:', payload.eventType, payload);
          if (recargar) recargar(true);
        }
      )
      .subscribe((status) => {
        console.log('📡 [GRILLA LIVE] Estado:', status);
      });

    return () => {
      supabase.removeChannel(canalGrilla);
    };
  }, [fecha, recargar]);

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
                const canchasHabilitadas = canchas.filter((c) => c.activa !== false);
                if (canchasHabilitadas.length === 0) {
                  alert('Todas las canchas se encuentran pausadas.');
                  return;
                }
                const firstFreeBlock = bloques[0];
                const firstCancha = canchasHabilitadas[0];
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

                {canchas.map((cancha, i) => {
                  const estaPausada = cancha.activa === false;

                  return (
                    <div
                      key={cancha.id}
                      className={`flex-1 min-w-[140px] py-2 px-2 text-center border-b-4 shadow-sm transition-colors ${
                        estaPausada ? 'bg-amber-50/70' : 'bg-white'
                      } ${
                        i < canchas.length - 1 ? 'border-r border-slate-200' : ''
                      }`}
                      style={{ 
                        borderBottomColor: estaPausada ? '#f59e0b' : (cancha.color_identificador || '#94a3b8'),
                        color: estaPausada ? '#b45309' : (cancha.color_identificador || '#475569') 
                      }}
                    >
                      <div className="flex items-center justify-center gap-1.5 min-w-0">
                        <span className="font-extrabold tracking-wide text-sm sm:text-base truncate uppercase leading-tight">
                          {cancha.nombre || 'Cancha'}
                        </span>
                      </div>

                      {estaPausada ? (
                        <div className="mt-1 flex items-center justify-center">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] sm:text-[11px] font-bold tracking-tight">
                            🔴 Cancha Pausada (Feriado / Mantenimiento)
                          </span>
                        </div>
                      ) : (
                        <p className="text-[10px] font-medium leading-none mt-1 opacity-70">
                          {turnosPorCancha[cancha.dbId || cancha.id]?.length || 0} turnos
                        </p>
                      )}
                    </div>
                  );
                })}
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
                      const estaPausada = cancha.activa === false;

                      /* ── ¿El bloque vacío ya caducó? (solo hoy) ── */
                      const vencido = !turno && esBloqueVencido(fecha, bloque);

                      return (
                        <div
                          key={cancha.id}
                          className={`flex-1 min-w-[140px] relative min-h-[36px] sm:min-h-[40px] ${
                            !turno && !vencido && !estaPausada
                              ? 'group cursor-pointer transition-colors duration-200 hover:bg-slate-50'
                              : ''
                          } ${
                            estaPausada
                              ? 'bg-amber-50/40 border-dashed border-amber-200/80 cursor-not-allowed select-none'
                              : vencido
                              ? 'bg-slate-50/50 opacity-60 border-dashed border-slate-200 cursor-not-allowed pointer-events-none'
                              : ''
                          } ${
                            i < canchas.length - 1 ? 'border-r border-slate-100' : ''
                          } ${turno ? 'z-10' : 'z-0'}`}
                          onClick={() => {
                            if (estaPausada) return; // Bloquear creación de turnos en columna pausada
                            if (!turno && !vencido) {
                              setModal({ bloque, cancha, turnos: turnosCancha });
                            }
                          }}
                          title={estaPausada ? 'Cancha pausada (feriado o mantenimiento)' : vencido ? 'Horario ya pasado' : undefined}
                        >
                          {turno ? (
                            <BloqueOcupado
                              turno={turno}
                              colorHex={cancha.color_identificador}
                              onAbrirCobro={setTurnoParaCobro}
                            />
                          ) : estaPausada ? (
                            /* Bloque bloqueado visualmente por pausa */
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
                              <span className="text-[10px] font-semibold text-amber-700/60 tracking-tight">
                                Pausada
                              </span>
                            </div>
                          ) : vencido ? (
                            /* Celda bloqueada: estilo ultra limpio sin dibujos */
                            null
                          ) : (
                            /* Celda libre con hover "+ Reservar" */
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
          <div className="w-3.5 h-3.5 rounded-sm bg-emerald-100 border border-emerald-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Pagado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-orange-100 border border-orange-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Pago Parcial</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-blue-100 border border-blue-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Confirmado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-purple-100 border border-purple-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Abono (Fijo)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-pink-100 border border-pink-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Pendiente / Seña</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-indigo-100 border border-indigo-300 shadow-2xs" />
          <span className="text-xs font-semibold text-slate-600">Torneo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-sm bg-slate-100 border border-dashed border-slate-300" />
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
        turno={
          turnoParaCobro
            ? turnosDelDia.find((t) => t.id === turnoParaCobro.id) || turnoParaCobro
            : null
        }
        onClose={() => setTurnoParaCobro(null)}
        onConfirmarCobro={async (turnoId, detalleCobro, estadoExplicito) => {
          const nuevoEstado = estadoExplicito || 'pagado';
          // Solo cerrar el picker si es pago completo; el parcial se guarda en background
          if (nuevoEstado === 'pagado') setTurnoParaCobro(null);
          try {
            await cambiarEstado(turnoId, nuevoEstado, detalleCobro || {});
          } catch (err) {
            console.error('[Agenda] No se pudo registrar el cobro:', err);
          }
        }}
      />
    </div>
  );
}

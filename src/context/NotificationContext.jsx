import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { normalizarHora } from '../utils/dateHelpers';
import { Bell, X, Clock, CalendarDays, AlertTriangle } from 'lucide-react';
import { useTurnos } from './TurnosContext';

/* ══════════════════════════════════════════════════════════════════════════
   Context + Hook
   ══════════════════════════════════════════════════════════════════════════ */
const NotificationContext = createContext();

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationProvider');
  return ctx;
}

/* ══════════════════════════════════════════════════════════════════════════
   Toast individual
   ══════════════════════════════════════════════════════════════════════════ */
function ToastItem({ toast, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Entrada con micro-delay para que el CSS transition arranque
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss a los 4 seg con animacion de salida
  useEffect(() => {
    const timer = setTimeout(() => {
      setSaliendo(true);
      setTimeout(() => onDismiss(toast.id), 350);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleClose = () => {
    setSaliendo(true);
    setTimeout(() => onDismiss(toast.id), 350);
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`
        flex items-start gap-3 bg-white border border-slate-200 rounded-2xl shadow-xl
        px-4 py-3.5 w-full max-w-sm cursor-default select-none
        transition-all duration-300 ease-out
        ${visible && !saliendo
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-4 scale-95'
        }
      `}
    >
      {/* Icono */}
      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ${toast.tipo === 'insert' ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>
        {toast.tipo === 'insert' ? <CalendarDays className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold leading-tight uppercase tracking-wide ${toast.tipo === 'insert' ? 'text-emerald-600' : 'text-red-600'}`}>
          {toast.tipo === 'insert' ? 'Nuevo turno reservado' : 'Turno cancelado'}
        </p>
        <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate capitalize">
          {toast.tipo === 'insert' ? toast.nombre : `${toast.nombre} liberó`}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500 font-medium tabular-nums">
            {toast.hora} hs &middot; {toast.cancha}
          </p>
        </div>
        {/* Barra de progreso de auto-dismiss */}
        <div className="mt-2.5 h-0.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full origin-left ${toast.tipo === 'insert' ? 'bg-emerald-400' : 'bg-red-400'}`}
            style={{ animation: 'notif-progress 4s linear forwards' }}
          />
        </div>
      </div>

      {/* Cerrar */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Cerrar notificacion"
        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors mt-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Contenedor de Toasts (portal, fixed bottom-right)
   ══════════════════════════════════════════════════════════════════════════ */
function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return createPortal(
    <div
      aria-label="Notificaciones"
      className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 items-end pointer-events-none"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Provider principal
   ══════════════════════════════════════════════════════════════════════════ */
export function NotificationProvider({ children }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [toasts, setToasts] = useState([]);
  const procesadosRef = useRef(new Set());
  const { recargar } = useTurnos();

  const playBeep = useCallback((tipo) => {
    try {
      if (tipo === 'insert') {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
      } else {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3');
        audio.play().catch(() => {});
      }
    } catch(e) {
      console.warn('Audio no soportado', e);
    }
  }, []);

  /* Agregar notificacion al array y disparar toast */
  const agregarNotificacion = useCallback((turno, tipo) => {
    const uid = turno.id || crypto.randomUUID();
    const eventId = `${uid}-${tipo}`;
    if (procesadosRef.current.has(eventId)) return;
    procesadosRef.current.add(eventId);

    const nombreCompleto = `${turno.cliente_nombre || 'Cliente'} ${turno.cliente_apellido || ''}`.trim();
    const hora = normalizarHora(turno.hora_inicio) || turno.hora_inicio?.substring(0, 5) || '?';
    const cancha = turno.cancha_nombre || turno.cancha || 'Cancha';
    const fecha = turno.fecha || '';

    const notif = {
      id: crypto.randomUUID(),
      turnoId: uid,
      tipo,
      nombre: nombreCompleto,
      hora,
      cancha,
      fecha,
      timestamp: new Date(),
    };

    setNotificaciones((prev) => [notif, ...prev].slice(0, 50));
    setToasts((prev) => [...prev, { ...notif, id: crypto.randomUUID() }]);

    playBeep(tipo);
    if (recargar) recargar();
  }, [playBeep, recargar]);

  /* Descartar toast */
  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  /* Marcar todas como leidas */
  const limpiarNotificaciones = useCallback(() => {
    setNotificaciones([]);
  }, []);

  /* Suscripcion Supabase Realtime */
  useEffect(() => {
    const canal = supabase
      .channel('notificaciones-turnos-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          console.log('⚡ EVENTO REALTIME RECIBIDO:', payload);

          // 1. NUEVO TURNO
          if (payload.eventType === 'INSERT') {
            agregarNotificacion(payload.new, 'insert');
            // alert(`🎾 ¡Nuevo Turno Reservado!\nCliente: ${payload.new.cliente_nombre || payload.new.cliente_apellido || 'Nuevo'}\nHora: ${payload.new.hora_inicio || ''}`);
          } 
          // 2. TURNO CANCELADO
          else if (payload.eventType === 'UPDATE' && payload.new.estado === 'cancelado') {
            // solo notificar si antes no estaba cancelado
            if (payload.old.estado !== 'cancelado') {
              agregarNotificacion(payload.new, 'cancel');
              // alert(`❌ Turno Cancelado\nSe liberó la cancha a las ${payload.new.hora_inicio || ''} hs.`);
            }
          } 
          // 3. TURNO ELIMINADO
          else if (payload.eventType === 'DELETE') {
            agregarNotificacion(payload.old, 'cancel');
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 ESTADO SUSCRIPCIÓN REALTIME:', status);
        if (err) console.error('Error en Realtime:', err);
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, [agregarNotificacion]);

  return (
    <NotificationContext.Provider
      value={{
        notificaciones,
        limpiarNotificaciones,
        agregarNotificacion,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}

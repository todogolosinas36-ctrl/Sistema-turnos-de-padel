import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTurnos } from '../context/TurnosContext';
import { calcularHoraFin } from '../utils/timeCalculations';
import { capitalizarPalabras } from '../utils/formatters';
import { MessageCircle, CheckCircle, X, CalendarDays, Clock, AlertTriangle } from 'lucide-react';

export default function ReservaModal({ isOpen, onClose, datosReserva, onSuccess }) {
  const { agregarTurno, precioBaseCancha } = useTurnos();
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paso, setPaso] = useState(1);
  const [turnoInsertado, setTurnoInsertado] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setNombre('');
      setTelefono('');
      setLoading(false);
      setError(null);
      setPaso(1);
      setTurnoInsertado(null);
    }
  }, [isOpen]);

  // Bloqueo de scroll robusto para iOS Safari y Android Chrome:
  // guardamos el scrollY antes de fijar el body para no perder la posición.
  useEffect(() => {
    if (!isOpen) return;

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen || !datosReserva) return null;

  const { cancha, fecha, horaInicio, duracion } = datosReserva;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const horaFin = calcularHoraFin(horaInicio, duracion);

      // Se espera el INSERT: el token de cancelación sólo sirve si el turno
      // quedó realmente guardado en la base.
      const data = await agregarTurno({
        cancha_id: cancha.id,
        cancha_nombre: cancha.nombre,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        duracion_minutos: Number(duracion),
        cliente_nombre: nombre.trim(),
        cliente_apellido: '',
        cliente_telefono: telefono.trim(),
        estado: 'confirmado',
        origen: 'cliente',
        total_base_cancha: precioBaseCancha || null,
      });

      if (!data) throw new Error('No se pudo guardar la reserva');

      setTurnoInsertado(data);
      setPaso(2);
    } catch (err) {
      console.error('Error al crear la reserva:', err);
      setError(
        err?.message?.includes('fetch')
          ? 'Sin conexión con el servidor. Revisá tu internet e intentá de nuevo.'
          : 'No pudimos registrar la reserva. Intentá de nuevo en un momento.'
      );
    } finally {
      setLoading(false);
    }
  };

  const numeroWhatsApp = import.meta.env.VITE_WHATSAPP_COMPLEJO || '';
  const nombreComplejo = import.meta.env.VITE_NOMBRE_COMPLEJO || '20/10 PÁDEL';

  const precioFormateado = precioBaseCancha
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(precioBaseCancha)
    : 'A confirmar';

  let fechaFormateada = fecha;
  if (fecha && fecha.includes('-')) {
    const [y, m, d] = fecha.split('-');
    fechaFormateada = `${d}/${m}/${y}`;
  }

  const codigo = turnoInsertado?.codigo_cancelacion || turnoInsertado?.token_cancelacion || '';
  const linkGestion = `${window.location.origin}/c/${codigo}`;

  const mensajeWhatsApp = `🎾 *NUEVA RESERVA - ${nombreComplejo.toUpperCase()}* 🎾

👤 *Cliente:* ${capitalizarPalabras(nombre)}
📱 *Teléfono:* ${telefono}
🏟 *Cancha:* ${cancha?.nombre}
🗓 *Fecha:* ${fechaFormateada}
⏰ *Horario:* ${horaInicio} hs
💵 *Valor:* ${precioFormateado}

🔗 *Gestionar o Cancelar mi Turno:*
${linkGestion}
*(Las cancelaciones solo se permiten con al menos 2 horas de anticipación)*`;

  const urlWhatsApp = `https://wa.me/${numeroWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(mensajeWhatsApp)}`;

  const inputClass =
    'w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-zinc-900 font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all text-sm';

  return createPortal((
    /* Overlay: fixed al viewport real, overflow-y-auto para que el contenido sea scrolleable si el teclado lo comprime */
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Contenedor de centrado: min-h-full + items-center garantizan centrado vertical en cualquier altura de viewport */}
      <div className="flex min-h-full items-center justify-center p-4 text-center">

        {/* Tarjeta interior */}
        <div
          className="relative w-full max-w-sm transform overflow-hidden rounded-2xl bg-white border border-zinc-100 p-5 text-left shadow-2xl transition-all my-auto animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
        {paso === 1 ? (
          <div>
            {/* Encabezado */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-zinc-900 tracking-tight">Reservar</h2>
                <p className="text-xs text-zinc-400 font-medium mt-0.5">Completá tus datos</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors cursor-pointer"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Resumen del turno */}
            <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-100 mb-4 flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${cancha?.color_identificador || '#3f3f46'}22` }}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: cancha?.color_identificador || '#3f3f46' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-zinc-900 text-sm leading-tight truncate">{cancha?.nombre}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                    <CalendarDays className="w-3 h-3 text-zinc-400" /> {fecha}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                    <Clock className="w-3 h-3 text-zinc-400" /> {horaInicio} hs · {duracion} min
                  </span>
                </div>
              </div>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Juan Pérez"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej: 3811234567"
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-red-700 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 px-3 border border-zinc-200 text-zinc-600 font-bold rounded-xl hover:bg-zinc-50 active:scale-[0.98] transition-all text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-zinc-900 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    'Confirmar Reserva'
                  )}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Paso 2: Confirmación */
          <div className="text-center space-y-4 py-2">
            <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight">¡Turno confirmado!</h2>
              <p className="text-xs text-zinc-500 font-medium mt-1.5 leading-relaxed">
                <span className="font-bold text-zinc-700">{cancha?.nombre}</span> — {fecha} a las{' '}
                <span className="font-bold text-zinc-700">{horaInicio} hs</span>
              </p>
            </div>

            <a
              href={urlWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-bold rounded-xl shadow-md transition-all text-sm cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              Notificar por WhatsApp
            </a>

            <button
              type="button"
              onClick={() => { onSuccess?.(); onClose?.(); }}
              className="w-full bg-zinc-900 text-white font-bold text-sm py-3.5 rounded-xl shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  ), document.body);
}

import { useState, useEffect } from 'react';
import { useTurnos } from '../context/TurnosContext';
import { calcularHoraFin } from '../utils/timeCalculations';
import { MessageCircle, CheckCircle, X, MapPin, CalendarDays, Clock, AlertTriangle } from 'lucide-react';

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
  const nombreComplejo = import.meta.env.VITE_NOMBRE_COMPLEJO || 'el complejo';

  let mensajeWhatsApp = `Hola ${nombreComplejo}, soy ${nombre.trim()}. Reservé el turno en ${cancha?.nombre} para el ${fecha} a las ${horaInicio} hs. ¡Nos vemos!`;
  if (turnoInsertado?.token_cancelacion) {
    mensajeWhatsApp += `\n\nPara cancelar en caso de imprevisto: ${window.location.origin}/?token=${turnoInsertado.token_cancelacion}`;
  }
  const urlWhatsApp = `https://wa.me/${numeroWhatsApp.replace(/\D/g, '')}?text=${encodeURIComponent(mensajeWhatsApp)}`;

  const inputClass =
    'w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3.5 text-zinc-900 font-medium placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card Centrada */}
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl my-auto max-h-[90vh] overflow-y-auto overscroll-contain-smooth animate-in fade-in zoom-in-95 duration-150">
        {paso === 1 ? (
          <div className="p-6 sm:p-8">
            {/* Encabezado */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Reservar</h2>
                <p className="text-sm text-zinc-400 font-medium mt-0.5">Completá tus datos</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Resumen del turno */}
            <div className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100 mb-6 flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${cancha?.color_identificador || '#3f3f46'}22` }}
              >
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: cancha?.color_identificador || '#3f3f46' }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-zinc-900 text-base leading-tight truncate">{cancha?.nombre}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                    <CalendarDays className="w-3 h-3" /> {fecha}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-zinc-500">
                    <Clock className="w-3 h-3" /> {horaInicio} hs · {duracion} min
                  </span>
                </div>
              </div>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
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
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
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
              <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-red-700 leading-relaxed">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-4 px-4 border border-zinc-200 text-zinc-600 font-bold rounded-xl hover:bg-zinc-50 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-zinc-900 text-white font-bold text-base py-4 rounded-xl shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-50"
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
          <div className="p-6 sm:p-8 text-center space-y-5">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle className="w-9 h-9 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">¡Turno confirmado!</h2>
              <p className="text-sm text-zinc-500 font-medium mt-2 leading-relaxed">
                <span className="font-bold text-zinc-700">{cancha?.nombre}</span> — {fecha} a las{' '}
                <span className="font-bold text-zinc-700">{horaInicio} hs</span>
              </p>
            </div>

            <a
              href={urlWhatsApp}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2.5 py-4 px-4 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white font-bold rounded-xl shadow-lg transition-all text-base"
            >
              <MessageCircle className="w-5 h-5" />
              Notificar por WhatsApp
            </a>

            <button
              type="button"
              onClick={() => { onSuccess?.(); onClose?.(); }}
              className="w-full bg-zinc-900 text-white font-bold text-base py-4 rounded-xl shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

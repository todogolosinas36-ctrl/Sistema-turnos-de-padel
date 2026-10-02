import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function CancelacionView({ token }) {
  const [turno, setTurno] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [canceladoExito, setCanceladoExito] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    async function buscarTurno() {
      setLoading(true);
      setError(null);

      try {
        let query = supabase.from('turnos').select('*, canchas(nombre)');
        if (token.length > 20) {
          query = query.or(`token_cancelacion.eq.${token},id.eq.${token}`);
        } else {
          query = query.eq('codigo_cancelacion', token);
        }
        
        const { data, error: queryError } = await query.maybeSingle();

        if (queryError || !data) {
          setError('Turno no encontrado o token inválido');
          return;
        }

        if (data.estado === 'cancelado') {
          setError('Este turno ya fue cancelado anteriormente');
          return;
        }

        if (data.estado === 'confirmado') {
          setTurno(data);
        } else {
          setError('El turno no está confirmado');
        }
      } catch (err) {
        console.error('Error al buscar turno:', err);
        setError('Error inesperado al buscar la información de la reserva');
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      buscarTurno();
    } else {
      setError('Token de cancelación no provisto');
      setLoading(false);
    }
  }, [token]);

  const handleCancelar = async () => {
    setCancelando(true);
    try {
      const { error: updateError } = await supabase
        .from('turnos')
        .update({
          estado: 'cancelado',
          cancelado_el: new Date().toISOString(),
        })
        .eq('id', turno.id);

      if (updateError) {
        console.error('Error al cancelar turno:', updateError);
        alert('No se pudo cancelar el turno. Intenta nuevamente.');
      } else {
        setCanceladoExito(true);
      }
    } catch (err) {
      console.error('Error inesperado:', err);
      alert('Ocurrió un error inesperado al cancelar el turno.');
    } finally {
      setCancelando(false);
    }
  };

  const irAlInicio = () => {
    window.location.href = '/';
  };

  return (
    <div className="p-6 text-center max-w-lg mx-auto">
      {loading && (
        <div className="py-12 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-slate-600 font-medium">Buscando información de la reserva...</p>
        </div>
      )}

      {!loading && error && (
        <div className="py-8 space-y-5">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <XCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">No se pudo procesar la solicitud</h2>
            <p className="text-red-600 font-medium">{error}</p>
          </div>
          <button
            type="button"
            onClick={irAlInicio}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow transition-colors text-base"
          >
            Volver al inicio
          </button>
        </div>
      )}

      {!loading && !error && canceladoExito && (
        <div className="py-8 space-y-5">
          <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-900">Reserva Cancelada</h2>
            <p className="text-green-600 font-medium">
              Tu reserva fue cancelada exitosamente. La cancha ha sido liberada.
            </p>
          </div>
          <button
            type="button"
            onClick={irAlInicio}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow transition-colors text-base"
          >
            Volver al inicio
          </button>
        </div>
      )}

      {!loading && !error && !canceladoExito && turno && (
        <div className="py-4 space-y-6">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">Cancelar Reserva</h2>
            <p className="text-slate-600 text-sm">
              ¿Estás seguro de que deseas cancelar tu turno? Esta acción no se puede deshacer.
            </p>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2 text-slate-800">
            <p className="font-semibold text-amber-900 text-base">
              Estás por cancelar tu turno en {turno.canchas?.nombre || 'la cancha'}
            </p>
            <div className="text-sm space-y-1 text-slate-700">
              <p><span className="font-medium">Día:</span> {turno.fecha}</p>
              <p><span className="font-medium">Hora:</span> {turno.hora_inicio} hs</p>
              {turno.cliente_nombre && (
                <p><span className="font-medium">Titular:</span> {turno.cliente_nombre} {turno.cliente_apellido}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              disabled={cancelando}
              onClick={handleCancelar}
              className="w-full sm:w-1/2 py-3.5 px-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow transition-colors text-base"
            >
              {cancelando ? 'Cancelando...' : 'Sí, cancelar mi reserva'}
            </button>
            <button
              type="button"
              disabled={cancelando}
              onClick={irAlInicio}
              className="w-full sm:w-1/2 py-3.5 px-4 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-base"
            >
              No, me arrepentí
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

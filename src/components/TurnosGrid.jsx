import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { generarBloquesHorarios } from '../utils/dateHelpers';
import ReservaModal from './ReservaModal';
import { ChevronRight } from 'lucide-react';

// Genera los próximos N días a partir de hoy
function generarProximosDias(n = 7) {
  const dias = [];
  const hoy = new Date();
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  for (let i = 0; i < n; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dias.push({
      value: `${yyyy}-${mm}-${dd}`,
      diaNombre: i === 0 ? 'Hoy' : diasSemana[d.getDay()],
      diaNum: d.getDate(),
      mes: meses[d.getMonth()],
    });
  }
  return dias;
}

export default function TurnosGrid() {
  const [fecha, setFecha] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [duracion, setDuracion] = useState(90);
  const [canchas, setCanchas] = useState([]);
  const [turnosOcupados, setTurnosOcupados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reservaActiva, setReservaActiva] = useState(null);

  const fetchTurnosOcupados = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('fecha', fecha)
        .eq('estado', 'confirmado');
      if (error) console.error('Error al obtener turnos ocupados:', error);
      else if (data) setTurnosOcupados(data);
    } catch (err) {
      console.error('Error inesperado:', err);
    }
  }, [fecha]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [resCanchas, resTurnos] = await Promise.all([
          supabase.from('canchas').select('*').order('orden'),
          supabase.from('turnos').select('*').eq('fecha', fecha).eq('estado', 'confirmado'),
        ]);
        if (resCanchas.data) setCanchas(resCanchas.data);
        if (resTurnos.data) setTurnosOcupados(resTurnos.data);
      } catch (error) {
        console.error('Error al obtener los datos:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fecha]);

  const dias = generarProximosDias(7);
  const bloques = generarBloquesHorarios('14:00', '23:30', duracion);

  return (
    <div className="flex flex-col w-full">

      {/* Carrusel de días */}
      <div className="flex overflow-x-auto no-scrollbar gap-3 px-6 py-4 bg-white border-b border-zinc-100">
        {dias.map((dia) => {
          const activo = dia.value === fecha;
          return (
            <button
              key={dia.value}
              onClick={() => setFecha(dia.value)}
              className={`flex flex-col items-center justify-center min-w-[4.5rem] py-3 px-2 rounded-2xl border transition-all duration-200 ${
                activo
                  ? 'bg-zinc-900 border-zinc-900 text-white shadow-md'
                  : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-widest ${activo ? 'text-zinc-300' : 'text-zinc-400'}`}>
                {dia.diaNombre}
              </span>
              <span className={`text-xl font-black leading-tight mt-0.5 ${activo ? 'text-white' : 'text-zinc-800'}`}>
                {dia.diaNum}
              </span>
              <span className={`text-[10px] font-semibold ${activo ? 'text-zinc-300' : 'text-zinc-400'}`}>
                {dia.mes}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selector de duración */}
      <div className="flex items-center gap-2 px-6 pt-4 pb-0">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider mr-1">Duración</span>
        {[60, 90].map((min) => (
          <button
            key={min}
            onClick={() => setDuracion(min)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              duracion === min
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
            }`}
          >
            {min} min
          </button>
        ))}
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-zinc-400">Cargando disponibilidad…</p>
        </div>
      ) : (
        <div className="px-6 py-6 flex flex-col gap-6 pb-32">
          {bloques.map((bloque) => {
            const canchasConEstado = canchas.map((cancha) => {
              const ocupado = turnosOcupados.find(
                (t) => t.cancha_id === cancha.id && t.hora_inicio.startsWith(bloque)
              );
              return { ...cancha, ocupado: !!ocupado };
            });

            const todasOcupadas = canchasConEstado.every((c) => c.ocupado);

            return (
              <div
                key={bloque}
                className={`flex gap-4 items-start transition-all ${todasOcupadas ? 'opacity-40 grayscale' : ''}`}
              >
                {/* Hora */}
                <div className="w-20 pt-3 shrink-0">
                  <span className="text-2xl font-black text-zinc-800 leading-none">{bloque}</span>
                  <span className="block text-[10px] font-semibold text-zinc-400 mt-0.5">hs</span>
                </div>

                {/* Canchas para ese bloque */}
                <div className="flex flex-col gap-2 flex-1">
                  {canchasConEstado.map((cancha) =>
                    cancha.ocupado ? (
                      <div
                        key={cancha.id}
                        className="flex-1 bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex justify-between items-center opacity-60 cursor-not-allowed"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: cancha.color_identificador || '#a1a1aa' }}
                          />
                          <span className="font-bold text-zinc-400 text-sm">{cancha.nombre}</span>
                        </div>
                        <span className="text-xs font-bold text-zinc-300 bg-zinc-100 px-2.5 py-1 rounded-full">
                          Ocupado
                        </span>
                      </div>
                    ) : (
                      <button
                        key={cancha.id}
                        onClick={() => setReservaActiva({ cancha, fecha, horaInicio: bloque, duracion })}
                        className="flex-1 bg-white border border-zinc-200 rounded-2xl p-4 flex justify-between items-center cursor-pointer hover:border-zinc-900 hover:shadow-lg transition-all duration-200 active:scale-[0.98] group"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: cancha.color_identificador || '#a1a1aa' }}
                          />
                          <div className="text-left">
                            <span className="font-bold text-zinc-700 text-sm block">{cancha.nombre}</span>
                            <span className="text-xs font-semibold text-emerald-600">Disponible</span>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-zinc-700 group-hover:translate-x-0.5 transition-all" />
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}

          {canchas.length === 0 && (
            <div className="text-center py-16 text-zinc-400 text-sm font-semibold">
              No hay canchas configuradas en la base de datos.
            </div>
          )}
        </div>
      )}

      <ReservaModal
        isOpen={!!reservaActiva}
        onClose={() => setReservaActiva(null)}
        datosReserva={reservaActiva}
        onSuccess={() => {
          setReservaActiva(null);
          fetchTurnosOcupados();
        }}
      />
    </div>
  );
}

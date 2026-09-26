import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ReservaModal from '../../components/ReservaModal';
import { Sparkles, Frown } from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';

function generarProximosDias(n = 7) {
  const dias = [];
  const hoy = new Date();
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

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

// Helper de conversión "HH:mm" a minutos totales desde la medianoche
const timeToMins = (time) => {
  if (!time) return 0;
  const [h, m] = time.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

// Helper para calcular la hora de fin según la duración seleccionada
const calcularHoraFin = (horaInicio, duracionMinutos) => {
  if (!horaInicio) return '';
  const [horas, minutos] = horaInicio.split(':').map(Number);
  const totalMinutos = minutos + parseInt(duracionMinutos, 10);
  const h = Math.floor(totalMinutos / 60);
  const m = totalMinutos % 60;
  return `${(horas + h).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function Home() {
  const [fecha, setFecha] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [duracion, setDuracion] = useState(90);
  const [canchas, setCanchas] = useState([]);
  const [turnosOcupados, setTurnosOcupados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reservaActiva, setReservaActiva] = useState(null);

  const { obtenerTurnosDelDia, turnos, turnosFijos } = useTurnos();

  // Sincronización de turnos regulares y fijos de la fecha seleccionada
  useEffect(() => {
    const turnosDelDia = obtenerTurnosDelDia(fecha);
    setTurnosOcupados(turnosDelDia);
  }, [fecha, turnos, turnosFijos, obtenerTurnosDelDia]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: resCanchas } = await supabase.from('canchas').select('*').order('orden');
        if (resCanchas && resCanchas.length > 0) {
          setCanchas(resCanchas);
        } else {
          setCanchas([
            { id: 'roja', nombre: 'Alfombra Roja', color_identificador: '#ef4444' },
            { id: 'verde', nombre: 'Alfombra Verde', color_identificador: '#10b981' },
          ]);
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        setCanchas([
          { id: 'roja', nombre: 'Alfombra Roja', color_identificador: '#ef4444' },
          { id: 'verde', nombre: 'Alfombra Verde', color_identificador: '#10b981' },
        ]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fecha]);

  const dias = generarProximosDias(7);

  const incluyeManana = localStorage.getItem('puntoexe-manana') === 'true';
  const horaInicioNum = incluyeManana ? 8 : 14;
  const horaFinNum = 23.5;
  const duracionSeleccionada = parseInt(duracion, 10);

  return (
    <div className="flex flex-col w-full pb-20">
      {/* Hero */}
      <section className="px-5 pt-6 pb-4 bg-white border-b border-zinc-100">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Disponibilidad en tiempo real</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 leading-tight">
          Reserva tu cancha en segundos
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          Elegí el día, horario y confirmá tu turno sin esperas.
        </p>
      </section>

      {/* Carrusel horizontal de días */}
      <section className="bg-white border-b border-zinc-100 py-3.5 px-5">
        <div className="flex overflow-x-auto no-scrollbar gap-2.5">
          {dias.map((dia) => {
            const activo = dia.value === fecha;
            return (
              <button
                key={dia.value}
                onClick={() => setFecha(dia.value)}
                className={`flex flex-col items-center justify-center min-w-[4.2rem] py-2.5 px-2 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  activo
                    ? 'bg-zinc-950 border-zinc-950 text-white shadow-sm'
                    : 'bg-zinc-50/80 border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    activo ? 'text-zinc-300' : 'text-zinc-400'
                  }`}
                >
                  {dia.diaNombre}
                </span>
                <span
                  className={`text-lg font-black leading-none my-0.5 ${
                    activo ? 'text-white' : 'text-zinc-800'
                  }`}
                >
                  {dia.diaNum}
                </span>
                <span
                  className={`text-[10px] font-semibold ${
                    activo ? 'text-zinc-400' : 'text-zinc-400'
                  }`}
                >
                  {dia.mes}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Selector de Duración */}
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Duración</span>
        <div className="flex bg-zinc-100 p-1 rounded-xl">
          {[60, 90, 120].map((min) => (
            <button
              key={min}
              onClick={() => setDuracion(min)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-sm text-center font-bold transition-all cursor-pointer ${
                duracion === min
                  ? 'bg-white shadow-sm text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Turnos */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-3 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
          <p className="text-xs font-semibold text-zinc-400">Consultando disponibilidad...</p>
        </div>
      ) : (
        <div className="px-5 py-4 flex flex-col gap-6">
          {canchas.length === 0 ? (
            <div className="text-center py-16 text-zinc-400 text-xs font-semibold">
              No hay canchas registradas en el sistema.
            </div>
          ) : (
            (() => {
              // 1. Escaneo continuo en intervalos de 30 minutos (0.5 hs) evaluando colisiones
              const canchasConDisponibilidad = canchas.map((cancha) => {
                const horariosDisponibles = [];

                for (let h = horaInicioNum; h <= horaFinNum; h += 0.5) {
                  const horas = Math.floor(h);
                  const minutos = Math.round((h - horas) * 60);
                  const horaStr = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;

                  const propuestoInicio = horas * 60 + minutos;
                  const propuestoFin = propuestoInicio + duracionSeleccionada;

                  // 1. Validar que el turno no termine después de la medianoche (24:00 = 1440 min)
                  if (propuestoFin > 1440) continue;

                  // 2. Validar solapamiento con turnos existentes para esta cancha
                  const estaOcupado = turnosOcupados.some((turno) => {
                    const canchaCoincide =
                      turno.cancha === cancha.nombre ||
                      turno.cancha_nombre === cancha.nombre ||
                      turno.cancha_id === cancha.id ||
                      (cancha.nombre?.toLowerCase().includes('roja') &&
                        (turno.cancha_id === 'roja' ||
                          turno.cancha_nombre?.toLowerCase().includes('roja') ||
                          turno.cancha?.toLowerCase().includes('roja'))) ||
                      (cancha.nombre?.toLowerCase().includes('verde') &&
                        (turno.cancha_id === 'verde' ||
                          turno.cancha_nombre?.toLowerCase().includes('verde') ||
                          turno.cancha?.toLowerCase().includes('verde')));

                    if (!canchaCoincide) return false;

                    const rawHoraInicio = turno.horaInicio || turno.hora_inicio || turno.horario;
                    const duracionTurno = parseInt(turno.duracion || turno.duracion_minutos || 90, 10);
                    const turnoInicio = timeToMins(rawHoraInicio);
                    const turnoFin = turnoInicio + duracionTurno;

                    // Fórmula estricta de solapamiento: (InicioA < FinB) && (FinA > InicioB)
                    return propuestoInicio < turnoFin && propuestoFin > turnoInicio;
                  });

                  if (!estaOcupado) {
                    horariosDisponibles.push(horaStr);
                  }
                }

                return { ...cancha, bloquesLibres: horariosDisponibles };
              });

              const hayDisponibilidad = canchasConDisponibilidad.some(
                (c) => c.bloquesLibres.length > 0
              );

              if (!hayDisponibilidad) {
                return (
                  <div className="flex flex-col items-center justify-center py-16 text-center bg-zinc-50 rounded-3xl border border-zinc-100">
                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                      <Frown className="w-8 h-8 text-zinc-300" />
                    </div>
                    <h3 className="text-lg font-black text-zinc-700">¡Día completo!</h3>
                    <p className="text-sm text-zinc-500 mt-1 max-w-[250px]">
                      No hay horarios disponibles para esta fecha. Por favor, seleccioná otro día.
                    </p>
                  </div>
                );
              }

              // 2. Renderizado de la grilla con todos los horarios libres encontrados
              return canchasConDisponibilidad.map((cancha) => {
                if (cancha.bloquesLibres.length === 0) return null;

                return (
                  <div
                    key={cancha.id}
                    className="bg-white rounded-2xl border border-zinc-100 p-5 shadow-xs"
                  >
                    <div className="flex items-center gap-2 mb-4 border-b border-zinc-50 pb-3">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cancha.color_identificador || '#10b981' }}
                      />
                      <h3 className="font-black text-zinc-800 text-lg tracking-tight">
                        {cancha.nombre}
                      </h3>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {cancha.bloquesLibres.map((bloque) => {
                        const horaFin = calcularHoraFin(bloque, duracion);
                        return (
                          <button
                            key={bloque}
                            onClick={() =>
                              setReservaActiva({ cancha, fecha, horaInicio: bloque, duracion })
                            }
                            className="py-2 px-1 rounded-xl border border-zinc-200 bg-white hover:border-punto-brand hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-punto-brand transition-all shadow-xs active:scale-95 cursor-pointer group"
                          >
                            <div className="flex flex-col items-center justify-center">
                              <span className="text-sm font-black text-zinc-800 group-hover:text-punto-brand transition-colors">
                                {bloque}
                              </span>
                              <span className="text-[10px] font-bold text-zinc-400 tracking-wide mt-0.5">
                                HASTA {horaFin}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </div>
      )}

      <ReservaModal
        isOpen={!!reservaActiva}
        onClose={() => setReservaActiva(null)}
        datosReserva={reservaActiva}
        onSuccess={() => {
          setReservaActiva(null);
        }}
      />
    </div>
  );
}

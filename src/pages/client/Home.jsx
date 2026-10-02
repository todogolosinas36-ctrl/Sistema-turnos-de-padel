import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReservaModal from '../../components/ReservaModal';
import { Frown, BellRing, X } from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';
import { hoyISO } from '../../utils/dateHelpers';
import { supabase } from '../../lib/supabaseClient';

function generarProximosDias(n = 7, desde = hoyISO()) {
  const dias = [];
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const [y, m, d] = desde.split('-').map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0);

  for (let i = 0; i < n; i++) {
    const fecha = new Date(base);
    fecha.setDate(base.getDate() + i);
    const yyyy = fecha.getFullYear();
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    dias.push({
      value: `${yyyy}-${mm}-${dd}`,
      diaNombre: i === 0 ? 'Hoy' : diasSemana[fecha.getDay()],
      diaNum: fecha.getDate(),
      mes: meses[fecha.getMonth()],
    });
  }
  return dias;
}

const timeToMins = (time) => {
  if (!time) return 0;
  const [h, m] = String(time).substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

const calcularHoraFin = (horaInicio, duracionMinutos) => {
  if (!horaInicio) return '';
  const [horas, minutos] = horaInicio.split(':').map(Number);
  const total = horas * 60 + minutos + parseInt(duracionMinutos, 10);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${(h % 24).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const seSolapan = (iniA, finA, iniB, finB) => iniA < finB && finA > iniB;

const horaStrAMs = (fechaISO, horaStr) => {
  const [h, m] = horaStr.split(':').map(Number);
  const d = new Date(`${fechaISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export default function Home() {
  const [fecha, setFecha] = useState(hoyISO);
  const [duracion, setDuracion] = useState(90);
  const [reservaActiva, setReservaActiva] = useState(null);
  const [avisoLiberado, setAvisoLiberado] = useState(false);
  const [mostrarAvisoLiberacion, setMostrarAvisoLiberacion] = useState(false);
  const [datosEspera, setDatosEspera] = useState({ nombre: '', telefono: '', rango: '' });

  // Variables para Presence (Bloqueo en vivo)
  const miIdTemporal = useMemo(() => crypto.randomUUID(), []);
  const [bloquesEnProceso, setBloquesEnProceso] = useState(new Set());
  const channelRef = useRef(null);

  const { canchas, obtenerTurnosDelDia, incluyeManana, loading, diasVisibles, nombreClub, recargar } = useTurnos();

  const esHoy = fecha === hoyISO();

  const turnosDelDia = useMemo(
    () => obtenerTurnosDelDia(fecha),
    [obtenerTurnosDelDia, fecha]
  );

  const dias = useMemo(() => {
    const cantidad = Number(diasVisibles) > 0 ? Number(diasVisibles) : 7;
    return generarProximosDias(cantidad, hoyISO());
  }, [diasVisibles]);

  // Si la fecha seleccionada quedó fuera del rango visible, resetear a hoy
  useEffect(() => {
    if (dias.length > 0 && !dias.some((d) => d.value === fecha)) {
      setFecha(dias[0].value);
    }
  }, [dias, fecha]);

  // Suscripción Realtime para Bloqueo en Vivo (Presence)
  useEffect(() => {
    const channel = supabase.channel('sala-reservas-en-vivo');
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const enProceso = new Set();
        for (const id in state) {
          state[id].forEach(pres => {
            if (pres.horarioSeleccionado && pres.usuarioId !== miIdTemporal) {
              enProceso.add(pres.horarioSeleccionado);
            }
          });
        }
        setBloquesEnProceso(enProceso);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [miIdTemporal]);

  // Trackear u untrackear cuando se abre/cierra la reserva
  useEffect(() => {
    if (reservaActiva) {
      const slotId = `${reservaActiva.cancha.id}-${reservaActiva.horaInicio}`;
      channelRef.current?.track({ horarioSeleccionado: slotId, usuarioId: miIdTemporal });
    } else {
      channelRef.current?.untrack();
    }
  }, [reservaActiva, miIdTemporal]);

  // Escuchar cancelaciones para mostrar el Toast persistente
  useEffect(() => {
    const channelName = `cliente-cancelaciones-${Math.random().toString(36).substring(2, 9)}`;
    const canal = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && payload.new?.estado?.toLowerCase() === 'cancelado')) {
            setAvisoLiberado(true);
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  const guardarListaEspera = async (e) => {
    e.preventDefault();
    if (!datosEspera.nombre || !datosEspera.telefono) return;
    
    // Lo guardamos en una tabla lista_espera, aunque no exista, evitamos crashear
    await supabase.from('lista_espera').insert([{
      fecha_solicitada: fecha,
      nombre: datosEspera.nombre,
      telefono: datosEspera.telefono,
      rango_horario: datosEspera.rango
    }]);
    
    alert('¡Anotado! Te avisaremos si se libera algún turno.');
    setMostrarAvisoLiberacion(false);
    setDatosEspera({ nombre: '', telefono: '', rango: '' });
  };

  const duracionSeleccionada = parseInt(duracion, 10);
  const horaInicioNum = incluyeManana ? 8 : 14;
  const horaFinNum = 23.5;

  const estaOcupado = useCallback(
    (cancha, propuestoInicio, propuestoFin) =>
      turnosDelDia.some((turno) => {
        const coincideCancha =
          (cancha.id && turno.cancha_id === cancha.id) ||
          turno.cancha_nombre === cancha.nombre ||
          turno.cancha === cancha.nombre;
        if (!coincideCancha) return false;

        const inicio = timeToMins(turno.hora_inicio);
        const fin = inicio + (Number(turno.duracion_minutos) || 90);
        return seSolapan(propuestoInicio, propuestoFin, inicio, fin);
      }),
    [turnosDelDia]
  );

  const canchasConDisponibilidad = useMemo(() => {
    const ahora = Date.now();
    return canchas.map((cancha) => {
      const estaPausada = cancha.activa === false;
      if (estaPausada) {
        return { ...cancha, estaPausada: true, bloquesLibres: [] };
      }

      const bloquesLibres = [];
      for (let h = horaInicioNum; h <= horaFinNum; h += 0.5) {
        const horas = Math.floor(h);
        const minutos = Math.round((h - horas) * 60);
        const horaStr = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;

        const inicio = horas * 60 + minutos;
        const fin = inicio + duracionSeleccionada;
        if (fin > 1440) continue;
        if (!estaOcupado(cancha, inicio, fin)) {
          const vencido = esHoy && horaStrAMs(fecha, horaStr) < ahora;
          bloquesLibres.push({ hora: horaStr, vencido });
        }
      }
      return { ...cancha, estaPausada: false, bloquesLibres };
    });
  }, [canchas, estaOcupado, horaInicioNum, horaFinNum, duracionSeleccionada, esHoy, fecha]);

  const hayDisponibilidad = canchasConDisponibilidad.some((c) =>
    !c.estaPausada && c.bloquesLibres.some((b) => !b.vencido)
  );

  const hayCanchasPausadas = canchasConDisponibilidad.some((c) => c.estaPausada);

  return (
    <div className="flex flex-col w-full pb-20 text-slate-100">
      
      {/* Toast de Oportunidad (Realtime) */}
      {avisoLiberado && (
        <div className="fixed top-4 right-4 z-[99999] max-w-sm w-full p-4 animate-in slide-in-from-right fade-in duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md border border-emerald-500/30 text-white px-5 py-4 rounded-2xl shadow-2xl shadow-emerald-500/10 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-500/10 p-2 rounded-xl shrink-0">
                <BellRing className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm tracking-wide text-slate-100">🎾 ¡Se acaba de liberar un turno!</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Haz clic abajo para actualizar la grilla.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  if (recargar) recargar();
                  setAvisoLiberado(false);
                }} 
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap"
              >
                Actualizar disponibilidad
              </button>
              <button 
                onClick={() => setAvisoLiberado(false)} 
                className="bg-slate-800 hover:bg-slate-700 p-2.5 rounded-xl transition-colors cursor-pointer text-slate-400 hover:text-slate-200 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero con Nombre del Club ── */}
      <section className="px-5 sm:px-8 pt-8 pb-6 border-b border-slate-800/60 text-center flex flex-col items-center justify-center">
        {/* Nombre del Club Dinámico y Llamativo */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-emerald-400 drop-shadow-sm select-none">
          {nombreClub || '20/10 PÁDEL'}
        </h1>

        <p className="text-sm sm:text-base font-bold text-emerald-400 tracking-wide mt-2">
          Reserva tu cancha en segundos
        </p>

        <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-md font-medium text-center">
          Elegí el día, horario y confirmá tu turno sin esperas.
        </p>
      </section>

      {/* ── Carrusel de días ── */}
      <section className="border-b border-slate-800/60 py-5 px-5 sm:px-8">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Seleccioná un día
        </p>
        <div className="flex overflow-x-auto no-scrollbar gap-2.5 pb-1">
          {dias.map((dia) => {
            const activo = dia.value === fecha;
            return (
              <button
                key={dia.value}
                onClick={() => setFecha(dia.value)}
                className={`flex flex-col items-center justify-center min-w-[3.6rem] py-3.5 px-2 rounded-2xl border transition-all duration-200 cursor-pointer flex-shrink-0 ${
                  activo
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 scale-105'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:-translate-y-0.5'
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                    activo ? 'text-slate-700' : 'text-slate-400'
                  }`}
                >
                  {dia.diaNombre}
                </span>
                <span
                  className={`text-xl font-black leading-none ${
                    activo ? 'text-slate-900' : 'text-slate-100'
                  }`}
                >
                  {dia.diaNum}
                </span>
                <span
                  className={`text-[10px] font-semibold mt-1 ${
                    activo ? 'text-slate-600' : 'text-slate-500'
                  }`}
                >
                  {dia.mes}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Selector de Duración ── */}
      <div className="px-5 sm:px-8 pt-6 pb-3 border-b border-slate-800/60">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
          Duración del turno
        </p>
        <div className="flex bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60 gap-1">
          {[60, 90, 120].map((min) => (
            <button
              key={min}
              onClick={() => setDuracion(min)}
              className={`flex-1 px-3 py-2.5 rounded-lg text-sm text-center font-bold transition-all duration-200 cursor-pointer ${
                duracion === min
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {min} min
            </button>
          ))}
        </div>
      </div>

      {/* ── Grilla de horarios por cancha ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-500">Consultando disponibilidad...</p>
        </div>
      ) : (
        <div className="px-5 sm:px-8 py-6 flex flex-col gap-5">
          {canchas.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm font-medium">
              No hay canchas registradas en el sistema.
            </div>
          ) : !hayDisponibilidad && !hayCanchasPausadas ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/60 rounded-3xl border border-slate-800/60">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-700">
                <Frown className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-xl font-extrabold text-slate-200 tracking-tight">¡Día completo!</h3>
              <p className="text-sm text-slate-500 mt-2 max-w-[280px]">
                No hay horarios disponibles para esta fecha. Por favor, seleccioná otro día.
              </p>
              <button 
                onClick={() => setMostrarAvisoLiberacion(true)}
                className="mt-5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20 cursor-pointer active:scale-95"
              >
                ¿No encontraste horario? Avisarme si se libera
              </button>
            </div>
          ) : (
            canchasConDisponibilidad.map((cancha) => (
              <div
                key={cancha.id}
                className={`bg-slate-900/60 rounded-2xl border overflow-hidden backdrop-blur-sm transition-all ${
                  cancha.estaPausada ? 'border-amber-500/30 bg-amber-950/10' : 'border-slate-800/60'
                }`}
              >
                {/* Barra de color superior de la cancha */}
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: cancha.estaPausada ? '#f59e0b' : (cancha.color_identificador || '#10b981') }}
                />

                <div className="p-4 sm:p-5">
                  {/* Header de la cancha */}
                  <div className="flex items-center gap-2.5 mb-5">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: cancha.estaPausada ? '#f59e0b' : (cancha.color_identificador || '#10b981'),
                        boxShadow: `0 0 6px ${cancha.estaPausada ? '#f59e0b' : (cancha.color_identificador || '#10b981')}80`
                      }}
                    />
                    <h3 className="font-bold text-slate-100 text-base tracking-wide uppercase">
                      {cancha.nombre}
                    </h3>
                    {cancha.estaPausada ? (
                      <span className="ml-auto text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        Pausada
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        {cancha.bloquesLibres.filter((b) => !b.vencido).length} disponibles
                      </span>
                    )}
                  </div>

                  {cancha.estaPausada ? (
                    /* Tarjetón con mensaje amigable cuando la cancha está pausada */
                    <div className="py-8 px-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-center flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl">⚠️</span>
                      <p className="text-sm font-bold text-amber-200">
                        Cancha temporalmente no disponible (Feriado/Mantenimiento)
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Esta cancha no se encuentra disponible para reservas en este momento.
                      </p>
                    </div>
                  ) : cancha.bloquesLibres.length === 0 || cancha.bloquesLibres.every((b) => b.vencido) ? (
                    <div className="py-6 text-center text-xs text-slate-500 font-medium">
                      No hay horarios disponibles para esta cancha en la fecha seleccionada.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                      {/* Grilla de horarios */}
                      {cancha.bloquesLibres.map(({ hora: bloque, vencido }) => {
                        const horaFin = calcularHoraFin(bloque, duracion);
                        const slotId = `${cancha.id}-${bloque}`;
                        const estaEnProceso = bloquesEnProceso.has(slotId);
                        
                        return (
                          <button
                            key={bloque}
                            disabled={vencido || estaEnProceso}
                            onClick={
                              vencido || estaEnProceso
                                ? undefined
                                : () => {
                                    setReservaActiva({ cancha, fecha, horaInicio: bloque, duracion });
                                    setAvisoLiberado(false);
                                  }
                            }
                            className={
                              vencido
                                ? 'py-3 px-2 rounded-xl border border-slate-900 bg-slate-950 opacity-25 cursor-not-allowed pointer-events-none select-none'
                                : estaEnProceso
                                ? 'py-3 px-2 rounded-xl border border-orange-500/50 bg-orange-950/20 opacity-70 cursor-not-allowed select-none'
                                : 'py-3 px-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-200 hover:border-emerald-500/60 hover:bg-slate-800/80 hover:shadow-md hover:shadow-emerald-500/10 hover:-translate-y-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all duration-150 active:scale-95 cursor-pointer group'
                            }
                            aria-disabled={vencido || estaEnProceso}
                            title={vencido ? 'Este horario ya pasó' : estaEnProceso ? 'Otro usuario está reservando este turno' : undefined}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={
                                  vencido
                                    ? 'text-sm font-semibold text-slate-600'
                                    : estaEnProceso
                                    ? 'text-sm font-bold text-orange-400'
                                    : 'text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors'
                                }
                              >
                                {estaEnProceso ? 'En proceso...' : bloque}
                              </span>
                              <span className="text-[10px] font-medium text-slate-600 tracking-wide mt-1 uppercase">
                                {horaFin}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
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

      {/* Modal Lista de Espera */}
      {mostrarAvisoLiberacion && (
        <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl w-full max-w-sm relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setMostrarAvisoLiberacion(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4">
              <BellRing className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Avisarme si se libera</h2>
            <p className="text-sm text-slate-400 mb-5">Dejanos tus datos y te mandamos un WhatsApp apenas alguien cancele el {fecha}.</p>
            <form onSubmit={guardarListaEspera} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Nombre</label>
                <input required type="text" value={datosEspera.nombre} onChange={e => setDatosEspera({...datosEspera, nombre: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Ej. Juan Pérez" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Teléfono (WhatsApp)</label>
                <input required type="tel" value={datosEspera.telefono} onChange={e => setDatosEspera({...datosEspera, telefono: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Ej. 381 123 4567" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Rango horario preferido</label>
                <input required type="text" value={datosEspera.rango} onChange={e => setDatosEspera({...datosEspera, rango: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500" placeholder="Ej. Después de las 18:00hs" />
              </div>
              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold py-3 rounded-xl mt-2 transition-colors">Anotarme a la espera</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

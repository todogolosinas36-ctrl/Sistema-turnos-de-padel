import { useState, useMemo, useCallback } from 'react';
import ReservaModal from '../../components/ReservaModal';
import { Sparkles, Frown } from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';
import { hoyISO } from '../../utils/dateHelpers';

function generarProximosDias(n = 7, desde = hoyISO()) {
  const dias = [];
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Se parsea la fecha ISO a mediodía local para no cruzar de día por UTC.
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

// Helper de conversión "HH:mm" a minutos totales desde la medianoche
const timeToMins = (time) => {
  if (!time) return 0;
  const [h, m] = String(time).substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

// Helper para calcular la hora de fin según la duración seleccionada
const calcularHoraFin = (horaInicio, duracionMinutos) => {
  if (!horaInicio) return '';
  const [horas, minutos] = horaInicio.split(':').map(Number);
  const total = horas * 60 + minutos + parseInt(duracionMinutos, 10);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${(h % 24).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

/** Dos horarios se pisan si el inicio de uno cae dentro del otro. */
const seSolapan = (iniA, finA, iniB, finB) => iniA < finB && finA > iniB;

/**
 * Dado un string "HH:mm" y una fecha ISO "YYYY-MM-DD",
 * devuelve el timestamp en ms de ese momento exacto.
 */
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

  const { canchasActivas, obtenerTurnosDelDia, incluyeManana, loading } = useTurnos();

  // true si el día seleccionado es el día actual
  const esHoy = fecha === hoyISO();

  const turnosDelDia = useMemo(
    () => obtenerTurnosDelDia(fecha),
    [obtenerTurnosDelDia, fecha]
  );

  const dias = useMemo(() => generarProximosDias(7, fecha < hoyISO() ? hoyISO() : fecha), [fecha]);

  const duracionSeleccionada = parseInt(duracion, 10);
  const horaInicioNum = incluyeManana ? 8 : 14;
  const horaFinNum = 23.5;

  /* Un turno bloquea la cancha si se superpone con el bloque candidato. */
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

  /* Escaneo en intervalos de 30 minutos evaluando solapamientos.
     Cada elemento del array incluye: { hora: "HH:mm", vencido: bool }  */
  const canchasConDisponibilidad = useMemo(() => {
    const ahora = Date.now();
    return canchasActivas.map((cancha) => {
      const bloquesLibres = [];
      for (let h = horaInicioNum; h <= horaFinNum; h += 0.5) {
        const horas = Math.floor(h);
        const minutos = Math.round((h - horas) * 60);
        const horaStr = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;

        const inicio = horas * 60 + minutos;
        const fin = inicio + duracionSeleccionada;
        if (fin > 1440) continue; // no se pasa de la medianoche
        if (!estaOcupado(cancha, inicio, fin)) {
          // Si es hoy, verificar si la hora ya pasó
          const vencido = esHoy && horaStrAMs(fecha, horaStr) < ahora;
          bloquesLibres.push({ hora: horaStr, vencido });
        }
      }
      return { ...cancha, bloquesLibres };
    });
  }, [canchasActivas, estaOcupado, horaInicioNum, horaFinNum, duracionSeleccionada, esHoy, fecha]);

  // Hay disponibilidad si al menos un bloque NO está vencido
  const hayDisponibilidad = canchasConDisponibilidad.some((c) =>
    c.bloquesLibres.some((b) => !b.vencido)
  );

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
          {canchasActivas.length === 0 ? (
            <div className="text-center py-16 text-zinc-400 text-xs font-semibold">
              No hay canchas registradas en el sistema.
            </div>
          ) : !hayDisponibilidad ? (
            <div className="flex flex-col items-center justify-center py-16 text-center bg-zinc-50 rounded-3xl border border-zinc-100">
              <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                <Frown className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-black text-zinc-700">¡Día completo!</h3>
              <p className="text-sm text-zinc-500 mt-1 max-w-[250px]">
                No hay horarios disponibles para esta fecha. Por favor, seleccioná otro día.
              </p>
            </div>
          ) : (
            canchasConDisponibilidad
              .filter((cancha) => cancha.bloquesLibres.length > 0)
              .map((cancha) => (
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
                    {cancha.bloquesLibres.map(({ hora: bloque, vencido }) => {
                      const horaFin = calcularHoraFin(bloque, duracion);
                      return (
                        <button
                          key={bloque}
                          disabled={vencido}
                          onClick={
                            vencido
                              ? undefined
                              : () => setReservaActiva({ cancha, fecha, horaInicio: bloque, duracion })
                          }
                          className={
                            vencido
                              ? 'py-2 px-1 rounded-xl border border-slate-200 bg-slate-50 opacity-50 cursor-not-allowed pointer-events-none select-none'
                              : 'py-2 px-1 rounded-xl border border-zinc-200 bg-white hover:border-punto-brand hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-punto-brand transition-all shadow-xs active:scale-95 cursor-pointer group'
                          }
                          aria-disabled={vencido}
                          title={vencido ? 'Este horario ya pasó' : undefined}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span
                              className={
                                vencido
                                  ? 'text-sm font-black text-slate-400'
                                  : 'text-sm font-black text-zinc-800 group-hover:text-punto-brand transition-colors'
                              }
                            >
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
    </div>
  );
}

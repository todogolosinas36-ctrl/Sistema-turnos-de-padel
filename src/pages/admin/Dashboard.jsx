import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
  Calendar,
  Activity,
  DollarSign,
  XCircle,
  CalendarRange,
  Coffee,
  PackageX,
  ArrowRight,
} from 'lucide-react';
import StatCard from '../../components/admin/StatCard';
import { useTurnos } from '../../context/TurnosContext';
import { hoyISO, sumarDias, normalizarHora } from '../../utils/dateHelpers';
import { obtenerConsumoCantinaTurno, resolverMontoCanchaNeto } from '../../utils/paymentHelpers';

const formatearMonto = (n) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n || 0);

export default function Dashboard() {
  const { turnos, obtenerTurnosDelDia, canchasActivas, precioBaseCancha, incluyeManana } =
    useTurnos();
  const [ventas, setVentas] = useState([]);

  const hoy = hoyISO();
  const ayer = sumarDias(hoy, -1);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('ventas_cantina')
          .select('total')
          .gte('fecha', ayer)
          .lte('fecha', hoy);
        if (!cancelado) setVentas(data || []);
      } catch {
        /* la tabla puede no existir todavía */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [ayer, hoy]);

  const metricas = useMemo(() => {
    const delDia = obtenerTurnosDelDia(hoy);
    const delDiaAyer = obtenerTurnosDelDia(ayer);

    const confirmados = delDia.filter((t) => t.estado === 'confirmado');
    const pagados = delDia.filter((t) => t.estado === 'pagado');
    const cancelados = turnos.filter((t) => t.fecha === hoy && t.estado === 'cancelado');

    // Ocupación: minutos reservados sobre minutos disponibles del día.
    const horaApertura = incluyeManana ? 8 * 60 : 14 * 60;
    const minutosDia = 23 * 60 + 30 - horaApertura;
    const minutosOcupados = delDia.reduce((s, t) => s + (Number(t.duracion_minutos) || 0), 0);
    const capacidad = minutosDia * Math.max(canchasActivas.length, 1);
    const ocupacion = capacidad > 0 ? Math.round((minutosOcupados / capacidad) * 100) : 0;

    const cobradoCanchas = pagados.reduce(
      (s, t) => s + resolverMontoCanchaNeto(t, precioBaseCancha),
      0
    );
    const cantinaEnTurnos = pagados.reduce(
      (s, t) => s + obtenerConsumoCantinaTurno(t).total,
      0
    );
    const cobradoCantina =
      ventas.reduce((s, v) => s + (Number(v.total) || 0), 0) + cantinaEnTurnos;

    const ingresosAyer = delDiaAyer
      .filter((t) => t.estado === 'pagado')
      .reduce((s, t) => {
        const canchasNeto = resolverMontoCanchaNeto(t, precioBaseCancha);
        const cantinaTurno = obtenerConsumoCantinaTurno(t).total;
        return s + canchasNeto + cantinaTurno;
      }, 0);

    const variacion =
      ingresosAyer > 0
        ? Math.round(((cobradoCanchas + cobradoCantina - ingresosAyer) / ingresosAyer) * 100)
        : null;

    return {
      totalTurnos: delDia.length,
      confirmados: confirmados.length,
      pagados: pagados.length,
      cancelados: cancelados.length,
      ocupacion: Math.min(100, ocupacion),
      ingresos: cobradoCanchas + cobradoCantina,
      variacion,
    };
  }, [obtenerTurnosDelDia, turnos, ventas, canchasActivas.length, incluyeManana, precioBaseCancha, hoy, ayer]);

  /* Actividad reciente: los últimos movimientos reales registrados. */
  const actividad = useMemo(() => {
    return [...turnos]
      .filter((t) => t.creado_el || t.cobrado_el)
      .sort((a, b) => new Date(b.cobrado_el || b.creado_el) - new Date(a.cobrado_el || a.creado_el))
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        cliente: `${t.cliente_nombre || ''} ${t.cliente_apellido || ''}`.trim() || 'Cliente',
        cancha: t.cancha_nombre || t.cancha || 'Cancha',
        cuando: t.cobrado_el || t.creado_el,
        estado: t.estado,
        monto: Number(t.precio) || null,
        fecha: t.fecha,
        hora: normalizarHora(t.hora_inicio),
      }));
  }, [turnos]);

  const sinMovimientos = actividad.length === 0;

  return (
    <div className="max-w-7xl mx-auto w-full">
      

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 mb-6 sm:mb-8">
        <StatCard
          titulo="Turnos Hoy"
          valor={metricas.totalTurnos}
          icono={Calendar}
          colorAcento="blue"
        />
        <StatCard
          titulo="Ocupación"
          valor={`${metricas.ocupacion}%`}
          icono={Activity}
          colorAcento="violet"
        />
        <StatCard
          titulo="Ingresos del Día"
          valor={formatearMonto(metricas.ingresos)}
          icono={DollarSign}
          tendencia={
            metricas.variacion !== null
              ? `${metricas.variacion >= 0 ? '+' : ''}${metricas.variacion}%`
              : undefined
          }
          colorAcento="emerald"
        />
        <StatCard
          titulo="Cancelaciones"
          valor={metricas.cancelados}
          icono={XCircle}
          colorAcento="red"
        />
      </div>

      {/* Detalle de cobros del día */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link
          to="/admin/grilla"
          className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 hover:border-zinc-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Por cobrar
            </span>
            <span className="text-xl font-black text-slate-900 tabular-nums">
              {metricas.confirmados}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
        </Link>

        <Link
          to="/admin/caja"
          className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 hover:border-zinc-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Turnos cobrados
            </span>
            <span className="text-xl font-black text-slate-900 tabular-nums">
              {metricas.pagados}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
        </Link>

        <Link
          to="/admin/cantina"
          className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-3 hover:border-zinc-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Coffee className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Ventas cantina
            </span>
            <span className="text-xl font-black text-slate-900 tabular-nums">
              {ventas.length}
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0" />
        </Link>
      </div>

      {/* Actividad reciente */}
      <div className="mt-6 sm:mt-8 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Actividad Reciente
            </h2>
            <p className="text-xs text-slate-500 font-medium">Últimos movimientos registrados</p>
          </div>
          <Link
            to="/admin/grilla"
            className="text-sm font-bold text-blue-600 hover:text-blue-700 shrink-0"
          >
            Ver grilla
          </Link>
        </div>

        {sinMovimientos ? (
          <div className="py-14 flex flex-col items-center justify-center text-center px-6">
            <PackageX className="w-10 h-10 text-slate-300 stroke-1 mb-3" />
            <p className="font-bold text-slate-700 text-sm">Todavía no hay movimientos</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              En cuanto reserves o cobres un turno, la actividad va a aparecer acá.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {actividad.map((item) => (
              <div key={item.id} className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    item.estado === 'pagado'
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.estado === 'cancelado'
                      ? 'bg-red-50 text-red-500'
                      : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {item.estado === 'pagado' ? (
                    <DollarSign className="w-5 h-5" />
                  ) : item.estado === 'cancelado' ? (
                    <XCircle className="w-5 h-5" />
                  ) : (
                    <Calendar className="w-5 h-5" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate capitalize">
                    {item.cliente}
                    {item.monto != null && (
                      <span className="ml-2 text-emerald-600 tabular-nums">
                        {formatearMonto(item.monto)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    <span className="capitalize">{item.cancha}</span> · {item.fecha} {item.hora} hs ·{' '}
                    {new Date(item.cuando).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${
                    item.estado === 'pagado'
                      ? 'bg-emerald-100 text-emerald-700'
                      : item.estado === 'cancelado'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {item.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { Calendar, Activity, DollarSign, XCircle, Clock, CheckCircle2 } from 'lucide-react';
import StatCard from '../../components/admin/StatCard';

export default function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* ─── Cabecera ─── */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
          Resumen Operativo
        </h1>
      </div>

      {/* ─── KPIs Grid ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5 mb-6 sm:mb-8">
        <StatCard
          titulo="Turnos Hoy"
          valor="14"
          icono={Calendar}
          tendencia="+12%"
          colorAcento="blue"
        />
        <StatCard
          titulo="Ocupación"
          valor="85%"
          icono={Activity}
          tendencia="+5%"
          colorAcento="violet"
        />
        <StatCard
          titulo="Ingresos del Día"
          valor="$168.000"
          icono={DollarSign}
          tendencia="+21%"
          colorAcento="emerald"
        />
        <StatCard
          titulo="Cancelaciones"
          valor="1"
          icono={XCircle}
          tendencia="-3"
          colorAcento="red"
        />
      </div>

      {/* ─── Actividad Reciente (Skeleton) ─── */}
      <div className="mt-6 sm:mt-8 bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Actividad Reciente
            </h2>
            <p className="text-xs text-slate-500 font-medium">Últimos movimientos del sistema</p>
          </div>
          <button className="text-sm font-bold text-blue-600 hover:text-blue-700 shrink-0">
            Ver todo
          </button>
        </div>

        <div className="divide-y divide-zinc-100">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 sm:p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-100 rounded w-1/4" />
                <div className="h-3 bg-slate-50 rounded w-1/2" />
              </div>
              <div className="w-20 h-6 bg-slate-50 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

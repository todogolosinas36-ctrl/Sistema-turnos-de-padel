export default function StatCard({ titulo, valor, icono: Icono, tendencia, colorAcento = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-500',
    violet: 'bg-violet-50 text-violet-600',
  };

  const iconBg = colorMap[colorAcento] ?? colorMap.blue;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] flex flex-col gap-3 sm:gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider leading-tight">
          {titulo}
        </span>
        {Icono && (
          <div className={`${iconBg} p-2 sm:p-2.5 rounded-xl shrink-0`}>
            <Icono className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-end justify-between gap-2 flex-wrap">
        <span className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight leading-none">
          {valor}
        </span>
        {tendencia && (
          <div className="flex items-center gap-1 pb-0.5">
            <span className="text-emerald-500 text-xs font-bold">{tendencia}</span>
            <span className="hidden sm:inline text-slate-400 text-xs font-medium whitespace-nowrap">
              vs sem. ant.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

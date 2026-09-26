import { useState, useMemo } from 'react';
import {
  Printer,
  AlertTriangle,
  CalendarDays,
  Coffee,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Receipt,
  X,
  ShieldAlert
} from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';

/* Datos mock de cantina (en un flujo real vendrían de otra tabla de Supabase) */
const MOVIMIENTOS_CANTINA = [
  {
    id: 1,
    hora: '15:10',
    ticket: 'TCK-1048',
    articulos: '2x Gatorade Manzana, 1x Tubo Head Pro',
    metodo: 'Efectivo',
    monto: 14800
  },
  {
    id: 2,
    hora: '16:45',
    ticket: 'TCK-1049',
    articulos: '2x Agua Mineral 600ml, 1x Grip Bullpadel',
    metodo: 'Transferencia / MP',
    monto: 6200
  },
  {
    id: 3,
    hora: '18:20',
    ticket: 'TCK-1050',
    articulos: '1x Alquiler Paleta Carbono',
    metodo: 'Tarjeta Débito',
    monto: 4000
  },
  {
    id: 4,
    hora: '19:55',
    ticket: 'TCK-1051',
    articulos: '2x Cerveza Corona, 1x Barra Proteica',
    metodo: 'Efectivo',
    monto: 9100
  },
  {
    id: 5,
    hora: '21:15',
    ticket: 'TCK-1052',
    articulos: '1x Café Espresso',
    metodo: 'Transferencia / MP',
    monto: 1800
  },
  {
    id: 6,
    hora: '22:40',
    ticket: 'TCK-1053',
    articulos: '1x Gatorade Manzana',
    metodo: 'Efectivo',
    monto: 2500
  }
];

export default function CajaDiaria() {
  const { obtenerTurnosDelDia, precioBaseCancha } = useTurnos();

  const [modalCierreZ, setModalCierreZ] = useState(false);
  const [cierreRealizado, setCierreRealizado] = useState(false);

  const fechaISO = new Date().toISOString().split('T')[0];

  // Los cobros se originan en la Agenda Diaria, que escribe en el mismo
  // contexto. Leerlos desde la misma fuente evita que la caja quede vacía.
  const turnosPagados = useMemo(
    () =>
      obtenerTurnosDelDia(fechaISO)
        .filter((t) => t.estado === 'pagado')
        .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')),
    [obtenerTurnosDelDia, fechaISO]
  );

  const formatearMonto = (num) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(num);
  };

  // Cálculos derivados. `precio` lo guarda el ModalCobro al confirmar; si
  // no estuviera, se usa la tarifa vigente como referencia.
  const totalCanchas = turnosPagados.reduce(
    (sum, t) => sum + (Number(t.precio) || precioBaseCancha || 0),
    0
  );
  const totalCantina = MOVIMIENTOS_CANTINA.reduce((sum, m) => sum + m.monto, 0);
  const totalGeneral = totalCanchas + totalCantina;
  const cantidadTurnosPagados = turnosPagados.length;

  const handleImprimir = () => {
    window.print();
  };

  const confirmarCierreZ = () => {
    setModalCierreZ(false);
    setCierreRealizado(true);
  };

  return (
    <div className="space-y-5 sm:space-y-8 max-w-7xl mx-auto w-full pb-10">
      {/* ─── Cabecera y Botón Principal ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            Caja Diaria
          </h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleImprimir}
            className="flex-1 sm:flex-none bg-punto-brand text-white px-5 sm:px-6 py-3 sm:py-2 rounded-lg font-bold shadow-sm hover:bg-punto-hover transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>Imprimir Cierre (X)</span>
          </button>
        </div>
      </div>

      {/* Notificación de Cierre Z realizado */}
      {cierreRealizado && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start sm:items-center justify-between gap-3 text-emerald-900">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm">
                Cierre de Caja (Z) ejecutado con éxito
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                La jornada fue archivada en los libros contables y la caja quedó lista para el arqueo.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCierreRealizado(false)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Sección 1: Tarjetas de Resumen (KPIs dinámicos) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Tarjeta 1 (Total General) */}
        <div className="bg-zinc-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-black tracking-wider text-zinc-400 uppercase">
              RECAUDACIÓN TOTAL
            </span>
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-white shrink-0">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl sm:text-4xl font-black tracking-tight block tabular-nums">
              {formatearMonto(totalGeneral)}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-2">
              <span className="text-emerald-400 font-bold flex items-center">
                <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> Canchas + Cantina
              </span>
              <span>• Jornada actual</span>
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-zinc-800/40 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Tarjeta 2 (Canchas — calculada desde turnos pagados) */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-black tracking-wider text-blue-600/90 uppercase">
              INGRESOS CANCHAS
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl sm:text-4xl font-black tracking-tight text-blue-600 block tabular-nums">
              {formatearMonto(totalCanchas)}
            </span>
            <p className="text-xs text-slate-500 mt-2 font-medium">
              {cantidadTurnosPagados} turno{cantidadTurnosPagados !== 1 ? 's' : ''} cobrado{cantidadTurnosPagados !== 1 ? 's' : ''} (estado: "pagado")
            </p>
          </div>
        </div>

        {/* Tarjeta 3 (Cantina) */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-black tracking-wider text-emerald-600/90 uppercase">
              INGRESOS CANTINA
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Coffee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-600 block tabular-nums">
              {formatearMonto(totalCantina)}
            </span>
            <p className="text-xs text-slate-500 mt-2 font-medium">
              {MOVIMIENTOS_CANTINA.length} tickets emitidos en mostrador
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sección 2: Desglose de Movimientos ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Columna Izquierda (Canchas — desde turnos pagados en Agenda) */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-slate-900 text-base truncate">
                  Detalle de Canchas
                </h2>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  Turnos cobrados desde la Agenda Diaria
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md shrink-0">
              {cantidadTurnosPagados} cobrado{cantidadTurnosPagados !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto overscroll-contain-smooth max-h-[460px]">
            {turnosPagados.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                <CalendarDays className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
                <p className="font-bold text-slate-700 text-sm">Sin turnos cobrados hoy</p>
                <p className="text-xs text-slate-400 mt-1">
                  Los turnos aparecen aquí cuando se marcan como "Pagado" en la Agenda Diaria.
                </p>
              </div>
            ) : (
              turnosPagados.map((turno) => {
                const nombreCancha = turno.cancha_nombre || turno.cancha || 'Cancha';
                const montoCobrado = Number(turno.precio) || precioBaseCancha || 0;
                const esRoja = nombreCancha.toLowerCase().includes('roja');

                return (
                <div
                  key={turno.id}
                  className="py-3.5 flex items-center justify-between gap-3 sm:gap-4 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700 shrink-0">
                      <Clock className="w-3.5 h-3.5 mr-0.5 text-slate-500" />
                      {turno.hora_inicio?.slice(0, 5)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">
                        {turno.cliente_nombre} {turno.cliente_apellido}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                          esRoja ? 'bg-red-500' : 'bg-green-500'
                        }`} />
                        <span className="truncate">{nombreCancha}</span>
                        <span>•</span>
                        <span className="text-emerald-600 font-semibold">Agenda → Caja</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-sm text-slate-900 block tabular-nums">
                      {formatearMonto(montoCobrado)}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                      Cobrado
                    </span>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna Derecha (Cantina) */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-slate-900 text-base truncate">
                Detalle de Cantina
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md shrink-0">
              {MOVIMIENTOS_CANTINA.length} tickets
            </span>
          </div>

          <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto overscroll-contain-smooth max-h-[460px]">
            {MOVIMIENTOS_CANTINA.map((item) => (
              <div
                key={item.id}
                className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700 shrink-0">
                    <Clock className="w-3.5 h-3.5 mr-0.5 text-slate-500" />
                    {item.hora}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-900 text-sm font-mono">
                        {item.ticket}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                        {item.metodo}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {item.articulos}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-black text-sm text-slate-900 block">
                    {formatearMonto(item.monto)}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    Pagado
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Sección 3: Botón de Cierre Z ─── */}
      <div className="flex justify-center pt-4">
        <button
          type="button"
          onClick={() => setModalCierreZ(true)}
          className="w-full sm:w-auto border-2 border-red-500 text-red-600 hover:bg-red-50 font-bold text-base sm:text-lg py-4 px-6 sm:px-12 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <span>Ejecutar Cierre de Caja (Z)</span>
        </button>
      </div>

      {/* Modal de Confirmación de Cierre Z */}
      {modalCierreZ && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4">
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 max-h-[92dvh] overflow-y-auto overscroll-contain-smooth"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 text-lg">
                  Confirmar Cierre Fiscal (Z)
                </h3>
                <p className="text-xs text-slate-500">
                  Esta acción bloqueará y archivará la jornada contable.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 text-sm text-slate-700 my-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Turnos de Canchas ({cantidadTurnosPagados}):</span>
                <span className="font-bold text-slate-900">{formatearMonto(totalCanchas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ventas de Cantina ({MOVIMIENTOS_CANTINA.length}):</span>
                <span className="font-bold text-slate-900">{formatearMonto(totalCantina)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-base font-black">
                <span>Total Arquillado:</span>
                <span className="text-red-600">{formatearMonto(totalGeneral)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              ¿Estás seguro de que deseas cerrar el turno de caja? Se generará el folio de auditoría y se restablecerán los balances para la apertura siguiente.
            </p>

            <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setModalCierreZ(false)}
                className="flex-1 sm:flex-none px-4 py-3.5 sm:py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCierreZ}
                className="flex-[1.5] sm:flex-none px-5 py-3.5 sm:py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-all active:scale-95"
              >
                Sí, Ejecutar Cierre Z
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

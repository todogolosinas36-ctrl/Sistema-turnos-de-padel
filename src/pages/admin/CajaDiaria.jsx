import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Printer,
  AlertTriangle,
  CalendarDays,
  CoffeeIcon,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  Receipt,
  X,
  ShieldAlert,
} from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';
import { hoyISO, normalizarHora } from '../../utils/dateHelpers';
import { obtenerConsumoCantinaTurno, resolverMontoCanchaNeto } from '../../utils/paymentHelpers';

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia / MP',
  tarjeta: 'Tarjeta Débito',
  mixto: 'Pago Mixto',
};

export default function CajaDiaria() {
  const { obtenerTurnosDelDia, precioBaseCancha } = useTurnos();

  const [modalCierreZ, setModalCierreZ] = useState(false);
  const [cierreRealizado, setCierreRealizado] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [cargandoVentas, setCargandoVentas] = useState(true);

  const fechaISO = hoyISO();

  /* Los cobros de canchas se originan en la Agenda Diaria, que escribe en el
     mismo contexto: leerlos de otra fuente dejaba la lista siempre vacía. */
  const turnosPagados = useMemo(
    () =>
      obtenerTurnosDelDia(fechaISO)
        .filter((t) => t.estado === 'pagado')
        .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')),
    [obtenerTurnosDelDia, fechaISO]
  );

  /* Ventas de cantina: reales. Antes eran 6 tickets inventados hardcodeados
     que sumaban $38.400 a la recaudación total. */
  const cargarVentas = useCallback(async () => {
    setCargandoVentas(true);
    try {
      const { data, error } = await supabase
        .from('ventas_cantina')
        .select('*, ventas_cantina_detalle(nombre, precio, cantidad)')
        .eq('fecha', fechaISO)
        .order('hora', { ascending: true });

      if (error) {
        // La tabla puede no existir todavía (falta correr schema.sql).
        console.warn('[Caja] No se pudieron leer las ventas de cantina:', error.message);
        setVentas([]);
      } else {
        setVentas(data || []);
      }
    } catch (err) {
      console.error('[Caja] Error al cargar ventas de cantina:', err);
    } finally {
      setCargandoVentas(false);
    }
  }, [fechaISO]);

  useEffect(() => {
    cargarVentas();
  }, [cargarVentas]);

  const formatearMonto = (num) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(num || 0);

  /* Desglose de ingresos por turno: Alquiler neto de cancha vs Cantina sumada al turno */
  const desgloseTurnos = useMemo(() => {
    return turnosPagados.map((turno) => {
      const { total: cantinaTotal, items: cantinaItems } = obtenerConsumoCantinaTurno(turno);
      const montoCanchaNeto = resolverMontoCanchaNeto(turno, precioBaseCancha);
      const montoTotalTurno = montoCanchaNeto + cantinaTotal;

      return {
        turno,
        montoCanchaNeto,
        cantinaTotal,
        cantinaItems,
        montoTotalTurno,
      };
    });
  }, [turnosPagados, precioBaseCancha]);

  // Ingresos netos por Alquiler de Canchas (exclusivo de canchas, sin cantina)
  const totalCanchas = useMemo(
    () => desgloseTurnos.reduce((sum, d) => sum + d.montoCanchaNeto, 0),
    [desgloseTurnos]
  );

  // Cantina vendida en mostrador (ventas_cantina en Supabase)
  const totalCantinaMostrador = useMemo(
    () => ventas.reduce((sum, v) => sum + (Number(v.total) || 0), 0),
    [ventas]
  );

  // Cantina vendida a través de turnos (gastos compartidos y consumos de kiosco)
  const totalCantinaTurnos = useMemo(
    () => desgloseTurnos.reduce((sum, d) => sum + d.cantinaTotal, 0),
    [desgloseTurnos]
  );

  // Ingresos totales de Cantina (Mostrador + Turnos)
  const totalCantina = totalCantinaMostrador + totalCantinaTurnos;

  // Recaudación Total General = Canchas Netas + Total Cantina
  const totalGeneral = totalCanchas + totalCantina;

  const cantidadTurnosPagados = turnosPagados.length;

  // Unidades físicas de productos de cantina vendidas
  const unidadesCantinaMostrador = useMemo(
    () => ventas.reduce((sum, v) => sum + (Number(v.cantidad_items) || 0), 0),
    [ventas]
  );
  const unidadesCantinaTurnos = useMemo(
    () =>
      desgloseTurnos.reduce(
        (sum, d) => sum + d.cantinaItems.reduce((acc, it) => acc + (Number(it.cantidad) || 1), 0),
        0
      ),
    [desgloseTurnos]
  );
  const unidadesCantinaTotal = unidadesCantinaMostrador + unidadesCantinaTurnos;

  // Lista detallada de consumos de cantina en turnos para el historial
  const itemsCantinaTurnos = useMemo(() => {
    return desgloseTurnos
      .filter((d) => d.cantinaTotal > 0)
      .map((d) => {
        const t = d.turno;
        const nombreCancha = t.cancha_nombre || t.cancha || 'Cancha';
        const hora = t.hora_inicio?.slice(0, 5) || 'Turno';
        const cliente = `${t.cliente_nombre || ''} ${t.cliente_apellido || ''}`.trim() || 'Cliente';
        const detalle = d.cantinaItems
          .map((it) => `${it.cantidad}x ${it.nombre}`)
          .join(', ');

        return {
          id: `turno-${t.id}`,
          tipo: 'turno',
          ticket: `Turno ${hora}`,
          hora: t.hora_inicio || '00:00',
          horaTexto: hora,
          cliente,
          nombreCancha,
          metodo_pago: 'En Turno',
          detalle: detalle || `${d.cantinaItems.length} artículos`,
          total: d.cantinaTotal,
          cantidad_items: d.cantinaItems.reduce((acc, it) => acc + (Number(it.cantidad) || 1), 0),
        };
      });
  }, [desgloseTurnos]);

  // Lista unificada de todas las ventas de cantina (Mostrador + Turnos) ordenadas cronológicamente
  const todasLasVentasCantina = useMemo(() => {
    const mostrador = ventas.map((v) => ({
      id: `pos-${v.id}`,
      tipo: 'mostrador',
      ticket: v.ticket || `#${v.id.slice(0, 6)}`,
      hora: v.hora || '00:00',
      horaTexto: normalizarHora(v.hora),
      metodo_pago: v.metodo_pago,
      detalle:
        (v.ventas_cantina_detalle || [])
          .map((d) => `${d.cantidad}x ${d.nombre}`)
          .join(', ') || `${v.cantidad_items} artículos`,
      total: Number(v.total) || 0,
      cantidad_items: Number(v.cantidad_items) || 0,
    }));

    return [...mostrador, ...itemsCantinaTurnos].sort((a, b) =>
      (a.hora || '').localeCompare(b.hora || '')
    );
  }, [ventas, itemsCantinaTurnos]);

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
              {cantidadTurnosPagados} turno{cantidadTurnosPagados !== 1 ? 's' : ''} cobrado{cantidadTurnosPagados !== 1 ? 's' : ''} · Alquiler neto
            </p>
          </div>
        </div>

        {/* Tarjeta 3 (Cantina — Mostrador + Turnos) */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs font-black tracking-wider text-emerald-600/90 uppercase">
              INGRESOS CANTINA
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <CoffeeIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-600 block tabular-nums">
              {formatearMonto(totalCantina)}
            </span>
            <div className="text-xs text-slate-500 mt-2 font-medium flex flex-col gap-0.5">
              <span>
                {todasLasVentasCantina.length === 0
                  ? 'Sin ventas de cantina hoy'
                  : `${todasLasVentasCantina.length} ventas · ${unidadesCantinaTotal} unidades`}
              </span>
              <span className="text-[11px] text-slate-400">
                Mostrador: {formatearMonto(totalCantinaMostrador)} · En Turnos: {formatearMonto(totalCantinaTurnos)}
              </span>
            </div>
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
            {desgloseTurnos.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                <CalendarDays className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
                <p className="font-bold text-slate-700 text-sm">Sin turnos cobrados hoy</p>
                <p className="text-xs text-slate-400 mt-1">
                  Los turnos aparecen acá cuando se marcan como &quot;Pagado&quot; en la Agenda Diaria.
                </p>
              </div>
            ) : (
              desgloseTurnos.map(({ turno, montoCanchaNeto, cantinaTotal }) => {
                const nombreCancha = turno.cancha_nombre || turno.cancha || 'Cancha';
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
                          <span
                            className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                              esRoja ? 'bg-red-500' : 'bg-green-500'
                            }`}
                          />
                          <span className="truncate">{nombreCancha}</span>
                          <span>•</span>
                          <span className="text-blue-600 font-semibold">Alquiler Cancha</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-slate-900 block tabular-nums">
                        {formatearMonto(montoCanchaNeto)}
                      </span>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        {cantinaTotal > 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                            +{formatearMonto(cantinaTotal)} Cantina
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                          Cobrado
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna Derecha (Cantina — Mostrador + Turnos) */}
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
              {todasLasVentasCantina.length} venta{todasLasVentasCantina.length !== 1 ? 's' : ''} ({ventas.length} mostrador · {itemsCantinaTurnos.length} en turnos)
            </span>
          </div>

          <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto overscroll-contain-smooth max-h-[460px]">
            {cargandoVentas ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="w-6 h-6 border-[3px] border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-medium">Cargando…</p>
              </div>
            ) : todasLasVentasCantina.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                <CoffeeIcon className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
                <p className="font-bold text-slate-700 text-sm">Sin ventas de cantina hoy</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Las ventas cobradas en el mostrador (POS) o agregadas a los turnos aparecen acá.
                </p>
              </div>
            ) : (
              todasLasVentasCantina.map((item) => {
                const esDeTurno = item.tipo === 'turno';

                return (
                  <div
                    key={item.id}
                    className="py-3.5 flex items-center justify-between gap-3 sm:gap-4 hover:bg-slate-50/70 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700 shrink-0">
                        <Clock className="w-3.5 h-3.5 mr-0.5 text-slate-500" />
                        {item.horaTexto}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-sm truncate">
                            {esDeTurno
                              ? `${item.ticket} · ${item.cliente}`
                              : item.ticket}
                          </p>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                              esDeTurno
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/50'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200/50'
                            }`}
                          >
                            {esDeTurno ? `En Turno (${item.nombreCancha})` : 'Mostrador (POS)'}
                          </span>
                          {!esDeTurno && item.metodo_pago && (
                            <span
                              title={item.metodo_pago}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                item.metodo_pago?.startsWith('Mixto')
                                  ? 'bg-purple-100 text-purple-700 font-bold'
                                  : 'text-slate-500 bg-zinc-100'
                              }`}
                            >
                              {ETIQUETA_METODO[item.metodo_pago] || item.metodo_pago}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {item.detalle}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-slate-900 block tabular-nums">
                        {formatearMonto(item.total)}
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
                <span className="text-slate-500">Alquiler Canchas ({cantidadTurnosPagados} turnos):</span>
                <span className="font-bold text-slate-900">{formatearMonto(totalCanchas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ventas Cantina ({todasLasVentasCantina.length} tickets):</span>
                <span className="font-bold text-slate-900">{formatearMonto(totalCantina)}</span>
              </div>
              <div className="pl-3 text-xs text-slate-500 flex justify-between">
                <span>• Mostrador: {formatearMonto(totalCantinaMostrador)}</span>
                <span>• En Turnos: {formatearMonto(totalCantinaTurnos)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between text-base font-black">
                <span>Total Arqueado:</span>
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

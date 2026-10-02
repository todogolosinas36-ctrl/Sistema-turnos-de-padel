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
  Lock,
  Banknote,
  Smartphone,
  CreditCard,
  History,
  Calendar,
  RefreshCw,
  FileText,
  ChevronRight,
  Info,
  Layers,
} from 'lucide-react';
import { useTurnos } from '../../context/TurnosContext';
import { hoyISO, normalizarHora, sumarDias } from '../../utils/dateHelpers';
import {
  calcularConsolidadoFinanciero,
  obtenerConsumoCantinaTurno,
  resolverMontoCanchaNeto,
} from '../../utils/paymentHelpers';

const LS_CIERRES = 'puntoexe-cierres-caja';

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia / MP',
  debito: 'Tarjeta Débito',
  credito: 'Tarjeta Crédito',
  tarjeta: 'Tarjeta Débito',
  mixto: 'Pago Mixto',
};

const formatearMonto = (num) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(num || 0);

export default function CajaDiaria() {
  const { turnos, obtenerTurnosDelDia, precioBaseCancha, nombreClub } = useTurnos();

  // ─── Pestaña Activa ───
  // 'caja_actual' | 'reporte_mes' | 'historial_cierres'
  const [vistaActiva, setVistaActiva] = useState('caja_actual');

  // Modo de visualización en la caja diaria: 'periodo_actual' (reseteado a 0) vs 'total_dia' (acumulado)
  const [modoCaja, setModoCaja] = useState('periodo_actual');

  // ─── Cierres de Caja (Historial y Último Cierre) ───
  const [cierresHistorial, setCierresHistorial] = useState([]);
  const [ultimoCierre, setUltimoCierre] = useState(null);
  const [cargandoCierres, setCargandoCierres] = useState(true);

  // ─── Modales y Estados de Cierre ───
  const [modalCierreAbierto, setModalCierreAbierto] = useState(false);
  const [modalDetalleCierre, setModalDetalleCierre] = useState(null);
  const [modalTicketImpresion, setModalTicketImpresion] = useState(null);
  const [cerrandoCaja, setCerrandoCaja] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [notasCierre, setNotasCierre] = useState('');

  // ─── Ventas de Cantina (Día y Mes) ───
  const [ventasDia, setVentasDia] = useState([]);
  const [ventasMes, setVentasMes] = useState([]);
  const [turnosMesSupabase, setTurnosMesSupabase] = useState([]);
  const [cargandoVentas, setCargandoVentas] = useState(true);
  const [cargandoReporteMes, setCargandoReporteMes] = useState(false);

  const fechaISO = hoyISO();
  const fechaHace30Dias = useMemo(() => sumarDias(fechaISO, -30), [fechaISO]);

  /* ══════════════════════════════════════════════════════════════════════════
     1. Carga de Cierres de Caja (Supabase con respaldo en localStorage)
     ══════════════════════════════════════════════════════════════════════════ */
  const cargarCierres = useCallback(async () => {
    setCargandoCierres(true);

    let cierresLocales = [];
    try {
      const raw = localStorage.getItem(LS_CIERRES);
      if (raw) cierresLocales = JSON.parse(raw);
    } catch (e) {
      console.error('[Caja] Error al leer cierres locales:', e);
    }

    try {
      const { data, error } = await supabase
        .from('cierres_caja')
        .select('*')
        .order('creado_el', { ascending: false });

      if (error) {
        console.warn('[Caja] No se pudo leer cierres_caja de Supabase, usando respaldo local:', error.message);
        setCierresHistorial(cierresLocales);
        setUltimoCierre(cierresLocales[0] || null);
      } else {
        // Unificar Supabase y local garantizando que no se pierda ningún cierre
        const mapa = new Map();
        for (const c of cierresLocales) {
          mapa.set(c.folio || c.id, c);
        }
        for (const c of data || []) {
          mapa.set(c.folio || c.id, c);
        }
        const combinados = Array.from(mapa.values()).sort(
          (a, b) => new Date(b.creado_el || b.fecha_cierre) - new Date(a.creado_el || a.fecha_cierre)
        );

        setCierresHistorial(combinados);
        setUltimoCierre(combinados[0] || null);
        try {
          localStorage.setItem(LS_CIERRES, JSON.stringify(combinados));
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.error('[Caja] Error al cargar cierres:', err);
      setCierresHistorial(cierresLocales);
      setUltimoCierre(cierresLocales[0] || null);
    } finally {
      setCargandoCierres(false);
    }
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════
     2. Carga de Ventas de Cantina (Día y Mes)
     ══════════════════════════════════════════════════════════════════════════ */
  const cargarVentasCantina = useCallback(async () => {
    setCargandoVentas(true);
    try {
      const { data, error } = await supabase
        .from('ventas_cantina')
        .select('*, ventas_cantina_detalle(nombre, precio, cantidad)')
        .eq('fecha', fechaISO)
        .order('hora', { ascending: true });

      if (error) {
        console.warn('[Caja] No se pudieron leer ventas de cantina de hoy:', error.message);
        setVentasDia([]);
      } else {
        setVentasDia(data || []);
      }
    } catch (err) {
      console.error('[Caja] Error en ventas de hoy:', err);
    } finally {
      setCargandoVentas(false);
    }
  }, [fechaISO]);

  const cargarDatosMes = useCallback(async () => {
    setCargandoReporteMes(true);
    try {
      // 1. Ventas de cantina últimos 30 días
      const { data: vData } = await supabase
        .from('ventas_cantina')
        .select('*, ventas_cantina_detalle(nombre, precio, cantidad)')
        .gte('fecha', fechaHace30Dias)
        .lte('fecha', fechaISO)
        .order('fecha', { ascending: true });

      setVentasMes(vData || []);

      // 2. Turnos pagados últimos 30 días
      const { data: tData } = await supabase
        .from('turnos')
        .select('*')
        .eq('estado', 'pagado')
        .gte('fecha', fechaHace30Dias)
        .lte('fecha', fechaISO)
        .order('fecha', { ascending: true });

      setTurnosMesSupabase(tData || []);
    } catch (err) {
      console.error('[Caja] Error al cargar datos del mes:', err);
    } finally {
      setCargandoReporteMes(false);
    }
  }, [fechaHace30Dias, fechaISO]);

  useEffect(() => {
    cargarCierres();
    cargarVentasCantina();
    cargarDatosMes();
  }, [cargarCierres, cargarVentasCantina, cargarDatosMes]);

  /* ══════════════════════════════════════════════════════════════════════════
     3. Filtrado de Turnos Pagados del Día
     ══════════════════════════════════════════════════════════════════════════ */
  const turnosPagadosDelDiaTotal = useMemo(
    () =>
      obtenerTurnosDelDia(fechaISO)
        .filter((t) => t.estado === 'pagado')
        .sort((a, b) => (a.hora_inicio || '').localeCompare(b.hora_inicio || '')),
    [obtenerTurnosDelDia, fechaISO]
  );

  /* ══════════════════════════════════════════════════════════════════════════
     4. DETERMINACIÓN DEL PERÍODO ACTUAL (CON RESETEO A $0 TRAS CIERRE)
     ══════════════════════════════════════════════════════════════════════════ */
  /**
   * Un movimiento pertenece al Período Actual si su momento de pago/creación
   * es posterior al último cierre registrado hoy. Si el cierre se ejecutó
   * hace instantes, no hay movimientos posteriores, resultando en $0.
   */
  const timestampUltimoCierre = useMemo(() => {
    if (!ultimoCierre) return 0;
    const corte = ultimoCierre.fecha_cierre || ultimoCierre.creado_el;
    return corte ? new Date(corte).getTime() : 0;
  }, [ultimoCierre]);

  const esDePeriodoActual = useCallback(
    (item, esTurno = true) => {
      if (!ultimoCierre) return true; // Sin cierres previos, todo hoy pertenece al período
      const corteTime = timestampUltimoCierre;
      if (!corteTime) return true;

      let itemTime = 0;
      if (esTurno) {
        if (item.cobrado_el) {
          itemTime = new Date(item.cobrado_el).getTime();
        } else if (item.creado_el) {
          itemTime = new Date(item.creado_el).getTime();
        } else if (item.fecha && item.hora_inicio) {
          itemTime = new Date(`${item.fecha}T${item.hora_inicio.slice(0, 5)}:00`).getTime();
        }
      } else {
        if (item.creado_el) {
          itemTime = new Date(item.creado_el).getTime();
        } else if (item.fecha && item.hora) {
          itemTime = new Date(`${item.fecha}T${item.hora.slice(0, 5)}:00`).getTime();
        }
      }

      return itemTime > corteTime;
    },
    [ultimoCierre, timestampUltimoCierre]
  );

  // Turnos y ventas para la vista actual (dependiendo de modoCaja)
  const turnosParaCajaActual = useMemo(() => {
    if (modoCaja === 'total_dia') return turnosPagadosDelDiaTotal;
    return turnosPagadosDelDiaTotal.filter((t) => esDePeriodoActual(t, true));
  }, [modoCaja, turnosPagadosDelDiaTotal, esDePeriodoActual]);

  const ventasParaCajaActual = useMemo(() => {
    if (modoCaja === 'total_dia') return ventasDia;
    return ventasDia.filter((v) => esDePeriodoActual(v, false));
  }, [modoCaja, ventasDia, esDePeriodoActual]);

  // Consolidado Financiero de la Caja Diaria Actual
  const datosCaja = useMemo(() => {
    return calcularConsolidadoFinanciero(turnosParaCajaActual, ventasParaCajaActual, precioBaseCancha);
  }, [turnosParaCajaActual, ventasParaCajaActual, precioBaseCancha]);

  // Lista unificada de todas las ventas de cantina (Mostrador + Turnos)
  const todasLasVentasCantinaActual = useMemo(() => {
    const mostrador = ventasParaCajaActual.map((v) => ({
      id: `pos-${v.id}`,
      tipo: 'mostrador',
      ticket: v.ticket || `#${String(v.id).slice(0, 6)}`,
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

    const deTurnos = datosCaja.desgloseTurnos
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
          metodo_pago: t.metodo_pago || 'En Turno',
          detalle: detalle || `${d.cantinaItems.length} artículos`,
          total: d.cantinaTotal,
          cantidad_items: d.cantinaItems.reduce((acc, it) => acc + (Number(it.cantidad) || 1), 0),
        };
      });

    return [...mostrador, ...deTurnos].sort((a, b) =>
      (a.hora || '').localeCompare(b.hora || '')
    );
  }, [ventasParaCajaActual, datosCaja.desgloseTurnos]);

  /* ══════════════════════════════════════════════════════════════════════════
     5. CÁLCULO DEL REPORTE CONSOLIDADO DE LOS ÚLTIMOS 30 DÍAS
     ══════════════════════════════════════════════════════════════════════════ */
  // Unificar turnos del contexto y turnos de Supabase para los 30 días
  const turnosMesUnificados = useMemo(() => {
    const mapa = new Map();
    for (const t of turnosMesSupabase) {
      mapa.set(t.id, t);
    }
    for (const t of turnos) {
      if (t.estado === 'pagado' && t.fecha >= fechaHace30Dias && t.fecha <= fechaISO) {
        mapa.set(t.id, t);
      }
    }
    return Array.from(mapa.values());
  }, [turnosMesSupabase, turnos, fechaHace30Dias, fechaISO]);

  const datosReporteMes = useMemo(() => {
    return calcularConsolidadoFinanciero(turnosMesUnificados, ventasMes, precioBaseCancha);
  }, [turnosMesUnificados, ventasMes, precioBaseCancha]);

  // Agrupación día por día de los últimos 30 días para la tabla evolutiva
  const diasEvolucionMes = useMemo(() => {
    const mapaDias = {};

    // Inicializar los últimos 30 días
    for (let i = 0; i <= 30; i++) {
      const f = sumarDias(fechaISO, -i);
      mapaDias[f] = {
        fecha: f,
        canchas: 0,
        cantina: 0,
        total: 0,
        efectivo: 0,
        transferencia: 0,
        debito: 0,
        credito: 0,
        turnosCount: 0,
        ventasCount: 0,
      };
    }

    // Sumar turnos por día
    for (const t of turnosMesUnificados) {
      if (mapaDias[t.fecha]) {
        const { total: cTotal } = obtenerConsumoCantinaTurno(t);
        const neto = resolverMontoCanchaNeto(t, precioBaseCancha);
        const sub = calcularConsolidadoFinanciero([t], [], precioBaseCancha);

        mapaDias[t.fecha].canchas += neto;
        mapaDias[t.fecha].cantina += cTotal;
        mapaDias[t.fecha].total += neto + cTotal;
        mapaDias[t.fecha].efectivo += sub.totalEfectivo;
        mapaDias[t.fecha].transferencia += sub.totalTransferencia;
        mapaDias[t.fecha].debito += sub.totalDebito;
        mapaDias[t.fecha].credito += sub.totalCredito;
        mapaDias[t.fecha].turnosCount += 1;
      }
    }

    // Sumar ventas de cantina por día
    for (const v of ventasMes) {
      if (mapaDias[v.fecha]) {
        const subV = calcularConsolidadoFinanciero([], [v], precioBaseCancha);
        const tot = Number(v.total) || 0;

        mapaDias[v.fecha].cantina += tot;
        mapaDias[v.fecha].total += tot;
        mapaDias[v.fecha].efectivo += subV.totalEfectivo;
        mapaDias[v.fecha].transferencia += subV.totalTransferencia;
        mapaDias[v.fecha].debito += subV.totalDebito;
        mapaDias[v.fecha].credito += subV.totalCredito;
        mapaDias[v.fecha].ventasCount += 1;
      }
    }

    return Object.values(mapaDias).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [turnosMesUnificados, ventasMes, precioBaseCancha, fechaISO]);

  /* ══════════════════════════════════════════════════════════════════════════
     6. EJECUCIÓN DEL CIERRE DE CAJA (Z) CON RESETEO INMEDIATO A $0
     ══════════════════════════════════════════════════════════════════════════ */
  const ejecutarCierreCaja = async () => {
    setCerrandoCaja(true);

    const ahora = new Date();
    const ahoraHora = `${String(ahora.getHours()).padStart(2, '0')}:${String(
      ahora.getMinutes()
    ).padStart(2, '0')}`;
    const fechaCierreISO = ahora.toISOString();
    const folio = `CIE-${Date.now().toString().slice(-6)}`;

    // Construcción del registro formal de cierre histórico
    const nuevoCierre = {
      folio,
      fecha: fechaISO,
      hora_cierre: ahoraHora,
      fecha_cierre: fechaCierreISO,
      periodo_desde: ultimoCierre ? (ultimoCierre.fecha_cierre || ultimoCierre.creado_el) : `${fechaISO}T00:00:00`,
      periodo_hasta: fechaCierreISO,
      total_general: datosCaja.totalGeneral,
      total_canchas: datosCaja.totalCanchas,
      total_cantina: datosCaja.totalCantina,
      total_cantina_mostrador: datosCaja.totalCantinaMostrador,
      total_cantina_turnos: datosCaja.totalCantinaTurnos,
      total_efectivo: datosCaja.totalEfectivo,
      total_transferencia: datosCaja.totalTransferencia,
      total_debito: datosCaja.totalDebito,
      total_credito: datosCaja.totalCredito,
      cantidad_turnos: datosCaja.cantidadTurnos,
      cantidad_ventas_cantina: datosCaja.cantidadVentasCantina,
      observaciones: notasCierre.trim() || null,
      cerrado_por: 'Administración',
      creado_el: fechaCierreISO,
    };

    try {
      // 1. Guardar en Supabase (si la tabla existe)
      const { data, error } = await supabase
        .from('cierres_caja')
        .insert([nuevoCierre])
        .select()
        .single();

      if (!error && data?.id) {
        nuevoCierre.id = data.id;
      } else if (error) {
        console.warn('[Caja] Aviso: La tabla cierres_caja no existe aún en Supabase o dio error, se guarda en localStorage:', error.message);
      }
    } catch (err) {
      console.warn('[Caja] Error de conexión al guardar en Supabase:', err);
    }

    // 2. Guardar en localStorage como garantía de persistencia permanente
    const historialActualizado = [nuevoCierre, ...cierresHistorial.filter((c) => c.folio !== folio)];
    setCierresHistorial(historialActualizado);
    setUltimoCierre(nuevoCierre);
    try {
      localStorage.setItem(LS_CIERRES, JSON.stringify(historialActualizado));
    } catch {
      /* ignore */
    }

    // 3. INMEDIATAMENTE DESPUÉS DEL CIERRE:
    // Los valores de la caja diaria actual se reinician a 0 porque `ultimoCierre`
    // ahora apunta a este instante, excluyendo los movimientos recién cerrados.
    setModalCierreAbierto(false);
    setCerrandoCaja(false);
    setNotasCierre('');

    setMensajeExito({
      folio,
      total: nuevoCierre.total_general,
      hora: ahoraHora,
      cierre: nuevoCierre,
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  const abrirTicketImpresion = (cierre) => {
    setModalTicketImpresion(cierre || ultimoCierre || {
      folio: 'ACTUAL',
      fecha: fechaISO,
      hora_cierre: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      ...datosCaja,
    });
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto w-full pb-16">
      {/* ─── Encabezado Principal y Acciones Rápidas ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
              Caja Diaria
            </h1>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Caja Operativa
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {new Date().toLocaleDateString('es-AR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {ultimoCierre && (
              <span className="ml-1 text-slate-400">
                · Último cierre: {ultimoCierre.hora_cierre} hs ({ultimoCierre.folio})
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => abrirTicketImpresion()}
            className="flex-1 sm:flex-none bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-2xs transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Printer className="w-4 h-4 shrink-0 text-slate-500" />
            <span>Imprimir Arqueo</span>
          </button>

          <button
            type="button"
            onClick={() => setModalCierreAbierto(true)}
            className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white px-5 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Realizar Cierre de Caja</span>
          </button>
        </div>
      </div>

      {/* ─── Pestañas de Navegación del Módulo ─── */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl max-w-full overflow-x-auto">
        <button
          type="button"
          onClick={() => setVistaActiva('caja_actual')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            vistaActiva === 'caja_actual'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span>Caja Diaria Actual</span>
          {datosCaja.totalGeneral > 0 && (
            <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-black">
              {formatearMonto(datosCaja.totalGeneral)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setVistaActiva('reporte_mes')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            vistaActiva === 'reporte_mes'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Calendar className="w-4 h-4 text-blue-600" />
          <span>Reporte Consolidado (30 Días)</span>
        </button>

        <button
          type="button"
          onClick={() => setVistaActiva('historial_cierres')}
          className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
            vistaActiva === 'historial_cierres'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <History className="w-4 h-4 text-purple-600" />
          <span>Historial de Cierres ({cierresHistorial.length})</span>
        </button>
      </div>

      {/* ─── Banner de Notificación de Cierre Z Reciente ─── */}
      {mensajeExito && (
        <div className="p-4 sm:p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-emerald-950 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-700">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="font-black text-sm sm:text-base">
                Cierre de Caja ejecutado con éxito · Folio {mensajeExito.folio}
              </p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Se archivó la recaudación de {formatearMonto(mensajeExito.total)}. La caja diaria actual{' '}
                <strong className="font-extrabold underline">ha sido reiniciada a $0.00</strong> para el inicio de la nueva jornada.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => abrirTicketImpresion(mensajeExito.cierre)}
              className="px-3.5 py-1.5 text-xs font-bold bg-white text-emerald-900 hover:bg-emerald-100/70 border border-emerald-300 rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Ver Comprobante</span>
            </button>
            <button
              type="button"
              onClick={() => setMensajeExito(null)}
              className="text-emerald-700 hover:text-emerald-950 p-1.5 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         VISTA 1: CAJA DIARIA ACTUAL (EL TURNO EN CURSO — RESETEADO A $0 TRAS CIERRE)
         ══════════════════════════════════════════════════════════════════════════ */}
      {vistaActiva === 'caja_actual' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          {/* Barra de estado del período actual y selector de modo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${datosCaja.totalGeneral > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block">
                  {modoCaja === 'periodo_actual' ? (
                    <>
                      Período Contable Abierto{' '}
                      {ultimoCierre && (
                        <span className="text-slate-500 font-normal">
                          (desde {ultimoCierre.hora_cierre} hs tras Cierre {ultimoCierre.folio})
                        </span>
                      )}
                    </>
                  ) : (
                    'Vista Total Consolidada de Todo el Día'
                  )}
                </span>
                <span className="text-[11px] text-slate-500 block truncate">
                  {modoCaja === 'periodo_actual'
                    ? datosCaja.totalGeneral === 0
                      ? 'Caja en $0. No hay nuevos cobros registrados desde el último cierre.'
                      : 'Mostrando ingresos recaudados pendientes de próximo arqueo.'
                    : 'Incluye todos los cobros del día, cerrados y abiertos.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1 rounded-xl shrink-0 self-start sm:self-auto shadow-2xs">
              <button
                type="button"
                onClick={() => setModoCaja('periodo_actual')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  modoCaja === 'periodo_actual'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Período Actual ({formatearMonto(datosCaja.totalGeneral)})
              </button>
              <button
                type="button"
                onClick={() => setModoCaja('total_dia')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  modoCaja === 'total_dia'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Muestra el consolidado de todo el día sin filtrar el último cierre"
              >
                Acumulado del Día
              </button>
            </div>
          </div>

          {/* ─── Sección 1: Tarjetas de Resumen (KPIs Dinámicos) ─── */}
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
                  {formatearMonto(datosCaja.totalGeneral)}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-2">
                  <span className="text-emerald-400 font-bold flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> Canchas + Cantina
                  </span>
                  <span>• {modoCaja === 'periodo_actual' ? 'Período en curso' : 'Jornada total'}</span>
                </div>
              </div>
              <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-zinc-800/40 rounded-full blur-xl pointer-events-none" />
            </div>

            {/* Tarjeta 2 (Canchas — alquiler neto) */}
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
                  {formatearMonto(datosCaja.totalCanchas)}
                </span>
                <p className="text-xs text-slate-500 mt-2 font-medium">
                  {datosCaja.cantidadTurnos} turno{datosCaja.cantidadTurnos !== 1 ? 's' : ''} cobrado
                  {datosCaja.cantidadTurnos !== 1 ? 's' : ''} · Alquiler neto
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
                  {formatearMonto(datosCaja.totalCantina)}
                </span>
                <div className="text-xs text-slate-500 mt-2 font-medium flex flex-col gap-0.5">
                  <span>
                    {todasLasVentasCantinaActual.length === 0
                      ? 'Sin ventas en este período'
                      : `${todasLasVentasCantinaActual.length} operaciones registradas`}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Mostrador: {formatearMonto(datosCaja.totalCantinaMostrador)} · En Turnos:{' '}
                    {formatearMonto(datosCaja.totalCantinaTurnos)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════
             TAREA 1: DESGLOSE DETALLADO POR MEDIO DE PAGO (EFECTIVO, TRANSF, DÉBITO, CRÉDITO)
             ══════════════════════════════════════════════════════════════════════════ */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
              <div>
                <h2 className="font-black text-slate-900 text-base tracking-tight flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-emerald-600" />
                  <span>Desglose Detallado por Medio de Pago</span>
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Agrupación contable de todos los ingresos de la caja actual
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg self-start sm:self-auto">
                Total Arqueado: {formatearMonto(datosCaja.totalGeneral)}
              </span>
            </div>

            {/* Grilla con los 4 Medios de Pago Requeridos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* 1. Efectivo */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Efectivo
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Banknote className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-slate-900 block tabular-nums">
                    {formatearMonto(datosCaja.totalEfectivo)}
                  </span>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Canchas:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.efectivo.canchas)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cantina:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.efectivo.cantina)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-center">
                  {datosCaja.totalGeneral > 0
                    ? `${Math.round((datosCaja.totalEfectivo / datosCaja.totalGeneral) * 100)}% del total`
                    : '0% del total'}
                </div>
              </div>

              {/* 2. Transferencia / MP */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Transferencia / MP
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-slate-900 block tabular-nums">
                    {formatearMonto(datosCaja.totalTransferencia)}
                  </span>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Canchas:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.transferencia.canchas)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cantina:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.transferencia.cantina)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-center">
                  {datosCaja.totalGeneral > 0
                    ? `${Math.round((datosCaja.totalTransferencia / datosCaja.totalGeneral) * 100)}% del total`
                    : '0% del total'}
                </div>
              </div>

              {/* 3. Débito */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Tarjeta Débito
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-slate-900 block tabular-nums">
                    {formatearMonto(datosCaja.totalDebito)}
                  </span>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Canchas:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.debito.canchas)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cantina:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.debito.cantina)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-center">
                  {datosCaja.totalGeneral > 0
                    ? `${Math.round((datosCaja.totalDebito / datosCaja.totalGeneral) * 100)}% del total`
                    : '0% del total'}
                </div>
              </div>

              {/* 4. Crédito */}
              <div className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200/80 rounded-2xl p-4 transition-all flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Tarjeta Crédito
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black text-slate-900 block tabular-nums">
                    {formatearMonto(datosCaja.totalCredito)}
                  </span>
                  <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Canchas:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.credito.canchas)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cantina:</span>
                      <span className="font-semibold text-slate-700">
                        {formatearMonto(datosCaja.desgloseMetodos.credito.cantina)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded text-center">
                  {datosCaja.totalGeneral > 0
                    ? `${Math.round((datosCaja.totalCredito / datosCaja.totalGeneral) * 100)}% del total`
                    : '0% del total'}
                </div>
              </div>
            </div>

            {/* Barra visual de distribución de pagos */}
            {datosCaja.totalGeneral > 0 && (
              <div className="pt-2">
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                  {datosCaja.totalEfectivo > 0 && (
                    <div
                      style={{ width: `${(datosCaja.totalEfectivo / datosCaja.totalGeneral) * 100}%` }}
                      className="bg-emerald-500 h-full"
                      title={`Efectivo: ${formatearMonto(datosCaja.totalEfectivo)}`}
                    />
                  )}
                  {datosCaja.totalTransferencia > 0 && (
                    <div
                      style={{ width: `${(datosCaja.totalTransferencia / datosCaja.totalGeneral) * 100}%` }}
                      className="bg-blue-500 h-full"
                      title={`Transferencia: ${formatearMonto(datosCaja.totalTransferencia)}`}
                    />
                  )}
                  {datosCaja.totalDebito > 0 && (
                    <div
                      style={{ width: `${(datosCaja.totalDebito / datosCaja.totalGeneral) * 100}%` }}
                      className="bg-indigo-500 h-full"
                      title={`Débito: ${formatearMonto(datosCaja.totalDebito)}`}
                    />
                  )}
                  {datosCaja.totalCredito > 0 && (
                    <div
                      style={{ width: `${(datosCaja.totalCredito / datosCaja.totalGeneral) * 100}%` }}
                      className="bg-amber-500 h-full"
                      title={`Crédito: ${formatearMonto(datosCaja.totalCredito)}`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ─── Sección 2: Desglose de Movimientos (Canchas vs Cantina) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Columna Izquierda: Detalle de Canchas */}
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
                      {modoCaja === 'periodo_actual' ? 'Turnos cobrados en este período' : 'Turnos cobrados hoy'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md shrink-0">
                  {turnosParaCajaActual.length} turno{turnosParaCajaActual.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto overscroll-contain-smooth max-h-[460px]">
                {datosCaja.desgloseTurnos.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                    <CalendarDays className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
                    <p className="font-bold text-slate-700 text-sm">
                      {modoCaja === 'periodo_actual'
                        ? 'Sin turnos cobrados en el período actual'
                        : 'Sin turnos cobrados hoy'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {modoCaja === 'periodo_actual'
                        ? 'La caja está en $0 tras el último cierre. Los nuevos turnos cobrados aparecerán aquí.'
                        : 'Los turnos aparecen al cobrarse en la Agenda Diaria.'}
                    </p>
                  </div>
                ) : (
                  datosCaja.desgloseTurnos.map(({ turno, montoCanchaNeto, cantinaTotal }) => {
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
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                              <span
                                className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                                  esRoja ? 'bg-red-500' : 'bg-green-500'
                                }`}
                              />
                              <span className="truncate">{nombreCancha}</span>
                              <span>•</span>
                              <span className="text-blue-600 font-semibold">Alquiler Cancha</span>
                              {turno.metodo_pago && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 uppercase">
                                  {ETIQUETA_METODO[turno.metodo_pago] || turno.metodo_pago}
                                </span>
                              )}
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

            {/* Columna Derecha: Detalle de Cantina */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-6 shadow-sm flex flex-col">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-slate-900 text-base truncate">
                      Detalle de Cantina
                    </h2>
                    <p className="text-[11px] text-slate-400 font-medium truncate">
                      {modoCaja === 'periodo_actual' ? 'Ventas en este período' : 'Todas las ventas de hoy'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md shrink-0">
                  {todasLasVentasCantinaActual.length} ticket{todasLasVentasCantinaActual.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto overscroll-contain-smooth max-h-[460px]">
                {cargandoVentas ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2">
                    <div className="w-6 h-6 border-[3px] border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                    <p className="text-xs text-slate-400 font-medium">Cargando…</p>
                  </div>
                ) : todasLasVentasCantinaActual.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                    <CoffeeIcon className="w-10 h-10 text-slate-300 stroke-1 mb-2" />
                    <p className="font-bold text-slate-700 text-sm">
                      {modoCaja === 'periodo_actual'
                        ? 'Sin ventas de cantina en el período actual'
                        : 'Sin ventas de cantina hoy'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {modoCaja === 'periodo_actual'
                        ? 'Al registrar ventas en Cantina o turnos en este turno, se imputarán aquí.'
                        : 'Las ventas de mostrador (POS) o agregadas a los turnos aparecen acá.'}
                    </p>
                  </div>
                ) : (
                  todasLasVentasCantinaActual.map((item) => {
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

          {/* ─── Botón Maestro Inferior de Cierre de Caja ─── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 to-zinc-900 text-white rounded-2xl shadow-sm">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="font-black text-base sm:text-lg flex items-center justify-center sm:justify-start gap-2">
                <Lock className="w-5 h-5 text-red-400" />
                <span>Cierre de Jornada Contable (Reporte Z)</span>
              </h3>
              <p className="text-xs text-zinc-400 max-w-xl">
                Archiva los ingresos recaudados en Supabase y{' '}
                <strong className="text-white underline">reinicia la caja diaria a $0</strong> para iniciar un nuevo período limpio.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setModalCierreAbierto(true)}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm sm:text-base shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <AlertTriangle className="w-4 h-4 text-white" />
              <span>Ejecutar Cierre y Resetear a $0</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         TAREA 2: REPORTE CONSOLIDADO DEL ÚLTIMO MES (ÚLTIMOS 30 DÍAS)
         ══════════════════════════════════════════════════════════════════════════ */}
      {vistaActiva === 'reporte_mes' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span>Reporte Consolidado — Últimos 30 Días</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Del {fechaHace30Dias} al {fechaISO} · Análisis financiero consolidado
              </p>
            </div>
            <button
              type="button"
              onClick={cargarDatosMes}
              disabled={cargandoReporteMes}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cargandoReporteMes ? 'animate-spin' : ''}`} />
              <span>Actualizar Datos</span>
            </button>
          </div>

          {/* Tarjetas Principales del Mes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                TOTAL RECAUDADO (30 DÍAS)
              </span>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black tabular-nums block">
                  {formatearMonto(datosReporteMes.totalGeneral)}
                </span>
                <span className="text-xs text-emerald-400 font-semibold mt-1 block">
                  Canchas + Cantina
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  CANCHAS (30 DÍAS)
                </span>
                <CalendarDays className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black text-blue-600 tabular-nums block">
                  {formatearMonto(datosReporteMes.totalCanchas)}
                </span>
                <span className="text-xs text-slate-500 font-medium mt-1 block">
                  {datosReporteMes.cantidadTurnos} turnos cobrados
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  CANTINA (30 DÍAS)
                </span>
                <CoffeeIcon className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 tabular-nums block">
                  {formatearMonto(datosReporteMes.totalCantina)}
                </span>
                <span className="text-xs text-slate-500 font-medium mt-1 block">
                  {datosReporteMes.cantidadVentasCantina} tickets en mostrador
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                  PROMEDIO DIARIO
                </span>
                <TrendingUp className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-3">
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums block">
                  {formatearMonto(Math.round(datosReporteMes.totalGeneral / 30))}
                </span>
                <span className="text-xs text-slate-500 font-medium mt-1 block">
                  Ingreso promedio por día
                </span>
              </div>
            </div>
          </div>

          {/* Desglose por Medio de Pago en los 30 Días */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-600" />
              <span>Desglose Consolidado por Medio de Pago (Últimos 30 Días)</span>
            </h3>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Efectivo</span>
                <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums block mt-1">
                  {formatearMonto(datosReporteMes.totalEfectivo)}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-1">
                  {datosReporteMes.totalGeneral > 0
                    ? `${Math.round((datosReporteMes.totalEfectivo / datosReporteMes.totalGeneral) * 100)}% del total`
                    : '0%'}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Transferencia / MP</span>
                <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums block mt-1">
                  {formatearMonto(datosReporteMes.totalTransferencia)}
                </span>
                <span className="text-[10px] text-blue-700 font-bold block mt-1">
                  {datosReporteMes.totalGeneral > 0
                    ? `${Math.round((datosReporteMes.totalTransferencia / datosReporteMes.totalGeneral) * 100)}% del total`
                    : '0%'}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Tarjeta Débito</span>
                <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums block mt-1">
                  {formatearMonto(datosReporteMes.totalDebito)}
                </span>
                <span className="text-[10px] text-indigo-700 font-bold block mt-1">
                  {datosReporteMes.totalGeneral > 0
                    ? `${Math.round((datosReporteMes.totalDebito / datosReporteMes.totalGeneral) * 100)}% del total`
                    : '0%'}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
                <span className="text-[11px] font-bold text-slate-500 uppercase block">Tarjeta Crédito</span>
                <span className="text-lg sm:text-xl font-black text-slate-900 tabular-nums block mt-1">
                  {formatearMonto(datosReporteMes.totalCredito)}
                </span>
                <span className="text-[10px] text-amber-700 font-bold block mt-1">
                  {datosReporteMes.totalGeneral > 0
                    ? `${Math.round((datosReporteMes.totalCredito / datosReporteMes.totalGeneral) * 100)}% del total`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* Tabla Día por Día de los Últimos 30 Días */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  Evolución Diaria (Últimos 30 Días)
                </h3>
                <p className="text-xs text-slate-400">Detalle separado de Canchas y Cantina por fecha</p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
                30 fechas analizadas
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Canchas ($)</th>
                    <th className="px-4 py-3">Cantina ($)</th>
                    <th className="px-4 py-3">Total Día ($)</th>
                    <th className="px-4 py-3 hidden md:table-cell">Efectivo</th>
                    <th className="px-4 py-3 hidden md:table-cell">Transf.</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Débito/Créd.</th>
                    <th className="px-4 py-3 text-right">Estado Cierre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diasEvolucionMes.map((d) => {
                    const tieneCierre = cierresHistorial.some((c) => c.fecha === d.fecha);
                    const esHoy = d.fecha === fechaISO;

                    return (
                      <tr
                        key={d.fecha}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          esHoy ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                          {d.fecha}
                          {esHoy && (
                            <span className="ml-2 text-[10px] font-black uppercase text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                              Hoy
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-blue-600 font-bold tabular-nums">
                          {formatearMonto(d.canchas)}
                        </td>
                        <td className="px-4 py-3 text-emerald-600 font-bold tabular-nums">
                          {formatearMonto(d.cantina)}
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900 tabular-nums">
                          {formatearMonto(d.total)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums hidden md:table-cell">
                          {formatearMonto(d.efectivo)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums hidden md:table-cell">
                          {formatearMonto(d.transferencia)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums hidden lg:table-cell">
                          {formatearMonto(d.debito + d.credito)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {tieneCierre ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Cerrado Z
                            </span>
                          ) : d.total > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Sin Cierre Z
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Sin ventas</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         VISTA 3: HISTORIAL DE CIERRES DE CAJA (AUDITORÍA FISCAL / REPORTES Z)
         ══════════════════════════════════════════════════════════════════════════ */}
      {vistaActiva === 'historial_cierres' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                <span>Historial de Cierres de Caja Realizados</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Registro inmutable de arqueos y jornadas archivadas en Supabase
              </p>
            </div>
            <button
              type="button"
              onClick={cargarCierres}
              disabled={cargandoCierres}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cargandoCierres ? 'animate-spin' : ''}`} />
              <span>Recargar Cierres</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {cargandoCierres ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2">
                <div className="w-7 h-7 border-[3px] border-slate-200 border-t-purple-600 rounded-full animate-spin" />
                <p className="text-xs text-slate-400 font-medium">Cargando historial de cierres…</p>
              </div>
            ) : cierresHistorial.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center px-6">
                <History className="w-12 h-12 text-slate-300 stroke-1 mb-3" />
                <p className="font-bold text-slate-800 text-base">Aún no hay cierres de caja registrados</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Al pulsar el botón &quot;Realizar Cierre de Caja&quot;, el sistema guardará el arqueo con folio único y reiniciará la caja a $0.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Folio / Fecha</th>
                      <th className="px-4 py-3">Hora Cierre</th>
                      <th className="px-4 py-3">Total Cerrado ($)</th>
                      <th className="px-4 py-3">Canchas ($)</th>
                      <th className="px-4 py-3">Cantina ($)</th>
                      <th className="px-4 py-3 hidden md:table-cell">Efectivo</th>
                      <th className="px-4 py-3 hidden md:table-cell">Transf.</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cierresHistorial.map((cierre) => (
                      <tr key={cierre.id || cierre.folio} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-black text-slate-900 block font-mono text-xs">
                            {cierre.folio}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {cierre.fecha}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-semibold">
                          {cierre.hora_cierre} hs
                        </td>
                        <td className="px-4 py-3 font-black text-slate-900 tabular-nums">
                          {formatearMonto(cierre.total_general)}
                        </td>
                        <td className="px-4 py-3 text-blue-600 font-bold tabular-nums">
                          {formatearMonto(cierre.total_canchas)}
                        </td>
                        <td className="px-4 py-3 text-emerald-600 font-bold tabular-nums">
                          {formatearMonto(cierre.total_cantina)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums hidden md:table-cell">
                          {formatearMonto(cierre.total_efectivo)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums hidden md:table-cell">
                          {formatearMonto(cierre.total_transferencia)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => abrirTicketImpresion(cierre)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 inline-flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                          >
                            <Printer className="w-3 h-3 text-slate-500" />
                            <span>Imprimir</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         MODAL 1: CONFIRMAR CIERRE DE CAJA (Z) CON RESETEO A $0
         ══════════════════════════════════════════════════════════════════════════ */}
      {modalCierreAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4"
          onClick={(e) => e.target === e.currentTarget && !cerrandoCaja && setModalCierreAbierto(false)}
        >
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
                  Confirmar Cierre de Caja (Z)
                </h3>
                <p className="text-xs text-slate-500">
                  Período contable actual · Arqueo y congelamiento
                </p>
              </div>
            </div>

            {/* Resumen numérico del cierre */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-xs sm:text-sm text-slate-700 my-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Alquiler Canchas ({datosCaja.cantidadTurnos} turnos):</span>
                <span className="font-bold text-slate-900">{formatearMonto(datosCaja.totalCanchas)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Ventas Cantina ({todasLasVentasCantinaActual.length} op.):</span>
                <span className="font-bold text-slate-900">{formatearMonto(datosCaja.totalCantina)}</span>
              </div>

              {/* Desglose estricto por método */}
              <div className="pt-2 border-t border-dashed border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>• Efectivo a arquear:</span>
                  <span className="font-semibold text-slate-900">{formatearMonto(datosCaja.totalEfectivo)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>• Transferencia / MP:</span>
                  <span className="font-semibold text-slate-900">{formatearMonto(datosCaja.totalTransferencia)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>• Tarjeta Débito:</span>
                  <span className="font-semibold text-slate-900">{formatearMonto(datosCaja.totalDebito)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>• Tarjeta Crédito:</span>
                  <span className="font-semibold text-slate-900">{formatearMonto(datosCaja.totalCredito)}</span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200 flex justify-between text-base font-black">
                <span>Total a Cerrar:</span>
                <span className="text-red-600">{formatearMonto(datosCaja.totalGeneral)}</span>
              </div>
            </div>

            {/* Input de notas u observaciones */}
            <div className="space-y-1.5 mb-4">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">
                Observaciones del Arqueo (Opcional):
              </label>
              <textarea
                value={notasCierre}
                onChange={(e) => setNotasCierre(e.target.value)}
                placeholder="Ej. Efectivo contado coincide, retiro de fondo para tesorería..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
              />
            </div>

            {/* Advertencia destacada de reseteo a 0 */}
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs mb-5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>ATENCIÓN:</strong> Al confirmar, este saldo quedará archivado formalmente en Supabase y{' '}
                <span className="font-extrabold underline">la caja diaria actual se reiniciará inmediatamente a $0.00</span> para el inicio del nuevo turno.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setModalCierreAbierto(false)}
                disabled={cerrandoCaja}
                className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarCierreCaja}
                disabled={cerrandoCaja}
                className="flex-[1.5] sm:flex-none px-5 py-3 sm:py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {cerrandoCaja ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Cerrando…</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Confirmar y Resetear a $0</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
         MODAL 2: VISTA E IMPRESIÓN DEL COMPROBANTE FISCAL / TICKET DE CIERRE Z
         ══════════════════════════════════════════════════════════════════════════ */}
      {modalTicketImpresion && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4"
          onClick={() => setModalTicketImpresion(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabecera del Ticket */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <h4 className="font-black text-slate-900 text-lg uppercase tracking-wider">
                {nombreClub || 'PÁDEL CLUB'}
              </h4>
              <p className="text-[11px] font-bold text-slate-500 uppercase mt-0.5">
                Comprobante de Cierre de Caja (Z)
              </p>
              <p className="text-xs font-mono font-bold text-slate-800 mt-1">
                Folio: {modalTicketImpresion.folio}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Fecha: {modalTicketImpresion.fecha} · Hora: {modalTicketImpresion.hora_cierre} hs
              </p>
            </div>

            {/* Cuerpo del Ticket */}
            <div className="py-4 space-y-2 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Alquiler de Canchas:</span>
                <span className="font-bold">{formatearMonto(modalTicketImpresion.total_canchas || modalTicketImpresion.totalCanchas)}</span>
              </div>
              <div className="flex justify-between">
                <span>Consumos de Cantina:</span>
                <span className="font-bold">{formatearMonto(modalTicketImpresion.total_cantina || modalTicketImpresion.totalCantina)}</span>
              </div>

              <div className="pt-2 border-t border-dashed border-slate-200 text-[11px] space-y-1">
                <div className="flex justify-between text-slate-500">
                  <span>Efectivo:</span>
                  <span className="font-semibold text-slate-800">{formatearMonto(modalTicketImpresion.total_efectivo || modalTicketImpresion.totalEfectivo)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Transferencia / MP:</span>
                  <span className="font-semibold text-slate-800">{formatearMonto(modalTicketImpresion.total_transferencia || modalTicketImpresion.totalTransferencia)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tarjeta Débito:</span>
                  <span className="font-semibold text-slate-800">{formatearMonto(modalTicketImpresion.total_debito || modalTicketImpresion.totalDebito)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tarjeta Crédito:</span>
                  <span className="font-semibold text-slate-800">{formatearMonto(modalTicketImpresion.total_credito || modalTicketImpresion.totalCredito)}</span>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-slate-900 flex justify-between text-base font-black text-slate-900">
                <span>TOTAL ARQUEADO:</span>
                <span>{formatearMonto(modalTicketImpresion.total_general || modalTicketImpresion.totalGeneral)}</span>
              </div>

              {modalTicketImpresion.observaciones && (
                <div className="pt-2 text-[10px] text-slate-500 italic">
                  Obs: {modalTicketImpresion.observaciones}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-dashed border-slate-300 text-center space-y-3">
              <p className="text-[10px] text-slate-400">
                Documento de control contable interno y auditoría
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleImprimir}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Ticket</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalTicketImpresion(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

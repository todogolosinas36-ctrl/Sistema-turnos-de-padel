import { useState, useEffect, useMemo, useRef } from 'react';
import { useArticulos } from '../context/ArticulosContext';
import { useTurnos } from '../context/TurnosContext';
import {
  X,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  Search,
  DollarSign,
  Tag,
  Sparkles,
  Pencil,
  AlertTriangle,
  Banknote,
  Smartphone,
  CreditCard,
  Coins,
} from 'lucide-react';
import { formatearMetodoPagoMixto, calcularTotalesMixtos, resolverPrecioCancha } from '../utils/paymentHelpers';

const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transf / MP', icon: Smartphone },
  { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
];

export default function ModalCobro({ isOpen, onClose, turno, onConfirmarCobro }) {
  const { articulos, ajustarStock } = useArticulos();
  const { precioBaseCancha } = useTurnos();

  // Monto base de la cancha: viene del turno consolidado en Supabase o de la Configuración general
  const [totalBaseCancha, setTotalBaseCancha] = useState(() =>
    resolverPrecioCancha(turno, precioBaseCancha)
  );
  const [editandoBase, setEditandoBase] = useState(false);
  const [gastosCompartidos, setGastosCompartidos] = useState([]);
  const [modalGastoCompartido, setModalGastoCompartido] = useState(false);
  const [conceptoGasto, setConceptoGasto] = useState('');
  const [montoGasto, setMontoGasto] = useState('');

  // Selector de División
  const [division, setDivision] = useState(4); // 4 jugadores por defecto en pádel

  // Estado de cada jugador
  const [jugadores, setJugadores] = useState([]);

  // Sub-modal buscador rápido de Kiosco
  const [jugadorKioscoActivo, setJugadorKioscoActivo] = useState(null);
  const [busquedaKiosco, setBusquedaKiosco] = useState('');
  const [avisoStock, setAvisoStock] = useState(null);
  const searchInputRef = useRef(null);

  // Sub-modal para seleccionar método de pago de un jugador
  const [jugadorParaCobro, setJugadorParaCobro] = useState(null);
  const [metodoPagoModal, setMetodoPagoModal] = useState('efectivo');
  const [montosMixtos, setMontosMixtos] = useState({
    efectivo: '',
    transferencia: '',
    tarjeta: '',
  });

  // Inicializar o ajustar jugadores cuando cambia la división
  useEffect(() => {
    if (!turno) return;
    setJugadores((prev) => {
      const nuevoArray = [];
      for (let i = 1; i <= division; i++) {
        const existente = prev.find((j) => j.id === i);
        if (existente) {
          nuevoArray.push(existente);
        } else {
          nuevoArray.push({
            id: i,
            nombre: i === 1 && turno.cliente_nombre ? `${turno.cliente_nombre} ${turno.cliente_apellido || ''}`.trim() : `Jugador ${i}`,
            itemsKiosco: [],
            pagado: false,
            metodoPago: 'efectivo',
          });
        }
      }
      return nuevoArray;
    });
  }, [division, turno]);

  // Sincronizar el modal cada vez que se abre con un turno
  useEffect(() => {
    if (!isOpen || !turno) return;
    // Fuente de la Verdad: si el turno ya tiene un precio asignado en Supabase, respetarlo
    const precioResuelto = resolverPrecioCancha(turno, precioBaseCancha);
    setTotalBaseCancha(precioResuelto);
    setEditandoBase(false);

    // Restaurar gastos compartidos si el turno ya los tenía guardados en Supabase
    setGastosCompartidos(Array.isArray(turno.gastos_compartidos) ? turno.gastos_compartidos : []);
    setModalGastoCompartido(false);
    setConceptoGasto('');
    setMontoGasto('');
    setJugadorKioscoActivo(null);
    setBusquedaKiosco('');
    setAvisoStock(null);

    // Restaurar jugadores si ya existen en detalle_cobro
    if (Array.isArray(turno.detalle_cobro) && turno.detalle_cobro.length > 0) {
      setDivision(turno.detalle_cobro.length);
      setJugadores(
        turno.detalle_cobro.map((j) => ({
          id: j.id,
          nombre: j.nombre || `Jugador ${j.id}`,
          itemsKiosco: Array.isArray(j.items) ? j.items : [],
          pagado: Boolean(j.pagado),
          metodoPago: j.metodo_pago || 'efectivo',
        }))
      );
    } else {
      setDivision(4);
    }

    setJugadorParaCobro(null);
    setMetodoPagoModal('efectivo');
    setMontosMixtos({ efectivo: '', transferencia: '', tarjeta: '' });
  }, [isOpen, turno?.id, turno?.total_base_cancha, turno?.precio, precioBaseCancha]);

  // Manejo de atajo Escape para cerrar sub-modales
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (jugadorParaCobro) {
          setJugadorParaCobro(null);
        } else if (jugadorKioscoActivo !== null) {
          setJugadorKioscoActivo(null);
        } else if (modalGastoCompartido) {
          setModalGastoCompartido(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, jugadorParaCobro, jugadorKioscoActivo, modalGastoCompartido]);

  // Enfocar buscador al abrir el sub-modal de kiosco
  useEffect(() => {
    if (jugadorKioscoActivo !== null) {
      setBusquedaKiosco('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [jugadorKioscoActivo]);

  // Cálculo de totales compartidos
  const totalGastosExtra = gastosCompartidos.reduce((sum, g) => sum + g.monto, 0);
  const totalCanchaYGastos = (Number(totalBaseCancha) || 0) + totalGastosExtra;
  const cuotaCanchaPorJugador = Math.round(totalCanchaYGastos / division);

  // Total de kiosco general
  const totalKioscoGeneral = jugadores.reduce(
    (sum, jug) => sum + jug.itemsKiosco.reduce((s, it) => s + it.precio * (it.cantidad || 1), 0),
    0
  );
  const granTotalGeneral = totalCanchaYGastos + totalKioscoGeneral;

  // Estado de jugadores cobrados
  const jugadoresCobradosCount = jugadores.filter((j) => j.pagado).length;
  const todosCobrados = jugadores.length > 0 && jugadores.every((j) => j.pagado);

  // Agregar gasto compartido
  const handleAgregarGastoCompartido = (e) => {
    e.preventDefault();
    if (!conceptoGasto.trim() || !montoGasto) return;
    setGastosCompartidos((prev) => [
      ...prev,
      {
        id: Date.now(),
        concepto: conceptoGasto.trim(),
        monto: Number(montoGasto) || 0,
      },
    ]);
    setConceptoGasto('');
    setMontoGasto('');
    setModalGastoCompartido(false);
  };

  const eliminarGastoCompartido = (id) => {
    setGastosCompartidos((prev) => prev.filter((g) => g.id !== id));
  };

  // Agregar ítem de Kiosco a un jugador.
  // OJO: acá NO se toca el stock. Se descuenta recién en `confirmarVenta`, para
  // que cerrar el modal sin cobrar no haga desaparecer producto del inventario.
  const agregarItemAJugador = (articulo) => {
    if (jugadorKioscoActivo === null) return;

    const stockDisponible = Number(articulos.find((a) => a.id === articulo.id)?.stock) || 0;
    const yaEnCarrito = jugadores
      .find((j) => j.id === jugadorKioscoActivo)
      ?.itemsKiosco.find((it) => it.id === articulo.id)?.cantidad || 0;

    if (stockDisponible <= yaEnCarrito) {
      setAvisoStock(
        stockDisponible === 0
          ? `No queda stock de "${articulo.nombre}".`
          : `Sólo quedan ${stockDisponible} un. de "${articulo.nombre}".`
      );
      return;
    }

    setAvisoStock(null);

    setJugadores((prev) =>
      prev.map((jug) => {
        if (jug.id !== jugadorKioscoActivo) return jug;

        const existente = jug.itemsKiosco.find((it) => it.id === articulo.id);
        const itemsActualizados = existente
          ? jug.itemsKiosco.map((it) =>
              it.id === articulo.id ? { ...it, cantidad: it.cantidad + 1 } : it
            )
          : [
              ...jug.itemsKiosco,
              { id: articulo.id, nombre: articulo.nombre, precio: articulo.precio, cantidad: 1 },
            ];
        return { ...jug, itemsKiosco: itemsActualizados };
      })
    );

    // Cerrar buscador rápido al seleccionar
    setJugadorKioscoActivo(null);
  };

  // Quitar ítem de Kiosco de un jugador (tampoco toca el stock: nunca se cobró)
  const quitarItemDeJugador = (jugadorId, itemId) => {
    setJugadores((prev) =>
      prev.map((jug) => {
        if (jug.id !== jugadorId) return jug;
        return {
          ...jug,
          itemsKiosco: jug.itemsKiosco.filter((it) => it.id !== itemId),
        };
      })
    );
  };

  // Descuenta el stock de todo lo que se cobró. Se llama UNA vez, cuando el
  // cobro se confirma, no al agregar al carrito.
  const descontarStockCobrado = async (listaJugadores) => {
    for (const jug of listaJugadores) {
      for (const item of jug.itemsKiosco) {
        try {
          await ajustarStock(item.id, -item.cantidad);
        } catch (err) {
          console.error(`[ModalCobro] No se pudo descontar "${item.nombre}":`, err);
        }
      }
    }
  };

  // Payload que se guarda en el turno al confirmar el cobro
  const construirDetalleCobro = (listaJugadores) => ({
    precio: granTotalGeneral,
    total_base_cancha: totalBaseCancha,
    gastos_compartidos: gastosCompartidos,
    detalle_cobro: listaJugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      pagado: j.pagado,
      metodo_pago: j.metodoPago,
      items: j.itemsKiosco.map((it) => ({
        nombre: it.nombre,
        precio: it.precio,
        cantidad: it.cantidad,
      })),
      subtotal_kiosco: j.itemsKiosco.reduce((s, it) => s + it.precio * (it.cantidad || 1), 0),
    })),
    cobrado_el: new Date().toISOString(),
  });

  // Cobro individual de un jugador con método de pago seleccionado
  const confirmarCobroJugador = (jugadorId, metodo) => {
    const metodoAGuardar =
      metodo === 'mixto' ? formatearMetodoPagoMixto(montosMixtos) : metodo;

    setJugadores((prev) => {
      const actualizados = prev.map((jug) =>
        jug.id === jugadorId ? { ...jug, pagado: true, metodoPago: metodoAGuardar } : jug
      );

      // Si todos quedaron cobrados, liquidamos el turno automáticamente
      if (actualizados.every((j) => j.pagado)) {
        setTimeout(async () => {
          await descontarStockCobrado(actualizados);
          onConfirmarCobro(turno.id, construirDetalleCobro(actualizados));
          onClose();
        }, 400);
      }

      return actualizados;
    });

    setJugadorParaCobro(null);
  };

  // Cobrar Todo Junto (botón maestro)
  const cobrarTodoJunto = async () => {
    const todosPagados = jugadores.map((jug) => ({ ...jug, pagado: true }));
    setJugadores(todosPagados);
    await descontarStockCobrado(todosPagados);
    onConfirmarCobro(turno.id, construirDetalleCobro(todosPagados));
    onClose();
  };

  // Filtrado en vivo de artículos para el sub-modal de Kiosco
  const articulosFiltrados = useMemo(() => {
    const q = busquedaKiosco.toLowerCase().trim();
    if (!q) return articulos.slice(0, 10);
    return articulos.filter(
      (a) =>
        a.nombre.toLowerCase().includes(q) ||
        (a.codigoBarras && a.codigoBarras.includes(q))
    );
  }, [articulos, busquedaKiosco]);

  const formatearPrecio = (valor) => {
    if (valor === null || valor === undefined) return '—';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(valor) || 0);
  };

  // Todos los hooks ya se ejecutaron: ahora sí se puede cortar el render
  if (!isOpen || !turno) return null;

  const modalInputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-2.5 text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4 overflow-hidden"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-4xl h-[92dvh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        
        {/* Handle de arrastre (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 shrink-0">
          <div className="w-11 h-1.5 bg-slate-200 rounded-full" />
        </div>

        {/* ─── ENCABEZADO ─── */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <h2 className="text-base sm:text-xl font-black text-slate-900 tracking-tight leading-none truncate">
                Cobro Inteligente
              </h2>
              <span className="hidden sm:inline text-sm font-bold text-slate-400"> (Split Payment)</span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-1 truncate">
              {turno.cancha_nombre || turno.cancha} • {turno.fecha} •{' '}
              {turno.hora_inicio?.substring(0, 5)} hs
              {turno.cliente_nombre && ` • Titular: ${turno.cliente_nombre} ${turno.cliente_apellido || ''}`}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setModalGastoCompartido(true)}
              className="px-3 py-2.5 sm:py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-punto-brand shrink-0" />
              <span className="hidden sm:inline">+ Gasto Compartido</span>
              <span className="sm:hidden">+ Gasto</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-lg cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── BANNER DE TOTALES Y SELECTOR DE DIVISIÓN ─── */}
        <div className="px-4 sm:px-6 py-3 sm:py-3.5 bg-zinc-900 text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Total Base Cancha
                </span>
                {totalBaseCancha === null ? (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-6 w-24 bg-zinc-800 animate-pulse rounded" />
                    <span className="text-xs text-zinc-500 font-medium">Cargando...</span>
                  </div>
                ) : editandoBase ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-white font-black text-lg">$</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="500"
                      autoFocus
                      value={totalBaseCancha}
                      onChange={(e) => setTotalBaseCancha(e.target.value)}
                      onBlur={() => {
                        const n = Number(totalBaseCancha);
                        const fallback = resolverPrecioCancha(turno, precioBaseCancha);
                        setTotalBaseCancha(
                          Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
                        );
                        setEditandoBase(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          setTotalBaseCancha(resolverPrecioCancha(turno, precioBaseCancha));
                          setEditandoBase(false);
                        }
                      }}
                      className="w-28 sm:w-32 bg-zinc-800 border border-zinc-600 rounded-lg px-2.5 py-1 text-lg sm:text-xl font-black text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-punto-brand [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditandoBase(true)}
                    title="Editar el monto de la cancha para este turno"
                    className="flex items-baseline gap-2 flex-wrap text-left active:scale-[0.98] transition-transform"
                  >
                    <span className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
                      {formatearPrecio(totalBaseCancha)}
                    </span>
                    {totalGastosExtra > 0 && (
                      <span className="text-xs text-emerald-400 font-bold">
                        (+{formatearPrecio(totalGastosExtra)} extra)
                      </span>
                    )}
                    <Pencil className="w-3 h-3 text-zinc-500 shrink-0" />
                  </button>
                )}
              </div>

              <div className="hidden sm:block h-8 w-px bg-zinc-800" />

              <div className="hidden sm:block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                  Por Jugador (Cancha)
                </span>
                {totalBaseCancha === null ? (
                  <div className="h-6 w-16 bg-zinc-800 animate-pulse rounded mt-1" />
                ) : (
                  <span className="text-lg font-black text-amber-400 tabular-nums">
                    {formatearPrecio(cuotaCanchaPorJugador)}
                  </span>
                )}
              </div>
            </div>

            {/* Selector de División estilo "pill" rápido */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold text-zinc-400 flex items-center gap-1 shrink-0">
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Dividir en:</span>
              </span>
              <div className="flex bg-zinc-800 p-1 rounded-xl border border-zinc-700 flex-1 sm:flex-none">
                {[1, 2, 4, 6].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDivision(num)}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      division === num
                        ? 'bg-punto-brand text-white shadow-sm'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {num === 1 ? '1 Solo' : `[ ${num} ]`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── GASTOS COMPARTIDOS LISTA (Si existen) ─── */}
        {gastosCompartidos.length > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-amber-50/70 border-b border-amber-200/60 flex items-center gap-3 overflow-x-auto no-scrollbar text-xs shrink-0">
            <span className="font-bold text-amber-900 shrink-0">Gastos compartidos:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {gastosCompartidos.map((gasto) => (
                <span
                  key={gasto.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-amber-800 font-semibold shadow-2xs"
                >
                  <span>{gasto.concepto}:</span>
                  <span className="font-bold">{formatearPrecio(gasto.monto)}</span>
                  <button
                    type="button"
                    onClick={() => eliminarGastoCompartido(gasto.id)}
                    className="text-amber-500 hover:text-red-600 ml-0.5 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── TARJETAS DE JUGADORES (Scrollable) ─── */}
        <div className="p-3 sm:p-6 overflow-y-auto overscroll-contain-smooth flex-1 min-h-0 bg-slate-50/60">
          <div className={`grid gap-3 sm:gap-4 ${division === 1 ? 'grid-cols-1' : division === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
            {jugadores.map((jugador) => {
              const subtotalKiosco = jugador.itemsKiosco.reduce(
                (sum, it) => sum + it.precio * (it.cantidad || 1),
                0
              );
              const totalJugador = cuotaCanchaPorJugador + subtotalKiosco;

              return (
                <div
                  key={jugador.id}
                  className={`bg-white rounded-2xl border transition-all flex flex-col justify-between overflow-hidden relative shadow-xs ${
                    jugador.pagado
                      ? 'border-emerald-300 bg-emerald-50/30 ring-1 ring-emerald-400/40'
                      : 'border-zinc-200 hover:border-blue-400 hover:shadow-md'
                  }`}
                >
                  {/* Encabezado de la Tarjeta */}
                  <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${jugador.pagado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {jugador.id}
                      </div>
                      <span className="font-bold text-slate-900 text-sm truncate">
                        {jugador.nombre}
                      </span>
                    </div>

                    {jugador.pagado && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        Pagado
                      </span>
                    )}
                  </div>

                  {/* Cuerpo de la Tarjeta */}
                  <div className="p-4 space-y-3 flex-1">
                    {/* Cuota cancha */}
                    <div className="flex justify-between items-center text-xs text-slate-600 pb-2 border-b border-dashed border-zinc-200">
                      <span>Cuota Cancha:</span>
                      <span className="font-bold text-slate-900">{formatearPrecio(cuotaCanchaPorJugador)}</span>
                    </div>

                    {/* Consumos de Kiosco */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Kiosco / Extras:
                        </span>
                        {!jugador.pagado && (
                          <button
                            type="button"
                            onClick={() => setJugadorKioscoActivo(jugador.id)}
                            className="text-[11px] font-bold text-punto-brand hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            + Kiosco
                          </button>
                        )}
                      </div>

                      {jugador.itemsKiosco.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">Sin consumos extra</p>
                      ) : (
                        <div className="space-y-1 max-h-28 overflow-y-auto pr-0.5">
                          {jugador.itemsKiosco.map((it) => (
                            <div
                              key={it.id}
                              className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded-lg border border-slate-100 group"
                            >
                              <div className="truncate mr-1">
                                <span className="font-semibold text-slate-800">{it.nombre}</span>
                                {it.cantidad > 1 && (
                                  <span className="text-[10px] text-slate-500 ml-1">x{it.cantidad}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-bold text-slate-900 text-[11px]">
                                  {formatearPrecio(it.precio * it.cantidad)}
                                </span>
                                {!jugador.pagado && (
                                  <button
                                    type="button"
                                    onClick={() => quitarItemDeJugador(jugador.id, it.id)}
                                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pie de la Tarjeta (Total + Botón Cobrar) */}
                  <div className="p-4 bg-slate-50/80 border-t border-zinc-100 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-semibold text-slate-500">Subtotal:</span>
                      <span className="text-lg font-black text-slate-900">
                        {formatearPrecio(totalJugador)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={jugador.pagado}
                      onClick={() => {
                        if (!jugador.pagado) {
                          const metodoPrevio = jugador.metodoPago || 'efectivo';
                          if (metodoPrevio.startsWith('Mixto')) {
                            setMetodoPagoModal('mixto');
                          } else {
                            setMetodoPagoModal(metodoPrevio);
                          }
                          setMontosMixtos({ efectivo: '', transferencia: '', tarjeta: '' });
                          setJugadorParaCobro(jugador);
                        }
                      }}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        jugador.pagado
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60 cursor-not-allowed pointer-events-none select-none shadow-none'
                          : 'bg-punto-brand hover:bg-punto-hover text-white shadow-xs active:scale-95 cursor-pointer'
                      }`}
                    >
                      {jugador.pagado ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Cobrado ✓</span>
                          {jugador.metodoPago && (
                            <span
                              title={jugador.metodoPago}
                              className="text-[10px] font-semibold text-emerald-700 ml-0.5 uppercase tracking-wide truncate max-w-[120px]"
                            >
                              ({jugador.metodoPago.startsWith('Mixto')
                                ? 'Mixto'
                                : jugador.metodoPago === 'transferencia'
                                ? 'Transf'
                                : jugador.metodoPago})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-3.5 h-3.5 shrink-0" />
                          <span>Cobrar Jugador</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── PIE DEL MODAL (FINALIZACIÓN DE PAGO) ─── */}
        <div className="bg-white px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 shrink-0 shadow-lg pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-6 min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Total Completo (Cancha + Kiosco)
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight tabular-nums block">
                {formatearPrecio(granTotalGeneral)}
              </span>
            </div>

            <div className="sm:hidden flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-slate-700 shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {jugadoresCobradosCount}/{jugadores.length}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700">
            <Users className="w-4 h-4 text-slate-400" />
            <span>
              {jugadoresCobradosCount} de {jugadores.length} cobrados
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 sm:px-5 py-3.5 sm:py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              onClick={cobrarTodoJunto}
              disabled={todosCobrados}
              className={`flex-[2] sm:flex-none px-4 sm:px-6 py-3.5 sm:py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 shadow-md transition-all ${
                todosCobrados
                  ? 'bg-emerald-600 cursor-default opacity-90'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] cursor-pointer'
              }`}
            >
              {todosCobrados ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    <span className="hidden sm:inline">Turno Completamente Cobrado</span>
                    <span className="sm:hidden">Todo Cobrado</span>
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    <span className="hidden sm:inline">Cobrar Todo Junto</span>
                    <span className="sm:hidden">Cobrar Todo</span>
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ─── SUB-MODAL: BUSCADOR RÁPIDO DE KIOSCO ─── */}
        {jugadorKioscoActivo !== null && (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-slate-900/40 backdrop-blur-xs sm:p-4"
            onClick={(e) => e.target === e.currentTarget && setJugadorKioscoActivo(null)}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden max-h-[88dvh] flex flex-col animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 border border-slate-200">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Tag className="w-4 h-4 text-punto-brand shrink-0" />
                  <span className="font-black text-sm text-slate-900 truncate">
                    Producto para Jugador {jugadorKioscoActivo}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setJugadorKioscoActivo(null)}
                  aria-label="Cerrar"
                  className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>

              {/* Input Buscador */}
              <div className="p-4 border-b border-slate-100 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    autoFocus
                    type="search"
                    inputMode="search"
                    value={busquedaKiosco}
                    onChange={(e) => setBusquedaKiosco(e.target.value)}
                    placeholder="Buscar artículo o escanear código..."
                    className="w-full pl-10 pr-4 py-3 sm:py-2.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
                {avisoStock && (
                  <p className="mt-2.5 flex items-start gap-2 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {avisoStock}
                  </p>
                )}
              </div>

              {/* Lista filtrada de artículos */}
              <div className="p-2 min-h-0 flex-1 overflow-y-auto overscroll-contain-smooth divide-y divide-slate-100">
                {articulosFiltrados.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No se encontraron productos en stock.
                  </div>
                ) : (
                  articulosFiltrados.map((art) => (
                    <div key={art.id} className="p-2 divide-y divide-slate-100">
                      <div
                        onClick={() => agregarItemAJugador(art)}
                        className="p-3 rounded-xl hover:bg-blue-50/80 active:bg-blue-100 cursor-pointer flex items-center justify-between gap-3 transition-colors group"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 truncate">
                            {art.nombre}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                            <span>Stock: {art.stock} un.</span>
                            {art.codigoBarras && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px]">
                                {art.codigoBarras}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-black text-slate-900 group-hover:text-blue-700">
                            {formatearPrecio(art.precio)}
                          </span>
                          <span className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg bg-slate-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white flex items-center justify-center transition-colors">
                            <Plus className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── MODAL: AGREGAR GASTO COMPARTIDO ─── */}
        {modalGastoCompartido && (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-slate-900/40 backdrop-blur-xs sm:p-4"
            onClick={(e) => e.target === e.currentTarget && setModalGastoCompartido(false)}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 border border-slate-200">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-black text-base text-slate-900">Agregar Gasto Compartido</h3>
                <button
                  type="button"
                  onClick={() => setModalGastoCompartido(false)}
                  aria-label="Cerrar"
                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 text-lg cursor-pointer shrink-0"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAgregarGastoCompartido} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Concepto
                  </label>
                  <input
                    autoFocus
                    type="text"
                    required
                    value={conceptoGasto}
                    onChange={(e) => setConceptoGasto(e.target.value)}
                    placeholder="Ej: Luz nocturna, alquiler paletas"
                    className={modalInputCls}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Monto ($ARS)
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="50"
                    required
                    value={montoGasto}
                    onChange={(e) => setMontoGasto(e.target.value)}
                    placeholder="Ej: 2000"
                    className={modalInputCls}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalGastoCompartido(false)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-punto-brand text-white text-xs font-bold hover:bg-punto-hover active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    Sumar Gasto
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── SUB-MODAL: MÉTODO DE PAGO PARA COBRAR JUGADOR ─── */}
        {jugadorParaCobro && (() => {
          const subtotalKiosco = jugadorParaCobro.itemsKiosco.reduce(
            (sum, it) => sum + it.precio * (it.cantidad || 1),
            0
          );
          const totalJugador = cuotaCanchaPorJugador + subtotalKiosco;
          const { suma, restante, esExacto, esExcedido } = calcularTotalesMixtos(
            totalJugador,
            montosMixtos
          );

          const puedeConfirmar =
            metodoPagoModal === 'mixto' ? esExacto : totalJugador >= 0;

          return (
            <div
              className="fixed inset-0 z-[65] flex items-end sm:items-center sm:justify-center bg-slate-900/50 backdrop-blur-xs sm:p-4"
              onClick={(e) => e.target === e.currentTarget && setJugadorParaCobro(null)}
            >
              <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 border border-slate-200 max-h-[92dvh] flex flex-col">
                {/* Header */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-punto-brand/10 text-punto-brand flex items-center justify-center font-bold shrink-0">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-sm text-slate-900 truncate">
                        Cobrar a {jugadorParaCobro.nombre}
                      </h3>
                      <span className="text-[10px] font-semibold text-slate-400 block truncate">
                        Seleccioná pago total o combiná métodos (Pago Mixto)
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setJugadorParaCobro(null)}
                    aria-label="Cerrar"
                    className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Body con Scroll */}
                <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain-smooth flex-1">
                  {/* Total a Pagar destacado en la parte superior */}
                  <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 text-center">
                    <span className="text-[10px] sm:text-[11px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                      Total a Pagar
                    </span>
                    <span className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight tabular-nums block">
                      {formatearPrecio(totalJugador)}
                    </span>
                    {subtotalKiosco > 0 && (
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        Cancha {formatearPrecio(cuotaCanchaPorJugador)} + Extras {formatearPrecio(subtotalKiosco)}
                      </p>
                    )}
                  </div>

                  {/* Selector: Botones rápidos + Botón Pago Mixto */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Método de Pago
                    </label>
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                      {METODOS_PAGO.map((metodo) => {
                        const Icono = metodo.icon;
                        const seleccionado = metodoPagoModal === metodo.id;
                        return (
                          <button
                            key={metodo.id}
                            type="button"
                            onClick={() => setMetodoPagoModal(metodo.id)}
                            className={`py-3 px-1 sm:px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                              seleccionado
                                ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Icono className={`w-4 h-4 shrink-0 ${seleccionado ? 'text-white' : 'text-slate-500'}`} />
                            <span className="truncate text-[11px]">{metodo.label}</span>
                          </button>
                        );
                      })}

                      {/* Opción Pago Mixto */}
                      <button
                        type="button"
                        onClick={() => {
                          setMetodoPagoModal('mixto');
                        }}
                        className={`py-3 px-1 sm:px-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          metodoPagoModal === 'mixto'
                            ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-600/30'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-purple-50/60'
                        }`}
                      >
                        <Coins className={`w-4 h-4 shrink-0 ${metodoPagoModal === 'mixto' ? 'text-amber-300' : 'text-purple-600'}`} />
                        <span className="truncate text-[11px]">Pago Mixto</span>
                      </button>
                    </div>
                  </div>

                  {/* Interfaz de montos al entrar en Pago Mixto */}
                  {metodoPagoModal === 'mixto' && (
                    <div className="space-y-3 pt-1 border-t border-dashed border-slate-200 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Montos por método
                        </span>
                        <span className="text-xs font-bold text-slate-500 tabular-nums">
                          Suma: {formatearPrecio(suma)}
                        </span>
                      </div>

                      {/* Inputs numéricos */}
                      <div className="space-y-2">
                        {/* Efectivo */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                          <label className="text-xs font-bold text-slate-700 w-24 shrink-0">
                            Efectivo
                          </label>
                          <div className="flex-1 flex items-center justify-end gap-1">
                            <span className="text-slate-400 text-sm font-semibold">$</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              placeholder="0"
                              value={montosMixtos.efectivo}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) =>
                                setMontosMixtos((prev) => ({ ...prev, efectivo: e.target.value }))
                              }
                              className="w-full text-right bg-transparent text-sm sm:text-base font-bold text-slate-900 focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                            />
                          </div>
                          {restante > 0 && Number(montosMixtos.efectivo || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const faltante = totalJugador - (Number(montosMixtos.transferencia) || 0) - (Number(montosMixtos.tarjeta) || 0);
                                if (faltante > 0) setMontosMixtos((prev) => ({ ...prev, efectivo: String(faltante) }));
                              }}
                              className="text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Cubrir restante con Efectivo"
                            >
                              Resto
                            </button>
                          )}
                        </div>

                        {/* Transferencia / MP */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                          <label className="text-xs font-bold text-slate-700 w-24 shrink-0">
                            Transf / MP
                          </label>
                          <div className="flex-1 flex items-center justify-end gap-1">
                            <span className="text-slate-400 text-sm font-semibold">$</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              placeholder="0"
                              value={montosMixtos.transferencia}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) =>
                                setMontosMixtos((prev) => ({ ...prev, transferencia: e.target.value }))
                              }
                              className="w-full text-right bg-transparent text-sm sm:text-base font-bold text-slate-900 focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                            />
                          </div>
                          {restante > 0 && Number(montosMixtos.transferencia || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const faltante = totalJugador - (Number(montosMixtos.efectivo) || 0) - (Number(montosMixtos.tarjeta) || 0);
                                if (faltante > 0) setMontosMixtos((prev) => ({ ...prev, transferencia: String(faltante) }));
                              }}
                              className="text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Cubrir restante con Transferencia"
                            >
                              Resto
                            </button>
                          )}
                        </div>

                        {/* Tarjeta */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          <CreditCard className="w-4 h-4 text-violet-600 shrink-0" />
                          <label className="text-xs font-bold text-slate-700 w-24 shrink-0">
                            Tarjeta
                          </label>
                          <div className="flex-1 flex items-center justify-end gap-1">
                            <span className="text-slate-400 text-sm font-semibold">$</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              placeholder="0"
                              value={montosMixtos.tarjeta}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) =>
                                setMontosMixtos((prev) => ({ ...prev, tarjeta: e.target.value }))
                              }
                              className="w-full text-right bg-transparent text-sm sm:text-base font-bold text-slate-900 focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                            />
                          </div>
                          {restante > 0 && Number(montosMixtos.tarjeta || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const faltante = totalJugador - (Number(montosMixtos.efectivo) || 0) - (Number(montosMixtos.transferencia) || 0);
                                if (faltante > 0) setMontosMixtos((prev) => ({ ...prev, tarjeta: String(faltante) }));
                              }}
                              className="text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Cubrir restante con Tarjeta"
                            >
                              Resto
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ─── Validación matemática en tiempo real ─── */}
                      <div
                        className={`rounded-xl p-3 border text-xs font-bold flex items-center justify-between transition-colors ${
                          esExacto
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : esExcedido
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-red-50 border-red-300 text-red-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {esExacto ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                          )}
                          <span>
                            {esExacto
                              ? '¡Monto exacto cubierto! (Restante: $0)'
                              : esExcedido
                              ? `Monto excedido por: ${formatearPrecio(Math.abs(restante))}`
                              : `Restante a cubrir: ${formatearPrecio(restante)}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer con Botón Confirmar */}
                <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={!puedeConfirmar}
                    onClick={() => confirmarCobroJugador(jugadorParaCobro.id, metodoPagoModal)}
                    className={`w-full py-3.5 rounded-xl text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 transition-all ${
                      !puedeConfirmar
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60 shadow-none pointer-events-none'
                        : metodoPagoModal === 'mixto'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] cursor-pointer'
                        : 'bg-punto-brand hover:bg-punto-hover text-white active:scale-[0.98] cursor-pointer'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {metodoPagoModal === 'mixto'
                        ? esExacto
                          ? 'Confirmar Pago Mixto'
                          : `Restante a cubrir: ${formatearPrecio(Math.max(0, restante))}`
                        : 'Confirmar Cobro'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setJugadorParaCobro(null)}
                    className="w-full py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors text-center cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}

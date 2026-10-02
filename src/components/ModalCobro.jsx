import { useState, useEffect, useMemo, useRef } from 'react';
import { useArticulos } from '../context/ArticulosContext';
import { useTurnos } from '../context/TurnosContext';
import { supabase } from '../lib/supabaseClient';
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
  Store,
  Receipt,
  Minus,
  ShoppingBag,
} from 'lucide-react';
import { formatearMetodoPagoMixto, calcularTotalesMixtos, resolverPrecioCancha } from '../utils/paymentHelpers';

const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transf / MP', icon: Smartphone },
  { id: 'debito', label: 'Débito', icon: CreditCard },
  { id: 'credito', label: 'Crédito', icon: CreditCard },
];

export default function ModalCobro({ isOpen, onClose, turno, onConfirmarCobro }) {
  const { articulos, ajustarStock } = useArticulos();
  const { precioBaseCancha, actualizarTurno } = useTurnos();

  // Monto base de la cancha: viene del turno consolidado en Supabase o de la Configuración general
  const [totalBaseCancha, setTotalBaseCancha] = useState(() =>
    resolverPrecioCancha(turno, precioBaseCancha)
  );
  const [editandoBase, setEditandoBase] = useState(false);
  const [guardandoPrecioBase, setGuardandoPrecioBase] = useState(false);
  const [gastosCompartidos, setGastosCompartidos] = useState([]);
  
  // Modal de Agregar Gasto Compartido (Directo de Cantina)
  const [modalGastoCompartido, setModalGastoCompartido] = useState(false);
  const [busquedaGastoCompartido, setBusquedaGastoCompartido] = useState('');
  const inputBusquedaGastoRef = useRef(null);

  // Selector de División
  const [division, setDivision] = useState(4); // 4 jugadores por defecto en pádel

  // Estado de cada jugador
  const [jugadores, setJugadores] = useState([]);
  // Caché de jugadores para preservar datos (nombre, itemsKiosco, pagado, etc.) al cambiar la división
  const jugadoresPoolRef = useRef(new Map());
  // Edición rápida de nombre de jugador
  const [editandoNombreId, setEditandoNombreId] = useState(null);
  const [nombreEnEdicion, setNombreEnEdicion] = useState('');

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
    debito: '',
    credito: '',
    tarjeta: '',
  });

  // Mantener actualizado el pool de jugadores con cada cambio en los jugadores actuales
  useEffect(() => {
    jugadores.forEach((j) => {
      jugadoresPoolRef.current.set(j.id, j);
    });
  }, [jugadores]);

  // Inicializar o ajustar jugadores cuando cambia la división dinámicamente
  useEffect(() => {
    if (!turno) return;
    if (division === '' || isNaN(parseInt(division, 10))) return;
    const cant = Math.max(1, parseInt(division, 10));

    const nombreTitular = turno.cliente_nombre
      ? `${turno.cliente_nombre} ${turno.cliente_apellido || ''}`.trim()
      : 'Jugador 1';

    setJugadores((prev) => {
      // Si la cantidad coincide y ya tenemos los mismos jugadores, no regenerar innecesariamente
      if (prev.length === cant && prev.every((j, idx) => j.id === idx + 1)) return prev;

      const nuevoArray = [];
      for (let i = 1; i <= cant; i++) {
        const existente = prev.find((j) => j.id === i) || jugadoresPoolRef.current.get(i);
        if (existente) {
          nuevoArray.push(existente);
          jugadoresPoolRef.current.set(i, existente);
        } else {
          const nuevoJugador = {
            id: i,
            nombre: i === 1 ? nombreTitular : `Jugador ${i}`,
            itemsKiosco: [],
            pagado: false,
            metodoPago: 'efectivo',
          };
          nuevoArray.push(nuevoJugador);
          jugadoresPoolRef.current.set(i, nuevoJugador);
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
    setBusquedaGastoCompartido('');
    setJugadorKioscoActivo(null);
    setBusquedaKiosco('');
    setAvisoStock(null);
    setEditandoNombreId(null);
    setNombreEnEdicion('');

    // Resetear el pool de jugadores para este turno
    jugadoresPoolRef.current.clear();

    const nombreTitular = turno.cliente_nombre
      ? `${turno.cliente_nombre} ${turno.cliente_apellido || ''}`.trim()
      : 'Jugador 1';

    // Restaurar jugadores si ya existen en detalle_cobro
    if (Array.isArray(turno.detalle_cobro) && turno.detalle_cobro.length > 0) {
      const listaRestaurada = turno.detalle_cobro.map((j) => ({
        id: j.id,
        nombre: j.nombre || (j.id === 1 ? nombreTitular : `Jugador ${j.id}`),
        itemsKiosco: Array.isArray(j.items) ? j.items : [],
        pagado: Boolean(j.pagado),
        metodoPago: j.metodo_pago || 'efectivo',
      }));
      setDivision(listaRestaurada.length);
      setJugadores(listaRestaurada);
      listaRestaurada.forEach((j) => jugadoresPoolRef.current.set(j.id, j));
    } else {
      setDivision(4);
      const listaInicial = [
        { id: 1, nombre: nombreTitular, itemsKiosco: [], pagado: false, metodoPago: 'efectivo' },
        { id: 2, nombre: 'Jugador 2', itemsKiosco: [], pagado: false, metodoPago: 'efectivo' },
        { id: 3, nombre: 'Jugador 3', itemsKiosco: [], pagado: false, metodoPago: 'efectivo' },
        { id: 4, nombre: 'Jugador 4', itemsKiosco: [], pagado: false, metodoPago: 'efectivo' },
      ];
      setJugadores(listaInicial);
      listaInicial.forEach((j) => jugadoresPoolRef.current.set(j.id, j));
    }

    setJugadorParaCobro(null);
    setMetodoPagoModal('efectivo');
    setMontosMixtos({ efectivo: '', transferencia: '', debito: '', credito: '', tarjeta: '' });
  }, [isOpen, turno?.id, turno?.total_base_cancha, turno?.precio_total, turno?.precio, precioBaseCancha]);

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

  // Cantidad de división normalizada para cálculos
  const cantDivision = Math.max(1, parseInt(division, 10) || 1);

  // Cálculo de totales compartidos
  const totalGastosExtra = gastosCompartidos.reduce((sum, g) => sum + g.monto, 0);
  const totalCanchaYGastos = (Number(totalBaseCancha) || 0) + totalGastosExtra;
  const cuotaCanchaPorJugador = Math.round(totalCanchaYGastos / cantDivision);

  // Total de kiosco general
  const totalKioscoGeneral = jugadores.reduce(
    (sum, jug) => sum + jug.itemsKiosco.reduce((s, it) => s + it.precio * (it.cantidad || 1), 0),
    0
  );
  const granTotalGeneral = totalCanchaYGastos + totalKioscoGeneral;

  // Estado de jugadores cobrados
  const jugadoresCobradosCount = jugadores.filter((j) => j.pagado).length;
  const todosCobrados = jugadores.length > 0 && jugadores.every((j) => j.pagado);

  // Persistir actualización del precio total / base de la cancha en Supabase y contexto
  const guardarNuevoPrecioCancha = async (nuevoValor) => {
    const n = Number(nuevoValor);
    const fallback = resolverPrecioCancha(turno, precioBaseCancha);
    const valorFinal = Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;

    setTotalBaseCancha(valorFinal);
    setEditandoBase(false);

    if (!turno?.id || valorFinal === null) return;

    // Calcular el nuevo total general sumando extras y consumos
    const nuevoTotal = valorFinal + totalGastosExtra + totalKioscoGeneral;

    // Mutar en memoria para reactividad inmediata del turno
    turno.total_base_cancha = valorFinal;
    turno.precio = nuevoTotal;

    setGuardandoPrecioBase(true);
    try {
      // 1. Sincronizar contexto y Supabase a través de actualizarTurno
      if (typeof actualizarTurno === 'function') {
        const res = await actualizarTurno(turno.id, {
          total_base_cancha: valorFinal,
          precio: nuevoTotal,
        });
        if (res?.id) {
          turno.id = res.id;
        }
      } else {
        // Fallback directo a Supabase
        await supabase
          .from('turnos')
          .update({
            total_base_cancha: valorFinal,
            precio: nuevoTotal,
          })
          .eq('id', turno.id);
      }
    } catch (err) {
      console.error('[ModalCobro] Error al persistir el nuevo precio de la cancha en Supabase:', err);
    } finally {
      setGuardandoPrecioBase(false);
    }
  };

  // Abrir modal de gastos y resetear a valores iniciales
  // Abrir modal de gastos compartidos y auto-enfocar buscador
  const abrirModalGasto = () => {
    setBusquedaGastoCompartido('');
    setModalGastoCompartido(true);
    setTimeout(() => {
      inputBusquedaGastoRef.current?.focus();
    }, 50);
  };

  // Filtrado de artículos de cantina en el modal de gastos
  const articulosGastoFiltrados = useMemo(() => {
    const q = busquedaGastoCompartido.toLowerCase().trim();
    if (!q) return articulos;
    return articulos.filter(
      (a) =>
        a.nombre.toLowerCase().includes(q) ||
        (a.categoria && a.categoria.toLowerCase().includes(q)) ||
        (a.codigoBarras && String(a.codigoBarras).includes(q))
    );
  }, [articulos, busquedaGastoCompartido]);

  // Acción Directa: al hacer clic en un artículo se agrega de inmediato a los consumos/extras del turno
  // y se recalcula automáticamente la división por jugador según el Split Payment (1, 2, 4 o 6).
  const agregarGastoCompartidoDirecto = (articulo) => {
    if (!articulo) return;

    setGastosCompartidos((prev) => {
      const precio = Number(articulo.precio) || 0;
      const index = prev.findIndex((g) => g.articuloId === articulo.id);
      if (index >= 0) {
        return prev.map((g, idx) => {
          if (idx !== index) return g;
          const nuevaCant = (g.cantidad || 1) + 1;
          return {
            ...g,
            cantidad: nuevaCant,
            concepto: `${articulo.nombre} (x${nuevaCant})`,
            nombre: articulo.nombre,
            monto: precio * nuevaCant,
            precioUnitario: precio,
            articuloId: articulo.id,
            tipo: 'cantina',
            origen: 'cantina',
          };
        });
      }
      return [
        ...prev,
        {
          id: Date.now(),
          concepto: articulo.nombre,
          nombre: articulo.nombre,
          monto: precio,
          articuloId: articulo.id,
          cantidad: 1,
          precioUnitario: precio,
          tipo: 'cantina',
          origen: 'cantina',
        },
      ];
    });

    setBusquedaGastoCompartido('');
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
              {
                id: articulo.id,
                articuloId: articulo.id,
                nombre: articulo.nombre,
                precio: Number(articulo.precio) || 0,
                cantidad: 1,
                tipo: 'cantina',
                origen: 'cantina',
              },
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

  // Edición de nombres de jugadores para Split Payment
  const iniciarEdicionNombre = (jugador) => {
    if (jugador.pagado) return;
    setEditandoNombreId(jugador.id);
    setNombreEnEdicion(jugador.nombre);
  };

  const guardarNombreJugador = (jugadorId) => {
    const nombreTitular = turno?.cliente_nombre
      ? `${turno.cliente_nombre} ${turno.cliente_apellido || ''}`.trim()
      : 'Jugador 1';
    const fallbackNombre = jugadorId === 1 ? nombreTitular : `Jugador ${jugadorId}`;
    const nombreFinal = nombreEnEdicion.trim() || fallbackNombre;

    setJugadores((prev) =>
      prev.map((j) => {
        if (j.id !== jugadorId) return j;
        const actualizado = { ...j, nombre: nombreFinal };
        jugadoresPoolRef.current.set(jugadorId, actualizado);
        return actualizado;
      })
    );
    setEditandoNombreId(null);
    setNombreEnEdicion('');
  };

  // Descuenta el stock de todo lo que se cobró. Se llama UNA vez, cuando el
  // cobro se confirma, no al agregar al carrito.
  const descontarStockCobrado = async (listaJugadores, listaGastos = gastosCompartidos) => {
    for (const jug of listaJugadores) {
      for (const item of jug.itemsKiosco) {
        if (item.id && articulos.some((a) => a.id === item.id)) {
          try {
            await ajustarStock(item.id, -(item.cantidad || 1));
          } catch (err) {
            console.error(`[ModalCobro] No se pudo descontar "${item.nombre}":`, err);
          }
        }
      }
    }
    for (const gasto of listaGastos) {
      if (gasto.articuloId && articulos.some((a) => a.id === gasto.articuloId)) {
        try {
          await ajustarStock(gasto.articuloId, -(gasto.cantidad || 1));
        } catch (err) {
          console.error(`[ModalCobro] No se pudo descontar gasto compartido "${gasto.concepto}":`, err);
        }
      }
    }
  };

  // Payload que se guarda en el turno al confirmar el cobro
  const construirDetalleCobro = (listaJugadores) => ({
    precio: granTotalGeneral,
    total_base_cancha: totalBaseCancha,
    gastos_compartidos: gastosCompartidos.map((g) => ({
      id: g.id,
      concepto: g.concepto,
      nombre: g.nombre || g.concepto,
      monto: Number(g.monto) || 0,
      cantidad: Number(g.cantidad) || 1,
      precioUnitario: Number(g.precioUnitario) || Number(g.precio) || 0,
      articuloId: g.articuloId || null,
      tipo: g.tipo || (g.articuloId ? 'cantina' : 'extra'),
      origen: g.origen || 'cantina',
    })),
    detalle_cobro: listaJugadores.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      pagado: j.pagado,
      metodo_pago: j.metodoPago,
      items: j.itemsKiosco.map((it) => ({
        id: it.id,
        articuloId: it.articuloId || it.id,
        nombre: it.nombre,
        precio: Number(it.precio) || 0,
        cantidad: Number(it.cantidad) || 1,
        tipo: 'cantina',
        origen: 'cantina',
      })),
      subtotal_kiosco: j.itemsKiosco.reduce((s, it) => s + (Number(it.precio) || 0) * (it.cantidad || 1), 0),
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
          await descontarStockCobrado(actualizados, gastosCompartidos);
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
    await descontarStockCobrado(todosPagados, gastosCompartidos);
    onConfirmarCobro(turno.id, construirDetalleCobro(todosPagados));
    onClose();
  };

  /**
   * handleCerrar — intercepta todos los cierres del modal principal.
   * Si hay al menos un jugador que ya pagó pero el cobro no está completo,
   * persiste el detalle parcial en Supabase con estado 'pago_parcial'
   * para que la grilla pueda pintarlo de naranja.
   */
  const handleCerrar = async () => {
    const alguienPago = jugadores.some((j) => j.pagado);
    const todosPagados = jugadores.length > 0 && jugadores.every((j) => j.pagado);

    if (alguienPago && !todosPagados) {
      // Guardar el estado parcial sin cambiar el estado final del turno
      const detalleParcial = {
        ...construirDetalleCobro(jugadores),
        cobrado_el: undefined, // aún no está liquidado
      };
      try {
        await onConfirmarCobro(turno.id, detalleParcial, turno.estado);
      } catch (err) {
        console.error('[ModalCobro] No se pudo guardar el pago parcial:', err);
      }
    }
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
      onClick={(e) => e.target === e.currentTarget && handleCerrar()}
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
              onClick={() => abrirModalGasto()}
              className="px-3 py-2.5 sm:py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-punto-brand shrink-0" />
              <span className="hidden sm:inline">+ Gasto Compartido</span>
              <span className="sm:hidden">+ Gasto</span>
            </button>

            <button
              type="button"
              onClick={handleCerrar}
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
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block flex items-center gap-1.5">
                  Total Base Cancha
                  {guardandoPrecioBase && (
                    <span className="text-[9px] text-amber-400 font-normal lowercase animate-pulse">
                      (guardando...)
                    </span>
                  )}
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
                        guardarNuevoPrecioCancha(totalBaseCancha);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          guardarNuevoPrecioCancha(totalBaseCancha);
                        }
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
                    className="flex items-baseline gap-2 flex-wrap text-left active:scale-[0.98] transition-transform group"
                  >
                    <span className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
                      {formatearPrecio(totalBaseCancha)}
                    </span>
                    {totalGastosExtra > 0 && (
                      <span className="text-xs text-emerald-400 font-bold">
                        (+{formatearPrecio(totalGastosExtra)} extra)
                      </span>
                    )}
                    <Pencil className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0 transition-colors" />
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

            {/* Control manual interactivo de cantidad de jugadores */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 shrink-0">
                <Users className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Dividir en:</span>
                <span className="sm:hidden">Jugadores:</span>
              </span>

              <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-xl p-1 shadow-inner shrink-0">
                {/* Botón Decrementar (-) */}
                <button
                  type="button"
                  onClick={() => setDivision((prev) => Math.max(1, (parseInt(prev, 10) || 1) - 1))}
                  disabled={cantDivision <= 1}
                  aria-label="Disminuir jugadores"
                  title="Disminuir jugadores"
                  className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:hover:bg-zinc-700 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>

                {/* Input Numérico Directo */}
                <div className="flex items-center justify-center px-1">
                  <input
                    type="number"
                    min="1"
                    value={division}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setDivision('');
                      } else {
                        const n = parseInt(val, 10);
                        if (!isNaN(n)) setDivision(Math.max(1, n));
                      }
                    }}
                    onBlur={() => {
                      if (!division || parseInt(division, 10) < 1) {
                        setDivision(1);
                      }
                    }}
                    className="w-11 sm:w-12 text-center bg-transparent text-white font-black text-sm sm:text-base focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                    title="Ingresar cantidad de jugadores para dividir"
                  />
                </div>

                {/* Botón Incrementar (+) */}
                <button
                  type="button"
                  onClick={() => setDivision((prev) => Math.max(1, (parseInt(prev, 10) || 1) + 1))}
                  aria-label="Aumentar jugadores"
                  title="Aumentar jugadores"
                  className="w-8 h-8 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-xs font-semibold text-zinc-400 hidden sm:inline">
                {cantDivision === 1 ? 'jugador' : 'jugadores'}
              </span>
            </div>
          </div>
        </div>

        {/* ─── GASTOS COMPARTIDOS LISTA (Si existen) ─── */}
        {gastosCompartidos.length > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-amber-50/70 border-b border-amber-200/60 flex items-center gap-3 overflow-x-auto no-scrollbar text-xs shrink-0">
            <span className="font-bold text-amber-900 shrink-0 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              Gastos compartidos ({gastosCompartidos.length}):
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {gastosCompartidos.map((gasto) => (
                <span
                  key={gasto.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-amber-800 font-semibold shadow-2xs text-[11px]"
                >
                  {gasto.articuloId ? (
                    <Store className="w-3 h-3 text-amber-600 shrink-0" />
                  ) : (
                    <Receipt className="w-3 h-3 text-amber-600 shrink-0" />
                  )}
                  <span>{gasto.concepto}:</span>
                  <span className="font-bold text-slate-900">{formatearPrecio(gasto.monto)}</span>
                  <button
                    type="button"
                    onClick={() => eliminarGastoCompartido(gasto.id)}
                    title="Eliminar gasto compartido"
                    className="text-amber-500 hover:text-red-600 ml-0.5 cursor-pointer font-bold"
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
          <div className={`grid gap-3 sm:gap-4 ${
            cantDivision === 1
              ? 'grid-cols-1 max-w-md mx-auto'
              : cantDivision === 2
              ? 'grid-cols-1 sm:grid-cols-2'
              : cantDivision === 3
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}>
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
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${jugador.pagado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {jugador.id}
                      </div>

                      {editandoNombreId === jugador.id ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <input
                            type="text"
                            autoFocus
                            value={nombreEnEdicion}
                            onChange={(e) => setNombreEnEdicion(e.target.value)}
                            onBlur={() => guardarNombreJugador(jugador.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') guardarNombreJugador(jugador.id);
                              if (e.key === 'Escape') {
                                setEditandoNombreId(null);
                                setNombreEnEdicion('');
                              }
                            }}
                            className="w-full text-xs font-bold text-slate-900 bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-punto-brand focus:bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => iniciarEdicionNombre(jugador)}
                          title={jugador.pagado ? jugador.nombre : 'Hacé clic para editar el nombre'}
                          className={`group/name flex items-center gap-1.5 min-w-0 ${!jugador.pagado ? 'cursor-pointer' : ''}`}
                        >
                          <span className="font-bold text-slate-900 text-sm truncate group-hover/name:text-blue-600 transition-colors">
                            {jugador.nombre}
                          </span>
                          {!jugador.pagado && (
                            <Pencil className="w-3 h-3 text-slate-300 group-hover/name:text-blue-500 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                          )}
                        </div>
                      )}
                    </div>

                    {jugador.pagado && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        Pagado
                      </span>
                    )}
                  </div>

                  {/* Cuerpo de la Tarjeta */}
                  <div className="p-4 space-y-3 flex-1">
                    {/* Cuota cancha y gastos compartidos */}
                    {totalGastosExtra > 0 ? (
                      <div className="space-y-1 pb-2 border-b border-dashed border-zinc-200">
                        <div className="flex justify-between items-center text-xs text-slate-500">
                          <span>Cancha base:</span>
                          <span className="font-semibold text-slate-700">
                            {formatearPrecio(Math.round((Number(totalBaseCancha) || 0) / cantDivision))}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-amber-700 font-medium">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3 text-amber-600 shrink-0" />
                            Gastos comp. ({gastosCompartidos.length}):
                          </span>
                          <span className="font-bold text-amber-800">
                            +{formatearPrecio(Math.round(totalGastosExtra / cantDivision))}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-bold text-slate-900 pt-0.5">
                          <span>Cuota Turno (c/u):</span>
                          <span>{formatearPrecio(cuotaCanchaPorJugador)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center text-xs text-slate-600 pb-2 border-b border-dashed border-zinc-200">
                        <span>Cuota Cancha:</span>
                        <span className="font-bold text-slate-900">{formatearPrecio(cuotaCanchaPorJugador)}</span>
                      </div>
                    )}

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
              onClick={handleCerrar}
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

        {/* ─── MODAL: AGREGAR GASTO COMPARTIDO (DIRECTO CANTINA) ─── */}
        {modalGastoCompartido && (
          <div
            className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-slate-900/60 backdrop-blur-xs sm:p-4"
            onClick={(e) => e.target === e.currentTarget && setModalGastoCompartido(false)}
          >
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 border border-slate-200 max-h-[85dvh] sm:max-h-[80vh] flex flex-col">
              
              {/* Encabezado */}
              <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-punto-brand/10 text-punto-brand flex items-center justify-center font-bold shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-base text-slate-900 leading-tight truncate">
                      Agregar Gasto Compartido
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      Tocá un artículo para dividirlo entre {cantDivision === 1 ? '1 solo jugador' : `los ${cantDivision} jugadores`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalGastoCompartido(false)}
                  aria-label="Cerrar"
                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Barra de búsqueda clara */}
              <div className="relative mb-3 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={inputBusquedaGastoRef}
                  type="search"
                  autoFocus
                  value={busquedaGastoCompartido}
                  onChange={(e) => setBusquedaGastoCompartido(e.target.value)}
                  placeholder="Buscar artículo de cantina..."
                  className="w-full pl-10 pr-9 py-2.5 sm:py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-punto-brand focus:bg-white transition-all"
                />
                {busquedaGastoCompartido && (
                  <button
                    type="button"
                    onClick={() => setBusquedaGastoCompartido('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Lista limpia de artículos de cantina */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain-smooth divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50/50">
                {articulosGastoFiltrados.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No se encontraron productos en la cantina.
                  </div>
                ) : (
                  articulosGastoFiltrados.map((art) => (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => agregarGastoCompartidoDirecto(art)}
                      className="w-full text-left p-3 hover:bg-emerald-50/80 active:bg-emerald-100 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 truncate">
                          {art.nombre}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-600 bg-slate-200/80 px-1.5 py-0.2 rounded text-[10px]">
                            {art.categoria || 'Cantina'}
                          </span>
                          <span className={Number(art.stock) <= 0 ? 'text-rose-500 font-semibold' : 'text-slate-500'}>
                            Stock: {art.stock ?? 0} un.
                          </span>
                          {art.codigoBarras && (
                            <span className="font-mono text-[10px] hidden sm:inline text-slate-400">
                              #{art.codigoBarras}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-sm font-black text-slate-900 group-hover:text-emerald-700 tabular-nums">
                          {formatearPrecio(art.precio)}
                        </span>
                        <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-slate-500 transition-colors shadow-2xs">
                          <Plus className="w-4 h-4" />
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Pie con indicador de división y recálculo automático */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
                <span>División Split Payment:</span>
                <span className="font-bold text-slate-800">
                  {cantDivision === 1 ? '1 solo jugador' : `Dividido entre ${cantDivision} jugadores`}
                </span>
              </div>
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
                    {(subtotalKiosco > 0 || totalGastosExtra > 0) && (
                      <p className="text-[11px] text-slate-500 font-medium mt-1">
                        Cancha {formatearPrecio(Math.round((Number(totalBaseCancha) || 0) / cantDivision))}
                        {totalGastosExtra > 0 && ` + Gastos comp. ${formatearPrecio(Math.round(totalGastosExtra / cantDivision))}`}
                        {subtotalKiosco > 0 && ` + Extras ${formatearPrecio(subtotalKiosco)}`}
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

                        {/* Débito */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          <CreditCard className="w-4 h-4 text-indigo-600 shrink-0" />
                          <label className="text-xs font-bold text-slate-700 w-24 shrink-0">
                            Débito
                          </label>
                          <div className="flex-1 flex items-center justify-end gap-1">
                            <span className="text-slate-400 text-sm font-semibold">$</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              placeholder="0"
                              value={montosMixtos.debito}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) =>
                                setMontosMixtos((prev) => ({ ...prev, debito: e.target.value }))
                              }
                              className="w-full text-right bg-transparent text-sm sm:text-base font-bold text-slate-900 focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                            />
                          </div>
                          {restante > 0 && Number(montosMixtos.debito || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const faltante = totalJugador - (Number(montosMixtos.efectivo) || 0) - (Number(montosMixtos.transferencia) || 0) - (Number(montosMixtos.credito) || 0);
                                if (faltante > 0) setMontosMixtos((prev) => ({ ...prev, debito: String(faltante) }));
                              }}
                              className="text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Cubrir restante con Débito"
                            >
                              Resto
                            </button>
                          )}
                        </div>

                        {/* Crédito */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all">
                          <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                          <label className="text-xs font-bold text-slate-700 w-24 shrink-0">
                            Crédito
                          </label>
                          <div className="flex-1 flex items-center justify-end gap-1">
                            <span className="text-slate-400 text-sm font-semibold">$</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min="0"
                              placeholder="0"
                              value={montosMixtos.credito}
                              onWheel={(e) => e.target.blur()}
                              onChange={(e) =>
                                setMontosMixtos((prev) => ({ ...prev, credito: e.target.value }))
                              }
                              className="w-full text-right bg-transparent text-sm sm:text-base font-bold text-slate-900 focus:outline-none tabular-nums appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:_textfield]"
                            />
                          </div>
                          {restante > 0 && Number(montosMixtos.credito || 0) === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const faltante = totalJugador - (Number(montosMixtos.efectivo) || 0) - (Number(montosMixtos.transferencia) || 0) - (Number(montosMixtos.debito) || 0);
                                if (faltante > 0) setMontosMixtos((prev) => ({ ...prev, credito: String(faltante) }));
                              }}
                              className="text-[10px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded cursor-pointer shrink-0 transition-colors"
                              title="Cubrir restante con Crédito"
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

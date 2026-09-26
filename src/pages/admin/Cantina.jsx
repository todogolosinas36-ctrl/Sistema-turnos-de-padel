import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useArticulos } from '../../context/ArticulosContext';
import { hoyISO } from '../../utils/dateHelpers';
import {
  Receipt,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  CreditCard,
  Banknote,
  Smartphone,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  X,
  AlertTriangle,
} from 'lucide-react';

const METODOS_PAGO = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transf / MP', icon: Smartphone },
  { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
];

/** Atajo de teclado por posición (1-9) sobre el listado filtrado. */
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function Cantina() {
  const { articulos, loading, ajustarStock } = useArticulos();

  const [busqueda, setBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todos');
  const [ticket, setTicket] = useState([]);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [cobrando, setCobrando] = useState(false);
  const [ultimoCobro, setUltimoCobro] = useState(null);
  const [error, setError] = useState(null);
  const searchInputRef = useRef(null);

  /* El catálogo sale de la tabla `articulos`. Si no hay columna `categoria`
     (no está en el mapeo del contexto), se agrupa todo en "Todos". */
  const catalogo = useMemo(
    () =>
      articulos.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        categoria: a.categoria || 'Otros',
        precio: Number(a.precio) || 0,
        stock: Number(a.stock) || 0,
      })),
    [articulos]
  );

  const categorias = useMemo(
    () => ['Todos', ...new Set(catalogo.map((p) => p.categoria).filter(Boolean))],
    [catalogo]
  );

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return catalogo.filter((p) => {
      const coincideBusqueda =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q) ||
        // Coincidencia por código de barras escaneado
        String(articulos.find((a) => a.id === p.id)?.codigoBarras || '').includes(q);
      const coincideCategoria =
        categoriaSeleccionada === 'Todos' || p.categoria === categoriaSeleccionada;
      return coincideBusqueda && coincideCategoria;
    });
  }, [catalogo, articulos, busqueda, categoriaSeleccionada]);

  /* ─── Operaciones del ticket ─── */
  const agregarProducto = useCallback((producto) => {
    if ((Number(producto.stock) || 0) <= 0) {
      setError(`"${producto.nombre}" no tiene stock disponible.`);
      return;
    }
    setError(null);
    setTicket((prev) => {
      const existe = prev.find((item) => item.id === producto.id);
      if (existe) {
        // No dejar agregar más de lo que hay en stock
        if (existe.cantidad >= producto.stock) {
          setError(`Sólo quedan ${producto.stock} un. de "${producto.nombre}".`);
          return prev;
        }
        return prev.map((item) =>
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: producto.id,
          nombre: producto.nombre,
          precio: Number(producto.precio) || 0,
          cantidad: 1,
        },
      ];
    });
  }, []);

  const modificarCantidad = (id, delta) => {
    setTicket((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const nueva = item.cantidad + delta;
          return nueva > 0 ? { ...item, cantidad: nueva } : null;
        })
        .filter(Boolean)
    );
  };

  const eliminarItem = (id) => setTicket((prev) => prev.filter((item) => item.id !== id));

  const total = ticket.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const cantidadItems = ticket.reduce((sum, item) => sum + item.cantidad, 0);

  /* ─── Cobro: primero la venta, después el stock ─── */
  const procesarCobro = useCallback(async () => {
    if (ticket.length === 0 || cobrando) return;

    setCobrando(true);
    setError(null);

    // A medianoche, toLocaleTimeString con hour12:false puede devolver "24:00",
    // y Postgres rechaza eso en una columna `time`. Se arma a mano.
    const ahora = new Date();
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(
      ahora.getMinutes()
    ).padStart(2, '0')}`;
    const ticketCode = `TCK-${Date.now().toString().slice(-6)}`;

    try {
      const { data: venta, error: errVenta } = await supabase
        .from('ventas_cantina')
        .insert([
          {
            fecha: hoyISO(),
            hora,
            metodo_pago: metodoPago,
            total,
            cantidad_items: cantidadItems,
            ticket: ticketCode,
          },
        ])
        .select()
        .single();

      if (errVenta) throw errVenta;

      // Detalle: guarda nombre y precio históricos, no los de referencia.
      const detalle = ticket.map((item) => ({
        venta_id: venta.id,
        articulo_id: String(item.id),
        nombre: item.nombre,
        precio: item.precio,
        cantidad: item.cantidad,
      }));

      const { error: errDetalle } = await supabase
        .from('ventas_cantina_detalle')
        .insert(detalle);

      if (errDetalle) {
        // La venta ya quedó registrada: avisar pero no perderla.
        console.error('[Cantina] Venta guardada sin detalle:', errDetalle);
      }

      // Stock recién ahora, con la venta confirmada.
      for (const item of ticket) {
        await ajustarStock(item.id, -item.cantidad);
      }

      setUltimoCobro({
        total,
        cantidadItems,
        metodoPago,
        ticket: ticketCode,
        timestamp: hora,
      });
      setTicket([]);
      setTimeout(() => setUltimoCobro(null), 5000);
    } catch (err) {
      console.error('[Cantina] No se pudo registrar la venta:', err);
      setError(
        'No se pudo registrar la venta. El stock no se tocó. Revisá la conexión e intentá de nuevo.'
      );
    } finally {
      setCobrando(false);
    }
  }, [ticket, cobrando, metodoPago, total, cantidadItems, ajustarStock]);

  /* ─── Atajos de teclado para velocidad de mostrador ─── */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (busqueda) {
          setBusqueda('');
        } else if (document.activeElement === searchInputRef.current) {
          searchInputRef.current.blur();
        }
        return;
      }

      const escribiendo = document.activeElement === searchInputRef.current;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Enter' && !escribiendo) {
        e.preventDefault();
        procesarCobro();
        return;
      }

      if (!escribiendo && TECLAS.includes(e.key)) {
        e.preventDefault();
        const indice = TECLAS.indexOf(e.key);
        if (productosFiltrados[indice]) agregarProducto(productosFiltrados[indice]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [productosFiltrados, agregarProducto, busqueda, procesarCobro]);

  const formatearPrecio = (valor) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(valor);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full">
      {/* ═══ Catálogo ═══ */}
      <div className="lg:w-[62%] flex flex-col min-w-0 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Cantina &amp; Pro-Shop
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                <Sparkles className="w-3 h-3" />
                POS Rápido
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Teclas <span className="font-bold text-slate-700">[1]</span>–
              <span className="font-bold text-slate-700">[9]</span> para agregar,{' '}
              <span className="font-bold text-slate-700">[Enter]</span> para cobrar.
            </p>
          </div>

          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full pl-9 pr-14 py-2.5 text-base sm:text-sm bg-white border border-zinc-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded shadow-xs">
                /
              </kbd>
            </div>
          </div>
        </div>

        {categorias.length > 2 && (
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
            {categorias.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaSeleccionada(cat)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  categoriaSeleccionada === cat
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-zinc-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {ultimoCobro && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start sm:items-center justify-between gap-3 text-emerald-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-black text-sm truncate">
                  ¡Venta cobrada! {formatearPrecio(ultimoCobro.total)}
                </p>
                <p className="text-xs text-emerald-700 truncate">
                  {ultimoCobro.ticket} • {ultimoCobro.cantidadItems} artículos •{' '}
                  {ultimoCobro.metodoPago.toUpperCase()} • {ultimoCobro.timestamp} hs
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUltimoCobro(null)}
              aria-label="Cerrar aviso"
              className="text-emerald-600 hover:text-emerald-900 p-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 animate-in fade-in duration-150">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-relaxed flex-1">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Cerrar aviso"
              className="text-red-500 hover:text-red-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain-smooth mt-5 pr-1">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3" />
              <p className="text-xs font-semibold">Cargando inventario…</p>
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-zinc-200 p-6 text-center">
              <ShoppingBag className="w-10 h-10 stroke-1 mb-2 text-slate-300" />
              <p className="font-bold text-slate-700 text-sm">
                {catalogo.length === 0 ? 'No hay productos cargados' : 'Sin resultados'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {catalogo.length === 0
                  ? 'Cargá productos en /admin/articulos para poder vender en cantina.'
                  : 'Probá con otro término de búsqueda o categoría.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {productosFiltrados.map((prod, indice) => {
                const sinStock = (Number(prod.stock) || 0) <= 0;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => agregarProducto(prod)}
                    disabled={sinStock}
                    className={`group relative bg-white rounded-xl border border-zinc-200 p-4 text-left flex flex-col justify-between select-none active:scale-[0.98] transition-all ${
                      sinStock
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-blue-500 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase truncate">
                        {prod.categoria}
                      </span>
                      {indice < 9 && (
                        <span
                          className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-black text-slate-500 bg-zinc-100 group-hover:bg-blue-50 group-hover:text-blue-600 border border-zinc-200 group-hover:border-blue-200 rounded-md transition-colors font-mono shadow-xs shrink-0"
                        >
                          [{TECLAS[indice]}]
                        </span>
                      )}
                    </div>

                    <div className="my-2.5">
                      <h3 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
                        {prod.nombre}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {sinStock ? 'Sin stock' : `Stock: ${prod.stock}`}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 mt-auto">
                      <span className="font-black text-base text-blue-600 tracking-tight tabular-nums">
                        {formatearPrecio(prod.precio)}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-zinc-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                        <Plus className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ Ticket ═══ */}
      <div className="lg:w-[38%] flex flex-col min-w-0 min-h-0">
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col h-[60vh] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-0">
          <div className="p-4 sm:p-5 border-b border-zinc-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 text-base leading-none">Venta Actual</h3>
                <span className="text-[11px] text-slate-400 font-semibold">Mostrador Principal</span>
              </div>
            </div>

            {ticket.length > 0 && (
              <button
                type="button"
                onClick={() => setTicket([])}
                className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Vaciar
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain-smooth p-4 space-y-2.5">
            {ticket.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Receipt className="w-12 h-12 stroke-1 text-slate-300 mb-2" />
                <p className="font-bold text-slate-700 text-sm">El ticket está vacío</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                  Tocá los productos o usá las teclas{' '}
                  <span className="font-bold text-slate-600">[1]-[9]</span> para sumar ítems.
                </p>
              </div>
            ) : (
              ticket.map((item) => {
                const estaAgotado =
                  (Number(articulos.find((a) => a.id === item.id)?.stock) || 0) < item.cantidad;
                return (
                  <div
                    key={item.id}
                    className={`bg-zinc-50/70 border border-zinc-100 rounded-xl p-3 flex items-center justify-between gap-2 sm:gap-3 group hover:border-zinc-200 transition-all ${
                      estaAgotado ? 'border-red-200 bg-red-50/50' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate">{item.nombre}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {formatearPrecio(item.precio)} c/u
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => modificarCantidad(item.id, -1)}
                        aria-label={`Quitar uno de ${item.nombre}`}
                        className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-black text-slate-900 tabular-nums">
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => modificarCantidad(item.id, 1)}
                        aria-label={`Agregar uno de ${item.nombre}`}
                        className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right min-w-[64px] sm:min-w-[72px] shrink-0">
                      <span className="font-black text-sm text-slate-900 block tabular-nums">
                        {formatearPrecio(item.precio * item.cantidad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => eliminarItem(item.id)}
                        className="text-[10px] text-slate-400 hover:text-red-500 transition-colors opacity-60 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-zinc-50 p-4 sm:p-5 rounded-b-2xl border-t border-zinc-100 flex flex-col shrink-0">
            <div className="grid grid-cols-3 gap-2 mb-4">
              {METODOS_PAGO.map((metodo) => {
                const Icono = metodo.icon;
                return (
                  <button
                    key={metodo.id}
                    type="button"
                    onClick={() => setMetodoPago(metodo.id)}
                    className={`py-2.5 px-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      metodoPago === metodo.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <Icono className="w-3.5 h-3.5" />
                    <span className="truncate">{metodo.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-zinc-200/60">
              <div className="flex justify-between text-xs text-slate-500 font-medium">
                <span>Artículos</span>
                <span>{cantidadItems} unidades</span>
              </div>
              <div className="flex justify-between items-baseline gap-2 pt-1">
                <span className="text-sm font-bold text-slate-700">Total a pagar</span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight tabular-nums">
                  {formatearPrecio(total)}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={ticket.length === 0 || cobrando}
              onClick={procesarCobro}
              className={`w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-base sm:text-lg py-4 rounded-xl shadow-md mt-4 flex justify-between items-center gap-2 px-4 sm:px-6 transition-all ${
                ticket.length === 0 || cobrando
                  ? 'opacity-50 cursor-not-allowed shadow-none'
                  : 'hover:shadow-lg active:scale-[0.99] cursor-pointer'
              }`}
            >
              {cobrando ? (
                <>
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Registrando…
                  </span>
                </>
              ) : (
                <>
                  <span>Cobrar</span>
                  <ArrowRight className="w-5 h-5 shrink-0" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

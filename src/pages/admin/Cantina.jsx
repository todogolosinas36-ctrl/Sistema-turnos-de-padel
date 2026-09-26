import { useState, useEffect, useRef } from 'react';
import {
  Receipt,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Zap,
  CreditCard,
  Banknote,
  Smartphone,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  X
} from 'lucide-react';

const PRODUCTOS_CATALOGO = [
  {
    id: 1,
    shortcut: '1',
    nombre: 'Gatorade Manzana',
    categoria: 'Bebidas',
    precio: 2500,
    stock: 24,
    descripcion: '500ml isotónica fría'
  },
  {
    id: 2,
    shortcut: '2',
    nombre: 'Tubo Pelotas Head',
    categoria: 'Pelotas',
    precio: 9800,
    stock: 12,
    descripcion: 'Head Padel Pro x3'
  },
  {
    id: 3,
    shortcut: '3',
    nombre: 'Agua Mineral',
    categoria: 'Bebidas',
    precio: 1500,
    stock: 35,
    descripcion: 'Sin gas 600ml'
  },
  {
    id: 4,
    shortcut: '4',
    nombre: 'Alquiler Paleta',
    categoria: 'Alquileres',
    precio: 4000,
    stock: 8,
    descripcion: 'Bullpadel / Nox carbono'
  },
  {
    id: 5,
    shortcut: '5',
    nombre: 'Grip Bullpadel Pro',
    categoria: 'Accesorios',
    precio: 3200,
    stock: 18,
    descripcion: 'Overgrip alta adherencia'
  },
  {
    id: 6,
    shortcut: '6',
    nombre: 'Barra Proteica',
    categoria: 'Snacks',
    precio: 2100,
    stock: 20,
    descripcion: 'Nutrición deportiva 45g'
  },
  {
    id: 7,
    shortcut: '7',
    nombre: 'Cerveza Corona',
    categoria: 'Bebidas',
    precio: 3500,
    stock: 30,
    descripcion: '330ml para el tercer tiempo'
  },
  {
    id: 8,
    shortcut: '8',
    nombre: 'Muñequera Toalla',
    categoria: 'Accesorios',
    precio: 2800,
    stock: 15,
    descripcion: 'Algodón absorbente'
  },
  {
    id: 9,
    shortcut: '9',
    nombre: 'Café Espresso',
    categoria: 'Bebidas',
    precio: 1800,
    stock: 50,
    descripcion: 'Café en grano especial'
  }
];

export default function Cantina() {
  // Estado de búsqueda y categoría
  const [busqueda, setBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todos');
  const searchInputRef = useRef(null);

  // Ítems iniciales de ejemplo para el ticket de venta
  const [ticket, setTicket] = useState([
    {
      id: 1,
      nombre: 'Gatorade Manzana',
      precio: 2500,
      cantidad: 2
    },
    {
      id: 2,
      nombre: 'Tubo Pelotas Head',
      precio: 9800,
      cantidad: 1
    }
  ]);

  // Método de pago seleccionado
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [ventaConfirmada, setVentaConfirmada] = useState(false);
  const [ultimoCobro, setUltimoCobro] = useState(null);

  // Filtrado de productos
  const categorias = ['Todos', 'Bebidas', 'Pelotas', 'Alquileres', 'Accesorios', 'Snacks'];

  const productosFiltrados = PRODUCTOS_CATALOGO.filter((prod) => {
    const coincideBusqueda =
      prod.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      prod.categoria.toLowerCase().includes(busqueda.toLowerCase()) ||
      prod.descripcion.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria =
      categoriaSeleccionada === 'Todos' || prod.categoria === categoriaSeleccionada;
    return coincideBusqueda && coincideCategoria;
  });

  // Operaciones sobre el ticket
  const agregarProducto = (producto) => {
    setTicket((prev) => {
      const existe = prev.find((item) => item.id === producto.id);
      if (existe) {
        return prev.map((item) =>
          item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1
        }
      ];
    });
  };

  const modificarCantidad = (id, delta) => {
    setTicket((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nuevaCantidad = item.cantidad + delta;
            return nuevaCantidad > 0 ? { ...item, cantidad: nuevaCantidad } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const eliminarItem = (id) => {
    setTicket((prev) => prev.filter((item) => item.id !== id));
  };

  const limpiarTicket = () => {
    setTicket([]);
  };

  // Cálculo de totales
  const total = ticket.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const cantidadItems = ticket.reduce((sum, item) => sum + item.cantidad, 0);

  // Cobro
  const procesarCobro = () => {
    if (ticket.length === 0) return;
    setUltimoCobro({
      total,
      cantidadItems,
      metodoPago,
      timestamp: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    });
    setVentaConfirmada(true);
    setTicket([]);
    setTimeout(() => {
      setVentaConfirmada(false);
    }, 3500);
  };

  // Atajos de teclado para velocidad de mostrador
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Si está escribiendo en el buscador, no activar atajos numéricos excepto Escape
      if (document.activeElement === searchInputRef.current) {
        if (e.key === 'Escape') {
          searchInputRef.current.blur();
        }
        return;
      }

      // Atajo '/' para enfocar buscador
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Atajo 'Enter' para cobrar
      if (e.key === 'Enter') {
        e.preventDefault();
        procesarCobro();
        return;
      }

      // Atajo numérico 1-9 para agregar productos rápidos
      if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        const prod = PRODUCTOS_CATALOGO.find((p) => p.shortcut === e.key);
        if (prod) {
          e.preventDefault();
          agregarProducto(prod);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ticket, total, metodoPago]);

  const formatearPrecio = (valor) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(valor);
  };

  return (
    <div className="flex h-full gap-6 select-none">
      {/* ─── COLUMNA IZQUIERDA: Catálogo de Productos (65%) ─── */}
      <div className="w-[65%] flex flex-col min-w-0">
        {/* Cabecera y Buscador */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Cantina & Pro-Shop
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                <Sparkles className="w-3 h-3" />
                POS Rápido
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Presioná números <span className="font-bold text-slate-700">[1]</span> al{' '}
              <span className="font-bold text-slate-700">[9]</span> para agregar al ticket al instante.
            </p>
          </div>

          {/* Buscador Rápido Estilo SaaS */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full pl-9 pr-14 py-2 text-sm bg-white border border-zinc-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded shadow-xs">
                /
              </kbd>
            </div>
          </div>
        </div>

        {/* Filtro de Categorías */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {categorias.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoriaSeleccionada(cat)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                categoriaSeleccionada === cat
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-zinc-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Notificación de venta confirmada */}
        {ventaConfirmada && ultimoCobro && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-sm">
                  ¡Venta cobrada con éxito! ({formatearPrecio(ultimoCobro.total)})
                </p>
                <p className="text-xs text-emerald-700">
                  {ultimoCobro.cantidadItems} artículos • Pago con {ultimoCobro.metodoPago.toUpperCase()} • {ultimoCobro.timestamp} hs
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVentaConfirmada(false)}
              className="text-emerald-600 hover:text-emerald-900 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Grilla de Productos */}
        <div className="flex-1 overflow-y-auto mt-6 pr-1">
          {productosFiltrados.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-zinc-200 p-6 text-center">
              <ShoppingBag className="w-10 h-10 stroke-1 mb-2 text-slate-300" />
              <p className="font-bold text-slate-700 text-sm">No se encontraron productos</p>
              <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda o categoría</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {productosFiltrados.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => agregarProducto(prod)}
                  className="group relative bg-white rounded-xl border border-zinc-200 p-4 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between select-none active:scale-[0.98]"
                >
                  {/* Atajo de teclado badge en esquina */}
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      {prod.categoria}
                    </span>
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-black text-slate-500 bg-zinc-100 group-hover:bg-blue-50 group-hover:text-blue-600 border border-zinc-200 group-hover:border-blue-200 rounded-md transition-colors font-mono shadow-xs">
                      [{prod.shortcut}]
                    </span>
                  </div>

                  {/* Nombre y descripción */}
                  <div className="my-2.5">
                    <h3 className="font-bold text-slate-900 text-sm leading-tight group-hover:text-blue-600 transition-colors">
                      {prod.nombre}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      {prod.descripcion}
                    </p>
                  </div>

                  {/* Precio y acción rápida */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 mt-auto">
                    <span className="font-black text-base text-blue-600 tracking-tight">
                      {formatearPrecio(prod.precio)}
                    </span>
                    <span className="w-6 h-6 rounded-lg bg-zinc-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white flex items-center justify-center transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── COLUMNA DERECHA: Ticket de Venta (35%) ─── */}
      <div className="w-[35%] flex flex-col min-w-0">
        <div className="sticky top-0 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col h-[calc(100vh-8rem)]">
          {/* Cabecera del Ticket */}
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Receipt className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base leading-none">
                  Venta Actual
                </h3>
                <span className="text-[11px] text-slate-400 font-semibold">
                  Mostrador Principal
                </span>
              </div>
            </div>

            {ticket.length > 0 && (
              <button
                type="button"
                onClick={limpiarTicket}
                className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                title="Vaciar ticket"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Vaciar
              </button>
            )}
          </div>

          {/* Lista de Ítems (Scroll) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {ticket.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <Receipt className="w-12 h-12 stroke-1 text-slate-300 mb-2" />
                <p className="font-bold text-slate-700 text-sm">El ticket está vacío</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tocá los productos o usá las teclas <span className="font-bold text-slate-600">[1]-[9]</span> para sumar ítems.
                </p>
              </div>
            ) : (
              ticket.map((item) => (
                <div
                  key={item.id}
                  className="bg-zinc-50/70 border border-zinc-100 rounded-xl p-3 flex items-center justify-between gap-3 group hover:border-zinc-200 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">
                      {item.nombre}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {formatearPrecio(item.precio)} c/u
                    </p>
                  </div>

                  {/* Botones +/- Cantidad */}
                  <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-xs">
                    <button
                      type="button"
                      onClick={() => modificarCantidad(item.id, -1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-zinc-100 rounded transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-black text-slate-900">
                      {item.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => modificarCantidad(item.id, 1)}
                      className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-zinc-100 rounded transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right min-w-[72px]">
                    <span className="font-black text-sm text-slate-900 block">
                      {formatearPrecio(item.precio * item.cantidad)}
                    </span>
                    <button
                      type="button"
                      onClick={() => eliminarItem(item.id)}
                      className="text-[10px] text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pie del Ticket (Cobro) */}
          <div className="bg-zinc-50 p-6 rounded-b-2xl border-t border-zinc-100 flex flex-col">
            {/* Selector de Método de Pago */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                { id: 'transferencia', label: 'Transf / MP', icon: Smartphone },
                { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard }
              ].map((metodo) => {
                const IconComponent = metodo.icon;
                const isSelected = metodoPago === metodo.id;
                return (
                  <button
                    key={metodo.id}
                    type="button"
                    onClick={() => setMetodoPago(metodo.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                    <span className="truncate">{metodo.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Desglose / Total */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-200/60">
              <div className="flex justify-between text-xs text-slate-500 font-medium">
                <span>Artículos</span>
                <span>{cantidadItems} unidades</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-sm font-bold text-slate-700">Total a pagar</span>
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {formatearPrecio(total)}
                </span>
              </div>
            </div>

            {/* Botón Gigante de Cobrar */}
            <button
              type="button"
              disabled={ticket.length === 0}
              onClick={procesarCobro}
              className={`w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black text-lg py-4 rounded-xl shadow-md mt-4 flex justify-between items-center px-6 transition-all ${
                ticket.length === 0
                  ? 'opacity-50 cursor-not-allowed shadow-none'
                  : 'hover:shadow-lg active:scale-[0.99]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span>Cobrar</span>
                <ArrowRight className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-blue-200 tracking-normal uppercase bg-blue-700/60 px-2.5 py-1 rounded-md">
                [Enter] para cobrar
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useArticulos } from '../../context/ArticulosContext';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Barcode,
  Boxes,
  DollarSign,
  AlertTriangle,
  X,
  CheckCircle2,
  Tag
} from 'lucide-react';

export default function Articulos() {
  const { articulos, crearArticulo, actualizarArticulo, eliminarArticulo, loading } = useArticulos();

  const [busqueda, setBusqueda] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [articuloEnEdicion, setArticuloEnEdicion] = useState(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(null);

  // Formulario
  const [formNombre, setFormNombre] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formCodigoBarras, setFormCodigoBarras] = useState('');
  const [formStock, setFormStock] = useState('');

  const resetForm = () => {
    setFormNombre('');
    setFormPrecio('');
    setFormCodigoBarras('');
    setFormStock('');
    setArticuloEnEdicion(null);
  };

  const abrirModalCrear = () => {
    resetForm();
    setModalOpen(true);
  };

  const abrirModalEditar = (art) => {
    setArticuloEnEdicion(art);
    setFormNombre(art.nombre);
    setFormPrecio(art.precio);
    setFormCodigoBarras(art.codigoBarras || '');
    setFormStock(art.stock);
    setModalOpen(true);
  };

  const [guardando, setGuardando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formNombre.trim()) return;

    setGuardando(true);
    const payload = {
      nombre: formNombre.trim(),
      precio: Number(formPrecio) || 0,
      codigoBarras: formCodigoBarras.trim(),
      stock: Number(formStock) || 0,
    };

    try {
      if (articuloEnEdicion) {
        await actualizarArticulo(articuloEnEdicion.id, payload);
      } else {
        await crearArticulo(payload);
      }
      resetForm();
      setModalOpen(false);
    } catch (error) {
      console.error('Error al guardar artículo:', error);
      alert('Hubo un error al guardar el artículo.');
    } finally {
      setGuardando(false);
    }
  };

  const [eliminando, setEliminando] = useState(false);

  const handleEliminar = async (id) => {
    setEliminando(true);
    try {
      await eliminarArticulo(id);
      setConfirmarEliminar(null);
    } catch (error) {
      console.error('Error al eliminar artículo:', error);
      alert('Hubo un error al eliminar el artículo.');
    } finally {
      setEliminando(false);
    }
  };

  // Filtrado en memoria (ultra rápido)
  const articulosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    if (!q) return articulos;
    return articulos.filter(
      (art) =>
        art.nombre.toLowerCase().includes(q) ||
        (art.codigoBarras && art.codigoBarras.toLowerCase().includes(q))
    );
  }, [articulos, busqueda]);

  // Métricas rápidas
  const totalArticulos = articulos.length;
  const totalStock = articulos.reduce((sum, a) => sum + (Number(a.stock) || 0), 0);
  const valorTotalInventario = articulos.reduce(
    (sum, a) => sum + (Number(a.precio) || 0) * (Number(a.stock) || 0),
    0
  );

  const formatearPrecio = (valor) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(valor);
  };

  const inputCls =
    'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 sm:py-3 text-base sm:text-sm text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all';

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto w-full pb-10">
      {/* ─── Cabecera ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
            Artículos
          </h1>
        </div>

        <button
          type="button"
          onClick={abrirModalCrear}
          className="bg-punto-brand text-white px-5 py-3 sm:py-2.5 rounded-lg font-bold shadow-sm hover:bg-punto-hover transition-all flex items-center justify-center gap-2 w-full sm:w-auto active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Artículo</span>
        </button>
      </div>

      {/* ─── Tarjetas de Resumen ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-4 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Variedad de Productos
            </span>
            <span className="text-2xl font-black text-slate-900 leading-tight">
              {totalArticulos}
            </span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-4 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Unidades en Stock
            </span>
            <span className="text-2xl font-black text-slate-900 leading-tight">
              {totalStock}
            </span>
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center gap-4 shadow-xs">
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Valor de Inventario
            </span>
            <span className="text-2xl font-black text-slate-900 leading-tight">
              {formatearPrecio(valorTotalInventario)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Barra de Búsqueda ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código de barras..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-zinc-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Tabla de Artículos ─── */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
            <p className="font-bold text-slate-700 text-sm">Cargando inventario...</p>
          </div>
        ) : articulosFiltrados.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-6">
            <Package className="w-12 h-12 text-slate-300 stroke-1 mb-3" />
            <p className="font-bold text-slate-700 text-sm">No se encontraron artículos</p>
            <p className="text-xs text-slate-400 mt-1">
              {busqueda
                ? 'Prueba con otro término de búsqueda.'
                : 'Cargá tu primer producto con el botón "+ Nuevo Artículo".'}
            </p>
          </div>
        ) : (
          <>
            {/* ─── Mobile: lista de cards (<sm) ─── */}
            <div className="sm:hidden divide-y divide-zinc-100">
              {articulosFiltrados.map((art) => {
                const stockNum = Number(art.stock) || 0;
                const stockBadgeCls =
                  stockNum === 0
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : stockNum < 5
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                return (
                  <div key={art.id} className="p-4 active:bg-zinc-50/80 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 text-sm leading-tight break-words">
                          {art.nombre}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="text-sm font-black text-slate-900">
                            {formatearPrecio(art.precio)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${stockBadgeCls}`}
                          >
                            {stockNum} un.
                            {stockNum === 0 && ' (Agotado)'}
                          </span>
                        </div>
                        {art.codigoBarras && (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 mt-1.5">
                            <Barcode className="w-3 h-3 text-slate-400 shrink-0" />
                            {art.codigoBarras}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => abrirModalEditar(art)}
                          aria-label={`Editar ${art.nombre}`}
                          className="w-9 h-9 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 active:scale-95 transition-all flex items-center justify-center"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarEliminar(art)}
                          aria-label={`Eliminar ${art.nombre}`}
                          className="w-9 h-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition-all flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ─── Desktop: tabla (sm+) ─── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-zinc-200">
                    <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Artículo
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Código de Barras
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Precio
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Stock
                    </th>
                    <th className="px-6 py-3.5 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {articulosFiltrados.map((art) => {
                    const stockNum = Number(art.stock) || 0;
                    const stockBadgeCls =
                      stockNum === 0
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : stockNum < 5
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200';

                    return (
                      <tr
                        key={art.id}
                        className="hover:bg-zinc-50/80 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                              <Tag className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 text-sm block leading-tight">
                                {art.nombre}
                              </span>
                              {art.categoria && (
                                <span className="text-[11px] text-slate-400 font-medium">
                                  {art.categoria}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {art.codigoBarras ? (
                            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md w-fit border border-slate-200/60">
                              <Barcode className="w-3.5 h-3.5 text-slate-400" />
                              {art.codigoBarras}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium italic">Sin código</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-black text-sm text-slate-900 tracking-tight">
                            {formatearPrecio(art.precio)}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${stockBadgeCls}`}
                          >
                            {stockNum} un.
                            {stockNum === 0 && ' (Agotado)'}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => abrirModalEditar(art)}
                              className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Editar artículo"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmarEliminar(art)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Eliminar artículo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ─── Modal Agregar / Editar ─── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[92dvh] overflow-y-auto overscroll-contain-smooth pb-safe animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden">
              <div className="w-11 h-1.5 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-start justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-5">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  {articuloEnEdicion ? 'Editar Artículo' : 'Nuevo Artículo'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Completá los datos del producto para el kiosco.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { resetForm(); setModalOpen(false); }}
                aria-label="Cerrar"
                className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-lg leading-none cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Nombre del Artículo *
                </label>
                <input
                  autoFocus
                  type="text"
                  required
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="Ej: Gatorade Manzana 500ml"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Precio ($ARS) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={formPrecio}
                    onChange={(e) => setFormPrecio(e.target.value)}
                    placeholder="Ej: 2500"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Stock Inicial *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="Ej: 20"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Código de Barras (Opcional)
                </label>
                <input
                  type="text"
                  value={formCodigoBarras}
                  onChange={(e) => setFormCodigoBarras(e.target.value)}
                  placeholder="Escanear o ingresar número de código..."
                  className={inputCls}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { resetForm(); setModalOpen(false); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-[2] py-3 rounded-xl bg-punto-brand text-white text-sm font-bold hover:bg-punto-hover active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {guardando ? 'Guardando...' : (articuloEnEdicion ? 'Guardar Cambios' : 'Crear Artículo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal Confirmar Eliminación ─── */}
      {confirmarEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-slate-900/50 backdrop-blur-sm sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setConfirmarEliminar(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6 pb-safe animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-900 text-base">
                  Eliminar Artículo
                </h3>
                <p className="text-xs text-slate-500">
                  ¿Deseas quitar este producto del inventario?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-sm text-slate-700 space-y-1 mb-5">
              <p className="font-bold text-slate-900 break-words">{confirmarEliminar.nombre}</p>
              <p className="text-xs text-slate-500">
                Precio: {formatearPrecio(confirmarEliminar.precio)} • Stock: {confirmarEliminar.stock} un.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setConfirmarEliminar(null)}
                className="flex-1 sm:flex-none px-4 py-3.5 sm:py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={eliminando}
                onClick={() => handleEliminar(confirmarEliminar.id)}
                className="flex-1 sm:flex-none px-4 py-3.5 sm:py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {eliminando ? 'Eliminando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

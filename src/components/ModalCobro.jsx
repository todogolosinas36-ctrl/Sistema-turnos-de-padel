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
  Pencil
} from 'lucide-react';

export default function ModalCobro({ isOpen, onClose, turno, onConfirmarCobro }) {
  const { articulos, descontarStock } = useArticulos();
  const { precioBaseCancha } = useTurnos();

  // Monto base de la cancha: viene de Configuración y es editable por turno
  const [totalBaseCancha, setTotalBaseCancha] = useState(precioBaseCancha);
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
  const searchInputRef = useRef(null);

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

  // Resetear el modal cada vez que se abre con un turno nuevo
  useEffect(() => {
    if (!isOpen) return;
    // Arrancamos siempre con la tarifa vigente de Configuración
    setTotalBaseCancha(precioBaseCancha);
    setEditandoBase(false);
    setGastosCompartidos([]);
    setModalGastoCompartido(false);
    setConceptoGasto('');
    setMontoGasto('');
    setJugadorKioscoActivo(null);
    setBusquedaKiosco('');
    setDivision(4);
  }, [isOpen, turno, precioBaseCancha]);

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
  const totalCanchaYGastos = totalBaseCancha + totalGastosExtra;
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

  // Agregar ítem de Kiosco a un jugador
  const agregarItemAJugador = (articulo) => {
    if (jugadorKioscoActivo === null) return;

    setJugadores((prev) =>
      prev.map((jug) => {
        if (jug.id !== jugadorKioscoActivo) return jug;

        const existente = jug.itemsKiosco.find((it) => it.id === articulo.id);
        let itemsActualizados;
        if (existente) {
          itemsActualizados = jug.itemsKiosco.map((it) =>
            it.id === articulo.id ? { ...it, cantidad: it.cantidad + 1 } : it
          );
        } else {
          itemsActualizados = [
            ...jug.itemsKiosco,
            { id: articulo.id, nombre: articulo.nombre, precio: articulo.precio, cantidad: 1 },
          ];
        }
        return { ...jug, itemsKiosco: itemsActualizados };
      })
    );

    // Descontar del inventario
    descontarStock(articulo.id, 1);

    // Cerrar buscador rápido al seleccionar
    setJugadorKioscoActivo(null);
  };

  // Quitar ítem de Kiosco de un jugador
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

  // Cobro individual de un jugador
  const cobrarJugador = (jugadorId) => {
    setJugadores((prev) => {
      const actualizados = prev.map((jug) =>
        jug.id === jugadorId ? { ...jug, pagado: true } : jug
      );

      // Si todos quedaron cobrados, liquidamos el turno
      if (actualizados.every((j) => j.pagado)) {
        setTimeout(() => {
          onConfirmarCobro(turno.id, construirDetalleCobro(actualizados));
          onClose();
        }, 400);
      }

      return actualizados;
    });
  };

  // Cobrar Todo Junto (botón maestro)
  const cobrarTodoJunto = () => {
    const todosPagados = jugadores.map((jug) => ({ ...jug, pagado: true }));
    setJugadores(todosPagados);
    setTimeout(() => {
      onConfirmarCobro(turno.id, construirDetalleCobro(todosPagados));
      onClose();
    }, 300);
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
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(valor);
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
                {editandoBase ? (
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
                        setTotalBaseCancha(
                          Number.isFinite(n) && n > 0 ? Math.round(n) : precioBaseCancha
                        );
                        setEditandoBase(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          setTotalBaseCancha(precioBaseCancha);
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
                <span className="text-lg font-black text-amber-400 tabular-nums">
                  {formatearPrecio(cuotaCanchaPorJugador)}
                </span>
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
                      onClick={() => cobrarJugador(jugador.id)}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                        jugador.pagado
                          ? 'bg-emerald-100 text-emerald-700 cursor-default'
                          : 'bg-punto-brand hover:bg-punto-hover text-white shadow-xs active:scale-95 cursor-pointer'
                      }`}
                    >
                      {jugador.pagado ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Cobrado ✓
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-3.5 h-3.5" />
                          Cobrar Jugador
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

      </div>
    </div>
  );
}

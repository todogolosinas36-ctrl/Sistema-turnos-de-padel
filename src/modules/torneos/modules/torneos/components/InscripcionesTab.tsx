/**
 * InscripcionesTab — control de parejas y pagos de una categoria.
 *
 * Muestra:
 *  - Resumen (total, habilitadas, pendiente de cobro).
 *  - Tabla con badges de estado de pago, monto abonado, saldo y restriccion.
 *  - Switch rapido de estado de pago sin abrir el formulario.
 *  - Boton "Sortear Zonas" con el analisis por delante (sin excepciones).
 */

import { useMemo, useState } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { EstadoPago, Pareja } from '../types';
import { analizarSorteo, puedeParticiparEnSorteo } from '../lib';
import { formatearMoneda, ParejaFormModal } from './ParejaFormModal';
import {
  Alerta,
  Badge,
  Button,
  Card,
  EstadoVacio,
  Input,
  Modal,
  Spinner,
  Tabla,
  Td,
  Th,
} from './ui';

const TONO_PAGO: Record<EstadoPago, 'peligro' | 'advertencia' | 'exito'> = {
  pendiente: 'peligro',
  sena: 'advertencia',
  pagado: 'exito',
};

const ETIQUETA_PAGO: Record<EstadoPago, string> = {
  pendiente: 'Pendiente',
  sena: 'Seña',
  pagado: 'Pagado',
};

export function InscripcionesTab() {
  const { categoria, parejas, acciones, cargando, guardando } = useTorneo();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<Pareja | null>(null);
  const [porBorrar, setPorBorrar] = useState<Pareja | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroPago, setFiltroPago] = useState<EstadoPago | 'todas'>('todas');

  const precio = categoria?.precio_inscripcion ?? 0;

  /* --------------------------------------------------------------- */
  /* Resumenes                                                        */
  /* --------------------------------------------------------------- */

  const resumen = useMemo(() => {
    const habilitadas = parejas.filter(puedeParticiparEnSorteo).length;
    const pendiente = parejas.length - habilitadas;
    const cobrado = parejas.reduce((acc, p) => acc + p.monto_abonado, 0);
    const esperado = parejas.length * precio;
    return { habilitadas, pendiente, cobrado, esperado, falta: Math.max(esperado - cobrado, 0) };
  }, [parejas, precio]);

  const analisis = useMemo(() => analizarSorteo(parejas), [parejas]);

  /** Además del análisis del sorteo, respeta el límite de la categoría. */
  const excedeMaximo =
    categoria?.maximo_parejas != null && parejas.length > categoria.maximo_parejas;
  const puedeSortear = analisis.habilitado && !excedeMaximo;

  /* --------------------------------------------------------------- */
  /* Filtrado                                                         */
  /* --------------------------------------------------------------- */

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return parejas.filter((p) => {
      if (filtroPago !== 'todas' && p.estado_pago !== filtroPago) return false;
      if (!q) return true;
      return (
        p.j1_nombre.toLowerCase().includes(q) ||
        p.j2_nombre.toLowerCase().includes(q) ||
        p.j1_telefono.includes(q) ||
        p.j2_telefono.includes(q)
      );
    });
  }, [parejas, busqueda, filtroPago]);

  /* --------------------------------------------------------------- */
  /* Acciones                                                         */
  /* --------------------------------------------------------------- */

  const abrirAlta = () => {
    setEditando(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (pareja: Pareja) => {
    setEditando(pareja);
    setModalAbierto(true);
  };

  const guardar = async (input: Parameters<typeof acciones.crearPareja>[0]) => {
    const r = editando ? await acciones.actualizarPareja(editando.id, input) : await acciones.crearPareja(input);
    return r;
  };

  /** Toggle rapido de pago: pendiente -> pagado -> pendiente. */
  const alternarPago = async (pareja: Pareja) => {
    const siguiente: EstadoPago = pareja.estado_pago === 'pagado' ? 'pendiente' : 'pagado';
    await acciones.cambiarEstadoPago(
      pareja.id,
      siguiente,
      siguiente === 'pagado' && pareja.monto_abonado === 0 ? precio : undefined,
    );
  };

  const confirmarBorrado = async () => {
    if (!porBorrar) return;
    const r = await acciones.eliminarPareja(porBorrar.id);
    if (r.ok) setPorBorrar(null);
  };

  const sortear = async () => {
    const r = await acciones.sortearZonas();
    if (r.ok) acciones.setTab('zonas');
  };

  if (!categoria) {
    return (
      <EstadoVacio
        titulo="Seleccioná una categoría"
        descripcion="Elegí una categoría desde las pestañas superiores para ver y cargar sus inscripciones."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variante="primario" onClick={abrirAlta} icono={<IconoMas />}>
            Inscribir pareja
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variante="fantasma"
            onClick={() => void acciones.refrescarCategoria()}
            disabled={cargando}
            icono={cargando ? <Spinner className="h-4 w-4" /> : <IconoRefrescar />}
          >
            Actualizar
          </Button>
          <Button
            variante="exito"
            onClick={sortear}
            cargando={guardando}
            disabled={!puedeSortear}
            icono={<IconoDado />}
          >
            Sortear zonas
          </Button>
        </div>
      </div>

      {/* Por que no se puede sortear */}
      {!analisis.habilitado && analisis.motivo && (
        <Alerta tono="advertencia">{analisis.motivo}</Alerta>
      )}
      {excedeMaximo && (
        <Alerta tono="error">
          La categoría tiene un máximo de <strong>{categoria?.maximo_parejas}</strong> parejas y ya hay{' '}
          {parejas.length}. Corregí las inscripciones antes de sortear.
        </Alerta>
      )}
      {analisis.habilitado && (
        <Alerta tono="info">
          Listo para sortear: <strong>{analisis.habilitadas}</strong> parejas habilitadas →{' '}
          <strong>{analisis.zonasEstimadas}</strong> zonas
          {analisis.pendientes > 0 && (
            <>
              . Quedan afuera <strong>{analisis.pendientes}</strong> por pago pendiente.
            </>
          )}
          .
        </Alerta>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica etiqueta="Parejas" valor={parejas.length} />
        <Metrica etiqueta="Habilitadas" valor={resumen.habilitadas} tono="exito" />
        <Metrica
          etiqueta="Cobrado"
          valor={formatearMoneda(resumen.cobrado)}
          tono={resumen.falta === 0 ? 'exito' : 'neutro'}
        />
        <Metrica
          etiqueta="Falta cobrar"
          valor={formatearMoneda(resumen.falta)}
          tono={resumen.falta > 0 ? 'peligro' : 'exito'}
        />
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3">
          <Input
            placeholder="Buscar por nombre o teléfono…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="max-w-xs"
            aria-label="Buscar pareja"
          />
          <div className="flex gap-1.5">
            {(['todas', 'pagado', 'sena', 'pendiente'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroPago(f)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  filtroPago === f ? 'bg-cancha-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                ].join(' ')}
              >
                {f === 'todas' ? 'Todas' : ETIQUETA_PAGO[f]}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-500">
            {filtradas.length} de {parejas.length}
          </span>
        </div>

        {filtradas.length === 0 ? (
          <div className="p-6">
            <EstadoVacio
              titulo={parejas.length === 0 ? 'Todavía no hay parejas inscriptas' : 'Sin resultados'}
              descripcion={
                parejas.length === 0
                  ? 'Inscribí la primera pareja para empezar. Solo las parejas con pago confirmado entran al sorteo.'
                  : 'Ninguna pareja coincide con el filtro actual.'
              }
              accion={
                parejas.length === 0 ? (
                  <Button variante="primario" onClick={abrirAlta}>
                    Inscribir pareja
                  </Button>
                ) : undefined
              }
              icono={<IconoPersonas />}
            />
          </div>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Jugadores</Th>
                <Th>Teléfonos</Th>
                <Th alinear="centro">Pago</Th>
                <Th alinear="derecha">Abonado</Th>
                <Th alinear="derecha">Falta</Th>
                <Th>Restricción</Th>
                <Th alinear="derecha">Acciones</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((pareja, i) => {
                const saldo = Math.max(precio - pareja.monto_abonado, 0);
                return (
                  <tr key={pareja.id} className="transition hover:bg-slate-50/70">
                    <Td className="text-xs text-slate-400">{i + 1}</Td>
                    <Td>
                      <div className="font-medium text-slate-800">{pareja.j1_nombre}</div>
                      <div className="text-slate-500">{pareja.j2_nombre}</div>
                    </Td>
                    <Td className="text-xs text-slate-500">
                      <div>{pareja.j1_telefono}</div>
                      <div>{pareja.j2_telefono}</div>
                    </Td>
                    <Td alinear="centro">
                      <Badge tono={TONO_PAGO[pareja.estado_pago]} conPunto>
                        {ETIQUETA_PAGO[pareja.estado_pago]}
                      </Badge>
                    </Td>
                    <Td alinear="derecha" className="tabular-nums">
                      {formatearMoneda(pareja.monto_abonado)}
                    </Td>
                    <Td
                      alinear="derecha"
                      className={saldo > 0 ? 'tabular-nums font-medium text-red-600' : 'tabular-nums text-slate-400'}
                    >
                      {precio > 0 ? formatearMoneda(saldo) : '—'}
                    </Td>
                    <Td>
                      {pareja.restriccion_horaria ? (
                        <span
                          className="inline-block max-w-[16rem] truncate text-xs text-slate-500"
                          title={pareja.restriccion_horaria}
                        >
                          {pareja.restriccion_horaria}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </Td>
                    <Td alinear="derecha">
                      <div className="flex justify-end gap-1">
                        {/* Switch rápido de pago */}
                        <button
                          type="button"
                          onClick={() => void alternarPago(pareja)}
                          disabled={guardando}
                          title={pareja.estado_pago === 'pagado' ? 'Marcar como pendiente' : 'Marcar como pagado'}
                          className={[
                            'rounded-lg p-1.5 transition disabled:opacity-40',
                            pareja.estado_pago === 'pagado'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600',
                          ].join(' ')}
                        >
                          {pareja.estado_pago === 'pagado' ? <IconoCheck /> : <IconoReloj />}
                        </button>

                        <button
                          type="button"
                          onClick={() => abrirEdicion(pareja)}
                          className="rounded-lg bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                          title="Editar"
                        >
                          <IconoLápiz />
                        </button>

                        <button
                          type="button"
                          onClick={() => setPorBorrar(pareja)}
                          className="rounded-lg bg-slate-100 p-1.5 text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                          title="Eliminar"
                        >
                          <IconoTacho />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Card>

      {/* Modales */}
      <ParejaFormModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={guardar}
        categoria={categoria}
        pareja={editando}
        existentes={parejas}
      />

      <Modal
        abierto={Boolean(porBorrar)}
        onCerrar={() => setPorBorrar(null)}
        ancho="sm"
        titulo="Eliminar pareja"
        pie={
          <>
            <Button variante="fantasma" onClick={() => setPorBorrar(null)}>
              Cancelar
            </Button>
            <Button variante="peligro" onClick={confirmarBorrado} cargando={guardando}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          ¿Vas a eliminar a <strong>{porBorrar?.j1_nombre}</strong> y{' '}
          <strong>{porBorrar?.j2_nombre}</strong>?
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Si la pareja ya está sorteada, se la va a quitar de la zona junto con sus partidos.
        </p>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Piezas internas                                                              */
/* -------------------------------------------------------------------------- */

function Metrica({
  etiqueta,
  valor,
  tono = 'neutro',
}: {
  etiqueta: string;
  valor: number | string;
  tono?: 'neutro' | 'exito' | 'peligro';
}) {
  const clases = {
    neutro: 'text-slate-900',
    exito: 'text-emerald-600',
    peligro: 'text-red-600',
  }[tono];

  return (
    <Card className="p-3">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${clases}`}>{valor}</p>
    </Card>
  );
}

/* Iconos en linea para no depender de una libreria de iconos. */

function IconoMas() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconoDado() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function IconoLápiz() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49l2.65 2.65L8.6 18.05l-3.53.88.88-3.53L16.86 4.49z" />
    </svg>
  );
}

function IconoTacho() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.9 12.1a2 2 0 01-2 1.9H7.9a2 2 0 01-2-1.9L5 7m4 0V5a2 2 0 012-2h2a2 2 0 012 2v2m4 0H3" />
    </svg>
  );
}

function IconoRefrescar() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0113.7-5.7L20 8M20 14a8 8 0 01-13.7 5.7L4 16" />
    </svg>
  );
}

function IconoPersonas() {
  return (
    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 3.87V20m0-4a4 4 0 10-4-4 4 4 0 004 4m8-8a3 3 0 11-6 0 3 3 0 016 0" />
    </svg>
  );
}

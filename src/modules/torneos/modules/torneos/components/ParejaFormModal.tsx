/**
 * Formulario de alta / edicion de pareja.
 *
 * Se usa en dos modos:
 *  - Alta (`pareja` undefined): pregunta el precio de la categoria para
 *    prellenar el monto cuando la pareja paga.
 *  - Edicion: precarga los valores y solo manda lo que cambio.
 */

import { useEffect, useMemo, useState } from 'react';
import type { EstadoPago, Pareja, ParejaInput, TorneoCategoria } from '../types';
import { validarPareja, type ErroresCampo } from '../lib';
import { Button, Input, Modal, Select, Textarea } from './ui';

const ESTADOS: { value: EstadoPago; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'sena', label: 'Seña' },
  { value: 'pagado', label: 'Pagado' },
];

const VACIO: ParejaInput = {
  j1_nombre: '',
  j1_telefono: '',
  j2_nombre: '',
  j2_telefono: '',
  estado_pago: 'pendiente',
  monto_abonado: 0,
  restriccion_horaria: '',
  notas: '',
};

export interface ParejaFormModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onGuardar: (input: ParejaInput) => Promise<{ ok: boolean; error?: { mensaje: string } }>;
  categoria?: TorneoCategoria | null;
  /** Si se pasa, el modal edita en vez de crear. */
  pareja?: Pareja | null;
  /** Parejas ya cargadas, para avisar de posibles duplicados. */
  existentes?: Pareja[];
}

export function ParejaFormModal({
  abierto,
  onCerrar,
  onGuardar,
  categoria,
  pareja,
  existentes = [],
}: ParejaFormModalProps) {
  const editando = Boolean(pareja);
  const [form, setForm] = useState<ParejaInput>(VACIO);
  const [errores, setErrores] = useState<ErroresCampo>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const precio = categoria?.precio_inscripcion ?? 0;

  // Carga los valores cuando cambia el objetivo del modal.
  useEffect(() => {
    if (!abierto) return;
    if (pareja) {
      setForm({
        j1_nombre: pareja.j1_nombre,
        j1_telefono: pareja.j1_telefono,
        j2_nombre: pareja.j2_nombre,
        j2_telefono: pareja.j2_telefono,
        estado_pago: pareja.estado_pago,
        monto_abonado: pareja.monto_abonado,
        restriccion_horaria: pareja.restriccion_horaria ?? '',
        notas: pareja.notas ?? '',
      });
    } else {
      setForm({ ...VACIO, monto_abonado: 0 });
    }
    setErrores({});
    setErrorGeneral(null);
  }, [abierto, pareja]);

  /**
   * Detecta si alguno de los jugadores ya esta anotado en la categoria con
   * otro companion. No bloquea (en padel es legitimo jugar con alguien que ya
   * esta en otra pareja), pero avisar evita errores de mostrador.
   */
  const posibleDuplicado = useMemo(() => {
    const objetivo = pareja?.id;
    const normalizar = (s: string) => s.trim().toLowerCase();
    return existentes.some((otra) => {
      if (otra.id === objetivo) return false;
      const mismosNombres =
        (normalizar(otra.j1_nombre) === normalizar(form.j1_nombre) && normalizar(form.j1_nombre) !== '') ||
        (normalizar(otra.j1_nombre) === normalizar(form.j2_nombre) && normalizar(form.j1_nombre) !== '') ||
        (normalizar(otra.j2_nombre) === normalizar(form.j1_nombre) && normalizar(form.j2_nombre) !== '') ||
        (normalizar(otra.j2_nombre) === normalizar(form.j2_nombre) && normalizar(form.j2_nombre) !== '');
      const mismoTel =
        otra.j1_telefono === form.j1_telefono && form.j1_telefono !== '';
      return mismosNombres || mismoTel;
    });
  }, [existentes, form, pareja]);

  const set = <K extends keyof ParejaInput>(clave: K, valor: ParejaInput[K]) => {
    setForm((previo) => {
      const siguiente = { ...previo, [clave]: valor };
      // Al marcar "Pagado" sin monto, se completa con el precio de la categoría.
      if (clave === 'estado_pago' && valor === 'pagado' && previo.monto_abonado === 0 && precio > 0) {
        siguiente.monto_abonado = precio;
      }
      return siguiente;
    });
    // Limpia el error del campo apenas se toca.
    setErrores((previos) => {
      if (!previos[clave]) return previos;
      const copia = { ...previos };
      delete copia[clave];
      return copia;
    });
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const encontrados = validarPareja(form);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    setErrorGeneral(null);
    const r = await onGuardar(form);
    setEnviando(false);

    if (r.ok) onCerrar();
    else setErrorGeneral(r.error?.mensaje ?? 'No se pudo guardar la pareja.');
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="md"
      titulo={editando ? 'Editar pareja' : 'Inscribir pareja'}
      descripcion={
        categoria
          ? `${categoria.nombre} · inscripción ${formatearMoneda(precio)}`
          : 'Completá los datos de los dos jugadores.'
      }
      pie={
        <>
          <Button type="button" variante="fantasma" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-pareja" variante="primario" cargando={enviando}>
            {editando ? 'Guardar cambios' : 'Inscribir pareja'}
          </Button>
        </>
      }
    >
      <form id="form-pareja" onSubmit={enviar} className="space-y-5" noValidate>
        {errorGeneral && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">{errorGeneral}</div>
        )}

        {posibleDuplicado && !errores.j1_nombre && (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
            <strong>Atención:</strong> alguno de estos jugadores ya está anotado en la categoría. Revisá que no
            sea un error de tipeo.
          </div>
        )}

        {/* Jugador 1 */}
        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cancha-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cancha-100 text-[10px]">
              1
            </span>
            Jugador 1
          </legend>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Input
              label="Nombre y apellido"
              placeholder="Ana Gómez"
              requerido
              value={form.j1_nombre}
              onChange={(e) => set('j1_nombre', e.target.value)}
              error={errores.j1_nombre}
              maxLength={80}
              autoFocus
            />
            <Input
              label="Teléfono"
              placeholder="11 5555-1234"
              requerido
              inputMode="tel"
              value={form.j1_telefono}
              onChange={(e) => set('j1_telefono', e.target.value)}
              error={errores.j1_telefono}
            />
          </div>
        </fieldset>

        {/* Jugador 2 */}
        <fieldset className="space-y-3">
          <legend className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cancha-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cancha-100 text-[10px]">
              2
            </span>
            Jugador 2
          </legend>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Input
              label="Nombre y apellido"
              placeholder="Luis Pérez"
              requerido
              value={form.j2_nombre}
              onChange={(e) => set('j2_nombre', e.target.value)}
              error={errores.j2_nombre}
              maxLength={80}
            />
            <Input
              label="Teléfono"
              placeholder="11 5555-9876"
              requerido
              inputMode="tel"
              value={form.j2_telefono}
              onChange={(e) => set('j2_telefono', e.target.value)}
              error={errores.j2_telefono}
            />
          </div>
        </fieldset>

        {/* Pago */}
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pago de la inscripción
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Estado"
              value={form.estado_pago}
              onChange={(e) => set('estado_pago', e.target.value as EstadoPago)}
              error={errores.estado_pago}
              opciones={ESTADOS}
            />
            <Input
              label="Monto abonado"
              type="number"
              min={0}
              step={0.01}
              inputMode="decimal"
              value={form.monto_abonado}
              onChange={(e) => set('monto_abonado', Number(e.target.value))}
              error={errores.monto_abonado}
              ayuda={precio > 0 ? `Total: ${formatearMoneda(precio)}` : undefined}
            />
            <Input
              label="Falta"
              readOnly
              tabIndex={-1}
              className="bg-slate-50"
              value={formatearMoneda(Math.max(precio - form.monto_abonado, 0))}
            />
          </div>
        </fieldset>

        {/* Restricciones */}
        <fieldset className="space-y-3 border-t border-slate-100 pt-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Disponibilidad y notas
          </legend>
          <Textarea
            label="Restricción horaria"
            placeholder="Ej: no puede jugar antes de las 18 h, ni los domingos"
            ayuda="El cronograma tiene en cuenta este texto al asignar canchas. Opcional."
            value={form.restriccion_horaria ?? ''}
            onChange={(e) => set('restriccion_horaria', e.target.value)}
            error={errores.restriccion_horaria}
            maxLength={200}
            rows={2}
          />
          <Textarea
            label="Notas internas"
            placeholder="Ej: viene con raqueta de repuesto"
            value={form.notas ?? ''}
            onChange={(e) => set('notas', e.target.value)}
            maxLength={300}
            rows={2}
          />
        </fieldset>
      </form>
    </Modal>
  );
}

/** $ 12.000,00 — formato es-AR. */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(valor) ? valor : 0);
}

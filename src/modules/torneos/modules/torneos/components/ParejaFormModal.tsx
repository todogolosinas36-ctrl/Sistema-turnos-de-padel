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
import { useTorneo } from '../store/TorneoStore';
import { Input, Modal, Select, Spinner, Textarea } from './ui';

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
  const { torneo } = useTorneo();
  const editando = Boolean(pareja);
  const [form, setForm] = useState<ParejaInput>(VACIO);
  const [errores, setErrores] = useState<ErroresCampo>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  // Estado estructurado para las restricciones
  type RestriccionDia = { activo: boolean; regla: 'solo' | 'no_puede'; inicio: string; fin: string };
  const [restricciones, setRestricciones] = useState<Record<number, RestriccionDia>>({});

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
      // Inicializar vacio en edición a menos que lo querramos parsear,
      // pero por ahora es mejor que usen el input viejo si ya estaba,
      // o arranquen de cero. Si ya habia texto, lo ponemos en notas o algo?
      // Lo dejamos en el state pero el UI lo va a sobreescribir si lo tocan.
    } else {
      setForm({ ...VACIO, monto_abonado: 0 });
      setRestricciones({});
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

    // Construir string de restricciones
    const diasStr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const partesRestriccion: string[] = [];
    Object.entries(restricciones).forEach(([diaStr, r]) => {
      if (!r.activo) return;
      const diaNum = Number(diaStr);
      const nombreDia = diasStr[diaNum === 7 ? 0 : diaNum];
      if (r.inicio && r.fin) {
        const accion = r.regla === 'solo' ? 'solo puede' : 'no puede';
        partesRestriccion.push(`${nombreDia}: ${accion} de ${r.inicio} a ${r.fin} hs`);
      }
    });
    
    // Si editamos y ya habia una restriccion manual, la combinamos o reemplazamos
    let restriccionFinal = form.restriccion_horaria || '';
    if (partesRestriccion.length > 0) {
      restriccionFinal = partesRestriccion.join(' | ');
    }

    const payload = { ...form, restriccion_horaria: restriccionFinal };

    const encontrados = validarPareja(payload);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return;

    setEnviando(true);
    setErrorGeneral(null);
    const r = await onGuardar(payload);
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
            Disponibilidad horaria
          </legend>
          
          <div className="space-y-3">
            {torneo?.dias_juego.map(dia => {
              const r = restricciones[dia] || { activo: false, regla: 'no_puede', inicio: '', fin: '' };
              const diasStr = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
              
              return (
                <div key={dia} className={`rounded-xl border p-3 transition-colors ${r.activo ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50/50'}`}>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-sm text-slate-700">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                      checked={r.activo}
                      onChange={e => setRestricciones(prev => ({ ...prev, [dia]: { ...r, activo: e.target.checked } }))}
                    />
                    ¿Tiene restricción el {diasStr[dia]}?
                  </label>
                  
                  {r.activo && (
                    <div className="mt-3 pl-6 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <select 
                          className="h-9 rounded-lg border-slate-300 text-sm focus:border-amber-500 focus:ring-amber-200 bg-white"
                          value={r.regla}
                          onChange={e => setRestricciones(prev => ({ ...prev, [dia]: { ...r, regla: e.target.value as 'solo' | 'no_puede' } }))}
                        >
                          <option value="no_puede">No puede</option>
                          <option value="solo">Puede solo</option>
                        </select>
                        <span className="text-sm text-slate-500">de</span>
                        <input 
                          type="time" 
                          className="h-9 rounded-lg border-slate-300 text-sm focus:border-amber-500 focus:ring-amber-200 bg-white"
                          value={r.inicio}
                          onChange={e => setRestricciones(prev => ({ ...prev, [dia]: { ...r, inicio: e.target.value } }))}
                        />
                        <span className="text-sm text-slate-500">a</span>
                        <input 
                          type="time" 
                          className="h-9 rounded-lg border-slate-300 text-sm focus:border-amber-500 focus:ring-amber-200 bg-white"
                          value={r.fin}
                          onChange={e => setRestricciones(prev => ({ ...prev, [dia]: { ...r, fin: e.target.value } }))}
                        />
                      </div>
                      
                      <div className="flex gap-2 text-xs">
                        <button type="button" onClick={() => setRestricciones(prev => ({ ...prev, [dia]: { ...r, inicio: '09:00', fin: '13:00' } }))} className="px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 transition-colors">Mañana (09-13)</button>
                        <button type="button" onClick={() => setRestricciones(prev => ({ ...prev, [dia]: { ...r, inicio: '13:00', fin: '19:00' } }))} className="px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 transition-colors">Tarde (13-19)</button>
                        <button type="button" onClick={() => setRestricciones(prev => ({ ...prev, [dia]: { ...r, inicio: '19:00', fin: '23:30' } }))} className="px-2 py-1 bg-white border border-slate-200 rounded-md hover:bg-slate-50 text-slate-600 transition-colors">Noche (19-23:30)</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <Textarea
              label="Notas extras (opcional)"
              placeholder="Ej: viene con raqueta de repuesto"
              value={form.notas ?? ''}
              onChange={(e) => set('notas', e.target.value)}
              maxLength={300}
              rows={2}
            />
          </div>
        </fieldset>
        
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 mt-6 sticky bottom-0 bg-white shadow-[0_-10px_15px_-3px_rgba(255,255,255,0.9)] pb-2">
          <button type="button" onClick={onCerrar} disabled={enviando} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-70"
          >
            {enviando ? (
              <>
                <Spinner className="w-5 h-5 text-white" />
                Guardando...
              </>
            ) : (
              editando ? 'Guardar cambios' : 'Inscribir Pareja'
            )}
          </button>
        </div>
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

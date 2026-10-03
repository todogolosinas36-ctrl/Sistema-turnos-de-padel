/**
 * Primitivas de UI del modulo.
 *
 * Sin dependencias externas salvo `clsx` + `tailwind-merge`. Si tu sistema ya
 * tiene sus propios componentes (Button, Modal, Badge...), borra este archivo y
 * reexporta los tuyos: los componentes de torneo solo dependen de estas props.
 */

import {
  forwardRef,
  useEffect,
  useId as useReactId,
  useRef,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { clsx } from './clsx';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'exito';
type TamanoBoton = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  cargando?: boolean;
  icono?: ReactNode;
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-cancha-600 text-white hover:bg-cancha-700 focus-visible:ring-cancha-500',
  secundario: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-400',
  fantasma: 'bg-transparent text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400',
  peligro: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
  exito: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500',
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'secundario', tamano = 'md', cargando = false, icono, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...props}
    >
      {cargando ? <Spinner className="h-4 w-4" /> : icono}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

type TonoBadge = 'neutro' | 'exito' | 'advertencia' | 'peligro' | 'info' | 'cancha';

export interface BadgeProps {
  tono?: TonoBadge;
  children: ReactNode;
  className?: string;
  /** Punto de color a la izquierda (estilo "estado"). */
  conPunto?: boolean;
}

const TONOS: Record<TonoBadge, string> = {
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  exito: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  advertencia: 'bg-amber-50 text-amber-800 ring-amber-200',
  peligro: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  cancha: 'bg-cancha-50 text-cancha-800 ring-cancha-200',
};

const PUNTOS: Record<TonoBadge, string> = {
  neutro: 'bg-slate-400',
  exito: 'bg-emerald-500',
  advertencia: 'bg-amber-500',
  peligro: 'bg-red-500',
  info: 'bg-sky-500',
  cancha: 'bg-cancha-500',
};

export function Badge({ tono = 'neutro', children, className, conPunto = false }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONOS[tono],
        className,
      )}
    >
      {conPunto && <span className={clsx('h-1.5 w-1.5 rounded-full', PUNTOS[tono])} aria-hidden />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  titulo,
  descripcion,
  acciones,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 border-b border-slate-100 p-4', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900">{titulo}</h3>
        {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex shrink-0 items-center gap-2">{acciones}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Formularios                                                                 */
/* -------------------------------------------------------------------------- */

export interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  ayuda?: string;
  requerido?: boolean;
}

export const Input = forwardRef<HTMLInputElement, CampoProps>(function Input(
  { label, error, ayuda, requerido, className, id, ...props },
  ref,
) {
  const generado = useId(id);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={generado} className="mb-1 block text-xs font-medium text-slate-700">
          {label}
          {requerido && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={generado}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${generado}-error` : undefined}
        className={clsx(
          'h-10 w-full rounded-lg border px-3 text-sm outline-none transition',
          'placeholder:text-slate-400 focus:ring-2',
          error
            ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200'
            : 'border-slate-300 bg-white focus:border-cancha-500 focus:ring-cancha-200',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={`${generado}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>
      )}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  opciones: { value: string; label: string }[];
  placeholder?: string;
  ayuda?: string;
}

export function Select(props: SelectProps & { ayuda?: string }) {
  const { label, error, opciones, placeholder, ayuda, className, id, ...rest } = props;
  const generado = useId(id);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={generado} className="mb-1 block text-xs font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        id={generado}
        aria-invalid={Boolean(error)}
        className={clsx(
          'h-10 w-full rounded-lg border px-3 text-sm outline-none transition focus:ring-2',
          error
            ? 'border-red-300 bg-red-50 focus:ring-red-200'
            : 'border-slate-300 bg-white focus:border-cancha-500 focus:ring-cancha-200',
          className,
        )}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>
      )}
    </div>
  );
}
Select.displayName = 'Select';

export interface TextareaProps {
  label?: string;
  error?: string;
  className?: string;
  rows?: number;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  ayuda?: string;
  name?: string;
  maxLength?: number;
}

export function Textarea({ label, error, ayuda, className, rows = 2, ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && <label className="mb-1 block text-xs font-medium text-slate-700">{label}</label>}
      <textarea
        rows={rows}
        className={clsx(
          'w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:ring-2',
          error
            ? 'border-red-300 bg-red-50 focus:ring-red-200'
            : 'border-slate-300 bg-white focus:border-cancha-500 focus:ring-cancha-200',
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-slate-500">{ayuda}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
}

const ANCHOS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

export function Modal({ abierto, onCerrar, titulo, descripcion, children, pie, ancho = 'md' }: ModalProps) {
  const refPanel = useRef<HTMLDivElement>(null);

  // Escape cierra. El foco entra al panel al abrir.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', alPulsar);
    refPanel.current?.focus();
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, onCerrar]);

  // Bloquea el scroll del body mientras el modal esta abierto.
  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onCerrar}
        aria-hidden
      />
      <div
        ref={refPanel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={clsx(
          'relative my-8 w-full animate-slide-up rounded-xl bg-white shadow-2xl outline-none',
          ANCHOS[ancho],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descripcion && <p className="mt-1 text-sm text-slate-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[90vh] overflow-y-auto p-5">{children}</div>

        {pie && <div className="flex justify-end gap-2 border-t border-slate-100 p-5">{pie}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                    */
/* -------------------------------------------------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export type TonoAlerta = 'info' | 'exito' | 'advertencia' | 'error';

const ALERTAS: Record<TonoAlerta, { caja: string; icono: string }> = {
  info: { caja: 'bg-sky-50 text-sky-800 border-sky-200', icono: 'text-sky-500' },
  exito: { caja: 'bg-emerald-50 text-emerald-800 border-emerald-200', icono: 'text-emerald-500' },
  advertencia: { caja: 'bg-amber-50 text-amber-900 border-amber-200', icono: 'text-amber-500' },
  error: { caja: 'bg-red-50 text-red-800 border-red-200', icono: 'text-red-500' },
};

export function Alerta({
  tono = 'info',
  children,
  onCerrar,
  className,
}: {
  tono?: TonoAlerta;
  children: ReactNode;
  onCerrar?: () => void;
  className?: string;
}) {
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start gap-3 rounded-lg border p-3 text-sm animate-fade-in',
        ALERTAS[tono].caja,
        className,
      )}
    >
      <IconoAlerta tono={tono} />
      <div className="min-w-0 flex-1">{children}</div>
      {onCerrar && (
        <button type="button" onClick={onCerrar} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Cerrar">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function IconoAlerta({ tono }: { tono: TonoAlerta }) {
  const relleno =
    tono === 'exito' ? 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' : 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z';

  return (
    <svg
      className={clsx('h-5 w-5 shrink-0', ALERTAS[tono].icono)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={relleno} />
    </svg>
  );
}

export function EstadoVacio({
  titulo,
  descripcion,
  icono,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      {icono && <div className="text-slate-300">{icono}</div>}
      <div>
        <p className="text-sm font-medium text-slate-700">{titulo}</p>
        {descripcion && <p className="mt-1 max-w-sm text-xs text-slate-500">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades internas                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `useId` con id propio: si el componente recibe `id` explicito lo respeta,
 * y si no genera uno estable para asociar label / input / error.
 */
function useId(id?: string): string {
  const generado = useReactId();
  return id ?? generado;
}

/** Tabla responsive sin scroll horizontal en mobile. */
export function Tabla({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  alinear = 'izquierda',
  title,
}: {
  children?: ReactNode;
  className?: string;
  alinear?: 'izquierda' | 'centro' | 'derecha';
  /** Tooltip nativo: se usa para explicar las abreviaturas de la tabla. */
  title?: string;
}) {
  return (
    <th
      scope="col"
      title={title}
      className={clsx(
        'whitespace-nowrap bg-slate-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500',
        alinear === 'centro' && 'text-center',
        alinear === 'derecha' && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  alinear = 'izquierda',
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  alinear?: 'izquierda' | 'centro' | 'derecha';
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={clsx(
        'px-3 py-2.5 text-slate-700',
        alinear === 'centro' && 'text-center',
        alinear === 'derecha' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}

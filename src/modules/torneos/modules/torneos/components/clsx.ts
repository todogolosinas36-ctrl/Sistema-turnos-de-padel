/**
 * `clsx` sin dependencias externas + merge de clases de Tailwind.
 *
 * Implementacion minima equivalente a `clsx`/`tailwind-merge`, para que el
 * modulo no dependa de paquetes extra al integrarlo en tu proyecto. Si ya tenes
 * `clsx` y `tailwind-merge` instalados, podes reemplazar el cuerpo de este
 * archivo por `export { clsx } from 'clsx'` mas el merge.
 */

type Valor = string | number | null | undefined | false | Record<string, unknown> | Valor[];

function normalizar(valor: Valor): string {
  if (!valor) return '';

  if (typeof valor === 'string' || typeof valor === 'number') return String(valor);

  if (Array.isArray(valor)) return valor.map(normalizar).filter(Boolean).join(' ');

  if (typeof valor === 'object') {
    return Object.entries(valor)
      .filter(([, activo]) => Boolean(activo))
      .map(([clave]) => clave)
      .join(' ');
  }

  return '';
}

/**
 * Combina clases, resolviendo conflictos de Tailwind: la ultima gana.
 * `cn('p-2', 'p-4')` -> `'p-4'`.
 */
export function clsx(...entradas: Valor[]): string {
  const todas = entradas.flatMap((v) => normalizar(v).split(' ').filter(Boolean));

  // ultimasVencen: recorre de derecha a izquierda y conserva la primera
  // aparicion de cada grupo de utilidades.
  const grupos = new Map<string, string>();

  const prefijoDe = (clase: string): string => {
    // El prefijo es todo lo anterior al ultimo separador simple ("-"), sin
    // contar variantes con modificadores como "hover:" o "md:".
    const sinVariante = clase.includes(':') ? clase.slice(clase.lastIndexOf(':') + 1) : clase;
    const corte = sinVariante.lastIndexOf('-');
    return corte === -1 ? sinVariante : sinVariante.slice(0, corte + 1);
  };

  for (const clase of todas) {
    const prefijo = prefijoDe(clase);
    if (!grupos.has(prefijo)) grupos.set(prefijo, clase);
  }

  // Se reemiten en el orden original para no romper el cascado de Tailwind.
  return todas.filter((clase) => grupos.get(prefijoDe(clase)) === clase).join(' ');
}

export default clsx;

/**
 * Helper para cálculo y formateo de métodos de pago (incluyendo Pago Mixto)
 */

export function formatearMetodoPagoMixto(montos = {}) {
  const partes = [];
  const efec = Math.max(0, Math.round(Number(montos.efectivo) || 0));
  const transf = Math.max(0, Math.round(Number(montos.transferencia) || 0));
  const tarj = Math.max(0, Math.round(Number(montos.tarjeta) || 0));

  if (efec > 0) partes.push(`Efec: ${efec}`);
  if (transf > 0) partes.push(`Transf: ${transf}`);
  if (tarj > 0) partes.push(`Tarjeta: ${tarj}`);

  if (partes.length === 0) return 'mixto';
  return `Mixto - ${partes.join(', ')}`;
}

export function calcularTotalesMixtos(total, montos = {}) {
  const efec = Math.max(0, Number(montos.efectivo) || 0);
  const transf = Math.max(0, Number(montos.transferencia) || 0);
  const tarj = Math.max(0, Number(montos.tarjeta) || 0);
  const suma = Math.round(efec + transf + tarj);
  const totalRedondeado = Math.round(Number(total) || 0);
  const restante = totalRedondeado - suma;

  return {
    suma,
    restante,
    esExacto: restante === 0 && totalRedondeado > 0,
    esExcedido: restante < 0,
    esFaltante: restante > 0,
  };
}

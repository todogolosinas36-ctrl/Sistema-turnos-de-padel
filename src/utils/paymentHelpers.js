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

/**
 * Determina el precio base de la cancha para un turno específico garantizando
 * la Fuente de la Verdad (Supabase) y evitando cálculos globales o parpadeos.
 *
 * @param {Object} turno - Objeto del turno desde Supabase o creación
 * @param {number|null} precioBaseGlobal - Precio base general consolidado
 * @param {Object} [tarifasDinamicas] - Opcional: configuración de tarifas pico/valle
 */
export function resolverPrecioCancha(turno, precioBaseGlobal, tarifasDinamicas = null) {
  if (!turno) {
    return Number.isFinite(Number(precioBaseGlobal)) && Number(precioBaseGlobal) > 0
      ? Math.round(Number(precioBaseGlobal))
      : null;
  }

  // 1. Prioridad Absoluta (Fuente de la Verdad en Supabase):
  // Si el turno ya tiene un precio asignado en la base de datos, NUNCA se sobreescribe ni recalcula.
  const precioGuardado = Number(turno.total_base_cancha) || Number(turno.precio);
  if (Number.isFinite(precioGuardado) && precioGuardado > 0) {
    return Math.round(precioGuardado);
  }

  // 2. Si no hay precio base consolidado aún en la app ni en el turno, retornar null (permite mostrar skeleton)
  if (!Number.isFinite(Number(precioBaseGlobal)) || Number(precioBaseGlobal) <= 0) {
    return null;
  }

  const base = Math.round(Number(precioBaseGlobal));

  // 3. Lógica dinámica: Se calcula ÚNICAMENTE si se define tarifa diferencial y
  // usando ESTRICTAMENTE la hora del turno seleccionado (turno.hora_inicio), NUNCA fechas globales
  if (tarifasDinamicas && turno.hora_inicio) {
    const horaStr = String(turno.hora_inicio).substring(0, 5); // ej "19:00"
    const horaNum = parseInt(horaStr.split(':')[0], 10);
    if (tarifasDinamicas.horaInicioPico && horaNum >= tarifasDinamicas.horaInicioPico) {
      if (tarifasDinamicas.precioPico) return Math.round(Number(tarifasDinamicas.precioPico));
    }
  }

  return base;
}


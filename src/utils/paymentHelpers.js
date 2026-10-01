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
  const precioGuardado =
    Number(turno.total_base_cancha) ||
    Number(turno.precio_total) ||
    Number(turno.precio);
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

/**
 * Extrae y desglosa todos los consumos de cantina imputados a un turno,
 * tanto desde gastos compartidos (con tipo/origen 'cantina' o articuloId)
 * como desde consumos individuales de kiosco en detalle_cobro.
 *
 * @param {Object} turno - Objeto del turno
 * @returns {{ total: number, items: Array<{ id: any, articuloId: any, nombre: string, cantidad: number, precio: number, tipo: string, origen: string, jugador?: string }> }}
 */
export function obtenerConsumoCantinaTurno(turno) {
  if (!turno) return { total: 0, items: [] };

  let total = 0;
  const items = [];

  // 1. Gastos compartidos de cantina
  if (Array.isArray(turno.gastos_compartidos)) {
    for (const g of turno.gastos_compartidos) {
      const esCantina =
        g.tipo === 'cantina' ||
        g.origen === 'cantina' ||
        Boolean(g.articuloId) ||
        Boolean(g.articulo_id);

      if (esCantina) {
        const cantidad = Number(g.cantidad) || 1;
        const monto =
          Number(g.monto) ||
          (Number(g.precioUnitario || g.precio || 0) * cantidad) ||
          0;

        total += monto;
        items.push({
          id: g.id || g.articuloId || `gc-${Math.random()}`,
          articuloId: g.articuloId || g.articulo_id,
          nombre: g.concepto || g.nombre || 'Artículo de Cantina',
          cantidad,
          precio: monto,
          tipo: 'cantina',
          origen: 'gasto_compartido',
        });
      }
    }
  }

  // 2. Consumos individuales de kiosco en detalle_cobro
  if (Array.isArray(turno.detalle_cobro)) {
    for (const jug of turno.detalle_cobro) {
      if (Array.isArray(jug.items)) {
        for (const it of jug.items) {
          const cantidad = Number(it.cantidad) || 1;
          const precioUnit = Number(it.precio) || 0;
          const subtotal = Number(it.subtotal) || (precioUnit * cantidad);

          total += subtotal;
          items.push({
            id: it.id || it.articuloId || `it-${Math.random()}`,
            articuloId: it.articuloId || it.id,
            nombre: it.nombre || 'Artículo de Kiosco',
            cantidad,
            precio: subtotal,
            jugador: jug.nombre,
            tipo: 'cantina',
            origen: 'kiosco_jugador',
          });
        }
      }
    }
  }

  return { total: Math.round(total), items };
}

/**
 * Calcula el monto neto correspondiente exclusivamente al alquiler de la cancha,
 * separándolo de cualquier consumo de cantina o extras asociados al turno.
 *
 * @param {Object} turno - Objeto del turno
 * @param {number|null} precioBaseGlobal - Precio base general
 * @returns {number} Monto neto de alquiler de la cancha
 */
export function resolverMontoCanchaNeto(turno, precioBaseGlobal) {
  if (!turno) return 0;

  const baseGuardada = Number(turno.total_base_cancha);
  if (Number.isFinite(baseGuardada) && baseGuardada > 0) {
    return Math.round(baseGuardada);
  }

  const { total: cantinaTotal } = obtenerConsumoCantinaTurno(turno);
  const precioTotal = Number(turno.precio) || 0;

  if (precioTotal > 0) {
    const neto = precioTotal - cantinaTotal;
    return neto > 0 ? Math.round(neto) : (Number(precioBaseGlobal) || 0);
  }

  return Number.isFinite(Number(precioBaseGlobal)) && Number(precioBaseGlobal) > 0
    ? Math.round(Number(precioBaseGlobal))
    : 0;
}


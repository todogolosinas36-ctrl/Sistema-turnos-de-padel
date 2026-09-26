import { createContext, useContext, useState, useEffect } from 'react';

const TurnosContext = createContext();

export function TurnosProvider({ children }) {
  const [turnos, setTurnos] = useState(() => {
    try {
      const local = localStorage.getItem('puntoexe-turnos');
      return local ? JSON.parse(local) : [];
    } catch (e) {
      console.error('Error al leer turnos de localStorage:', e);
      return [];
    }
  });

  const [turnosFijos, setTurnosFijos] = useState(() => {
    try {
      const local = localStorage.getItem('puntoexe-turnos-fijos');
      return local ? JSON.parse(local) : [];
    } catch (e) {
      console.error('Error al leer turnos fijos de localStorage:', e);
      return [];
    }
  });

  // Efecto para persistir en localStorage cada vez que cambia 'turnos'
  useEffect(() => {
    localStorage.setItem('puntoexe-turnos', JSON.stringify(turnos));
  }, [turnos]);

  // Efecto para persistir en localStorage cada vez que cambia 'turnosFijos'
  useEffect(() => {
    localStorage.setItem('puntoexe-turnos-fijos', JSON.stringify(turnosFijos));
  }, [turnosFijos]);

  // Estado global para White-Label (Nombre del Complejo/Club)
  const [nombreClub, setNombreClubState] = useState(
    () => localStorage.getItem('2010-nombreClub') || 'Mi Complejo'
  );

  const setNombreClub = (nuevoNombre) => {
    setNombreClubState((prev) => {
      const valor = typeof nuevoNombre === 'function' ? nuevoNombre(prev) : nuevoNombre;
      try {
        localStorage.setItem('2010-nombreClub', valor);
      } catch (e) {
        console.error('Error al guardar nombreClub en localStorage:', e);
      }
      return valor;
    });
  };

  // Estado global para White-Label (Color de la Marca / Club)
  const [colorClub, setColorClubState] = useState(
    () => localStorage.getItem('2010-colorClub') || '#09090b'
  );

  const setColorClub = (nuevoColor) => {
    setColorClubState((prev) => {
      const valor = typeof nuevoColor === 'function' ? nuevoColor(prev) : nuevoColor;
      try {
        localStorage.setItem('2010-colorClub', valor);
      } catch (e) {
        console.error('Error al guardar colorClub en localStorage:', e);
      }
      return valor;
    });
  };

  // Tarifa base por turno ( configurable desde /admin/configuracion )
  const TARIFA_DEFAULT = 15000;

  const [precioBaseCancha, setPrecioBaseCanchaState] = useState(() => {
    try {
      const local = localStorage.getItem('puntoexe-precio-base');
      const n = Number(local);
      return Number.isFinite(n) && n > 0 ? n : TARIFA_DEFAULT;
    } catch (e) {
      console.error('Error al leer la tarifa base de localStorage:', e);
      return TARIFA_DEFAULT;
    }
  });

  const setPrecioBaseCancha = (nuevoPrecio) => {
    setPrecioBaseCanchaState((prev) => {
      const valor = typeof nuevoPrecio === 'function' ? nuevoPrecio(prev) : Number(nuevoPrecio);
      const sanitizado = Number.isFinite(valor) && valor > 0 ? Math.round(valor) : TARIFA_DEFAULT;
      try {
        localStorage.setItem('puntoexe-precio-base', String(sanitizado));
      } catch (e) {
        console.error('Error al guardar la tarifa base en localStorage:', e);
      }
      return sanitizado;
    });
  };

  // Función maestra: sincroniza turnos regulares y fijos para un día específico
  const obtenerTurnosDelDia = (fechaDate) => {
    if (!fechaDate) return [];

    let fechaStr = '';
    let dateObj;

    if (fechaDate instanceof Date) {
      dateObj = fechaDate;
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      fechaStr = `${yyyy}-${mm}-${dd}`;
    } else if (typeof fechaDate === 'string') {
      fechaStr = fechaDate;
      const [year, month, day] = fechaDate.split('-').map(Number);
      dateObj = new Date(year, month - 1, day, 12, 0, 0);
    } else {
      return [];
    }

    // a) Filtrar los turnos regulares que coincidan exactamente con la fecha solicitada
    const regulares = turnos.filter(
      (t) => t.fecha === fechaStr && t.estado !== 'cancelado'
    );

    // b) Obtener el día de la semana de fechaDate
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaSemana = dias[dateObj.getDay()];

    const normalizar = (texto) =>
      (texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    // c) Filtrar los turnosFijos que correspondan a ese día de la semana
    const fijosDelDia = turnosFijos.filter((tf) => {
      if (normalizar(tf.dia) !== normalizar(diaSemana) || tf.activo === false) {
        return false;
      }
      // Evitar duplicar si ya existe un turno regular registrado para esta fecha y horario
      const yaSobrescrito = regulares.some(
        (reg) =>
          reg.fijo_referencia_id === tf.id ||
          (reg.hora_inicio === tf.horario &&
            (reg.cancha_nombre === tf.cancha || reg.cancha === tf.cancha || reg.cancha_id === tf.cancha_id))
      );
      return !yaSobrescrito;
    });

    // d) Transformar los turnos fijos al mismo formato que los regulares
    const fijosTransformados = fijosDelDia.map((tf) => {
      const horarioInicio = tf.horario || '14:00';
      const [h, m] = horarioInicio.split(':').map(Number);
      const duracion = tf.duracion_minutos || tf.duracion || 120;
      const endMins = h * 60 + m + duracion;
      const hFin = Math.floor(endMins / 60).toString().padStart(2, '0');
      const mFin = (endMins % 60).toString().padStart(2, '0');

      const partesCliente = (tf.cliente || '').trim().split(' ');
      const cliente_nombre = partesCliente[0] || 'Abonado';
      const cliente_apellido = partesCliente.slice(1).join(' ') || '(Abono)';

      return {
        ...tf,
        id: `fijo-${tf.id}-${fechaStr}`,
        turno_fijo_id: tf.id,
        fecha: fechaStr,
        hora_inicio: horarioInicio,
        hora_fin: `${hFin}:${mFin}`,
        duracion_minutos: duracion,
        cancha_nombre: tf.cancha,
        cancha: tf.cancha,
        cancha_id: tf.cancha_id || (tf.cancha?.toLowerCase().includes('roja') ? 'roja' : 'verde'),
        cliente_nombre,
        cliente_apellido,
        cliente_telefono: tf.telefono || '',
        estado: 'fijo',
        esFijo: true,
        origen: 'fijo',
      };
    });

    // e) Retornar un array único (la suma de los regulares + los fijos transformados)
    return [...regulares, ...fijosTransformados];
  };

  // Agregar turno regular
  const agregarTurno = (nuevoTurno) => {
    const turnoInsertado = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      token_cancelacion: crypto.randomUUID(),
      ...nuevoTurno,
    };
    setTurnos((prev) => [...prev, turnoInsertado]);
    return turnoInsertado;
  };

  // Cambiar estado de un turno.
  // `extra` permite adjuntar datos del cobro (precio real, split payment, etc.)
  const cambiarEstado = (id, nuevoEstado, extra = {}) => {
    if (typeof id === 'string' && id.startsWith('fijo-')) {
      const partes = id.split('-');
      const fechaStr = partes.slice(2).join('-');
      const fijoId = Number(partes[1]) || partes[1];
      const tfOriginal = turnosFijos.find((tf) => String(tf.id) === String(fijoId));

      if (tfOriginal) {
        const [h, m] = (tfOriginal.horario || '14:00').split(':').map(Number);
        const duracion = tfOriginal.duracion_minutos || tfOriginal.duracion || 120;
        const endMins = h * 60 + m + duracion;
        const hFin = Math.floor(endMins / 60).toString().padStart(2, '0');
        const mFin = (endMins % 60).toString().padStart(2, '0');
        const partesCliente = (tfOriginal.cliente || '').trim().split(' ');

        const turnoRegularOverride = {
          id: crypto.randomUUID(),
          fijo_referencia_id: tfOriginal.id,
          fecha: fechaStr,
          hora_inicio: tfOriginal.horario,
          hora_fin: `${hFin}:${mFin}`,
          duracion_minutos: duracion,
          cancha_nombre: tfOriginal.cancha,
          cancha: tfOriginal.cancha,
          cancha_id: tfOriginal.cancha_id || (tfOriginal.cancha?.toLowerCase().includes('roja') ? 'roja' : 'verde'),
          cliente_nombre: partesCliente[0] || 'Abonado',
          cliente_apellido: partesCliente.slice(1).join(' ') || '(Abono)',
          cliente_telefono: tfOriginal.telefono || '',
          estado: nuevoEstado,
          esFijo: true,
          ...extra,
        };

        setTurnos((prev) => [...prev, turnoRegularOverride]);
        return;
      }
    }

    setTurnos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, estado: nuevoEstado, ...extra } : t))
    );
  };

  // Eliminar un turno definitivamente
  const eliminarTurno = (id) => {
    setTurnos((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <TurnosContext.Provider
      value={{
        turnos,
        agregarTurno,
        cambiarEstado,
        eliminarTurno,
        turnosFijos,
        setTurnosFijos,
        obtenerTurnosDelDia,
        nombreClub,
        setNombreClub,
        actualizarNombreClub: setNombreClub,
        colorClub,
        setColorClub,
        actualizarColorClub: setColorClub,
        precioBaseCancha,
        setPrecioBaseCancha,
        actualizarPrecioBaseCancha: setPrecioBaseCancha,
      }}
    >
      {children}
    </TurnosContext.Provider>
  );
}

export function useTurnos() {
  const context = useContext(TurnosContext);
  if (!context) {
    throw new Error('useTurnos debe ser usado dentro de un TurnosProvider');
  }
  return context;
}

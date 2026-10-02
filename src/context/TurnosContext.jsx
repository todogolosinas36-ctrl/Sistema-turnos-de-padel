import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { clasificarErrorSupabase } from '../lib/erroresSupabase';
import { normalizarHora } from '../utils/dateHelpers';
import { capitalizarPalabras, generarCodigoCorto } from '../utils/formatters';

const TurnosContext = createContext();

const LS_TURNOS = 'puntoexe-turnos';
const LS_TURNOS_FIJOS = 'puntoexe-turnos-fijos';
const LS_NOMBRE_CLUB = '2010-nombreClub';
const LS_COLOR_CLUB = '2010-colorClub';
const LS_PRECIO_BASE = 'puntoexe-precio-base';
const LS_MANANA = 'puntoexe-manana';
const LS_DIAS_ANTICIPACION = 'puntoexe-dias-anticipacion';

const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

/* ══════════════════════════════════════════════════════════════════════════
   Helpers de localStorage
   ══════════════════════════════════════════════════════════════════════════ */
const leerLS = (clave, porDefecto) => {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto === null ? porDefecto : JSON.parse(bruto);
  } catch (e) {
    console.error(`Error al leer ${clave} de localStorage:`, e);
    return porDefecto;
  }
};

const escribirLS = (clave, valor) => {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    console.error(`Error al guardar ${clave} en localStorage:`, e);
  }
};

/* ══════════════════════════════════════════════════════════════════════════
   Normalizadores: la app trabaja con "HH:mm" y la base con "HH:MM:SS"
   ══════════════════════════════════════════════════════════════════════════ */

/** Un turno tal como lo consume la UI. */
const normalizarTurno = (t) => {
  if (!t) return null;
  const hora_inicio = normalizarHora(t.hora_inicio ?? t.horaInicio ?? t.horario);
  const duracion = Number(t.duracion_minutos) || Number(t.duracion) || 90;
  const hora_fin_crudo = normalizarHora(t.hora_fin ?? t.horaFin);

  return {
    ...t,
    hora_inicio,
    hora_fin: hora_fin_crudo || (hora_inicio ? sumarMinutos(hora_inicio, duracion) : ''),
    duracion_minutos: duracion,
    estado: t.estado || 'confirmado',
    origen: t.origen || 'admin',
    es_fijo: Boolean(t.es_fijo ?? t.esFijo),
    gastos_compartidos: t.gastos_compartidos || [],
  };
};

/** Un abono tal como lo consume la UI (agrega los alias que usa el código). */
const normalizarFijo = (tf) => {
  if (!tf) return null;
  const horario = normalizarHora(tf.hora_inicio ?? tf.horario);
  const duracion = Number(tf.duracion_minutos) || Number(tf.duracion) || 120;
  return {
    ...tf,
    horario,
    hora_inicio: horario,
    duracion,
    duracion_minutos: duracion,
    hora_fin: sumarMinutos(horario, duracion),
    cancha: tf.cancha || '',
    telefono: tf.telefono || '',
    activo: tf.activo !== false,
  };
};

function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + Number(minutos);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Sólo los campos que existen en la tabla `turnos`. */
const camposTurno = (t) => ({
  cancha_id: t.cancha_id || null,
  fecha: t.fecha,
  hora_inicio: t.hora_inicio,
  hora_fin: t.hora_fin || null,
  duracion_minutos: Number(t.duracion_minutos) || 90,
  cliente_nombre: capitalizarPalabras(t.cliente_nombre) || '',
  cliente_apellido: capitalizarPalabras(t.cliente_apellido) || '',
  cliente_telefono: t.cliente_telefono || '',
  estado: t.estado || 'confirmado',
  origen: t.origen || 'admin',
  es_fijo: Boolean(t.es_fijo),
  notas: t.notas || null,
  token_cancelacion: t.token_cancelacion || crypto.randomUUID(),
  codigo_cancelacion: t.codigo_cancelacion || null,
  motivo_cancelacion: t.motivo_cancelacion || null,
  cancelado_el: t.cancelado_el || null,
  turno_fijo_id: t.turno_fijo_id || null,
  precio: t.precio !== undefined ? t.precio : null,
  total_base_cancha: t.total_base_cancha !== undefined ? t.total_base_cancha : null,
  gastos_compartidos: t.gastos_compartidos || [],
  detalle_cobro: t.detalle_cobro || null,
});

/* ══════════════════════════════════════════════════════════════════════════
   Provider
   ══════════════════════════════════════════════════════════════════════════ */
export function TurnosProvider({ children }) {
  /* ─── Datos de negocio (Supabase, con respaldo en localStorage) ─── */
  const [canchas, setCanchas] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  // Si una consulta a Supabase falla (tabla inexistente, sin red, RLS),
  // la app sigue funcionando contra localStorage en vez de romperse.
  // `falla` guarda el motivo para poder explicárselo al operador.
  const [falla, setFalla] = useState(null);
  const modoLocal = falla !== null;

  /* ─── Configuración (preferencias del dispositivo → localStorage) ─── */
  const [nombreClub, setNombreClubState] = useState(() => {
    const guardado = localStorage.getItem(LS_NOMBRE_CLUB);
    if (guardado && guardado !== 'Mi Complejo') return guardado;
    const envVal = import.meta.env.VITE_NOMBRE_COMPLEJO?.replace(/^"|"$/g, '');
    return envVal ? `${envVal} PÁDEL` : '20/10 PÁDEL';
  });
  const [colorClub, setColorClubState] = useState(
    () => localStorage.getItem(LS_COLOR_CLUB) || '#09090b'
  );
  // Fuente de la verdad: iniciamos en null si no hay valor local para que la UI muestre
  // skeleton/cargando en vez de un valor falso hardcodeado
  const [precioBaseCancha, setPrecioBaseCanchaState] = useState(() => {
    const n = Number(localStorage.getItem(LS_PRECIO_BASE));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  // Antes se leía a nivel de módulo (una sola vez al cargar el bundle), por
  // lo que cambiar el toggle exigía recargar la página con F5.
  const [incluyeManana, setIncluyeMananaState] = useState(
    () => localStorage.getItem(LS_MANANA) === 'true'
  );

  const setNombreClub = useCallback((nuevo) => {
    setNombreClubState((prev) => {
      const valor = typeof nuevo === 'function' ? nuevo(prev) : nuevo;
      localStorage.setItem(LS_NOMBRE_CLUB, valor);
      return valor;
    });
  }, []);

  const setColorClub = useCallback((nuevo) => {
    setColorClubState((prev) => {
      const valor = typeof nuevo === 'function' ? nuevo(prev) : nuevo;
      localStorage.setItem(LS_COLOR_CLUB, valor);
      return valor;
    });
  }, []);

  const setPrecioBaseCancha = useCallback((nuevo) => {
    setPrecioBaseCanchaState((prev) => {
      const bruto = typeof nuevo === 'function' ? nuevo(prev) : Number(nuevo);
      const valor = Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto) : null;
      if (valor !== null) {
        localStorage.setItem(LS_PRECIO_BASE, String(valor));
      } else {
        localStorage.removeItem(LS_PRECIO_BASE);
      }
      return valor;
    });
  }, []);

  const setIncluyeManana = useCallback((nuevo) => {
    setIncluyeMananaState((prev) => {
      const valor = typeof nuevo === 'function' ? nuevo(prev) : Boolean(nuevo);
      localStorage.setItem(LS_MANANA, String(valor));
      return valor;
    });
  }, []);

  const [diasVisibles, setDiasVisiblesState] = useState(() => {
    const n = Number(localStorage.getItem(LS_DIAS_ANTICIPACION));
    return Number.isFinite(n) && n > 0 ? n : 7;
  });

  const setDiasVisibles = useCallback((nuevo) => {
    setDiasVisiblesState((prev) => {
      const bruto = typeof nuevo === 'function' ? nuevo(prev) : Number(nuevo);
      const valor = Number.isFinite(bruto) && bruto > 0 ? Math.round(bruto) : 7;
      localStorage.setItem(LS_DIAS_ANTICIPACION, String(valor));
      return valor;
    });
  }, []);

  /* ─── Carga inicial ─── */
  const cargarDatos = useCallback(async () => {
    setLoading(true);

    const [resCanchas, resTurnos, resFijos, resConfig] = await Promise.all([
      supabase.from('canchas').select('*').order('orden'),
      supabase.from('turnos').select('*'),
      supabase.from('turnos_fijos').select('*'),
      supabase.from('configuracion').select('precio_base').eq('id', 1).maybeSingle(),
    ]);

    // Sincronización Global de tarifa desde Supabase (tabla configuracion)
    if (!resConfig?.error && resConfig?.data && Number.isFinite(Number(resConfig.data.precio_base)) && Number(resConfig.data.precio_base) > 0) {
      const precioSupabase = Number(resConfig.data.precio_base);
      setPrecioBaseCanchaState(precioSupabase);
      localStorage.setItem(LS_PRECIO_BASE, String(precioSupabase));
    }

    if (resCanchas.error) {
      console.error('[Turnos] No se pudieron leer las canchas:', resCanchas.error.message);
      setFalla(clasificarErrorSupabase(resCanchas.error));
    } else if (resCanchas.data?.length) {
      setCanchas(resCanchas.data);
    }

    if (resTurnos.error) {
      console.warn('[Turnos] Supabase no disponible, se usará el almacenamiento local:', resTurnos.error.message);
      setFalla(clasificarErrorSupabase(resTurnos.error));
      setTurnos(leerLS(LS_TURNOS, []).map(normalizarTurno).filter(Boolean));
    } else {
      const turnosNormalizados = (resTurnos.data || []).map(normalizarTurno).filter(Boolean);
      setTurnos(turnosNormalizados);
    }

    if (resFijos.error) {
      // `turnos_fijos` es nueva: hasta que se corra schema.sql se usa local.
      if (!resTurnos.error) {
        console.info('[Turnos] Tabla turnos_fijos ausente; usando localStorage.');
        setFalla((prev) => prev || clasificarErrorSupabase(resFijos.error));
      }
      setTurnosFijos(leerLS(LS_TURNOS_FIJOS, []).map(normalizarFijo).filter(Boolean));
    } else {
      setTurnosFijos((resFijos.data || []).map(normalizarFijo).filter(Boolean));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();

    // Sincronización Realtime (Postgres Changes) sin recargar
    const turnosChannel = supabase.channel('realtime-turnos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'turnos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTurnos(prev => {
              if (prev.some(t => t.id === payload.new.id)) return prev;
              return [...prev, normalizarTurno(payload.new)];
            });
          } else if (payload.eventType === 'DELETE') {
            setTurnos(prev => prev.filter(t => t.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            const estado = payload.new?.estado?.toLowerCase();
            if (estado === 'cancelado') {
              setTurnos(prev => prev.filter(t => t.id !== payload.new.id));
            } else {
              setTurnos(prev => {
                if (prev.some(t => t.id === payload.new.id)) {
                  return prev.map(t => t.id === payload.new.id ? normalizarTurno(payload.new) : t);
                }
                return [...prev, normalizarTurno(payload.new)];
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(turnosChannel);
    };
  }, [cargarDatos]);

  // Espejo en localStorage: red de seguridad si la base no está disponible.
  useEffect(() => {
    if (modoLocal) escribirLS(LS_TURNOS, turnos);
  }, [turnos, modoLocal]);

  useEffect(() => {
    if (modoLocal) escribirLS(LS_TURNOS_FIJOS, turnosFijos);
  }, [turnosFijos, modoLocal]);

  /* ══════════════════════════════════════════════════════════════════════
     Turnos
     ══════════════════════════════════════════════════════════════════════ */

  /**
   * Inserta un turno. Devuelve la fila creada (con `id` y `token_cancelacion`)
   * para que la UI pueda navegar o mostrar el link de cancelación.
   */
  const agregarTurno = useCallback(
    async (nuevoTurno) => {
      const payload = {
        ...camposTurno(nuevoTurno),
        token_cancelacion: nuevoTurno.token_cancelacion || crypto.randomUUID(),
        codigo_cancelacion: nuevoTurno.codigo_cancelacion || generarCodigoCorto(),
      };

      let fila;
      if (modoLocal) {
        fila = { ...payload, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
      } else {
        const { data, error } = await supabase
          .from('turnos')
          .insert([payload])
          .select()
          .single();
        if (error) {
          console.error('[Turnos] No se pudo crear el turno:', error.message);
          setFalla((prev) => prev || clasificarErrorSupabase(error));
          fila = { ...payload, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
        } else {
          fila = data;
        }
      }

      setTurnos((prev) => [...prev, normalizarTurno(fila)]);
      return fila;
    },
    [modoLocal]
  );

  const cambiarEstado = useCallback(
    async (id, nuevoEstado, extra = {}) => {
      /* Un abono no se persiste: se "materializa" como un turno regular de esa
         fecha, para que el cobro y la caja lo treaten igual que a cualquier otro.
         El idEncoding va con "::" porque los uuid contienen guiones y un
         `split('-')` los rompía. */
      if (typeof id === 'string' && id.startsWith('fijo::')) {
        const [, abonoId, fechaISO] = id.split('::');
        const abono = turnosFijos.find((tf) => String(tf.id) === String(abonoId));

        if (abono) {
          const partesCliente = (abono.cliente || '').trim().split(' ');
          const tokenCancelacion = abono.token_cancelacion || crypto.randomUUID();
          const override = {
            ...camposTurno({
              ...abono,
              fecha: fechaISO,
              cliente_nombre: partesCliente[0] || 'Abonado',
              cliente_apellido: partesCliente.slice(1).join(' ') || '(Abono)',
              cliente_telefono: '',
              estado: nuevoEstado,
              es_fijo: true,
              turno_fijo_id: abono.id,
              origen: 'admin',
              token_cancelacion: tokenCancelacion,
            }),
            token_cancelacion: tokenCancelacion,
            ...extra,
          };

          let fila;
          if (modoLocal) {
            fila = { ...override, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
          } else {
            const { data, error } = await supabase
              .from('turnos')
              .insert([override])
              .select()
              .single();
            if (error) {
              console.error('[Turnos] No se pudo materializar el abono:', error.message);
              setFalla((prev) => prev || clasificarErrorSupabase(error));
              fila = { ...override, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
            } else {
              fila = data;
            }
          }

          setTurnos((prev) => [...prev, normalizarTurno(fila)]);
          return fila;
        }
      }

      if (modoLocal) {
        setTurnos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, estado: nuevoEstado, ...extra } : t))
        );
        return null;
      }

      // Para turnos ya existentes, usamos estrictamente .update().eq('id', id)
      // para que Supabase solo modifique las columnas deseadas sin exigir campos de inserción
      const datosAActualizar = {
        estado: nuevoEstado,
        ...extra,
      };

      if ('token_cancelacion' in datosAActualizar && !datosAActualizar.token_cancelacion) {
        delete datosAActualizar.token_cancelacion;
      }

      const { data, error } = await supabase
        .from('turnos')
        .update(datosAActualizar)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[Turnos] No se pudo actualizar el turno:', error.message);
        setFalla((prev) => prev || clasificarErrorSupabase(error));
        setTurnos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, estado: nuevoEstado, ...extra } : t))
        );
        return null;
      }

      console.log('✅ [Supabase] Turno actualizado/cancelado con éxito:', data);
      if (data) setTurnos((prev) => prev.map((t) => (t.id === id ? normalizarTurno(data) : t)));
      return data;
    },
    [modoLocal, turnosFijos]
  );

  const actualizarTurno = useCallback(
    async (id, campos = {}) => {
      if (typeof id === 'string' && id.startsWith('fijo::')) {
        const [, abonoId, fechaISO] = id.split('::');
        const abono = turnosFijos.find((tf) => String(tf.id) === String(abonoId));

        if (abono) {
          const partesCliente = (abono.cliente || '').trim().split(' ');
          const tokenCancelacion = abono.token_cancelacion || crypto.randomUUID();
          const override = {
            ...camposTurno({
              ...abono,
              fecha: fechaISO,
              cliente_nombre: partesCliente[0] || 'Abonado',
              cliente_apellido: partesCliente.slice(1).join(' ') || '(Abono)',
              cliente_telefono: '',
              estado: 'confirmado',
              es_fijo: true,
              turno_fijo_id: abono.id,
              origen: 'admin',
              token_cancelacion: tokenCancelacion,
            }),
            token_cancelacion: tokenCancelacion,
            ...campos,
          };

          let fila;
          if (modoLocal) {
            fila = { ...override, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
          } else {
            const { data, error } = await supabase
              .from('turnos')
              .insert([override])
              .select()
              .single();
            if (error) {
              console.error('[Turnos] No se pudo materializar el abono para actualizar:', error.message);
              setFalla((prev) => prev || clasificarErrorSupabase(error));
              fila = { ...override, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
            } else {
              fila = data;
            }
          }

          setTurnos((prev) => [...prev, normalizarTurno(fila)]);
          return fila;
        }
      }

      if (modoLocal) {
        setTurnos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...campos } : t))
        );
        return null;
      }

      const datosAActualizar = { ...campos };
      if ('token_cancelacion' in datosAActualizar && !datosAActualizar.token_cancelacion) {
        delete datosAActualizar.token_cancelacion;
      }

      const { data, error } = await supabase
        .from('turnos')
        .update(datosAActualizar)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[Turnos] No se pudo actualizar el turno:', error.message);
        setFalla((prev) => prev || clasificarErrorSupabase(error));
        setTurnos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...campos } : t))
        );
        return null;
      }

      if (data) {
        setTurnos((prev) => prev.map((t) => (t.id === id ? normalizarTurno(data) : t)));
      }
      return data;
    },
    [modoLocal, turnosFijos]
  );

  const eliminarTurno = useCallback(
    async (id) => {
      if (!modoLocal) {
        const { data, error } = await supabase.from('turnos').delete().eq('id', id).select();
        if (error) {
          console.error('[Turnos] No se pudo eliminar el turno:', error.message);
          setFalla((prev) => prev || clasificarErrorSupabase(error));
        } else {
          console.log('✅ [Supabase] Turno eliminado con éxito:', data);
        }
      }
      setTurnos((prev) => prev.filter((t) => t.id !== id));
    },
    [modoLocal]
  );

  /* ══════════════════════════════════════════════════════════════════════
     Turnos fijos (abonos)
     ══════════════════════════════════════════════════════════════════════ */

  const agregarTurnoFijo = useCallback(
    async (datos) => {
      const payload = {
        dia: datos.dia,
        hora_inicio: datos.horario || datos.hora_inicio,
        duracion_minutos: Number(datos.duracion) || Number(datos.duracion_minutos) || 120,
        cancha_id: datos.cancha_id,
        cliente: capitalizarPalabras(datos.cliente || ''),
        telefono: (datos.telefono || '').trim() || null,
        activo: datos.activo !== false,
        notas: datos.notas || null,
      };

      let fila;
      if (modoLocal) {
        fila = { ...payload, id: datos.id || crypto.randomUUID(), creado_el: new Date().toISOString() };
      } else {
        const { data, error } = await supabase
          .from('turnos_fijos')
          .insert([payload])
          .select()
          .single();
        if (error) {
          console.error('[Turnos] No se pudo crear el abono:', error.message);
          setFalla((prev) => prev || clasificarErrorSupabase(error));
          fila = { ...payload, id: crypto.randomUUID(), creado_el: new Date().toISOString() };
        } else {
          fila = data;
        }
      }

      // El nombre de la cancha no está en la tabla (es una FK), pero la UI lo
      // muestra en varios lados: se resuelve acá.
      const conNombre = {
        ...normalizarFijo(fila),
        cancha: canchas.find((c) => c.id === fila.cancha_id)?.nombre || datos.cancha || '',
      };
      setTurnosFijos((prev) => [...prev, conNombre]);
      return conNombre;
    },
    [modoLocal, canchas]
  );

  const actualizarTurnoFijo = useCallback(
    async (id, cambios) => {
      const actual = turnosFijos.find((tf) => String(tf.id) === String(id));
      const payload = {};
      if (cambios.activo !== undefined) payload.activo = Boolean(cambios.activo);
      if (cambios.dia !== undefined) payload.dia = cambios.dia;
      if (cambios.horario !== undefined) payload.hora_inicio = cambios.horario;
      if (cambios.duracion !== undefined) payload.duracion_minutos = Number(cambios.duracion);
      if (cambios.cancha_id !== undefined) payload.cancha_id = cambios.cancha_id;
      if (cambios.cliente !== undefined) payload.cliente = capitalizarPalabras(cambios.cliente);
      if (cambios.telefono !== undefined) payload.telefono = cambios.telefono.trim() || null;

      if (!modoLocal && Object.keys(payload).length > 0) {
        const { error } = await supabase.from('turnos_fijos').update(payload).eq('id', id);
        if (error) {
          console.error('[Turnos] No se pudo actualizar el abono:', error.message);
          setFalla((prev) => prev || clasificarErrorSupabase(error));
        }
      }

      const nombreCancha =
        cambios.cancha_id !== undefined
          ? canchas.find((c) => c.id === cambios.cancha_id)?.nombre || ''
          : actual?.cancha;

      setTurnosFijos((prev) =>
        prev.map((tf) => (String(tf.id) === String(id) ? { ...tf, ...cambios, cancha: nombreCancha } : tf))
      );
    },
    [modoLocal, turnosFijos, canchas]
  );

  const eliminarTurnoFijo = useCallback(
    async (id) => {
      if (!modoLocal) {
        const { error } = await supabase.from('turnos_fijos').delete().eq('id', id);
        if (error) {
          console.error('[Turnos] No se pudo eliminar el abono:', error.message);
          setFalla((prev) => prev || clasificarErrorSupabase(error));
        }
      }
      setTurnosFijos((prev) => prev.filter((t) => String(t.id) !== String(id)));
    },
    [modoLocal]
  );

  const actualizarCancha = useCallback(
    async (id, cambios) => {
      // Actualización optimista inmediata en la UI
      setCanchas((prev) => prev.map((c) => (c.id === id ? { ...c, ...cambios } : c)));

      if (modoLocal) {
        return { id, ...cambios };
      }

      const { data, error } = await supabase
        .from('canchas')
        .update(cambios)
        .eq('id', id)
        .select();
      
      if (error) {
        console.error('[Turnos] Error al actualizar cancha:', error.message);
        throw error;
      }
      
      if (data && data.length > 0) {
        setCanchas((prev) => prev.map((c) => (c.id === id ? { ...c, ...data[0] } : c)));
        return data[0];
      }
      return { id, ...cambios };
    },
    [modoLocal]
  );

  /* ══════════════════════════════════════════════════════════════════════
     Derivados
     ══════════════════════════════════════════════════════════════════════ */

  const canchasActivas = canchas.filter((c) => c.activa !== false);

  const nombreCancha = useCallback(
    (canchaId) => canchas.find((c) => c.id === canchaId)?.nombre || '',
    [canchas]
  );

  /**
   * Reúne los turnos regulares del día con los abonos que caen ese día de la
   * semana, omitiendo los abonos ya sobreescritos por un turno real.
   */
  const obtenerTurnosDelDia = useCallback(
    (fechaDate) => {
      if (!fechaDate) return [];

      let fechaStr = '';
      let dateObj;

      if (fechaDate instanceof Date) {
        dateObj = fechaDate;
        fechaStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      } else if (typeof fechaDate === 'string') {
        fechaStr = fechaDate;
        const [y, m, d] = fechaDate.split('-').map(Number);
        dateObj = new Date(y, m - 1, d, 12, 0, 0);
      } else {
        return [];
      }

      const regulares = turnos.filter((t) => t.fecha === fechaStr && t.estado !== 'cancelado');

      // getDay(): 0 = domingo. La lista arranca en lunes.
      const diaSemana = DIAS_SEMANA[(dateObj.getDay() + 6) % 7];

      const normalizar = (txt) =>
        (txt || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();

      const fijosDelDia = turnosFijos.filter((tf) => {
        if (normalizar(tf.dia) !== normalizar(diaSemana) || tf.activo === false) return false;

        // Si ya hay un turno real para ese abono, el turno real manda.
        return !regulares.some(
          (reg) =>
            reg.turno_fijo_id === tf.id ||
            (reg.hora_inicio === tf.horario &&
              (reg.cancha_id === tf.cancha_id ||
                (!!reg.cancha_nombre && reg.cancha_nombre === tf.cancha)))
        );
      });

      const fijosTransformados = fijosDelDia.map((tf) => {
        const partesCliente = (tf.cliente || '').trim().split(' ');
        return {
          ...tf,
          id: `fijo::${tf.id}::${fechaStr}`,
          turno_fijo_id: tf.id,
          fecha: fechaStr,
          hora_inicio: tf.horario,
          hora_fin: tf.hora_fin,
          duracion_minutos: tf.duracion,
          cancha_id: tf.cancha_id,
          cancha: tf.cancha,
          cancha_nombre: tf.cancha,
          cliente_nombre: partesCliente[0] || 'Abonado',
          cliente_apellido: partesCliente.slice(1).join(' ') || '(Abono)',
          cliente_telefono: tf.telefono || '',
          estado: 'confirmado',
          es_fijo: true,
          origen: 'admin',
        };
      });

      return [...regulares, ...fijosTransformados];
    },
    [turnos, turnosFijos]
  );

  return (
    <TurnosContext.Provider
      value={{
        // datos
        canchas,
        canchasActivas,
        actualizarCancha,
        nombreCancha,
        turnos,
        turnosFijos,
        loading,
        modoLocal,
        falla,
        recargar: cargarDatos,

        // turnos
        agregarTurno,
        actualizarTurno,
        cambiarEstado,
        eliminarTurno,
        obtenerTurnosDelDia,

        // abonos
        agregarTurnoFijo,
        actualizarTurnoFijo,
        eliminarTurnoFijo,

        // configuración
        nombreClub,
        setNombreClub,
        colorClub,
        setColorClub,
        precioBaseCancha,
        setPrecioBaseCancha,
        incluyeManana,
        setIncluyeManana,
        diasVisibles,
        setDiasVisibles,
      }}
    >
      {children}
    </TurnosContext.Provider>
  );
}

export function useTurnos() {
  const ctx = useContext(TurnosContext);
  if (!ctx) {
    throw new Error('useTurnos debe ser usado dentro de un TurnosProvider');
  }
  return ctx;
}

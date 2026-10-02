import { useState, useEffect } from 'react';
import {
  DollarSign,
  Save,
  CheckCircle2,
  SlidersHorizontal,
  Phone,
  Building2,
  Info,
  Palette,
  Clock,
  AlertTriangle,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  Calendar,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useTurnos } from '../../context/TurnosContext';
import { supabase } from '../../lib/supabaseClient';

export default function Configuracion() {
  const { theme, changeTheme } = useTheme();
  const {
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
    canchas,
    actualizarCancha,
    modoLocal,
    falla,
    recargar,
  } = useTurnos();

  // Estado White-Label: Nombre del Club
  const [inputNombreClub, setInputNombreClub] = useState(nombreClub);
  const [nombreGuardado, setNombreGuardado] = useState(false);

  useEffect(() => {
    setInputNombreClub(nombreClub);
  }, [nombreClub]);

  const handleNombreClubChange = (e) => {
    const val = e.target.value;
    setInputNombreClub(val);
    setNombreClub(val);
  };

  const guardarNombreClub = () => {
    setNombreClub(inputNombreClub);
    setColorClub(colorClub);
    setNombreGuardado(true);
    setTimeout(() => setNombreGuardado(false), 3000);
  };

  // Estado de tarifas (buffer de edición; se persiste al guardar)
  const [inputPrecioBase, setInputPrecioBase] = useState(() => (precioBaseCancha ? String(precioBaseCancha) : ''));
  const [tarifaGuardada, setTarifaGuardada] = useState(false);
  const [guardandoTarifa, setGuardandoTarifa] = useState(false);

  // 2. Carga Inicial Persistente (useEffect) desde Supabase
  useEffect(() => {
    let montado = true;

    async function cargarTarifaDesdeSupabase() {
      try {
        const { data, error } = await supabase
          .from('configuracion')
          .select('precio_base')
          .eq('id', 1)
          .maybeSingle();

        if (error) {
          console.warn('[Configuración] Error al leer tarifa desde Supabase:', error.message);
          return;
        }

        if (montado && data && Number.isFinite(Number(data.precio_base)) && Number(data.precio_base) > 0) {
          const precioDB = Number(data.precio_base);
          setInputPrecioBase(String(precioDB));
          setPrecioBaseCancha(precioDB);
        }
      } catch (err) {
        console.error('[Configuración] Error al cargar tarifa:', err);
      }
    }

    cargarTarifaDesdeSupabase();

    return () => {
      montado = false;
    };
  }, [setPrecioBaseCancha]);

  useEffect(() => {
    if (precioBaseCancha) {
      setInputPrecioBase(String(precioBaseCancha));
    }
  }, [precioBaseCancha]);

  // Estado de contacto
  const [whatsapp, setWhatsapp] = useState('');
  const [datosGuardados, setDatosGuardados] = useState(false);

  // 1. Persistencia en Supabase
  const handleGuardarTarifa = async () => {
    const precioNumerico = Number(inputPrecioBase);
    if (!Number.isFinite(precioNumerico) || precioNumerico <= 0) {
      alert('Ingresá un monto válido para la tarifa base.');
      setInputPrecioBase(precioBaseCancha ? String(precioBaseCancha) : '15000');
      return;
    }

    setGuardandoTarifa(true);
    try {
      const { error } = await supabase
        .from('configuracion')
        .upsert({ id: 1, precio_base: precioNumerico }, { onConflict: 'id' });

      if (error) {
        console.error('Error al guardar tarifa:', error);
        alert('Error al guardar en base de datos');
        return;
      }

      setPrecioBaseCancha(precioNumerico);
      setTarifaGuardada(true);
      setTimeout(() => setTarifaGuardada(false), 3000);
      alert('Tarifa guardada correctamente');
    } catch (err) {
      console.error('Error al guardar tarifa:', err);
      alert('Error al guardar en base de datos');
    } finally {
      setGuardandoTarifa(false);
    }
  };

  const guardarDatos = () => {
    setDatosGuardados(true);
    setTimeout(() => setDatosGuardados(false), 3000);
  };

  // Estado para notificaciones de canchas
  const [avisoCancha, setAvisoCancha] = useState(null);
  const [guardandoCanchaId, setGuardandoCanchaId] = useState(null);

  const togglePausarCancha = async (cancha) => {
    const nuevoEstado = cancha.activa === false ? true : false;
    setGuardandoCanchaId(cancha.id);
    try {
      await actualizarCancha(cancha.id, { activa: nuevoEstado });
      setAvisoCancha({
        tipo: 'exito',
        texto: `Cancha "${cancha.nombre}" ${nuevoEstado ? 'habilitada' : 'pausada'} con éxito.`
      });
      setTimeout(() => setAvisoCancha(null), 3500);
    } catch (err) {
      console.error('Error al actualizar estado de la cancha:', err);
      setAvisoCancha({
        tipo: 'error',
        texto: 'No se pudo actualizar el estado de la cancha.'
      });
      setTimeout(() => setAvisoCancha(null), 3500);
    } finally {
      setGuardandoCanchaId(null);
    }
  };

  // Estado para feedback de rango de días
  const [diasGuardado, setDiasGuardado] = useState(false);

  const cambiarDiasVisibles = (dias) => {
    setDiasVisibles(Number(dias));
    setDiasGuardado(true);
    setTimeout(() => setDiasGuardado(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col gap-5 sm:gap-8 pb-10">
      {/* ─── Cabecera ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
          Configuración
        </h1>
        {modoLocal && (
          <button
            type="button"
            onClick={recargar}
            className="flex items-center gap-2 self-start px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold hover:bg-amber-200 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reconectar con Supabase
          </button>
        )}
      </div>

      {modoLocal && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 font-medium">
            {falla?.mensaje ||
              'Los cambios se guardan sólo en este navegador y no se comparten entre dispositivos.'}
          </p>
        </div>
      )}

      {/* ─── Sección 0: Identidad del Club (White-Label) ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Identidad del Club
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Personaliza el nombre y color de la marca que se mostrarán en la aplicación.
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          <div className="max-w-md">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
              Nombre del Complejo
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={inputNombreClub}
                onChange={handleNombreClubChange}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-base font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Nombre del Complejo"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">
              Al escribir y guardar, el nombre se actualizará al instante en todas las cabeceras y en el header superior.
            </p>
          </div>

          {/* Color de la Marca */}
          <div className="pt-6 border-t border-slate-100 max-w-xl">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
              Color de la Marca
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-14 h-14 p-1 rounded-xl cursor-pointer border border-zinc-200 bg-white shadow-xs hover:border-zinc-300 transition-all flex items-center justify-center shrink-0">
                <input
                  type="color"
                  value={colorClub}
                  onChange={(e) => setColorClub(e.target.value)}
                  className="w-full h-full rounded-lg cursor-pointer border-0 p-0 bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-lg"
                  title="Seleccionar color de marca"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 uppercase">
                    {colorClub}
                  </span>
                  <div
                    className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-xs"
                    style={{ backgroundColor: colorClub }}
                  />
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  Este color se aplica directamente al nombre del club en la cabecera superior.
                </p>
              </div>

              {/* Presets rápidos */}
              <div className="flex items-center gap-1.5 sm:ml-auto pt-2 sm:pt-0">
                {[
                  { hex: '#09090b', label: 'Dark Zinc' },
                  { hex: '#2563eb', label: 'Azul Eléctrico' },
                  { hex: '#059669', label: 'Verde Pádel' },
                  { hex: '#7c3aed', label: 'Violeta' },
                  { hex: '#ea580c', label: 'Naranja' },
                  { hex: '#dc2626', label: 'Rojo' },
                ].map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    onClick={() => setColorClub(preset.hex)}
                    style={{ backgroundColor: preset.hex }}
                    className={`w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95 ${
                      colorClub?.toLowerCase() === preset.hex.toLowerCase()
                        ? 'border-white ring-2 ring-slate-900 shadow-sm'
                        : 'border-white/80 shadow-xs'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {nombreGuardado ? (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-left-2 duration-200">
              <CheckCircle2 className="w-4 h-4" />
              Identidad de marca guardada con éxito
            </div>
          ) : (
            <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
              <span>Vista previa:</span>
              <span
                className="font-black text-base tracking-tight"
                style={{ color: colorClub }}
              >
                {inputNombreClub || 'Mi Complejo'}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={guardarNombreClub}
            className="bg-punto-brand hover:bg-punto-hover text-white font-bold py-3 sm:py-2.5 px-6 rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 text-sm cursor-pointer w-full sm:w-auto"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar Identidad
          </button>
        </div>
      </div>

      {/* ─── Sección 1: Tarifas de Canchas ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Tarifas de Canchas
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Define el costo por turno que se reflejará en la Agenda y en la Caja Diaria.
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-6 flex flex-col gap-5 sm:gap-6">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
              Precio Base por Turno (90 min)
            </label>
            <div className="relative max-w-xs">
              <span className="absolute left-4 top-3.5 text-slate-400 text-xl font-bold pointer-events-none select-none">
                $
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={inputPrecioBase}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setInputPrecioBase(val);
                  setTarifaGuardada(false);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-3 text-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="Ej. 25000"
              />
            </div>
            <div className="flex items-start gap-2 mt-2.5">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-sm text-slate-500">
                Este es el valor que se cobra por defecto en la grilla y sumará a la Caja Diaria.
                <span className="block mt-1 text-xs text-slate-400">
                  Vigente:{' '}
                  {precioBaseCancha === null ? (
                    <span className="inline-block h-3.5 w-16 bg-slate-200 animate-pulse rounded align-middle" />
                  ) : (
                    <span className="font-bold text-slate-700">
                      ${Number(precioBaseCancha).toLocaleString('es-AR')}
                    </span>
                  )}{' '}
                  por turno.
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Pie */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {tarifaGuardada && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-left-2 duration-200">
              <CheckCircle2 className="w-4 h-4" />
              Tarifa guardada con éxito
            </div>
          )}
          {!tarifaGuardada && <div />}
          <button
            type="button"
            onClick={handleGuardarTarifa}
            disabled={guardandoTarifa}
            className="bg-punto-brand hover:bg-punto-hover text-white font-bold py-3 sm:py-2.5 px-6 rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 text-sm w-full sm:w-auto disabled:opacity-50 cursor-pointer"
          >
            {guardandoTarifa ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar Tarifa
          </button>
        </div>
      </div>

      {/* ─── Sección Nueva: Gestión de Canchas ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Gestión de Canchas
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Configura los nombres, colores y disponibilidad (pausar por lluvia, feriado o mantenimiento).
            </p>
          </div>
        </div>

        {/* Notificación de éxito / error */}
        {avisoCancha && (
          <div className={`mx-4 sm:mx-6 mt-4 p-3 rounded-xl border flex items-center gap-2.5 text-xs font-bold animate-fade-in ${
            avisoCancha.tipo === 'exito'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{avisoCancha.texto}</span>
          </div>
        )}

        <div className="p-4 sm:p-6 flex flex-col gap-4">
          {canchas.map((cancha) => {
            const estaPausada = cancha.activa === false;

            return (
              <div
                key={cancha.id}
                className={`flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-xl border transition-all duration-200 ${
                  estaPausada
                    ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                    : 'bg-slate-50 border-slate-200/80'
                }`}
              >
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">
                      Nombre de la Cancha
                    </label>
                    {estaPausada && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                        ⚠️ Pausada / Feriado
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    defaultValue={cancha.nombre}
                    onBlur={(e) => {
                      if (e.target.value !== cancha.nombre) {
                        actualizarCancha(cancha.id, { nombre: e.target.value });
                      }
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="w-full sm:w-auto flex items-end gap-3">
                  {/* Selector de color */}
                  <div className="flex-1 sm:flex-initial">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                      Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        defaultValue={cancha.color_identificador || '#64748b'}
                        onBlur={(e) => {
                          if (e.target.value !== cancha.color_identificador) {
                            actualizarCancha(cancha.id, { color_identificador: e.target.value });
                          }
                        }}
                        className="w-10 h-10 p-1 bg-white border border-slate-200 rounded-lg cursor-pointer"
                      />
                      <span className="text-xs font-medium text-slate-400">
                        Hex
                      </span>
                    </div>
                  </div>

                  {/* Botón de Pausar / Habilitar Cancha */}
                  <div className="flex-1 sm:flex-initial">
                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wide">
                      Disponibilidad
                    </label>
                    <button
                      type="button"
                      onClick={() => togglePausarCancha(cancha)}
                      disabled={guardandoCanchaId === cancha.id}
                      className={`h-10 px-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                        estaPausada
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
                      }`}
                      title={estaPausada ? 'Habilitar cancha para reservas' : 'Pausar cancha por lluvia, feriado o mantenimiento'}
                    >
                      {estaPausada ? (
                        <>
                          <PlayCircle className="w-4 h-4 text-white" />
                          <span>Habilitar Cancha</span>
                        </>
                      ) : (
                        <>
                          <PauseCircle className="w-4 h-4 text-amber-600" />
                          <span>Pausar Cancha</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Sección Nueva: Horarios de Operación ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Horarios de Operación
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Define las franjas horarias en las que el complejo recibe turnos.
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-6">
          <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <div className="min-w-0">
              <span className="font-bold text-slate-800 text-sm block">Habilitar Turnos por la Mañana</span>
              <span className="text-xs text-slate-500 font-medium">
                {incluyeManana
                  ? 'La grilla abre a las 08:00 y cierra a las 23:30.'
                  : 'La grilla abre a las 14:00 y cierra a las 23:30.'}
              </span>
            </div>
            <div className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={incluyeManana}
                onChange={(e) => setIncluyeManana(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-punto-brand"></div>
            </div>
          </label>
        </div>
      </div>

      {/* ─── Sección: Anticipación de Reservas para Clientes ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                Días Visibles para el Cliente
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Controla con cuánta anticipación los jugadores pueden ver fechas y reservar canchas.
              </p>
            </div>
          </div>
          {diasGuardado && (
            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold animate-fade-in bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
              <span>Guardado</span>
            </div>
          )}
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2.5">
              Rango de Días Hacia Adelante (Anticipación)
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Botones de opción rápida */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 max-w-xl">
                {[
                  { valor: 7, label: '7 días', desc: '1 semana' },
                  { valor: 14, label: '14 días', desc: '2 semanas' },
                  { valor: 21, label: '21 días', desc: '3 semanas' },
                  { valor: 30, label: '30 días', desc: '1 mes' },
                ].map((opcion) => {
                  const activo = Number(diasVisibles) === opcion.valor;
                  return (
                    <button
                      key={opcion.valor}
                      type="button"
                      onClick={() => cambiarDiasVisibles(opcion.valor)}
                      className={`flex flex-col items-center justify-center px-4 py-3 rounded-xl border text-center transition-all cursor-pointer ${
                        activo
                          ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold shadow-xs ring-1 ring-blue-500'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm font-extrabold">{opcion.label}</span>
                      <span className="text-[10px] text-slate-400 font-medium leading-none mt-1">{opcion.desc}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selector alternativo <select> */}
              <div className="sm:ml-auto flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 hidden lg:inline">Personalizado:</span>
                <select
                  value={diasVisibles}
                  onChange={(e) => cambiarDiasVisibles(e.target.value)}
                  className="w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  <option value={7}>7 días (1 semana)</option>
                  <option value={10}>10 días</option>
                  <option value={14}>14 días (2 semanas)</option>
                  <option value={21}>21 días (3 semanas)</option>
                  <option value={28}>28 días (4 semanas)</option>
                  <option value={30}>30 días (1 mes)</option>
                  <option value={60}>60 días (2 meses)</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3 font-medium">
              Actualmente los clientes verán <strong className="text-slate-800 font-bold">{diasVisibles} días</strong> a partir de la fecha de hoy en el carrusel de la página de reservas.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Sección 2: Contacto y Notificaciones ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Contacto y Notificaciones
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Información de contacto utilizada para confirmaciones y mensajes a clientes.
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-6">
          <div className="max-w-md">
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2">
              WhatsApp de Contacto
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                placeholder="+54 381 xxx xxxx"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2 font-medium">
              El sistema enviará confirmaciones y recordatorios a este número vía la API de WhatsApp.
            </p>
          </div>
        </div>

        {/* Pie */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {datosGuardados && (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-left-2 duration-200">
              <CheckCircle2 className="w-4 h-4" />
              Contacto guardado con éxito
            </div>
          )}
          {!datosGuardados && <div />}
          <button
            type="button"
            onClick={guardarDatos}
            className="bg-punto-brand hover:bg-punto-hover text-white font-bold py-3 sm:py-2.5 px-6 rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 text-sm cursor-pointer w-full sm:w-auto"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar Contacto
          </button>
        </div>
      </div>

      {/* ─── Sección 3: Apariencia del Panel ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Cabecera de tarjeta */}
        <div className="bg-slate-50 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Apariencia del Panel
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Elige el estilo visual del panel de administración.
            </p>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Tarjeta Pro Sports */}
            <button
              type="button"
              onClick={() => changeTheme('pro')}
              className={`text-left rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${theme === 'pro' ? 'border-yellow-500 ring-4 ring-yellow-500/20' : 'border-slate-200 hover:border-yellow-300'}`}
            >
              <div className="h-24 bg-zinc-950 flex flex-col p-4">
                <div className="w-8 h-3 bg-yellow-500 rounded-sm mb-auto"></div>
                <div className="w-16 h-2 bg-zinc-800 rounded-sm mb-1.5"></div>
                <div className="w-12 h-2 bg-zinc-800 rounded-sm"></div>
              </div>
              <div className="p-4 bg-white">
                <p className="font-bold text-slate-900 text-sm">Pro Sports</p>
                <p className="text-xs text-slate-500 font-medium">Grafito y Amarillo</p>
              </div>
            </button>

            {/* Tarjeta Cyber Cyan */}
            <button
              type="button"
              onClick={() => changeTheme('cyan')}
              className={`text-left rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${theme === 'cyan' ? 'border-cyan-500 ring-4 ring-cyan-500/20' : 'border-slate-200 hover:border-cyan-300'}`}
            >
              <div className="h-24 bg-slate-950 flex flex-col p-4">
                <div className="w-8 h-3 bg-cyan-500 rounded-sm mb-auto"></div>
                <div className="w-16 h-2 bg-slate-800 rounded-sm mb-1.5"></div>
                <div className="w-12 h-2 bg-slate-800 rounded-sm"></div>
              </div>
              <div className="p-4 bg-white">
                <p className="font-bold text-slate-900 text-sm">Cyber Cyan</p>
                <p className="text-xs text-slate-500 font-medium">Azul Noche y Cian</p>
              </div>
            </button>

            {/* Tarjeta Midnight Rose */}
            <button
              type="button"
              onClick={() => changeTheme('rose')}
              className={`text-left rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${theme === 'rose' ? 'border-pink-500 ring-4 ring-pink-500/20' : 'border-slate-200 hover:border-pink-300'}`}
            >
              <div className="h-24 bg-indigo-950 flex flex-col p-4">
                <div className="w-8 h-3 bg-pink-500 rounded-sm mb-auto"></div>
                <div className="w-16 h-2 bg-indigo-900 rounded-sm mb-1.5"></div>
                <div className="w-12 h-2 bg-indigo-900 rounded-sm"></div>
              </div>
              <div className="p-4 bg-white">
                <p className="font-bold text-slate-900 text-sm">Midnight Rose</p>
                <p className="text-xs text-slate-500 font-medium">Violeta y Rosa</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Sección 4: Info del Sistema ─── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 sm:px-5 py-4 flex items-start gap-3">
        <SlidersHorizontal className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-700">Sistema de Turnos v1.0</span> — Los cambios de configuración se aplican inmediatamente a las nuevas operaciones. Los turnos y ventas existentes no se ven afectados retroactivamente.
          </p>
        </div>
      </div>
    </div>
  );
}

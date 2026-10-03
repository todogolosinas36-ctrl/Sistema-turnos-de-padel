import { useMemo, useState, useEffect } from 'react';
import { useTorneo } from '../store/TorneoStore';
import type { Cancha, Partido, PartidoAgenda } from '../types';
import { buscarSlotLibre, generarSlots, validarCronograma, ETIQUETA_FASE } from '../lib';
import { AsignarCanchaHorarioModal } from './AsignarCanchaHorarioModal';
import { ScoreForm } from './ScoreForm';
import { Alerta, Badge, Button, EstadoVacio, Spinner } from './ui';
import { Clock, Calendar, Download, MoreVertical, AlertTriangle } from 'lucide-react';

function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatearDiaPill(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/^\w/, c => c.toUpperCase());
}

export function CronogramaGeneral() {
  const { torneo, categoria, agenda, sinAgendar, parejas, canchas, acciones, guardando, cargando } = useTorneo();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [partidoObjetivo, setPartidoObjetivo] = useState<Partido | null>(null);
  const [soloConflictos, setSoloConflictos] = useState(false);

  const [scoreAbierto, setScoreAbierto] = useState(false);
  const [partidoScore, setPartidoScore] = useState<Partido | null>(null);

  const mapaParejas = useMemo(() => new Map(parejas.map((p) => [p.id, p])), [parejas]);

  const opcionesValidacion = useMemo(
    () => ({
      descansoMin: torneo?.descanso_min_entre_partidos ?? 30,
      duracionMin: torneo?.duracion_partido_min ?? 75,
      torneo: torneo ?? null,
    }),
    [torneo]
  );

  const conflictos = useMemo(
    () => validarCronograma(agenda, opcionesValidacion, parejas),
    [agenda, opcionesValidacion, parejas]
  );

  const partidosEnConflicto = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conflictos) {
      for (const id of c.partidoIds) ids.add(id);
    }
    return ids;
  }, [conflictos]);

  // Obtener dias unicos basados en la agenda
  const diasUnicos = useMemo(() => {
    const dates = agenda
      .filter((p) => p.inicio)
      .map((p) => {
        // Usar formato YYYY-MM-DD local
        const d = p.inicio!;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
    return Array.from(new Set(dates)).sort();
  }, [agenda]);

  const [diaSeleccionado, setDiaSeleccionado] = useState<string>('');

  useEffect(() => {
    if (!diaSeleccionado && diasUnicos.length > 0) {
      setDiaSeleccionado(diasUnicos[0]);
    } else if (diaSeleccionado && !diasUnicos.includes(diaSeleccionado) && diasUnicos.length > 0) {
      setDiaSeleccionado(diasUnicos[0]);
    }
  }, [diasUnicos, diaSeleccionado]);

  // Filtrar partidos visibles por dia
  const visibles = useMemo(() => {
    let filtrados = agenda;
    if (soloConflictos) {
      filtrados = filtrados.filter((p) => partidosEnConflicto.has(p.id));
    }
    return filtrados.filter((p) => {
      if (!p.inicio) return false;
      const d = p.inicio;
      const isoLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return isoLocal === diaSeleccionado;
    });
  }, [agenda, soloConflictos, partidosEnConflicto, diaSeleccionado]);

  const partidosPorCancha = useMemo(() => {
    const map = new Map<string, PartidoAgenda[]>();
    for (const c of canchas) map.set(c.id, []);

    for (const p of visibles) {
      const cid = p.cancha_id ?? 'sin_asignar';
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(p);
    }

    for (const [_, list] of map.entries()) {
      list.sort((a, b) => (a.inicio?.getTime() || 0) - (b.inicio?.getTime() || 0));
    }
    return map;
  }, [visibles, canchas]);

  const resumenDia = useMemo(() => {
    const jugados = visibles.filter(p => p.ganador_id !== null).length;
    return { jugados, total: visibles.length };
  }, [visibles]);

  const abrirAsignar = (partido: Partido | null) => {
    setPartidoObjetivo(partido);
    setModalAbierto(true);
  };

  const abrirScore = (partido: Partido) => {
    setPartidoScore(partido);
    setScoreAbierto(true);
  };

  const autoCompletar = async () => {
    if (!torneo || sinAgendar.length === 0) return;

    const slots = generarSlots(torneo, canchas);
    const asignaciones: { partido_id: string; cancha_id: string | null; horario: string | null }[] = [];
    const agendaSimulada: PartidoAgenda[] = [...agenda];

    for (const partido of sinAgendar) {
      const parejaIds = [partido.pareja_1_id, partido.pareja_2_id].filter((x): x is string => Boolean(x));
      let elegido: Cancha | null = null;
      let inicio: Date | null = null;

      for (const slot of slots) {
        if (buscarSlotLibre(slot, parejaIds, agendaSimulada, opcionesValidacion)) {
          elegido = canchas.find((c) => c.id === slot.cancha_id) ?? null;
          inicio = slot.inicio;
          break;
        }
      }

      if (elegido && inicio) {
        const horario = inicio.toISOString();
        asignaciones.push({ partido_id: partido.id, cancha_id: elegido.id, horario });
        agendaSimulada.push({
          ...partido,
          cancha_id: elegido.id,
          horario,
          inicio,
          fin: new Date(inicio.getTime() + opcionesValidacion.duracionMin * 60_000),
          pareja_1: parejaIds[0] ? (parejas.find((p) => p.id === parejaIds[0]) ?? null) : null,
          pareja_2: parejaIds[1] ? (parejas.find((p) => p.id === parejaIds[1]) ?? null) : null,
          cancha: elegido,
        });
      }
    }

    if (asignaciones.length === 0) {
      acciones.setAviso('No quedan slots libres con los horarios y canchas actuales.');
      return;
    }
    await acciones.guardarAgenda(asignaciones);
    acciones.setAviso(
      `${asignaciones.length} partidos asignados. Quedaron ${sinAgendar.length - asignaciones.length} sin horario.`
    );
  };

  if (!torneo || !categoria) {
    return (
      <EstadoVacio
        titulo="Seleccioná un torneo y una categoría"
        descripcion="El cronograma se arma sobre el torneo (horarios, canchas y descanso mínimo) y una categoría."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Controles del Cronograma */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col gap-3">
          {/* Tabs de Días */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            {diasUnicos.length === 0 ? (
              <span className="text-sm font-medium text-slate-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Sin días programados
              </span>
            ) : (
              diasUnicos.map((dia) => (
                <button
                  key={dia}
                  onClick={() => setDiaSeleccionado(dia)}
                  className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                    diaSeleccionado === dia 
                      ? 'bg-slate-800 text-white shadow-md' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Calendar className="w-4 h-4" />
                  {formatearDiaPill(dia)}
                </button>
              ))
            )}
          </div>
          
          {/* Resumen del Día Seleccionado */}
          {diaSeleccionado && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-700">Resumen del día:</span>
              <Badge tono="cancha">{resumenDia.jugados} jugados</Badge>
              <Badge tono="neutro">{resumenDia.total - resumenDia.jugados} pendientes</Badge>
              {sinAgendar.length > 0 && <Badge tono="advertencia">{sinAgendar.length} sin asignar (total)</Badge>}
              {cargando && <Spinner className="w-4 h-4 ml-2 text-blue-500" />}
            </div>
          )}
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2 shrink-0 border-t xl:border-t-0 pt-3 xl:pt-0 border-slate-100">
          <Button 
            variante="fantasma" 
            onClick={() => window.print()}
            title="Imprimir Fixture"
          >
            <Download className="w-4 h-4 mr-2" /> Descargar PDF
          </Button>
          <Button
            variante="secundario"
            onClick={autoCompletar}
            disabled={guardando || sinAgendar.length === 0}
            title={sinAgendar.length === 0 ? 'No hay partidos pendientes de asignar' : undefined}
          >
            Auto-programar
          </Button>
        </div>
      </div>

      {/* Conflictos globales */}
      {conflictos.length > 0 && (
        <Alerta tono="error">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-3">
            <p className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              Se detectaron {conflictos.length} conflictos en el cronograma
            </p>
            <Button tamano="sm" variante="secundario" onClick={() => setSoloConflictos(v => !v)}>
              {soloConflictos ? 'Ver todos los partidos' : 'Filtrar con conflictos'}
            </Button>
          </div>
          <ul className="mt-2 space-y-1 text-sm font-medium opacity-90">
            {conflictos.slice(0, 6).map((c, i) => (
              <li key={i} className="list-disc ml-5">{c.mensaje}</li>
            ))}
            {conflictos.length > 6 && <li className="ml-5 mt-1">... y {conflictos.length - 6} más.</li>}
          </ul>
        </Alerta>
      )}

      {/* Grid de Canchas para el Día */}
      {agenda.length === 0 ? (
        <EstadoVacio
          titulo="Todavía no hay partidos con horario"
          descripcion="Asigná cancha y horario manualmente, o usá 'Auto-programar' para llenar la grilla automáticamente."
          accion={
            <Button variante="primario" onClick={autoCompletar} disabled={sinAgendar.length === 0}>
              Auto-programar
            </Button>
          }
        />
      ) : diasUnicos.length === 0 ? (
        <EstadoVacio
          titulo="No hay partidos con fecha asignada"
          descripcion="Todos los partidos están pendientes de ser programados."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {canchas.map((cancha) => {
            const partidos = partidosPorCancha.get(cancha.id) || [];
            return (
              <div key={cancha.id} className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 min-h-[600px] flex flex-col gap-3 shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 mb-2">
                  <h3 className="font-extrabold text-slate-800 tracking-tight uppercase text-lg">{cancha.nombre}</h3>
                  <span className="bg-white border border-slate-200 text-slate-600 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                    {partidos.length} partidos
                  </span>
                </div>
                
                {partidos.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-sm font-medium text-slate-400 border-2 border-dashed border-slate-200 rounded-xl h-40">
                    Sin partidos
                  </div>
                ) : (
                  partidos.map((p) => (
                    <MatchCard 
                      key={p.id} 
                      partido={p} 
                      onAbrir={abrirAsignar} 
                      onCargar={abrirScore}
                      enConflicto={partidosEnConflicto.has(p.id)} 
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      <AsignarCanchaHorarioModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        partido={partidoObjetivo}
      />

      <ScoreForm
        abierto={scoreAbierto}
        onCerrar={() => setScoreAbierto(false)}
        partido={partidoScore}
        parejas={mapaParejas}
        onGuardar={acciones.guardarResultado}
        cargando={guardando}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tarjeta de Partido Moderna (Match Card)                                    */
/* -------------------------------------------------------------------------- */

function MatchCard({ 
  partido, 
  onAbrir, 
  onCargar,
  enConflicto 
}: { 
  partido: PartidoAgenda; 
  onAbrir: (p: Partido) => void; 
  onCargar: (p: Partido) => void;
  enConflicto: boolean 
}) {
  const resuelto = partido.ganador_id !== null;
  const p1Nombre = partido.pareja_1 ? `${partido.pareja_1.j1_nombre} / ${partido.pareja_1.j2_nombre}` : 'Por definir';
  const p2Nombre = partido.pareja_2 ? `${partido.pareja_2.j1_nombre} / ${partido.pareja_2.j2_nombre}` : 'Por definir';

  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border ${enConflicto ? 'border-red-400 bg-red-50' : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'} transition-all`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <span className="bg-blue-50 text-blue-700 font-bold text-xs px-2.5 py-1 rounded-lg border border-blue-100 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {partido.inicio ? formatearHora(partido.inicio) : '—'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-wider">
            {ETIQUETA_FASE[partido.fase] ?? partido.fase}
          </span>
          <button 
            onClick={() => onAbrir(partido)} 
            className="text-slate-400 hover:text-blue-600 transition-colors p-1 -mr-1 rounded-md hover:bg-slate-50" 
            title="Reasignar horario"
          >
             <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-col text-center px-2">
        <span className={`text-sm font-semibold truncate ${partido.ganador_id === partido.pareja_1_id ? 'text-green-600' : 'text-slate-800'}`}>
          {p1Nombre}
        </span>
        <div className="flex justify-center my-1.5">
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full w-fit">VS</span>
        </div>
        <span className={`text-sm font-semibold truncate ${partido.ganador_id === partido.pareja_2_id ? 'text-green-600' : 'text-slate-800'}`}>
          {p2Nombre}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-50">
        {resuelto ? (
          <div className="text-center font-bold text-green-700 bg-green-50 rounded-lg py-2 border border-green-100 text-sm tracking-wide">
            {partido.set1_p1 !== null
              ? `${partido.set1_p1}-${partido.set1_p2}` +
                (partido.set2_p1 !== null ? ` ${partido.set2_p1}-${partido.set2_p2}` : '') +
                (partido.set3_p1 !== null ? ` TB ${partido.set3_p1}-${partido.set3_p2}` : '')
              : 'WO'}
          </div>
        ) : (
          <button 
            onClick={() => onCargar(partido)} 
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold px-3 py-2 rounded-lg w-full text-center transition-colors shadow-sm"
          >
            Cargar Resultado
          </button>
        )}
      </div>
    </div>
  );
}

export default CronogramaGeneral;

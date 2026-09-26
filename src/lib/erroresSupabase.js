/**
 * Convierte un error de Supabase en un mensaje que el usuario pueda actuar.
 *
 * Sin esto, un esquema desactualizado se manifiesta igual que "no hay
 * internet", y el operador no entiende por qué no se le guardan los turnos.
 */
export function clasificarErrorSupabase(error) {
  const msg = error?.message || String(error || '');
  const code = error?.code || '';

  // La tabla existe pero le faltan columnas (o la tabla no existe).
  if (
    code === 'PGRST204' ||
    /Could not find the .* column/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /relation ".*" does not exist/i.test(msg)
  ) {
    return {
      motivo: 'esquema',
      mensaje:
        'Faltan tablas o columnas en Supabase. Ejecutá el archivo supabase/schema.sql en el SQL Editor y después tocá "Reintentar".',
    };
  }

  // Las políticas RLS están cerrando la escritura.
  if (code === '42501' || /row-level security|permission denied|not authorized/i.test(msg)) {
    return {
      motivo: 'permisos',
      mensaje:
        'Supabase rechazó la escritura por permisos. Revisá que hayas iniciado sesión en /admin y aplicá el bloque RLS de supabase/schema.sql.',
    };
  }

  // Sin conexión.
  if (/failed to fetch|networkerror|load failed|ERR_INTERNET|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
    return {
      motivo: 'red',
      mensaje: 'No se pudo alcanzar Supabase. Revisá la conexión a internet.',
    };
  }

  return { motivo: 'desconocido', mensaje: `Error de Supabase: ${msg}` };
}

import { createClient } from '@supabase/supabase-js';

// Variables de entorno con valores de respaldo
const FALLBACK_SUPABASE_URL = 'https://sagcjnqicducrmwuzycw.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_Qn5PWMW_zVof9sdEXDSaBQ_64uvEq1p';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = (rawUrl && typeof rawUrl === 'string' && rawUrl.trim() !== '' ? rawUrl.trim() : FALLBACK_SUPABASE_URL);
const supabaseAnonKey = (rawAnonKey && typeof rawAnonKey === 'string' && rawAnonKey.trim() !== '' ? rawAnonKey.trim() : FALLBACK_SUPABASE_ANON_KEY);

if (!rawUrl || !rawAnonKey) {
  console.warn(
    '[SupabaseClient] Atención: No se encontraron todas las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Utilizando configuración de respaldo.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

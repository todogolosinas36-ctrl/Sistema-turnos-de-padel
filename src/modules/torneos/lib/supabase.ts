import { supabase as mainSupabase } from '../../../lib/supabaseClient';

export const estaConfigurado = true;
export const supabase = mainSupabase;
export function assertConfigurado(): void {}

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Verdadeiro quando o .env está preenchido; sem isso o app segue só com localStorage. */
export const supabaseConfigured = !!url && !!anonKey && !url.includes('SEU-PROJETO');

export const supabase = createClient(
  supabaseConfigured ? url! : 'http://localhost:54321',
  supabaseConfigured ? anonKey! : 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true } },
);

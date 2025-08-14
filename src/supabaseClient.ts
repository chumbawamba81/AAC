import { createClient } from '@supabase/supabase-js';

// Supabase client initialization. The URL and anon key are loaded from
// environment variables prefixed with VITE_ so that Vite exposes them to the
// client-side code. Make sure to define VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY in your Netlify or build environment.
const supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey: string = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
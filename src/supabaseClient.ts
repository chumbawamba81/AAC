// src/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente minimalista de DIAGNÓSTICO:
 * - Não faz throw se faltarem envs; apenas avisa no console.
 * - Regista eventos de auth (login/logout/refresh).
 * - Exponde o cliente em window.sb para inspeção manual.
 */

const w = typeof window !== "undefined" ? (window as any) : undefined;

// Tenta primeiro Vite env, depois variáveis que possas meter manualmente em window.*
const SUPABASE_URL: string | undefined =
  (import.meta as any)?.env?.VITE_SUPABASE_URL ?? w?.VITE_SUPABASE_URL;

const SUPABASE_ANON_KEY: string | undefined =
  (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY ?? w?.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Não quebramos o build: apenas avisamos claramente.
  // Em produção, confirma as envs no Netlify.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseClient][diag] Variáveis em falta:",
    { hasURL: !!SUPABASE_URL, hasAnonKey: !!SUPABASE_ANON_KEY }
  );
}

// Cria o client (se as envs forem inválidas, as chamadas irão falhar — e isso aparece no console/network)
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "http://__MISSING_SUPABASE_URL__",
  SUPABASE_ANON_KEY || "__MISSING_SUPABASE_ANON_KEY__",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
    global: {
      headers: { "x-app": "aac-sb-diag" },
    },
  }
);

// ====== DIAGNÓSTICO NO BROWSER ======
declare global {
  interface Window {
    sb?: SupabaseClient;
    __supabaseDiag?: {
      url?: string;
      anonKeyPresent: boolean;
      startedAt: string;
    };
  }
}

if (typeof window !== "undefined") {
  // Expor cliente para inspecionar manualmente: window.sb.auth.getSession(), etc.
  w.sb = supabase;
  w.__supabaseDiag = {
    url: SUPABASE_URL,
    anonKeyPresent: !!SUPABASE_ANON_KEY,
    startedAt: new Date().toISOString(),
  };

  // Log inicial do estado da sessão
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("[supabaseClient][diag] getSession error:", error.message);
    }
    console.log("[supabaseClient][diag] initial session:", {
      hasSession: !!data?.session,
      userId: data?.session?.user?.id,
      email: data?.session?.user?.email,
    });
  });

  // Log contínuo de eventos de autenticação
  supabase.auth.onAuthStateChange((event, session) => {
    console.log("[supabaseClient][diag] onAuthStateChange:", event, {
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
    });
  });
}

// Helpers de utilidade (opcionais)
export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.error("[supabaseClient][diag] getCurrentSession error:", error.message);
  return data?.session ?? null;
}
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error("[supabaseClient][diag] getCurrentUser error:", error.message);
  return data?.user ?? null;
}
export async function getCurrentUserId() {
  const u = await getCurrentUser();
  return u?.id ?? null;
}

// ... export const supabase = createClient(....)

if (typeof window !== "undefined") {
  // ⚠️ DEBUG TEMPORÁRIO – remove depois
  (window as any).supabase = supabase;
}

// src/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lê envs de runtime (Vite) — verifica que em Netlify tens as mesmas variáveis configuradas
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Throw explícito em build se faltar configuração
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Em produção convém falhar cedo para não andarmos a “debugar fantasmas”
  throw new Error(
    "[supabaseClient] Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY em falta. " +
      "Confirma o .env local e as envs no Netlify."
  );
}

// Cria um ÚNICO client (sessões em localStorage do próprio domínio)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // útil para fluxos com redirects (OAuth/magic link)
    // Força storage do browser quando existir window (SPA)
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
  global: {
    headers: { "x-application-name": "aac-sb" },
  },
});

// ====== DEBUG OPCIONAL: regista transições de autenticação no console ======
declare global {
  interface Window {
    __supabaseAuthDebugHooked?: boolean;
  }
}
if (typeof window !== "undefined" && !window.__supabaseAuthDebugHooked) {
  window.__supabaseAuthDebugHooked = true;
  supabase.auth.onAuthStateChange((event, session) => {
    // Isto deve disparar em login/logout/refresh. Se não vires nada após login,
    // o problema é de ambiente (origens CORS/redirects/keys erradas).
    // Podes comentar estas linhas depois de validar.
    // eslint-disable-next-line no-console
    console.log("[auth:onAuthStateChange]", event, {
      hasSession: !!session,
      userId: session?.user?.id,
      email: session?.user?.email,
    });
  });
}

// Helpers pequeninos (úteis noutros serviços)
export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[supabaseClient] getSession error:", error.message);
  }
  return data?.session ?? null;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[supabaseClient] getUser error:", error.message);
  }
  return data?.user ?? null;
}

export async function getCurrentUserId() {
  const u = await getCurrentUser();
  return u?.id ?? null;
}

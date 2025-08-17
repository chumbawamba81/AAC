// src/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 🔐 Variáveis de ambiente (Vite)
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 */
const RAW_URL = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
const RAW_ANON = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Normaliza strings (remove espaços acidentais, aspas de .env, etc.)
 */
function cleanEnv(v?: string | null): string | undefined {
  if (v == null) return undefined;
  const trimmed = String(v).trim();
  if (!trimmed) return undefined;
  // Remove aspas acidentais: VITE_SUPABASE_URL="https://..." -> https://...
  return trimmed.replace(/^['"]|['"]$/g, "");
}

/**
 * Validação das envs + mensagens úteis.
 * Em DEV: lança erro detalhado para falhar rápido.
 * Em PROD: também lança erro — preferimos falhar com mensagem clara
 * do que ter comportamentos silenciosos e difíceis de depurar.
 */
function requireEnv(name: string, value?: string): string {
  const cleaned = cleanEnv(value);
  if (!cleaned) {
    const msg =
      `[supabaseClient] Variável de ambiente em falta: ${name}.\n` +
      `- Garante que tens um ficheiro .env.local (ou .env) com:\n` +
      `    VITE_SUPABASE_URL="https://<project>.supabase.co"\n` +
      `    VITE_SUPABASE_ANON_KEY="<anon-key>"\n` +
      `- Em ambientes como Netlify/Vercel, define estas envs no painel do projeto.`;
    // eslint-disable-next-line no-console
    console.error(msg);
    throw new Error(msg);
  }
  return cleaned;
}

const SUPABASE_URL = requireEnv("VITE_SUPABASE_URL", RAW_URL);
const SUPABASE_ANON_KEY = requireEnv("VITE_SUPABASE_ANON_KEY", RAW_ANON);

/**
 * Opções de autenticação:
 * - persistSession: mantém sessão em localStorage (frontend SPA)
 * - autoRefreshToken: renova tokens em background
 * - detectSessionInUrl: true (se usas magic links / OAuth)
 * - storageKey: chave própria para evitar conflitos
 * - sameSite/secure: mais seguros em produção/https
 */
const isProd = typeof window !== "undefined" && window.location.protocol === "https:";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "aacsb_supabase_auth_v1",
    flowType: "pkce",
    // cookies são geridos pelo SDK quando necessário (PKCE/OAuth). Em SPA normal, localStorage é suficiente.
  },
  global: {
    fetch: (input, init) => {
      // Decorador opcional para registar erros 401/403 com mais contexto
      return fetch(input as RequestInfo, init).then(async (res) => {
        if (!res.ok && (res.status === 401 || res.status === 403)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[supabaseClient] Pedido ${res.status} a ${typeof input === "string" ? input : (input as any)?.url}`
          );
        }
        return res;
      });
    },
  },
});

/**
 * Expor no window em DEV para inspecionar no console:
 *   > window.supabase.auth.getUser()
 *   > window.supabase.from('documentos').select('*')
 */
declare global {
  interface Window {
    supabase?: SupabaseClient;
  }
}
if (typeof window !== "undefined" && !isProd) {
  // eslint-disable-next-line no-console
  console.info("[supabaseClient] Expondo window.supabase para debug (apenas DEV).");
  window.supabase = supabase;
}

/**
 * Auto-check inicial da sessão + logs úteis para diagnóstico.
 * (Não impede o funcionamento; apenas informa.)
 */
(async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[supabaseClient] getSession error:", error.message);
      return;
    }
    if (!data?.session) {
      // eslint-disable-next-line no-console
      console.warn(
        "[supabaseClient] Sem sessão ativa. É esperado até o utilizador iniciar sessão."
      );
    } else {
      // eslint-disable-next-line no-console
      console.info("[supabaseClient] Sessão ativa detetada para:", data.session.user?.email);
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error("[supabaseClient] Falha inesperada ao verificar sessão:", e?.message || e);
  }
})();

/**
 * Helper (opcional) para forçar sessão em pontos críticos.
 * Usa assim:
 *   const user = await assertUser();
 *   // se não houver sessão, a função lança erro com mensagem clara
 */
export async function assertUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`[supabaseClient] auth.getUser() falhou: ${error.message}`);
  }
  const user = data?.user;
  if (!user) {
    throw new Error(
      "[supabaseClient] Sem sessão Supabase. Inicie sessão e tente novamente."
    );
  }
  return user;
}

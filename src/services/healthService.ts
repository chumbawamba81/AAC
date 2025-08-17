import { supabase } from "../supabaseClient";
import { getMyProfile, upsertMyProfile } from "./profileService";

type Probe = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type HealthReport = {
  authenticated: boolean;
  probes: Probe[];
};

async function headSelect(table: string): Promise<Probe> {
  const { error } = await supabase
    .from(table)
    .select("id", { head: true, count: "estimated" })
    .limit(1);
  if (error) {
    return { name: `select ${table}`, ok: false, detail: error.message };
  }
  return { name: `select ${table}`, ok: true };
}

/**
 * Tenta um upsert "no-op" ao perfil APENAS se este já existir.
 * Serve para validar se existe UNIQUE(user_id) quando usamos onConflict:'user_id'.
 */
async function tryNoopUpsertProfile(): Promise<Probe> {
  try {
    const existing = await getMyProfile();
    if (!existing) {
      return {
        name: "upsert dados_pessoais (noop)",
        ok: true,
        detail: "Ignorado (sem perfil existente — evita criação).",
      };
    }
    // Fazemos um upsert com os mesmos dados; deveria ser no-op.
    await upsertMyProfile({
      nomeCompleto: existing.nomeCompleto,
      dataNascimento: existing.dataNascimento,
      genero: existing.genero,
      morada: existing.morada,
      codigoPostal: existing.codigoPostal,
      telefone: existing.telefone,
      email: existing.email,
      situacaoTesouraria: existing.situacaoTesouraria,
      noticias: existing.noticias,
      // campos extra do teu tipo (se existirem)
      // @ts-ignore – apenas se o teu PessoaDados os tiver
      tipoSocio: (existing as any).tipoSocio ?? "Não pretendo ser sócio",
      // @ts-ignore
      tipoDocumento: (existing as any).tipoDocumento ?? "Cartão de cidadão",
      // @ts-ignore
      numeroDocumento: (existing as any).numeroDocumento ?? "",
      // @ts-ignore
      nif: (existing as any).nif ?? "",
      // @ts-ignore
      profissao: (existing as any).profissao ?? "",
    });
    return { name: "upsert dados_pessoais (noop)", ok: true };
  } catch (e: any) {
    return {
      name: "upsert dados_pessoais (noop)",
      ok: false,
      detail: String(e?.message || e),
    };
  }
}

/**
 * Teste de conectividade/perm/constraints.
 * - Não cria dados se não existir perfil.
 */
export async function testSupabaseConnection(): Promise<HealthReport> {
  const probes: Probe[] = [];

  // 1) Sessão
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  const authenticated = !!sessionData?.session?.access_token && !sessErr;

  // 2) SELECT head às tabelas (deteta RLS/perm)
  for (const tbl of ["dados_pessoais", "atletas", "pagamentos"]) {
    probes.push(await headSelect(tbl));
  }

  // 3) (Opcional) valida o onConflict:'user_id' com um upsert no-op
  probes.push(await tryNoopUpsertProfile());

  return { authenticated, probes };
}

import { supabase } from "../supabaseClient";

/**
 * Tipagem mínima para listagem na área de admin.
 * Alguns campos (validado, titular_*) podem não existir ainda — ajusta conforme a tua BD.
 */
export type AdminPagamento = {
  id: string;
  atleta_id: string | null;
  atleta_nome?: string | null;
  descricao: string | null;
  comprovativo_url: string | null;
  created_at: string | null;
  validado?: boolean | null;
  titular_user_id?: string | null;
  titular_nome?: string | null;
  titular_email?: string | null;
};

/** Lista pagamentos com URL assinado quando necessário e infos básicas do atleta/titular. */
export async function listarPagamentosComUrl(): Promise<AdminPagamento[]> {
  // 1) Ler pagamentos
  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      "id, atleta_id, descricao, comprovativo_url, created_at, validado, titular_user_id"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as any[];

  // 2) Enriquecer com nome do atleta (se quiseres; depende das tuas RLS/joins)
  //    Mantemos simples: tentamos ir buscar o nome do atleta por id
  const out: AdminPagamento[] = [];
  for (const r of rows) {
    let atletaNome: string | null = null;

    if (r.atleta_id) {
      const { data: a } = await supabase
        .from("atletas")
        .select("nome")
        .eq("id", r.atleta_id)
        .maybeSingle();
      atletaNome = (a as any)?.nome ?? null;
    }

    // (opcional) titular
    let titularNome: string | null = null;
    let titularEmail: string | null = null;
    if (r.titular_user_id) {
      const { data: dp } = await supabase
        .from("dados_pessoais")
        .select("nome_completo,email")
        .eq("user_id", r.titular_user_id)
        .maybeSingle();
      titularNome = (dp as any)?.nome_completo ?? null;
      titularEmail = (dp as any)?.email ?? null;
    }

    out.push({
      id: r.id,
      atleta_id: r.atleta_id ?? null,
      atleta_nome: atletaNome,
      descricao: r.descricao ?? null,
      comprovativo_url: r.comprovativo_url ?? null,
      created_at: r.created_at ?? null,
      validado: r.validado ?? null,
      titular_user_id: r.titular_user_id ?? null,
      titular_nome: titularNome,
      titular_email: titularEmail,
    });
  }

  return out;
}

/** Marca um pagamento como validado/invalidado (requer coluna `validado` na tabela). */
export async function marcarPagamentoValidado(
  pagamentoId: string,
  validado: boolean
): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado })
    .eq("id", pagamentoId);
  if (error) throw error;
}

/** Atualiza o campo `situacao_tesouraria` no titular (tabela `dados_pessoais`). */
export async function atualizarSituacaoTesouraria(
  titularUserId: string,
  situacao: string
): Promise<void> {
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: situacao })
    .eq("user_id", titularUserId);
  if (error) throw error;
}

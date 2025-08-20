// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nivel do pagamento na visão de admin */
export type NivelPagamento = "socio" | "atleta";

/** Linha normalizada para a UI do admin */
export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  descricao: string | null;
  validado: boolean;
  /** Comprovativo no Storage (caminho) */
  comprovativoUrl: string | null;
  /** URL assinada para abrir o ficheiro */
  signedUrl: string | null;
  /** Para pagamentos de atleta */
  atletaId: string | null;
  atletaNome: string | null;
  /** Titular (EE/Sócio) — deduzido via atleta.user_id (quando existe) */
  titularUserId: string | null;
  titularEmail: string | null;
  created_at: string | null;
};

const BUCKET = "pagamentos";

/** Assina um path do bucket de pagamentos (ou devolve null se não existir path) */
async function sign(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("[adminPagamentosService] createSignedUrl:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/**
 * Lista todos os pagamentos com enriquecimento (atleta, titular email) para o admin.
 * Não usa SQL raw (evita problemas de schema cache) e faz “fan-out” em 2 queries auxiliares.
 *
 * Tabelas usadas (atuais):
 *  - public.pagamentos: id, atleta_id (uuid|null), descricao (text), comprovativo_url (text|null), validado (bool), created_at (timestamptz)
 *  - public.atletas: id, user_id, nome
 *  - public.dados_pessoais: user_id, email
 */
export async function listPagamentosAdmin(): Promise<AdminPagamento[]> {
  // 1) Pagamentos base
  const { data: base, error } = await supabase
    .from("pagamentos")
    .select("id, atleta_id, descricao, comprovativo_url, validado, created_at");
  if (error) throw error;

  const rows = (base ?? []) as Array<{
    id: string;
    atleta_id: string | null;
    descricao: string | null;
    comprovativo_url: string | null;
    validado: boolean | null;
    created_at: string | null;
  }>;

  // 2) Se existirem pagamentos de atleta, ir buscar os atletas e respetivos user_ids
  const atletaIds = Array.from(
    new Set(rows.map((r) => r.atleta_id).filter((x): x is string => !!x))
  );

  let atletasMap = new Map<string, { user_id: string | null; nome: string | null }>();
  if (atletaIds.length > 0) {
    const { data: at, error: atErr } = await supabase
      .from("atletas")
      .select("id, user_id, nome")
      .in("id", atletaIds);
    if (atErr) throw atErr;
    for (const a of at ?? []) {
      atletasMap.set(a.id, { user_id: a.user_id ?? null, nome: a.nome ?? null });
    }
  }

  // 3) Para os titulares (user_ids) obter email em dados_pessoais
  const userIds = Array.from(
    new Set(
      Array.from(atletasMap.values())
        .map((v) => v.user_id)
        .filter((x): x is string => !!x)
    )
  );

  let emailsMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: dp, error: dpErr } = await supabase
      .from("dados_pessoais")
      .select("user_id, email")
      .in("user_id", userIds);
    if (dpErr) throw dpErr;
    for (const p of dp ?? []) {
      if (p.user_id) emailsMap.set(p.user_id, p.email ?? "");
    }
  }

  // 4) Montar saída normalizada + assinar URLs
  const out: AdminPagamento[] = [];
  for (const r of rows) {
    const nivel: NivelPagamento = r.atleta_id ? "atleta" : "socio";
    const atleta = r.atleta_id ? atletasMap.get(r.atleta_id) ?? null : null;
    const titularUserId = atleta?.user_id ?? null;
    const titularEmail = titularUserId ? emailsMap.get(titularUserId) ?? null : null;
    const signedUrl = await sign(r.comprovativo_url);

    out.push({
      id: r.id,
      nivel,
      descricao: r.descricao ?? null,
      validado: !!r.validado,
      comprovativoUrl: r.comprovativo_url ?? null,
      signedUrl,
      atletaId: r.atleta_id ?? null,
      atletaNome: atleta?.nome ?? null,
      titularUserId,
      titularEmail,
      created_at: r.created_at ?? null,
    });
  }

  // ordenar por data (mais recente primeiro)
  out.sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  return out;
}

/** Marca/Desmarca um pagamento como validado */
export async function markPagamentoValidado(id: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado: value })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Recalcula situação de tesouraria ao nível do titular (Sócio/EE) e atualiza `dados_pessoais.situacao_tesouraria`.
 * Heurística simples: se algum pagamento (de qualquer atleta do titular) estiver validado -> "Regularizado", caso contrário "Pendente".
 * (Como a tabela `pagamentos` ainda não tem `user_id` para "nível sócio", esta função ignora pagamentos sem `atleta_id`.)
 */
export async function recomputeTesourariaSocio(userId: string): Promise<void> {
  // atletas do titular
  const { data: ats, error: atErr } = await supabase
    .from("atletas")
    .select("id")
    .eq("user_id", userId);
  if (atErr) throw atErr;
  const ids = (ats ?? []).map((x) => x.id);
  if (ids.length === 0) {
    // sem atletas -> deixamos como está
    return;
  }

  // algum pagamento validado para estes atletas?
  const { data: pays, error: pErr } = await supabase
    .from("pagamentos")
    .select("id, validado")
    .in("atleta_id", ids)
    .eq("validado", true);
  if (pErr) throw pErr;

  const newStatus = (pays ?? []).length > 0 ? "Regularizado" : "Pendente";

  const { error: upErr } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: newStatus })
    .eq("user_id", userId);
  if (upErr) throw upErr;
}

/**
 * Recalcula situação de tesouraria a partir de um atleta (sobe a informação ao titular).
 * Implementação: encontra o `user_id` do atleta e delega em `recomputeTesourariaSocio`.
 */
export async function recomputeTesourariaAtleta(atletaId: string): Promise<void> {
  const { data: a, error } = await supabase
    .from("atletas")
    .select("user_id")
    .eq("id", atletaId)
    .maybeSingle();
  if (error) throw error;
  const userId = a?.user_id as string | undefined;
  if (userId) {
    await recomputeTesourariaSocio(userId);
  }
}

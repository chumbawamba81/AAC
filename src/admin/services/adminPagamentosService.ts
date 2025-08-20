// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Tipo de pagamento (separação mensalidades vs inscrição) */
export type TipoPagamento = "mensalidade" | "inscricao";

export type AdminPagamento = {
  id: string;
  tipo: TipoPagamento;
  descricao: string;
  validado: boolean;
  createdAt: string | null;
  comprovativoUrl: string | null;
  signedUrl?: string | null;

  atletaId: string | null;
  atletaNome: string | null;

  titularUserId: string | null;
  titularNome: string | null;
};

/** Assina URL do Storage para admins (bucket 'pagamentos') */
async function sign(urlPath: string | null): Promise<string | null> {
  if (!urlPath) return null;
  const { data, error } = await supabase
    .storage
    .from("pagamentos")
    .createSignedUrl(urlPath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}

/** Lista pagamentos (com join a atletas e nomes do titular) */
export async function listPagamentosAdmin(opts?: {
  tipo?: TipoPagamento;
  validado?: "qualquer" | "sim" | "nao";
  search?: string;
}): Promise<AdminPagamento[]> {
  // 1) pagamentos + relação a atleta (FK direta)
  let q = supabase
    .from("pagamentos")
    .select("id,tipo,descricao,validado,created_at,comprovativo_url,user_id,atleta_id,atletas(id,nome,user_id)")
    .order("created_at", { ascending: false });

  if (opts?.tipo) q = q.eq("tipo", opts.tipo);
  if (opts?.validado === "sim") q = q.eq("validado", true);
  if (opts?.validado === "nao") q = q.eq("validado", false);
  if (opts?.search) q = q.ilike("descricao", `%${opts.search}%`);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as any[];

  // 2) mapear titular user_id e atleta user_id -> buscar nome no dados_pessoais (1 batelada)
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.user_id) userIds.add(r.user_id);
    if (r.atletas?.user_id) userIds.add(r.atletas.user_id);
  }
  const ids = Array.from(userIds);
  const titularMap = new Map<string, string>(); // user_id -> nome_completo

  if (ids.length) {
    const { data: dps, error: e2 } = await supabase
      .from("dados_pessoais")
      .select("user_id,nome_completo")
      .in("user_id", ids);
    if (!e2 && dps) {
      for (const dp of dps as any[]) {
        if (dp.user_id) titularMap.set(dp.user_id, dp.nome_completo || "");
      }
    }
  }

  // 3) construir saída + assinar urls
  const out: AdminPagamento[] = [];
  for (const r of rows) {
    const titularUserId: string | null = r.user_id ?? r.atletas?.user_id ?? null;
    const titularNome: string | null =
      titularUserId ? (titularMap.get(titularUserId) || null) : null;

    out.push({
      id: r.id,
      tipo: (r.tipo || "mensalidade") as TipoPagamento,
      descricao: r.descricao,
      validado: !!r.validado,
      createdAt: r.created_at || null,
      comprovativoUrl: r.comprovativo_url || null,
      atletaId: r.atleta_id || null,
      atletaNome: r.atletas?.nome || null,
      titularUserId,
      titularNome,
    });
  }

  // assinar em paralelo (sem falhar a lista se algum falhar)
  await Promise.all(
    out.map(async (x) => {
      x.signedUrl = await sign(x.comprovativoUrl);
    })
  );

  return out;
}

/** Marca/Desmarca um pagamento como validado */
export async function marcarPagamentoValidado(pagamentoId: string, validado: boolean) {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado })
    .eq("id", pagamentoId);
  if (error) throw error;
}

/** Recria as slots de mensalidade do atleta segundo o plano atual (SQL trigger-compatible) */
export async function recomputeSlotsMensalidades(atletaId: string) {
  // A função definida no SQL chama-se ensure_pagamentos_for_atleta(atleta_id uuid)
  const { error } = await supabase.rpc("ensure_pagamentos_for_atleta", { p_atleta_id: atletaId });
  if (error) throw error;
}

/** (Opcional) Recalcula situação de tesouraria do Sócio/EE (placeholder) */
export async function recomputeTesourariaSocio(_userId: string) {
  // Mantive como “no-op” para já — a tua UI mostra o estado por pagamento.
  return;
}

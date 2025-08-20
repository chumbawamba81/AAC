// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/**
 * Estrutura dos pagamentos + joins úteis para a administração
 */
export type AdminPagamento = {
  id: string;
  atleta_id: string | null;
  descricao: string;
  comprovativo_url: string | null;
  created_at: string | null;
  validado: boolean | null;

  // Joins
  atleta_nome: string | null;
  titular_user_id: string | null;
  titular_nome: string | null;

  // URL assinada para ver o ficheiro (se existir)
  signedUrl?: string | null;
};

/**
 * Constrói URL assinada de Storage (bucket: pagamentos).
 * Se já for link https://... devolve tal e qual.
 */
async function signUrlIfNeeded(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const { data, error } = await supabase
    .storage
    .from("pagamentos")
    .createSignedUrl(key, 60 * 60); // 1h

  if (error) {
    console.warn("[adminPagamentos] createSignedUrl error:", error.message);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * Lista de pagamentos, com filtros simples
 */
export async function listPagamentos(opts?: {
  search?: string;
  estado?: "all" | "val" | "pend" | "sem"; // validado / pendente (false) / sem (null)
  order?: "recentes" | "antigos";
}): Promise<AdminPagamento[]> {
  const o = opts || {};
  let q = supabase
    .from("pagamentos")
    .select(`
      id,
      atleta_id,
      descricao,
      comprovativo_url,
      created_at,
      validado,
      atletas!inner(
        id,
        nome,
        user_id
      ),
      dados_pessoais:atletas_user_id_fkey(user_id) 
    `) as any;

  // O join a dados_pessoais pelo user_id do atleta pode variar conforme FK.
  // Aqui vamos buscar o titular via sub-select manual (mais seguro):
  const { data, error } = await supabase.rpc("admin_list_pagamentos");
  // Se não tens a RPC criada ainda, removemos a chamada acima e fazemos SELECT “manual”:
  // Para não partir o build enquanto não existe a RPC, detectamos e caímos no plano B:
  let rows: any[] | null = null;
  if (!error && Array.isArray(data)) {
    rows = data as any[];
  } else {
    // Plano B (query com joins normais)
    const { data: data2, error: error2 } = await supabase
      .from("pagamentos as p")
      .select(`
        id,
        atleta_id,
        descricao,
        comprovativo_url,
        created_at,
        validado,
        atleta:atleta_id (
          id,
          nome,
          user_id
        ),
        titular:atleta_id!inner(user_id)
      `) as any;

    if (error2) throw error2;
    rows = data2 || [];
  }

  // Filtro em memória (robusto face às variantes de join)
  let list: AdminPagamento[] = (rows || []).map((r: any) => ({
    id: r.id,
    atleta_id: r.atleta_id ?? r?.atleta?.id ?? null,
    descricao: r.descricao,
    comprovativo_url: r.comprovativo_url ?? null,
    created_at: r.created_at ?? null,
    validado: r.validado ?? null,
    atleta_nome: r?.atleta?.nome ?? r?.atletas?.nome ?? r?.nome ?? null,
    titular_user_id: r?.atleta?.user_id ?? r?.titular?.user_id ?? r?.user_id ?? null,
    titular_nome: r?.titular_nome ?? r?.dados_pessoais?.nome_completo ?? null,
  }));

  // filtros
  if (o.estado && o.estado !== "all") {
    if (o.estado === "val") list = list.filter(x => x.validado === true);
    if (o.estado === "pend") list = list.filter(x => x.validado === false);
    if (o.estado === "sem") list = list.filter(x => x.validado == null);
  }
  if (o.search && o.search.trim()) {
    const t = o.search.trim().toLowerCase();
    list = list.filter(x =>
      (x.descricao || "").toLowerCase().includes(t) ||
      (x.atleta_nome || "").toLowerCase().includes(t) ||
      (x.titular_nome || "").toLowerCase().includes(t)
    );
  }
  // ordenação
  list.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return (o.order || "recentes") === "recentes" ? (tb - ta) : (ta - tb);
  });

  // assina URLs (em paralelo)
  await Promise.all(
    list.map(async (r) => {
      r.signedUrl = await signUrlIfNeeded(r.comprovativo_url);
    })
  );

  return list;
}

/**
 * Marca um pagamento como validado (true/false)
 */
export async function setPagamentoValidado(pagamentoId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado: value })
    .eq("id", pagamentoId);

  if (error) {
    console.error("[adminPagamentos] setPagamentoValidado error:", error.message);
    throw error;
  }
}

/**
 * Recalcula e atualiza a situação de tesouraria do titular:
 * - 'Regularizado' se não existirem pagamentos pendentes (validado != true)
 * - 'Pendente' caso contrário
 */
export async function recomputeTesourariaForUser(userId: string): Promise<"Regularizado" | "Pendente"> {
  // conta pagamentos do user pendentes
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id, validado, atletas!inner(user_id)")
    .eq("atletas.user_id", userId);

  if (error) {
    console.error("[adminPagamentos] read for recompute error:", error.message);
    throw error;
  }

  const hasPending = (data || []).some((r: any) => r.validado !== true);
  const status: "Regularizado" | "Pendente" = hasPending ? "Pendente" : "Regularizado";

  const { error: updErr } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: status })
    .eq("user_id", userId);

  if (updErr) {
    console.error("[adminPagamentos] update tesouraria error:", updErr.message);
    throw updErr;
  }

  return status;
}

/**
 * Conveniência: valida/anula um pagamento e atualiza a situação do titular
 */
export async function validarEAtualizar(pagamentoId: string, valor: boolean): Promise<{
  status: "Regularizado" | "Pendente";
  titularUserId: string | null;
}> {
  // 1) fetch para descobrir o titular
  const { data: pay, error: errPay } = await supabase
    .from("pagamentos")
    .select("id, atleta_id, atletas!inner(user_id)")
    .eq("id", pagamentoId)
    .maybeSingle();

  if (errPay) throw errPay;
  const titularUserId: string | null = (pay as any)?.atletas?.user_id ?? null;

  // 2) atualizar pagamento
  await setPagamentoValidado(pagamentoId, valor);

  // 3) se soubermos o titular, recalcular situação
  let status: "Regularizado" | "Pendente" = "Pendente";
  if (titularUserId) {
    status = await recomputeTesourariaForUser(titularUserId);
  }

  return { status, titularUserId };
}

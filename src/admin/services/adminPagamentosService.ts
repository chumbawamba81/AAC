// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Linha de pagamentos para a área de administração */
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

/** Assina uma key do bucket 'pagamentos' (se já for http(s), devolve tal e qual) */
async function signUrlIfNeeded(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const { data, error } = await supabase.storage
    .from("pagamentos")
    .createSignedUrl(key, 60 * 60); // 1h

  if (error) {
    console.warn("[adminPagamentos] createSignedUrl error:", error.message);
  }
  return data?.signedUrl ?? null;
}

/**
 * Lista pagamentos com filtros simples.
 * NOTA: sem aliases no `.from()` para evitar “Could not find the table … as p”.
 * Fazemos:
 *  1) SELECT pagamentos + join a atletas (para obter user_id e nome do atleta)
 *  2) SELECT a dados_pessoais com todos os user_id únicos (para obter nome do titular)
 */
export async function listPagamentos(opts?: {
  search?: string;
  estado?: "all" | "val" | "pend" | "sem"; // validado / pendente(false) / sem(null)
  order?: "recentes" | "antigos";
}): Promise<AdminPagamento[]> {
  const o = opts || {};

  // 1) Pagamentos + atleta (LEFT JOIN). A relação deve existir: pagamentos.atleta_id -> atletas.id
  const { data, error } = await supabase
    .from("pagamentos")
    .select(`
      id,
      atleta_id,
      descricao,
      comprovativo_url,
      created_at,
      validado,
      atletas:atleta_id (
        id,
        nome,
        user_id
      )
    `);

  if (error) throw error;

  const base: AdminPagamento[] = (data || []).map((r: any) => ({
    id: r.id,
    atleta_id: r.atleta_id ?? r?.atletas?.id ?? null,
    descricao: r.descricao,
    comprovativo_url: r.comprovativo_url ?? null,
    created_at: r.created_at ?? null,
    validado: r.validado ?? null,
    atleta_nome: r?.atletas?.nome ?? null,
    titular_user_id: r?.atletas?.user_id ?? null,
    titular_nome: null,
  }));

  // 2) Buscar nomes dos titulares em lote (dados_pessoais por user_id)
  const userIds = Array.from(
    new Set(base.map((r) => r.titular_user_id).filter(Boolean)) as Set<string>
  );
  if (userIds.length > 0) {
    const { data: titulares, error: e2 } = await supabase
      .from("dados_pessoais")
      .select("user_id,nome_completo")
      .in("user_id", userIds);

    if (e2) throw e2;

    const mapTit = new Map<string, string>();
    for (const t of titulares || []) {
      mapTit.set((t as any).user_id, (t as any).nome_completo);
    }
    for (const r of base) {
      if (r.titular_user_id && mapTit.has(r.titular_user_id)) {
        r.titular_nome = mapTit.get(r.titular_user_id)!;
      }
    }
  }

  // filtros
  let list = base;
  if (o.estado && o.estado !== "all") {
    if (o.estado === "val") list = list.filter((x) => x.validado === true);
    if (o.estado === "pend") list = list.filter((x) => x.validado === false);
    if (o.estado === "sem") list = list.filter((x) => x.validado == null);
  }
  if (o.search && o.search.trim()) {
    const t = o.search.trim().toLowerCase();
    list = list.filter(
      (x) =>
        (x.descricao || "").toLowerCase().includes(t) ||
        (x.atleta_nome || "").toLowerCase().includes(t) ||
        (x.titular_nome || "").toLowerCase().includes(t)
    );
  }

  // ordenar
  list.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return (o.order || "recentes") === "recentes" ? tb - ta : ta - tb;
  });

  // assinar URLs
  await Promise.all(
    list.map(async (r) => {
      r.signedUrl = await signUrlIfNeeded(r.comprovativo_url);
    })
  );

  return list;
}

/** Marca um pagamento como validado (true/false) */
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
 * Recalcula e escreve a situação de tesouraria do titular:
 * 'Regularizado' se não existirem pagamentos pendentes (validado != true)
 * 'Pendente' caso contrário.
 */
export async function recomputeTesourariaForUser(
  userId: string
): Promise<"Regularizado" | "Pendente"> {
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
  // Descobrir o titular do pagamento
  const { data: pay, error: errPay } = await supabase
    .from("pagamentos")
    .select("id, atleta_id, atletas!inner(user_id)")
    .eq("id", pagamentoId)
    .maybeSingle();

  if (errPay) throw errPay;
  const titularUserId: string | null = (pay as any)?.atletas?.user_id ?? null;

  // Atualizar o pagamento
  await setPagamentoValidado(pagamentoId, valor);

  // Recalcular situação (se soubermos o titular)
  let status: "Regularizado" | "Pendente" = "Pendente";
  if (titularUserId) {
    status = await recomputeTesourariaForUser(titularUserId);
  }

  return { status, titularUserId };
}

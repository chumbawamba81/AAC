// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

export type NivelPagamento = "socio" | "atleta";

export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  user_id: string | null;       // titular se 'socio'; no 'atleta' é o dono do atleta
  atleta_id: string | null;
  descricao: string;
  comprovativo_url: string | null;
  created_at: string | null;
  validado: boolean | null;

  // Joins/derivados
  atleta_nome: string | null;
  titular_nome: string | null;

  signedUrl?: string | null;
};

async function signUrlIfNeeded(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const { data, error } = await supabase.storage
    .from("pagamentos")
    .createSignedUrl(key, 60 * 60);
  if (error) console.warn("[adminPagamentos] sign error:", error.message);
  return data?.signedUrl ?? null;
}

/** Lê pagamentos; podes filtrar por nível, estado, busca e ordenação */
export async function listPagamentos(opts?: {
  search?: string;
  estado?: "all" | "val" | "pend" | "sem"; // true / false / null
  nivel?: "all" | NivelPagamento;
  order?: "recentes" | "antigos";
}): Promise<AdminPagamento[]> {
  const o = opts || {};

  // SELECT pagamentos + join opcional a atletas (para nome e user)
  const { data, error } = await supabase
    .from("pagamentos")
    .select(`
      id,
      nivel,
      user_id,
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

  let list: AdminPagamento[] = (data || []).map((r: any) => ({
    id: r.id,
    nivel: r.nivel as NivelPagamento,
    user_id: r.user_id ?? r?.atletas?.user_id ?? null,
    atleta_id: r.atleta_id ?? null,
    descricao: r.descricao,
    comprovativo_url: r.comprovativo_url ?? null,
    created_at: r.created_at ?? null,
    validado: r.validado ?? null,
    atleta_nome: r?.atletas?.nome ?? null,
    titular_nome: null,
  }));

  // Buscar nomes dos titulares em lote
  const uids = Array.from(new Set(list.map(x => x.user_id).filter(Boolean)) as Set<string>);
  if (uids.length > 0) {
    const { data: titulares, error: e2 } = await supabase
      .from("dados_pessoais")
      .select("user_id,nome_completo")
      .in("user_id", uids);
    if (e2) throw e2;
    const map = new Map<string, string>();
    (titulares || []).forEach((t: any) => map.set(t.user_id, t.nome_completo));
    list.forEach(r => { if (r.user_id && map.has(r.user_id)) r.titular_nome = map.get(r.user_id)!; });
  }

  // Filtros (nível, estado, busca)
  if (o.nivel && o.nivel !== "all") list = list.filter(x => x.nivel === o.nivel);
  if (o.estado && o.estado !== "all") {
    if (o.estado === "val")  list = list.filter(x => x.validado === true);
    if (o.estado === "pend") list = list.filter(x => x.validado === false);
    if (o.estado === "sem")  list = list.filter(x => x.validado == null);
  }
  if (o.search && o.search.trim()) {
    const t = o.search.trim().toLowerCase();
    list = list.filter(x =>
      (x.descricao || "").toLowerCase().includes(t) ||
      (x.atleta_nome || "").toLowerCase().includes(t) ||
      (x.titular_nome || "").toLowerCase().includes(t)
    );
  }

  // Ordenação
  list.sort((a,b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return (o.order || "recentes") === "recentes" ? tb - ta : ta - tb;
  });

  // Assinar URLs
  await Promise.all(list.map(async r => { r.signedUrl = await signUrlIfNeeded(r.comprovativo_url); }));

  return list;
}

/** Marca pagamento validado SIM/NÃO */
export async function setPagamentoValidado(pagamentoId: string, valor: boolean): Promise<void> {
  const { error } = await supabase.from("pagamentos").update({ validado: valor }).eq("id", pagamentoId);
  if (error) throw error;
}

/** Recalcula situação do SÓCIO: 'N/A' se tipo_socio = 'Não pretendo ser sócio' */
export async function recomputeTesourariaSocio(userId: string): Promise<"Regularizado"|"Pendente"|"N/A"> {
  // 1) ver tipo_socio
  const { data: dp, error: e1 } = await supabase
    .from("dados_pessoais")
    .select("tipo_socio")
    .eq("user_id", userId)
    .maybeSingle();
  if (e1) throw e1;

  const tipo = (dp?.tipo_socio || "").toString();
  if (tipo === "Não pretendo ser sócio") {
    await supabase.from("dados_pessoais").update({ situacao_tesouraria_socio: "N/A" }).eq("user_id", userId);
    return "N/A";
  }

  // 2) ver pagamentos nível 'socio'
  const { data: pays, error: e2 } = await supabase
    .from("pagamentos")
    .select("id,validado")
    .eq("nivel", "socio")
    .eq("user_id", userId);
  if (e2) throw e2;

  const pend = (pays || []).some(p => p.validado !== true);
  const status = pend ? "Pendente" : "Regularizado";
  const { error: e3 } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria_socio: status })
    .eq("user_id", userId);
  if (e3) throw e3;
  return status;
}

/** Recalcula situação do ATLETA */
export async function recomputeTesourariaAtleta(atletaId: string): Promise<"Regularizado"|"Pendente"> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,validado")
    .eq("nivel", "atleta")
    .eq("atleta_id", atletaId);
  if (error) throw error;
  const pend = (data || []).some(p => p.validado !== true);
  const status: "Regularizado" | "Pendente" = pend ? "Pendente" : "Regularizado";
  const { error: e2 } = await supabase
    .from("atletas")
    .update({ situacao_tesouraria: status })
    .eq("id", atletaId);
  if (e2) throw e2;
  return status;
}

/** Atalho: valida/anula e atualiza a situação correta (sócio ou atleta) */
export async function validarEAtualizar(pagamentoId: string, valor: boolean): Promise<{
  nivel: NivelPagamento;
  titularUserId: string | null;
  atletaId: string | null;
  statusAfter: string;
}> {
  // Ler pagamento para saber o nível
  const { data: p, error } = await supabase
    .from("pagamentos")
    .select("id,nivel,user_id,atleta_id")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (error) throw error;
  if (!p) throw new Error("Pagamento não encontrado");

  await setPagamentoValidado(pagamentoId, valor);

  if (p.nivel === "socio") {
    const status = p.user_id ? await recomputeTesourariaSocio(p.user_id) : "Pendente";
    return { nivel: "socio", titularUserId: p.user_id, atletaId: null, statusAfter: status };
  } else {
    const status = p.atleta_id ? await recomputeTesourariaAtleta(p.atleta_id) : "Pendente";
    return { nivel: "atleta", titularUserId: p.user_id ?? null, atletaId: p.atleta_id ?? null, statusAfter: status };
  }
}

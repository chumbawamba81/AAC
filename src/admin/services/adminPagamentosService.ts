// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nível do pagamento na visão de admin */
export type NivelPagamento = "socio" | "atleta";

/** Linha normalizada para a tabela de Pagamentos (tabela public.pagamentos) */
export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  descricao: string | null;
  validado: boolean;
  comprovativoUrl: string | null; // path no bucket "pagamentos"
  signedUrl: string | null;       // URL assinada para abrir o ficheiro
  atletaId: string | null;
  atletaNome: string | null;
  titularUserId: string | null;
  titularEmail: string | null;
  created_at: string | null;
};

/** Linha normalizada para comprovativos de inscrição do SÓCIO (tabela public.documentos) */
export type AdminSocioDoc = {
  id: string;
  userId: string;
  docTipo: string;
  page: number | null;
  path: string | null;       // path no bucket "documentos"
  signedUrl: string | null;  // URL assinada
  uploaded_at: string | null;
  titularEmail: string | null;
};

const BUCKET_PAGAMENTOS = "pagamentos";
const BUCKET_DOCUMENTOS = "documentos";

/* --------------------------------- helpers -------------------------------- */

async function signPagamentos(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_PAGAMENTOS)
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("[adminPagamentosService] signPagamentos:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

async function signDocumentos(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("[adminPagamentosService] signDocumentos:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/* -------------------------- Pagamentos (tabela) --------------------------- */

/**
 * Lista todos os pagamentos com enriquecimento (atleta, titular email) para o admin.
 * Evita SQL raw e resolve com chamadas adicionais.
 *
 * Tabelas usadas:
 *  - public.pagamentos: id, atleta_id (uuid|null), descricao, comprovativo_url, validado, created_at
 *  - public.atletas: id, user_id, nome
 *  - public.dados_pessoais: user_id, email
 */
export async function listPagamentosAdmin(): Promise<AdminPagamento[]> {
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

  // map atletas
  const atletaIds = Array.from(new Set(rows.map(r => r.atleta_id).filter((x): x is string => !!x)));
  const atletasMap = new Map<string, { user_id: string | null; nome: string | null }>();
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

  // map emails dos titulares
  const userIds = Array.from(
    new Set(Array.from(atletasMap.values()).map(v => v.user_id).filter((x): x is string => !!x))
  );
  const emailsMap = new Map<string, string>();
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

  // montar saída
  const out: AdminPagamento[] = [];
  for (const r of rows) {
    const nivel: NivelPagamento = r.atleta_id ? "atleta" : "socio";
    const atleta = r.atleta_id ? (atletasMap.get(r.atleta_id) ?? null) : null;
    const titularUserId = atleta?.user_id ?? null;
    const titularEmail = titularUserId ? (emailsMap.get(titularUserId) ?? null) : null;
    const signedUrl = await signPagamentos(r.comprovativo_url);
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

  out.sort((a,b)=> new Date(b.created_at||0).getTime() - new Date(a.created_at||0).getTime());
  return out;
}

/** Marca/Desmarca um pagamento como validado */
export async function markPagamentoValidado(id: string, value: boolean): Promise<void> {
  const { error } = await supabase.from("pagamentos").update({ validado: value }).eq("id", id);
  if (error) throw error;
}

/* ------------------- Comprovativos de INSCRIÇÃO (sócio) ------------------- */

/**
 * Lista comprovativos de inscrição do SÓCIO (vindos da tabela `documentos`, bucket `documentos`).
 * Considera doc_nivel='socio' e doc_tipo em:
 *  - 'Comprovativo de pagamento de sócio'
 *  - 'Comprovativo de pagamento de inscrição'
 */
export async function listComprovativosSocio(): Promise<AdminSocioDoc[]> {
  const { data: docs, error } = await supabase
    .from("documentos")
    .select("id, user_id, doc_tipo, page, file_path, path, uploaded_at")
    .eq("doc_nivel", "socio")
    .in("doc_tipo", [
      "Comprovativo de pagamento de sócio",
      "Comprovativo de pagamento de inscrição",
    ]);
  if (error) throw error;

  const rows = (docs ?? []) as Array<{
    id: string;
    user_id: string;
    doc_tipo: string;
    page: number | null;
    file_path: string | null;
    path: string | null;
    uploaded_at: string | null;
  }>;

  // emails por user_id
  const userIds = Array.from(new Set(rows.map(r => r.user_id)));
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: dp, error: dpErr } = await supabase
      .from("dados_pessoais")
      .select("user_id, email")
      .in("user_id", userIds);
    if (dpErr) throw dpErr;
    for (const p of dp ?? []) {
      if (p.user_id) emailMap.set(p.user_id, p.email ?? "");
    }
  }

  const out: AdminSocioDoc[] = [];
  for (const r of rows) {
    const finalPath = r.path || r.file_path || null;
    const signedUrl = await signDocumentos(finalPath);
    out.push({
      id: r.id,
      userId: r.user_id,
      docTipo: r.doc_tipo,
      page: r.page ?? null,
      path: finalPath,
      signedUrl,
      uploaded_at: r.uploaded_at ?? null,
      titularEmail: emailMap.get(r.user_id) ?? null,
    });
  }

  out.sort((a,b)=> new Date(b.uploaded_at||0).getTime() - new Date(a.uploaded_at||0).getTime());
  return out;
}

/** Atualiza situação de tesouraria do titular diretamente */
export async function setTesourariaSocio(userId: string, status: "Regularizado" | "Pendente"): Promise<void> {
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: status })
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Recalcula situação de tesouraria ao nível do titular com base em pagamentos de atleta.
 * Mantido porque é útil quando trabalhas na tabela `pagamentos`.
 */
export async function recomputeTesourariaSocio(userId: string): Promise<void> {
  const { data: ats, error: atErr } = await supabase
    .from("atletas")
    .select("id")
    .eq("user_id", userId);
  if (atErr) throw atErr;
  const ids = (ats ?? []).map(x => x.id);
  if (ids.length === 0) return;

  const { data: pays, error: pErr } = await supabase
    .from("pagamentos")
    .select("id, validado")
    .in("atleta_id", ids)
    .eq("validado", true);
  if (pErr) throw pErr;

  const status = (pays ?? []).length > 0 ? "Regularizado" : "Pendente";
  const { error: upErr } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: status })
    .eq("user_id", userId);
  if (upErr) throw upErr;
}

/** Recalcula tesouraria a partir de um atleta (sobe ao titular) */
export async function recomputeTesourariaAtleta(atletaId: string): Promise<void> {
  const { data: a, error } = await supabase
    .from("atletas")
    .select("user_id")
    .eq("id", atletaId)
    .maybeSingle();
  if (error) throw error;
  const userId = a?.user_id as string | undefined;
  if (userId) await recomputeTesourariaSocio(userId);
}

// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/* ===================== Tipos ===================== */

export type NivelPagamento = "socio" | "atleta";

export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  descricao: string | null;
  createdAt: string | null;
  // atleta
  atletaId: string | null;
  atletaNome: string | null;
  // titular
  titularUserId: string | null;
  titularEmail: string | null;
  // comprovativo (pagamentos)
  storageKey: string | null;
  signedUrl?: string | null;
  // estado de validação do pagamento
  validado: boolean;
};

export type EstadoMensalidades = "Regularizado" | "Pendente de validação" | "Em atraso" | "—";

export type AdminDoc = {
  id: string;
  userId: string | null;
  atletaId: string | null;
  docNivel: "socio" | "atleta";
  docTipo: string;
  page: number | null;
  objectPath: string | null;
  uploadedAt: string | null;
  // extras
  titularEmail: string | null;
  atletaNome: string | null;
  // NOVO: validação no documento
  validadoDoc: boolean;
  // NOVO: validação agregada no atleta
  inscricaoValidada: boolean | null; // só faz sentido quando docNivel='atleta'
  signedUrl?: string | null;
};

/* =============== Helpers de signed URL =============== */

async function signFromBucket(bucket: string, key: string | null, seconds = 3600) {
  if (!key) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/* ===================== Mensalidades ===================== */

export async function listPagamentosAdmin(): Promise<AdminPagamento[]> {
  // pagamentos (mensalidades/anuidades de atleta) – bucket 'pagamentos'
  const { data, error } = await supabase
    .from("pagamentos")
    .select(
      `
      id,
      atleta_id,
      descricao,
      comprovativo_url,
      created_at,
      validado,
      atletas:atleta_id ( nome, user_id ),
      titular:dados_pessoais!inner(user_id,email)
    `
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  const out: AdminPagamento[] = [];
  for (const r of (data as any[]) || []) {
    out.push({
      id: r.id,
      nivel: "atleta",
      descricao: r.descricao ?? null,
      createdAt: r.created_at ?? null,
      atletaId: r.atleta_id ?? null,
      atletaNome: r.atletas?.nome ?? null,
      titularUserId: r.titular?.user_id ?? null,
      titularEmail: r.titular?.email ?? null,
      storageKey: r.comprovativo_url ?? null,
      validado: !!r.validado,
      signedUrl: await signFromBucket("pagamentos", r.comprovativo_url ?? null),
    });
  }
  return out;
}

/** Marca/desmarca um pagamento (mensalidade/trimestre/anuidade de atleta) como validado */
export async function markPagamentoValidado(pagamentoId: string, ok: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado: ok })
    .eq("id", pagamentoId);
  if (error) throw error;
}

/** Estado por atleta — (implementação simples) */
export function computeEstadoByAtleta(rows: AdminPagamento[]): Map<
  string,
  { estado: EstadoMensalidades }
> {
  const m = new Map<string, { estado: EstadoMensalidades }>();
  for (const r of rows) {
    if (!r.atletaId) continue;
    // heurística básica: se tem algum pago e validado => Regularizado; se tem comprovativo não validado => Pendente de validação
    const prev = m.get(r.atletaId);
    if (r.validado) {
      m.set(r.atletaId, { estado: "Regularizado" });
    } else if (!prev) {
      m.set(r.atletaId, { estado: "Pendente de validação" });
    }
  }
  return m;
}

/* ===================== Inscrição — SÓCIO ===================== */

const DOC_SOCIO = "Comprovativo de pagamento de sócio";

export async function listComprovativosSocio(): Promise<AdminDoc[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select(
      `
      id, user_id, atleta_id, doc_nivel, doc_tipo, page, object_path, uploaded_at, validado,
      titular:dados_pessoais!inner(user_id,email)
    `
    )
    .eq("doc_nivel", "socio")
    .eq("doc_tipo", DOC_SOCIO)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const out: AdminDoc[] = [];
  for (const d of (data as any[]) || []) {
    out.push({
      id: d.id,
      userId: d.user_id ?? null,
      atletaId: d.atleta_id ?? null,
      docNivel: "socio",
      docTipo: d.doc_tipo,
      page: d.page ?? null,
      objectPath: d.object_path ?? null,
      uploadedAt: d.uploaded_at ?? null,
      titularEmail: d.titular?.email ?? null,
      atletaNome: null,
      validadoDoc: !!d.validado,
      inscricaoValidada: null,
      signedUrl: await signFromBucket("documentos", d.object_path ?? null),
    });
  }
  return out;
}

/** Atualiza situação de tesouraria do titular (dados_pessoais) */
export async function setTesourariaSocio(userId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: status })
    .eq("user_id", userId);
  if (error) throw error;
}

/* ===================== Inscrição — ATLETA ===================== */

const DOC_ATLETA_INSCR = "Comprovativo de pagamento de inscrição";

export async function listComprovativosInscricaoAtleta(): Promise<AdminDoc[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select(
      `
      id, user_id, atleta_id, doc_nivel, doc_tipo, page, object_path, uploaded_at, validado,
      atleta:atletas!inner(id, nome, inscricao_validada),
      titular:dados_pessoais!inner(user_id, email)
    `
    )
    .eq("doc_nivel", "atleta")
    .eq("doc_tipo", DOC_ATLETA_INSCR)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;

  const out: AdminDoc[] = [];
  for (const d of (data as any[]) || []) {
    out.push({
      id: d.id,
      userId: d.user_id ?? null,
      atletaId: d.atleta?.id ?? d.atleta_id ?? null,
      docNivel: "atleta",
      docTipo: d.doc_tipo,
      page: d.page ?? null,
      objectPath: d.object_path ?? null,
      uploadedAt: d.uploaded_at ?? null,
      titularEmail: d.titular?.email ?? null,
      atletaNome: d.atleta?.nome ?? null,
      validadoDoc: !!d.validado,
      inscricaoValidada: typeof d.atleta?.inscricao_validada === "boolean" ? d.atleta.inscricao_validada : null,
      signedUrl: await signFromBucket("documentos", d.object_path ?? null),
    });
  }
  return out;
}

/** Marca/reverte a inscrição validada (ATUALIZA AMBAS as tabelas) */
export async function setInscricaoAtletaValidada(atletaId: string, ok: boolean): Promise<void> {
  // 1) atletas.inscricao_validada
  const { error: e1 } = await supabase
    .from("atletas")
    .update({ inscricao_validada: ok })
    .eq("id", atletaId);
  if (e1) throw e1;

  // 2) documentos.validado para os docs de inscrição desse atleta
  const { error: e2 } = await supabase
    .from("documentos")
    .update({ validado: ok })
    .eq("doc_nivel", "atleta")
    .eq("doc_tipo", DOC_ATLETA_INSCR)
    .eq("atleta_id", atletaId);
  if (e2) throw e2;
}

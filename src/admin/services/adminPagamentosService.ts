// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nível do pagamento na visão admin */
export type NivelPagamento = "socio" | "atleta";

/** Plano de pagamento do atleta */
export type Plano = "Mensal" | "Trimestral" | "Anual";

/** Linha normalizada para a tabela de Pagamentos (public.pagamentos) */
export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  descricao: string | null;
  validado: boolean;
  comprovativoUrl: string | null; // path no bucket "pagamentos"
  signedUrl: string | null;       // URL assinada
  atletaId: string | null;
  atletaNome: string | null;
  titularUserId: string | null;
  titularEmail: string | null;
  created_at: string | null;

  // extra para cálculo de estado
  plano?: Plano | null;
  escalao?: string | null;
};

/** Linha normalizada para comprovativos de inscrição (SOCIO ou ATLETA) @ documentos */
export type AdminDoc = {
  id: string;
  userId: string | null;     // titular user id (sócio) — pode vir null nos docs de atleta
  atletaId: string | null;   // para inscrição do atleta
  atletaNome: string | null; // para inscrição do atleta
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

  // map atletas (com plano e escalao)
  const atletaIds = Array.from(new Set(rows.map(r => r.atleta_id).filter((x): x is string => !!x)));
  const atletasMap = new Map<
    string,
    { user_id: string | null; nome: string | null; escalao: string | null; opcao_pagamento: string | null }
  >();
  if (atletaIds.length > 0) {
    const { data: at, error: atErr } = await supabase
      .from("atletas")
      .select("id, user_id, nome, escalao, opcao_pagamento")
      .in("id", atletaIds);
    if (atErr) throw atErr;
    for (const a of at ?? []) {
      atletasMap.set(a.id, {
        user_id: a.user_id ?? null,
        nome: a.nome ?? null,
        escalao: a.escalao ?? null,
        opcao_pagamento: a.opcao_pagamento ?? null,
      });
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

  const out: AdminPagamento[] = [];
  for (const r of rows) {
    const nivel: NivelPagamento = r.atleta_id ? "atleta" : "socio";
    const atleta = r.atleta_id ? (atletasMap.get(r.atleta_id) ?? null) : null;
    const titularUserId = atleta?.user_id ?? null;
    const titularEmail = titularUserId ? (emailsMap.get(titularUserId) ?? null) : null;
    const signedUrl = await signPagamentos(r.comprovativo_url);

    // normaliza plano: masters/sub-23 => Anual
    const planoRaw = atleta?.opcao_pagamento as Plano | null | undefined;
    const forcedAnnual =
      (atleta?.escalao || "").toLowerCase().includes("masters") ||
      (atleta?.escalao || "").toLowerCase().includes("sub 23") ||
      (atleta?.escalao || "").toLowerCase().includes("sub-23");
    const plano = forcedAnnual ? ("Anual" as Plano) : (planoRaw ?? null);

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
      plano,
      escalao: atleta?.escalao ?? null,
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

/* --------------------- Comprovativos de INSCRIÇÃO (documentos) -------------------- */

export async function listComprovativosSocio(): Promise<AdminDoc[]> {
  const { data: docs, error } = await supabase
    .from("documentos")
    .select("id, user_id, atleta_id, doc_tipo, page, file_path, path, uploaded_at")
    .eq("doc_nivel", "socio")
    .in("doc_tipo", [
      "Comprovativo de pagamento de sócio",
      "Comprovativo de pagamento de inscrição",
    ]);
  if (error) throw error;

  const rows = (docs ?? []) as Array<any>;
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: dp, error: dpErr } = await supabase
      .from("dados_pessoais")
      .select("user_id, email")
      .in("user_id", userIds as string[]);
    if (dpErr) throw dpErr;
    for (const p of dp ?? []) if (p.user_id) emailMap.set(p.user_id, p.email ?? "");
  }

  const out: AdminDoc[] = [];
  for (const r of rows) {
    const finalPath = r.path || r.file_path || null;
    const signedUrl = await signDocumentos(finalPath);
    out.push({
      id: r.id,
      userId: r.user_id ?? null,
      atletaId: r.atleta_id ?? null,
      atletaNome: null,
      docTipo: r.doc_tipo,
      page: r.page ?? null,
      path: finalPath,
      signedUrl,
      uploaded_at: r.uploaded_at ?? null,
      titularEmail: r.user_id ? (emailMap.get(r.user_id) ?? null) : null,
    });
  }
  out.sort((a,b)=> new Date(b.uploaded_at||0).getTime() - new Date(a.uploaded_at||0).getTime());
  return out;
}

/** ATLETA — comprovativo de pagamento de inscrição (em documentos) */
export async function listComprovativosInscricaoAtleta(): Promise<AdminDoc[]> {
  const { data: docs, error } = await supabase
    .from("documentos")
    .select("id, user_id, atleta_id, doc_tipo, page, file_path, path, uploaded_at")
    .eq("doc_nivel", "atleta")
    .eq("doc_tipo", "Comprovativo de pagamento de inscrição");
  if (error) throw error;

  const rows = (docs ?? []) as Array<any>;
  const atletaIds = Array.from(new Set(rows.map((r) => r.atleta_id).filter(Boolean)));

  // Mapear atletas -> (nome, user_id)
  const atletasMap = new Map<string, { nome: string | null; user_id: string | null }>();
  if (atletaIds.length > 0) {
    const { data: at, error: atErr } = await supabase
      .from("atletas")
      .select("id, nome, user_id")
      .in("id", atletaIds as string[]);
    if (atErr) throw atErr;
    for (const a of at ?? []) atletasMap.set(a.id, { nome: a.nome ?? null, user_id: a.user_id ?? null });
  }

  // Emails dos titulares a partir do atletasMap (❗️corrige o erro do 'at' fora de escopo)
  const userIds = Array.from(
    new Set(Array.from(atletasMap.values()).map(v => v.user_id).filter((x): x is string => !!x))
  );
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: dp, error: dpErr } = await supabase
      .from("dados_pessoais")
      .select("user_id, email")
      .in("user_id", userIds as string[]);
    if (dpErr) throw dpErr;
    for (const p of dp ?? []) if (p.user_id) emailMap.set(p.user_id, p.email ?? "");
  }

  const out: AdminDoc[] = [];
  for (const r of rows) {
    const finalPath = r.path || r.file_path || null;
    const signedUrl = await signDocumentos(finalPath);
    const a = r.atleta_id ? atletasMap.get(r.atleta_id) ?? null : null;
    out.push({
      id: r.id,
      userId: r.user_id ?? (a?.user_id ?? null),
      atletaId: r.atleta_id ?? null,
      atletaNome: a?.nome ?? null,
      docTipo: r.doc_tipo,
      page: r.page ?? null,
      path: finalPath,
      signedUrl,
      uploaded_at: r.uploaded_at ?? null,
      titularEmail: a?.user_id ? (emailMap.get(a.user_id) ?? null) : null,
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

/** Recalcula situação (titular) com base em pagamentos de atletas */
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

/* ---------------------- Cálculo de ESTADO (mensalidades) ---------------------- */

export type EstadoMensalidades = "Regularizado" | "Pendente de validação" | "Em atraso" | "—";

function seasonStartYear(today = new Date()): number {
  const m = today.getMonth() + 1; // 1..12
  const y = today.getFullYear();
  return m >= 9 ? y : y - 1;
}

function scheduleForPlano(plano: Plano, seasonY = seasonStartYear()): Date[] {
  // datas de vencimento (dia 1) — TZ local
  const ds: Date[] = [];
  if (plano === "Mensal") {
    // set…jun (10 meses)
    const months = [9,10,11,12,1,2,3,4,5,6]; // 9..12 seasonY, 1..6 seasonY+1
    for (const mm of months) {
      const year = mm >= 9 ? seasonY : seasonY + 1;
      ds.push(new Date(year, mm - 1, 1, 0, 0, 0, 0));
    }
  } else if (plano === "Trimestral") {
    ds.push(new Date(seasonY, 8, 1));  // set
    ds.push(new Date(seasonY + 1, 0, 1)); // jan
    ds.push(new Date(seasonY + 1, 3, 1)); // abr
  } else {
    ds.push(new Date(seasonY, 8, 1)); // set (anuidade)
  }
  return ds;
}

function parseDescricaoSlot(desc: string | null, plano: Plano): number | null {
  if (!desc) return null;
  const s = desc.toLowerCase();
  if (plano === "Mensal") {
    const m = s.match(/pagamento\s*-\s*(\d+)[ºo]?\s*m[eê]s/);
    if (m) return Math.max(1, parseInt(m[1], 10)) - 1;
  } else if (plano === "Trimestral") {
    const t = s.match(/pagamento\s*-\s*(\d+)[ºo]?\s*trimestre/);
    if (t) return Math.max(1, parseInt(t[1], 10)) - 1;
  } else {
    if (s.includes("anuidade")) return 0;
  }
  return null;
}

/** Calcula o estado do atleta a partir de TODOS os pagamentos dele */
export function computeEstadoByAtleta(rows: AdminPagamento[]): Map<string, { estado: EstadoMensalidades; detail: string }> {
  // agrupar por atleta
  const byAth = new Map<string, AdminPagamento[]>();
  for (const r of rows) {
    if (!r.atletaId) continue;
    const arr = byAth.get(r.atletaId) || [];
    arr.push(r);
    byAth.set(r.atletaId, arr);
  }

  const out = new Map<string, { estado: EstadoMensalidades; detail: string }>();
  const today = new Date();
  const seasonY = seasonStartYear(today);

  for (const [athId, list] of byAth) {
    const any = list[0];
    const plano = (any?.plano ?? "Mensal") as Plano;
    const schedule = scheduleForPlano(plano, seasonY);

    // quantos já venceram até hoje?
    const dueCount = schedule.filter(d => d.getTime() <= today.getTime()).length;
    if (dueCount === 0) { out.set(athId, { estado: "—", detail: "" }); continue; }

    // pagamentos por slot
    const slotStatus: ("ok" | "pending" | "missing")[] = Array.from({ length: dueCount }, () => "missing");
    for (const r of list) {
      const slot = parseDescricaoSlot(r.descricao, plano);
      if (slot == null || slot < 0 || slot >= dueCount) continue;
      if (r.validado) slotStatus[slot] = "ok";
      else if (slotStatus[slot] !== "ok") slotStatus[slot] = "pending";
    }

    const missing = slotStatus.filter(s => s === "missing").length;
    const pending = slotStatus.filter(s => s === "pending").length;

    let estado: EstadoMensalidades = "Regularizado";
    if (missing > 0) estado = "Em atraso";
    else if (pending > 0) estado = "Pendente de validação";

    const detail =
      plano === "Mensal"
        ? `Vencidos ${dueCount}/10 · ok ${dueCount - missing - pending}, pend ${pending}, em falta ${missing}`
        : plano === "Trimestral"
        ? `Vencidos ${dueCount}/3 · ok ${dueCount - missing - pending}, pend ${pending}, em falta ${missing}`
        : `Vencidos ${dueCount}/1 · ${missing > 0 ? "em falta" : pending > 0 ? "pendente" : "ok"}`;

    out.set(athId, { estado, detail });
  }

  return out;
}

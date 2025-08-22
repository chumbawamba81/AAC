// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";
import type { PlanoPagamento } from "../types/Atleta";

/* ======================= Tipos ======================= */
export type PagamentoRow = {
  id: string;
  user_id: string | null;
  atleta_id: string | null;
  tipo: "inscricao" | "quota";
  descricao: string;                 // único por atleta (ux_pagamentos_atleta_descricao)
  comprovativo_url: string | null;
  validado: boolean;                 // NOT NULL (false = pendente)
  devido_em: string | null;          // 'YYYY-MM-DD'
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

/* ======================= Utils de datas ======================= */

// 30 de setembro do ano corrente
export function sep30OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-30`;
}

// 8 de setembro — ainda usado como fallback nalguns locais
export function sep8OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-08`;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "").toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub-23") ||
    s.includes("sub 23") ||
    s.includes("seniores sub 23") ||
    s.includes("seniores sub-23")
  );
}

/* ======================= Rótulos / slots / prazos ======================= */

export function getSlotsForPlano(p: PlanoPagamento) {
  return p === "Mensal" ? 10 : p === "Trimestral" ? 3 : 1;
}

export function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}

// Datas-limite por plano.
// Regras: primeiro pagamento a 30/09; restantes mantêm (08 Jan / 08 Abr e 08 de cada mês).
function buildDueDates(plano: PlanoPagamento): string[] {
  const now = new Date();
  const year = now.getFullYear();

  if (plano === "Anual") {
    return [sep30OfCurrentYear()];
  }

  if (plano === "Trimestral") {
    // 1º: 30 Set (ano corrente), 2º: 08 Jan (ano seguinte), 3º: 08 Abr (ano seguinte)
    return [`${year}-09-30`, `${year + 1}-01-08`, `${year + 1}-04-08`];
  }

  // Mensal: 10 meses de Setembro a Junho; o 1.º vence a 30/09
  const out: string[] = [];
  out.push(`${year}-09-30`); // Setembro
  const monthlyDays = [
    { y: year, m: 9, d: 8 },   // Out
    { y: year, m: 10, d: 8 },  // Nov
    { y: year, m: 11, d: 8 },  // Dez
    { y: year + 1, m: 0, d: 8 }, // Jan
    { y: year + 1, m: 1, d: 8 },  // Fev
    { y: year + 1, m: 2, d: 8 },  // Mar
    { y: year + 1, m: 3, d: 8 },  // Abr
    { y: year + 1, m: 4, d: 8 },  // Mai
    { y: year + 1, m: 5, d: 8 },  // Jun
  ];
  for (const x of monthlyDays) out.push(fmt(new Date(x.y, x.m, x.d)));
  return out;
}

/* ======================= Storage helpers ======================= */

async function getSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from("pagamentos").createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    out.push({ ...r, signedUrl: await getSignedUrl(r.comprovativo_url) });
  }
  return out;
}

/* ======================= CRUD Básico ======================= */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", atletaId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as PagamentoRow[];
}

export async function deletePagamento(row: PagamentoRow) {
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw error;
}

/* ======================= Upload de comprovativos ======================= */

export async function saveComprovativo(params: {
  userId: string;
  atletaId: string;
  descricao: string; // tem de existir na tabela (foi criado pelo schedule/seed)
  file: File;
}) {
  // 1) upload do ficheiro
  const path = `${params.userId}/atletas/${params.atletaId}/${Date.now()}_${params.file.name}`;
  const up = await supabase.storage.from("pagamentos").upload(path, params.file, { upsert: false });
  if (up.error) throw up.error;

  // 2) atualizar a linha (validado permanece false)
  const { error } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: path, validado: false })
    .eq("atleta_id", params.atletaId)
    .eq("descricao", params.descricao);
  if (error) throw error;
}



export async function saveComprovativoSocioInscricao(userId: string, file: File) {
  const path = `${userId}/socio/${Date.now()}_${file.name}`;
  const up = await supabase.storage.from("pagamentos").upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  const { error } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: path, validado: false })
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "inscricao");
  if (error) throw error;
}

// === NOVO: upload do comprovativo da INSCRIÇÃO do atleta (independente da descrição)
export async function saveComprovativoInscricaoAtleta(params: {
  userId: string;
  atletaId: string;
  file: File;
}) {
  // 1) enviar para o storage
  const path = `${params.userId}/atletas/${params.atletaId}/inscricao/${Date.now()}_${params.file.name}`;
  const up = await supabase.storage.from("pagamentos").upload(path, params.file, { upsert: false });
  if (up.error) throw up.error;

  // 2) atualizar a linha de inscrição (tipo='inscricao') do atleta
  const { error } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: path, validado: false })
    .eq("atleta_id", params.atletaId)
    .eq("tipo", "inscricao"); // <— não dependemos da descrição
  if (error) throw error;
}

// === NOVO: limpar comprovativo (sem apagar o registo)
export async function clearComprovativo(row: PagamentoRow) {
  const { error } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: null, validado: false })
    .eq("id", row.id);
  if (error) throw error;
}

/* ======================= Sócio — inscrição ======================= */
/** IMPORTANTE: sem ON CONFLICT. Fazemos SELECT → INSERT se não existir. */
export async function createInscricaoSocioIfMissing(userId: string) {
  const due = sep30OfCurrentYear(); // 30/09 (pedido)

  const { data: exists, error: selErr } = await supabase
    .from("pagamentos")
    .select("id,devido_em")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "inscricao")
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;

  if (!exists) {
    const { error: insErr } = await supabase.from("pagamentos").insert({
      user_id: userId,
      atleta_id: null,
      tipo: "inscricao",
      descricao: "Inscrição de Sócio",
      comprovativo_url: null,
      validado: false, // NOT NULL
      devido_em: due,
    });
    if (insErr) throw insErr;
  } else if (!exists.devido_em) {
    // alinhar o prazo se vier nulo
    const { error: updErr } = await supabase
      .from("pagamentos")
      .update({ devido_em: due })
      .eq("id", exists.id);
    if (updErr) throw updErr;
  }
}

/** Listar a inscrição de sócio (última) — usado na App e em Pagamentos.tsx */
export async function listSocioInscricao(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "inscricao")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data || []) as PagamentoRow[];
}

/* ======================= Ajustes (inscrição atleta, se existir) ======================= */

// Se já existir uma inscrição do atleta, força a data-limite para 30/09 do ano corrente.
async function bumpAtletaInscricaoToSep30(atletaId: string) {
  const { error } = await supabase
    .from("pagamentos")
    .update({ devido_em: sep30OfCurrentYear() })
    .eq("atleta_id", atletaId)
    .eq("tipo", "inscricao");
  if (error) throw error;
}

/* ======================= Schedule do atleta (idempotente) ======================= */
/** NOTA: aqui o ON CONFLICT usa (atleta_id, descricao),
 *        que corresponde ao teu UNIQUE "ux_pagamentos_atleta_descricao".
 */
// src/services/pagamentosService.ts

// Garante que existe uma linha de INSCRIÇÃO para o atleta (tipo='inscricao').
// Se não existir, cria com descrição "Taxa de inscrição" e prazo 30/09.
export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: PlanoPagamento },
  opts?: { forceRebuild?: boolean }
) {
  const onlyInscricao = isAnuidadeObrigatoria(atleta.escalao); // Masters/Sub-23 => só inscrição

  // 0) Garante SEMPRE a linha de inscrição do atleta
  await ensureInscricaoAtletaIfMissing(atleta.id);

  // 1) Se for rebuild, remove TODAS as quotas existentes (mantém inscrição)
  if (opts?.forceRebuild) {
    const { error: delErr } = await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id)
      .eq("tipo", "quota");
    if (delErr) throw delErr;
  }

  // 2) Masters/Sub-23: não geram quotas; só alinhamos o prazo da inscrição
  if (onlyInscricao) {
    await bumpAtletaInscricaoToSep30(atleta.id);
    return;
  }

  // 3) Restantes: gera/atualiza as quotas do plano
  const planoEfetivo: PlanoPagamento = atleta.planoPagamento;
  const labels = Array.from({ length: getSlotsForPlano(planoEfetivo) }, (_, i) =>
    getPagamentoLabel(planoEfetivo, i)
  );
  const dues = buildDueDates(planoEfetivo);

  const rows = labels.map((descricao, i) => ({
    user_id: null as any,
    atleta_id: atleta.id,
    tipo: "quota" as const,
    descricao,
    comprovativo_url: null,
    validado: false,
    devido_em: dues[i] || null,
  }));

  // upsert idempotente sobre (atleta_id, descricao) — corresponde ao UNIQUE
  const { error } = await supabase
    .from("pagamentos")
    .upsert(rows, { onConflict: "atleta_id,descricao" });
  if (error) throw error;

  // 4) Alinhar a inscrição para 30/09 (seja nova ou pré-existente)
  await bumpAtletaInscricaoToSep30(atleta.id);
}


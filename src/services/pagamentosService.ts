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
function sep30OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-30`;
}

// 8 de setembro — mantido só se precisares noutros contextos
function sep8OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-08`;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isAnuidadeObrigatoria(escalao?: string | null) {
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
// Regras pedidas: primeiro pagamento a 30/09; restantes mantêm (08 de cada mês / 08 Jan / 08 Abr).
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
  // Outubro a Junho → dia 08
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

export async function saveComprovativo(params: {
  userId: string;
  atletaId: string;
  descricao: string; // tem de existir na tabela (foi criado pelo schedule)
  file: File;
}) {
  // 1) escrever ficheiro no bucket "pagamentos"
  const path = `${params.userId}/atletas/${params.atletaId}/${Date.now()}_${params.file.name}`;
  const up = await supabase.storage.from("pagamentos").upload(path, params.file, { upsert: false });
  if (up.error) throw up.error;

  // 2) atualizar a linha (validado permanece false até validação de admin)
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

/* ======================= Sócio — inscrição ======================= */

export async function createInscricaoSocioIfMissing(userId: string) {
  // cria (se não existir) a linha "inscricao" do sócio
  const due = sep30OfCurrentYear(); // 30/09 (pedido)
  const row = {
    user_id: userId,
    atleta_id: null,
    tipo: "inscricao" as const,
    descricao: "Inscrição de Sócio",
    comprovativo_url: null,
    validado: false,   // NOT NULL
    devido_em: due,
  };
  // upsert por (user_id, atleta_id, descricao)
  const { error } = await supabase
    .from("pagamentos")
    .upsert(row, { onConflict: "user_id,atleta_id,descricao" });
  if (error) throw error;
}

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

export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: PlanoPagamento },
  opts?: { forceRebuild?: boolean }
) {
  const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(atleta.escalao) ? "Anual" : atleta.planoPagamento;
  const labels = Array.from({ length: getSlotsForPlano(planoEfetivo) }, (_, i) => getPagamentoLabel(planoEfetivo, i));
  const dues = buildDueDates(planoEfetivo);

  // Se for “rebuild”, apaga primeiro as quotas deste conjunto (mantém inscrição).
  if (opts?.forceRebuild) {
    const { error: delErr } = await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id)
      .eq("tipo", "quota")
      .in("descricao", labels);
    if (delErr) throw delErr;
  }

  // upsert — evita violar ux_pagamentos_atleta_descricao e atualiza devido_em
  const rows = labels.map((descricao, i) => ({
    user_id: null as any, // pode ser populado por trigger; deixamos null aqui se a coluna permitir
    atleta_id: atleta.id,
    tipo: "quota" as const,
    descricao,
    comprovativo_url: null,
    validado: false,              // NOT NULL (pendente)
    devido_em: dues[i] || null,   // 30/09 para o primeiro, restantes conforme a regra
  }));

  const { error } = await supabase
    .from("pagamentos")
    .upsert(rows, { onConflict: "atleta_id,descricao" });
  if (error) throw error;

  // Se existir inscrição do atleta, alinhar a data-limite para 30/09
  await bumpAtletaInscricaoToSep30(atleta.id);
}

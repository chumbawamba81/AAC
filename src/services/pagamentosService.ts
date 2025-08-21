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
  validado: boolean | null;
  devido_em: string | null;          // 'YYYY-MM-DD'
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

/* ======================= Utils locais ======================= */

// Dia 8 de setembro do ano corrente
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

export function getSlotsForPlano(p: PlanoPagamento) {
  return p === "Mensal" ? 10 : p === "Trimestral" ? 3 : 1;
}

export function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}

// Datas-limite por plano (usamos as mesmas que a UI mostra)
function buildDueDates(plano: PlanoPagamento): string[] {
  const now = new Date();
  const year = now.getFullYear();
  if (plano === "Anual") {
    return [sep8OfCurrentYear()];
  }
  if (plano === "Trimestral") {
    // 1º: 8 Set (ano corrente), 2º: 15 Jan (ano seguinte), 3º: 15 Abr (ano seguinte)
    return [
      `${year}-09-08`,
      `${year + 1}-01-15`,
      `${year + 1}-04-15`,
    ];
  }
  // Mensal: 10 meses de Setembro a Junho (dia 10)
  const out: string[] = [];
  // set/ano -> jun/(ano+1)
  for (let i = 0; i < 10; i++) {
    const d = new Date(year, 8 + i, 10); // mês 8 = setembro
    out.push(fmt(d));
  }
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

  // 2) atualizar a linha
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
  const due = sep8OfCurrentYear();
  const row = {
    user_id: userId,
    atleta_id: null,
    tipo: "inscricao",
    descricao: "Inscrição de Sócio",
    comprovativo_url: null,
    validado: null,
    devido_em: due,
  };
  // upsert por (user_id, atleta_id, tipo, descricao) — na prática, atleta_id é null
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

  // upsert — evita violar ux_pagamentos_atleta_descricao
  const rows = labels.map((descricao, i) => ({
    user_id: null as any, // preenchido por trigger/row level security, se aplicável
    atleta_id: atleta.id,
    tipo: "quota" as const,
    descricao,
    comprovativo_url: null,
    validado: null,
    devido_em: dues[i] || null,
  }));

  const { error } = await supabase
    .from("pagamentos")
    .upsert(rows, { onConflict: "atleta_id,descricao" });
  if (error) throw error;

  // Nota: a inscrição do atleta (tipo='inscricao') é gerida no fluxo de Admin/lançamento.
}

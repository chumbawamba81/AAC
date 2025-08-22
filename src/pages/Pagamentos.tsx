// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";
import type { PlanoPagamento } from "../types/Atleta";

/* ============================= Types ============================= */

export type PagamentoRow = {
  id: string;
  atleta_id: string | null;
  user_id: string | null;
  descricao: string | null;
  tipo: string | null; // "inscricao" | "inscricao_socio" | null (quotas)
  comprovativo_url: string | null;
  devido_em: string | null; // YYYY-MM-DD
  validado: boolean | null;
  validado_em: string | null;
  validado_por: string | null;
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string };

/* ====================== Pequenos helpers locais ====================== */

function seasonStartYear(): number {
  // época começa em Setembro
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? y : y - 1; // >= Agosto(7) => esse ano
}
function fmt(y: number, m: number, d = 8): string {
  // m: 1..12
  const mm = m.toString().padStart(2, "0");
  const dd = d.toString().padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
function defaultDue(): string {
  return fmt(seasonStartYear(), 9, 8); // 8 de Setembro da época
}
function isMastersOrSub23(esc?: string | null) {
  const s = (esc || "").toLowerCase();
  return s.includes("masters") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores sub 23") || s.includes("seniores sub-23");
}
function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
function getSlotsForPlano(p: PlanoPagamento) {
  return p === "Mensal" ? 10 : p === "Trimestral" ? 3 : 1;
}

/* ============================= Queries básicas ============================= */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listSocioInscricao(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .or("tipo.eq.inscricao_socio,descricao.eq.Inscrição de Sócio")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (r.comprovativo_url) {
      const { data } = await supabase.storage
        .from("pagamentos")
        .createSignedUrl(r.comprovativo_url, 60 * 60);
      out.push({ ...r, signedUrl: data?.signedUrl });
    } else {
      out.push(r);
    }
  }
  return out;
}

/* ============================= Mutations ============================= */

/** Grava/substitui comprovativo (atleta+descricao). Sem UPSERT. */
export async function saveComprovativo(args: {
  userId: string;
  atletaId?: string | null;
  descricao: string; // p.ex. "Inscrição de atleta", "Pagamento - 2º Mês", ...
  file: File;
}): Promise<PagamentoRow> {
  const desc = args.descricao.trim();

  // 1) obter linha existente
  const { data: existing, error: findErr } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", args.atletaId ?? null)
    .eq("descricao", desc)
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  // 2) criar se não existir
  let row: PagamentoRow | null = existing ?? null;
  if (!row) {
    const { data: created, error: insErr } = await supabase
      .from("pagamentos")
      .insert({
        user_id: args.userId,
        atleta_id: args.atletaId ?? null,
        descricao: desc,
        devido_em: defaultDue(),
      })
      .select()
      .single();
    if (insErr) throw insErr;
    row = created as PagamentoRow;
  }

  // 3) upload para o Storage
  const safeName = args.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${args.userId}/${row.id}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("pagamentos")
    .upload(filePath, args.file, { upsert: true });
  if (uploadError) throw uploadError;

  // 4) update com a URL do comprovativo
  const { data: updated, error: updErr } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: filePath })
    .eq("id", row.id)
    .select()
    .single();
  if (updErr) throw updErr;

  return updated as PagamentoRow;
}

/** Remove um pagamento (aceita id ou objeto). */
export async function deletePagamento(rowOrId: string | PagamentoRow): Promise<void> {
  const id = typeof rowOrId === "string" ? rowOrId : rowOrId.id;
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  if (error) throw error;
}

/* ===================== Inscrição de SÓCIO (user-level) ===================== */

export async function createInscricaoSocioIfMissing(userId: string): Promise<PagamentoRow> {
  // existe?
  const { data: existing, error: findErr } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .or("tipo.eq.inscricao_socio,descricao.eq.Inscrição de Sócio")
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing as PagamentoRow;

  // criar
  const { data, error } = await supabase
    .from("pagamentos")
    .insert({
      user_id: userId,
      atleta_id: null,
      tipo: "inscricao_socio",
      descricao: "Inscrição de Sócio",
      devido_em: defaultDue(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as PagamentoRow;
}

export async function saveComprovativoSocioInscricao(userId: string, file: File): Promise<PagamentoRow> {
  const row = await createInscricaoSocioIfMissing(userId);

  // upload
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${userId}/${row.id}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("pagamentos")
    .upload(filePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  // update URL
  const { data: updated, error: updErr } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: filePath })
    .eq("id", row.id)
    .select()
    .single();
  if (updErr) throw updErr;

  return updated as PagamentoRow;
}

/* ===================== Agenda de QUOTAS por atleta ===================== */

export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: PlanoPagamento },
  opts?: { forceRebuild?: boolean }
): Promise<void> {
  // descobrir user atual para preencher user_id nas inserções
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id ?? null;

  // se alteraste o escalão para Masters/Sub-23, força anual
  const efetivo: PlanoPagamento = isMastersOrSub23(atleta.escalao) ? "Anual" : atleta.planoPagamento;
  const slots = getSlotsForPlano(efetivo);
  const y0 = seasonStartYear();

  // apagar grelha anterior se pedido (quotas apenas: tipo null)
  if (opts?.forceRebuild) {
    // apagar onde tipo é null (quotas) para este atleta
    await supabase.from("pagamentos").delete().eq("atleta_id", atleta.id).is("tipo", null);
  }

  // construir o plano de vencimentos
  type Item = { descricao: string; devido_em: string };
  const items: Item[] = [];
  if (efetivo === "Mensal") {
    // meses: Set(9) .. Jun(6) => 10 itens
    const months = [9,10,11,12,1,2,3,4,5,6];
    let idx = 0;
    for (const m of months) {
      const year = m >= 9 ? y0 : y0 + 1;
      items.push({ descricao: getPagamentoLabel(efetivo, idx++), devido_em: fmt(year, m, 8) });
    }
  } else if (efetivo === "Trimestral") {
    const triplets = [9,12,3];
    triplets.forEach((m, i) => {
      const year = m >= 9 ? y0 : y0 + 1;
      items.push({ descricao: getPagamentoLabel(efetivo, i), devido_em: fmt(year, m, 8) });
    });
  } else {
    items.push({ descricao: getPagamentoLabel("Anual", 0), devido_em: fmt(y0, 9, 8) });
  }

  // inserir itens que não existam ainda (por descricao)
  for (const it of items) {
    const { data: existing } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("atleta_id", atleta.id)
      .eq("descricao", it.descricao)
      .limit(1)
      .maybeSingle();

    if (!existing) {
      await supabase
        .from("pagamentos")
        .insert({
          user_id: userId,
          atleta_id: atleta.id,
          descricao: it.descricao,
          devido_em: it.devido_em,
          tipo: null, // quotas
        });
    } else {
      // garantir devido_em atualizado (não quebra nada)
      await supabase
        .from("pagamentos")
        .update({ devido_em: it.devido_em })
        .eq("id", (existing as any).id);
    }
  }
}

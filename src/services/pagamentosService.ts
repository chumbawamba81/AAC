// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";

/* ============================= Tipos ============================= */

export type PagamentoTipo = "inscricao" | "mensalidade" | "trimestre" | "anual";

export type PagamentoRow = {
  id: string;
  user_id: string | null;
  atleta_id: string | null;
  descricao: string;
  tipo: PagamentoTipo | null;
  comprovativo_url: string | null;
  devido_em: string | null; // YYYY-MM-DD
  created_at: string | null;
  validado: boolean | null;
  validado_em?: string | null;
  validado_por?: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

export type PlanoPagamento = "Mensal" | "Trimestral" | "Anual";

/* =========================== Constantes ========================== */

const BUCKET = "pagamentos";
const DUE_DAY = 8; // dia de vencimento
const SEASON_START_MONTH = 8; // 0-indexed: 8 = Setembro

/* ============================ Helpers ============================ */

function seasonStartDate(base = new Date(), seasonYear?: number): Date {
  let year: number;
  if (typeof seasonYear === "number") {
    year = seasonYear;
  } else {
    const m = base.getMonth();
    const y = base.getFullYear();
    year = m >= SEASON_START_MONTH ? y : y - 1;
  }
  return new Date(Date.UTC(year, SEASON_START_MONTH, 1));
}

function dateYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addMonthsUTC(d: Date, n: number): Date {
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
  return nd;
}

function isSub23OrMasters(esc?: string | null): boolean {
  const s = (esc || "").toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub23") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores")
  );
}

function descricaoForMensal(i: number): string {
  return `Pagamento - ${i + 1}º Mês`;
}
function descricaoForTrimestre(i: number): string {
  return `Pagamento - ${i + 1}º Trimestre`;
}
function descricaoForAnual(): string {
  return "Pagamento da anuidade";
}
function descricaoInscricao(): string {
  return "Inscrição de Atleta";
}

function guessTipoByDescricao(desc: string): PagamentoTipo {
  const s = desc.toLowerCase();
  if (s.includes("inscri")) return "inscricao";
  if (s.includes("anuidade")) return "anual";
  if (s.includes("trimestre")) return "trimestre";
  return "mensalidade";
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) throw new Error("Sessão inválida");
  return data.user.id;
}

/* =========================== Storage URLs ======================== */

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null });
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.comprovativo_url, 3600);
    out.push({ ...r, signedUrl: error ? null : data?.signedUrl ?? null });
  }
  return out;
}

/* ============================= CRUD ============================== */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,devido_em,created_at,validado,validado_em,validado_por")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

/** Grava (ou substitui) um comprovativo num item (localizado por atleta+descricao). */
export async function saveComprovativo(args: {
  userId: string;
  atletaId: string;
  descricao: string;
  file: File;
}): Promise<PagamentoRowWithUrl> {
  const { userId, atletaId, descricao, file } = args;

  const { data: found, error: findErr } = await supabase
    .from("pagamentos")
    .select("id,descricao,tipo,devido_em,validado")
    .eq("atleta_id", atletaId)
    .eq("descricao", descricao)
    .maybeSingle();

  if (findErr) throw findErr;

  let rowId = found?.id as string | undefined;
  let tipo: PagamentoTipo = (found?.tipo as PagamentoTipo) || guessTipoByDescricao(descricao);

  if (!rowId) {
    const { data: ins, error: insErr } = await supabase
      .from("pagamentos")
      .insert([
        {
          user_id: userId,
          atleta_id: atletaId,
          descricao,
          tipo,
          validado: false,
        },
      ])
      .select("id")
      .single();
    if (insErr) throw insErr;
    rowId = ins.id;
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const stamp = new Date().toISOString().replace(/[:.]/g, "");
  const path = `${userId}/atletas/${atletaId}/${stamp}_${safeName}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadErr) throw uploadErr;

  const { data: up, error: upErr } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: path, validado: false, validado_em: null, validado_por: null })
    .eq("id", rowId)
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,devido_em,created_at,validado,validado_em,validado_por")
    .single();

  if (upErr) throw upErr;

  const [signed] = await withSignedUrls([up as PagamentoRow]);
  return signed;
}

/** Remove o comprovativo (Storage + linha). */
export async function deletePagamento(row: PagamentoRowWithUrl): Promise<void> {
  if (row.comprovativo_url) {
    await supabase.storage.from(BUCKET).remove([row.comprovativo_url]).catch(() => {});
  }
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw error;
}

/* ====================== Pré-criação de calendário ========================= */

function dueDatesMensal(seasonStart: Date): { desc: string; tipo: PagamentoTipo; ymd: string }[] {
  const out: { desc: string; tipo: PagamentoTipo; ymd: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const mStart = addMonthsUTC(seasonStart, i);
    const due = new Date(Date.UTC(mStart.getUTCFullYear(), mStart.getUTCMonth(), DUE_DAY));
    out.push({ desc: descricaoForMensal(i), tipo: "mensalidade", ymd: dateYMD(due) });
  }
  return out;
}

function dueDatesTrimestral(seasonStart: Date): { desc: string; tipo: PagamentoTipo; ymd: string }[] {
  const months = [0, 3, 6]; // Set, Dez, Mar
  return months.map((off, i) => {
    const mStart = addMonthsUTC(seasonStart, off);
    const due = new Date(Date.UTC(mStart.getUTCFullYear(), mStart.getUTCMonth(), DUE_DAY));
    return { desc: descricaoForTrimestre(i), tipo: "trimestre", ymd: dateYMD(due) };
  });
}

function dueDateAnual(seasonStart: Date): { desc: string; tipo: PagamentoTipo; ymd: string }[] {
  const due = new Date(Date.UTC(seasonStart.getUTCFullYear(), seasonStart.getUTCMonth(), DUE_DAY));
  return [{ desc: descricaoForAnual(), tipo: "anual", ymd: dateYMD(due) }];
}

function dueDateInscricao(seasonStart: Date): { desc: string; tipo: PagamentoTipo; ymd: string } {
  const due = new Date(Date.UTC(seasonStart.getUTCFullYear(), seasonStart.getUTCMonth(), DUE_DAY));
  return { desc: descricaoInscricao(), tipo: "inscricao", ymd: dateYMD(due) };
}

export async function ensureInscricaoForAtleta(
  atleta: { id: string; escalao?: string | null },
  opts?: { seasonYear?: number }
): Promise<void> {
  const userId = await getCurrentUserId();
  const start = seasonStartDate(new Date(), opts?.seasonYear);
  const { desc, tipo, ymd } = dueDateInscricao(start);

  const { data: found, error: selErr } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("atleta_id", atleta.id)
    .eq("descricao", desc)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!found) {
    const { error: insErr } = await supabase.from("pagamentos").insert([
      {
        user_id: userId,
        atleta_id: atleta.id,
        descricao: desc,
        tipo,
        devido_em: ymd,
        validado: false,
      },
    ]);
    if (insErr) throw insErr;
  } else {
    await supabase
      .from("pagamentos")
      .update({ devido_em: ymd })
      .eq("id", found.id)
      .then(() => {});
  }
}

export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento?: PlanoPagamento | null },
  opts?: { forceRebuild?: boolean; seasonYear?: number }
): Promise<void> {
  const userId = await getCurrentUserId();
  const start = seasonStartDate(new Date(), opts?.seasonYear);

  await ensureInscricaoForAtleta({ id: atleta.id, escalao: atleta.escalao }, { seasonYear: opts?.seasonYear });

  const obrigAnual = isSub23OrMasters(atleta.escalao);
  const planoEfetivo: PlanoPagamento = obrigAnual ? "Anual" : (atleta.planoPagamento || "Mensal");

  if (opts?.forceRebuild) {
    const { error: delErr } = await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id)
      .in("tipo", ["mensalidade", "trimestre", "anual"]);
    if (delErr) throw delErr;
  }

  const { data: existing, error: exErr } = await supabase
    .from("pagamentos")
    .select("id,descricao")
    .eq("atleta_id", atleta.id)
    .not("tipo", "eq", "inscricao");
  if (exErr) throw exErr;
  const existingDesc = new Set<string>((existing ?? []).map((r) => r.descricao));

  let toCreate: { desc: string; tipo: PagamentoTipo; ymd: string }[] = [];
  if (planoEfetivo === "Mensal") toCreate = dueDatesMensal(start);
  else if (planoEfetivo === "Trimestral") toCreate = dueDatesTrimestral(start);
  else toCreate = dueDateAnual(start);

  const payload = toCreate
    .filter((x) => !existingDesc.has(x.desc))
    .map((x) => ({
      user_id: userId,
      atleta_id: atleta.id,
      descricao: x.desc,
      tipo: x.tipo,
      devido_em: x.ymd,
      validado: false,
    }));

  if (payload.length) {
    const { error: insErr } = await supabase.from("pagamentos").insert(payload);
    if (insErr) throw insErr;
  }
}

export async function ensureSchedulesForAtletas(
  atletas: Array<{ id: string; escalao?: string | null; planoPagamento?: PlanoPagamento | null }>,
  opts?: { forceRebuild?: boolean; seasonYear?: number }
): Promise<void> {
  for (const a of atletas) {
    await ensureScheduleForAtleta(a, opts).catch((e) => {
      console.error("[ensureSchedulesForAtletas] atleta", a.id, e);
    });
  }
}

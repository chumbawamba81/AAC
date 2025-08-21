// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";

/** ---------------------- Tipos ---------------------- */
export type PlanoPagamento = "Mensal" | "Trimestral" | "Anual";

export type PagamentoRow = {
  id: string;
  user_id: string | null;
  atleta_id: string | null;          // null => sócio
  descricao: string;                 // ex.: "Pagamento - 1º Mês", "Inscrição de Sócio"
  tipo: "mensal" | "trimestre" | "anual" | "inscricao_atleta" | "inscricao_socio";
  comprovativo_url: string | null;   // caminho no bucket 'pagamentos'
  created_at: string | null;
  devido_em: string | null;          // date (YYYY-MM-DD)
  validado: boolean | null;
  validado_em: string | null;
  validado_por: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl: string | null };

/** ---------------------- Constantes ---------------------- */
const BUCKET = "pagamentos";
const DUE_DAY = 10; // dia limite em cada mês

/** ---------------------- Helpers ---------------------- */

function safeName(name: string) {
  return (name || "file").replace(/[^\p{L}\p{N}\.\-_]+/gu, "_").slice(0, 120);
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Época começa em setembro e termina em junho do ano seguinte. */
function getSeasonStart(today = new Date()): Date {
  const y = today.getFullYear();
  const start = new Date(y, 8, 1); // 1 setembro y
  return today >= start ? start : new Date(y - 1, 8, 1);
}
function dueDateFor(monthOffset: number, base = getSeasonStart()) {
  const d = new Date(base);
  d.setMonth(base.getMonth() + monthOffset);
  d.setDate(DUE_DAY);
  return ymd(d);
}

export function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
export function getSlotsForPlano(p: PlanoPagamento) {
  if (p === "Mensal") return 10;
  if (p === "Trimestral") return 3;
  return 1;
}

function inferTipoFromDescricao(desc: string, scope: "socio" | "atleta"): PagamentoRow["tipo"] {
  const s = (desc || "").toLowerCase();
  if (s.includes("anuidade")) return "anual";
  if (s.includes("trimestre")) return "trimestre";
  if (s.includes("mês")) return "mensal";
  if (s.includes("inscri")) return scope === "socio" ? "inscricao_socio" : "inscricao_atleta";
  return scope === "socio" ? "inscricao_socio" : "mensal";
}

/** Assina URLs para comprovativo (se existir). */
export async function withSignedUrls<T extends { comprovativo_url: string | null }>(
  rows: (T & Record<string, any>)[]
) {
  const out: any[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null });
      continue;
    }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(r.comprovativo_url, 60 * 60);
    out.push({ ...r, signedUrl: error ? null : data?.signedUrl ?? null });
  }
  return out as (T & { signedUrl: string | null })[];
}

/** ---------------------- CRUD Básico ---------------------- */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,created_at,devido_em,validado,validado_em,validado_por")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

export async function listSocioInscricao(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,created_at,devido_em,validado,validado_em,validado_por")
    .is("atleta_id", null)
    .eq("user_id", userId)
    .ilike("descricao", "%inscri%")
    .order("created_at", { ascending: false, nullsFirst: true });
  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

/** Só “limpa” o comprovativo (mantém a linha do calendário). */
export async function deletePagamento(row: PagamentoRow | PagamentoRowWithUrl) {
  const path = row.comprovativo_url;
  if (path) {
    // tentar apagar o ficheiro (se existir)
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch {
      /* ignore */
    }
  }
  const { error } = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: null, validado: false, validado_em: null, validado_por: null })
    .eq("id", row.id);
  if (error) throw error;
}

/** Guarda/substitui ficheiro e liga à linha do calendário (ou cria uma). */
export async function saveComprovativo(opts: {
  userId: string;
  atletaId: string | null; // null => sócio
  descricao: string;
  file: File;
}) {
  const scope: "socio" | "atleta" = opts.atletaId ? "atleta" : "socio";
  // 1) path no storage
  const name = `${Date.now()}_${safeName(opts.file.name)}`;
  const path = `${opts.userId}/${opts.atletaId ?? "socio"}/${name}`;

  const up = await supabase.storage.from(BUCKET).upload(path, opts.file, { upsert: false });
  if (up.error) throw up.error;

  // 2) encontrar (ou criar) a linha do calendário
  let sel = supabase
    .from("pagamentos")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("descricao", opts.descricao)
    .order("created_at", { ascending: false })
    .limit(1);

  sel = opts.atletaId ? sel.eq("atleta_id", opts.atletaId) : sel.is("atleta_id", null);
  const { data: found, error: selErr } = await sel;
  if (selErr) throw selErr;

  if (found && found.length) {
    const { error: upErr } = await supabase
      .from("pagamentos")
      .update({ comprovativo_url: path, created_at: new Date().toISOString() })
      .eq("id", found[0].id);
    if (upErr) throw upErr;
    return;
  }

  const { error: insErr } = await supabase.from("pagamentos").insert({
    user_id: opts.userId,
    atleta_id: opts.atletaId,
    descricao: opts.descricao,
    tipo: inferTipoFromDescricao(opts.descricao, scope),
    comprovativo_url: path,
    created_at: new Date().toISOString(),
  });
  if (insErr) throw insErr;
}

/** ---------------------- Agendamento (época) ---------------------- */

function isAnuidadeObrigatoria(escalao?: string | null) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return s.includes("masters") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores");
}

/** Cria/atualiza o calendário de pagamentos do ATLETA para a época atual. */
export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: PlanoPagamento },
  opts?: { forceRebuild?: boolean }
) {
  const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(atleta.escalao) ? "Anual" : atleta.planoPagamento;
  const slots = getSlotsForPlano(planoEfetivo);

  // 1) apagar linhas de calendário da época (se forceRebuild)
  if (opts?.forceRebuild) {
    const start = getSeasonStart();
    const end = new Date(start); end.setMonth(start.getMonth() + 12);
    await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id)
      .gte("devido_em", ymd(start))
      .lt("devido_em", ymd(end));
  }

  // 2) criar slots em falta
  for (let i = 0; i < slots; i++) {
    const descricao = getPagamentoLabel(planoEfetivo, i);
    const tipo = inferTipoFromDescricao(descricao, "atleta");
    let devido_em: string | null = null;

    if (planoEfetivo === "Mensal") {
      // Setembro a Junho (10 meses)
      devido_em = dueDateFor(i);
    } else if (planoEfetivo === "Trimestral") {
      // Set (0), Dez (3), Mar (6)
      const offsets = [0, 3, 6];
      devido_em = dueDateFor(offsets[i]);
    } else {
      // Anual: Set
      devido_em = dueDateFor(0);
    }

    // existe?
    const { data: exists, error: selErr } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("atleta_id", atleta.id)
      .eq("descricao", descricao)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!exists) {
      const { error: insErr } = await supabase.from("pagamentos").insert({
        atleta_id: atleta.id,
        descricao,
        tipo,
        comprovativo_url: null,
        devido_em,
        validado: false,
      });
      if (insErr) throw insErr;
    } else if (devido_em) {
      await supabase.from("pagamentos").update({ devido_em }).eq("id", exists.id);
    }
  }
}

/** Cria/garante a linha de INSCRIÇÃO do SÓCIO (sem ficheiro) */
export async function ensureSocioInscricaoRow(userId: string) {
  // já existe?
  const { data: row } = await supabase
    .from("pagamentos")
    .select("id")
    .is("atleta_id", null)
    .eq("user_id", userId)
    .ilike("descricao", "%inscri%")
    .maybeSingle();

  const payload = {
    user_id: userId,
    atleta_id: null,
    descricao: "Inscrição de Sócio",
    tipo: "inscricao_socio" as const,
    comprovativo_url: null,
    devido_em: dueDateFor(0),
    validado: false,
  };

  if (!row) {
    await supabase.from("pagamentos").insert(payload);
  } else {
    await supabase.from("pagamentos").update(payload).eq("id", row.id);
  }
}

/** Estado simplificado para o cartão do sócio no resumo */
export async function getSocioInscricaoStatus(userId: string): Promise<{
  exists: boolean;
  hasFile: boolean;
  validado: boolean;
  signedUrl: string | null;
}> {
  const rows = await listSocioInscricao(userId);
  if (!rows.length) return { exists: false, hasFile: false, validado: false, signedUrl: null };
  const latest = rows.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
  const [withUrl] = await withSignedUrls([latest]);
  return {
    exists: true,
    hasFile: !!latest.comprovativo_url,
    validado: !!latest.validado,
    signedUrl: withUrl.signedUrl,
  };
}

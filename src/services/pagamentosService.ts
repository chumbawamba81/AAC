// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";

/** Bucket de pagamentos (privado) */
const BUCKET = "pagamentos";

/** Linha da tabela public.pagamentos */
export type PagamentoRow = {
  id: string;
  atleta_id: string | null;
  descricao: string;
  comprovativo_url: string | null; // path no Storage (não URL pública)
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & {
  signedUrl?: string | null;
  file_name?: string | null;
};

/* ------------------------------- Helpers ------------------------------- */

function slugify(input: string): string {
  // remove acentos + espaços → hifens + só [a-z0-9-_]
  const norm = input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\/\\]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return norm || "ficheiro";
}

function safeFileName(name: string): string {
  const parts = name.split(".");
  const ext = parts.length > 1 ? "." + parts.pop()!.toLowerCase() : "";
  const base = slugify(parts.join("."));
  return `${base}${ext}`;
}

function storageKey(userId: string, atletaId: string, descricao: string, originalName: string) {
  const key = [
    slugify(userId),
    slugify(atletaId),
    slugify(descricao),
    `${Date.now()}_${safeFileName(originalName)}`
  ].join("/");
  return key;
}

/* ----------------------------- List & Read ----------------------------- */

/** Lista todos os pagamentos de um atleta */
export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", atletaId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao listar pagamentos: ${error.message}`);
  return (data ?? []) as PagamentoRow[];
}

/** Devolve o último pagamento para (atleta_id, descricao) se existir */
export async function getByAtletaAndDescricao(
  atletaId: string,
  descricao: string
): Promise<PagamentoRow | null> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", atletaId)
    .eq("descricao", descricao)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao obter pagamento: ${error.message}`);
  }
  return (data as PagamentoRow) ?? null;
}

/* --------------------------- Signed URL helpers --------------------------- */

export async function withSignedUrls(
  rows: PagamentoRow[],
  expiresInSec = 3600
): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null, file_name: null });
      continue;
    }
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(r.comprovativo_url, expiresInSec);
    if (error) {
      out.push({ ...r, signedUrl: null, file_name: r.comprovativo_url.split("/").pop() ?? null });
    } else {
      out.push({
        ...r,
        signedUrl: data?.signedUrl ?? null,
        file_name: r.comprovativo_url.split("/").pop() ?? null
      });
    }
  }
  return out;
}

/* ------------------------------ Create/Update ----------------------------- */

/**
 * Cria ou substitui o comprovativo para (atletaId, descricao).
 * - Faz upload para o bucket "pagamentos".
 * - Se já existir uma linha para (atleta, descricao), atualiza-a e remove o ficheiro antigo (se pedido).
 */
export async function saveComprovativo(args: {
  userId: string;
  atletaId: string;
  descricao: string;
  file: File;
  deleteOld?: boolean; // default true
}): Promise<PagamentoRow> {
  const { userId, atletaId, descricao, file } = args;
  const deleteOld = args.deleteOld ?? true;

  // 1) procurar existência
  const existing = await getByAtletaAndDescricao(atletaId, descricao);

  // 2) upload para Storage
  const key = storageKey(userId, atletaId, descricao, file.name);
  const { error: upErr } = await supabase
    .storage
    .from(BUCKET)
    .upload(key, file, { upsert: false, contentType: file.type || undefined });

  if (upErr) throw new Error(`Falha no upload para Storage: ${upErr.message}`);

  // 3) DB: insert/update
  if (existing) {
    // update
    const { data, error } = await supabase
      .from("pagamentos")
      .update({ comprovativo_url: key, created_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(`Falha ao atualizar pagamento: ${error.message}`);

    // apagar ficheiro antigo se necessário
    if (deleteOld && existing.comprovativo_url) {
      await supabase.storage.from(BUCKET).remove([existing.comprovativo_url]).catch(() => {});
    }
    return data as PagamentoRow;
  } else {
    // insert
    const { data, error } = await supabase
      .from("pagamentos")
      .insert({
        atleta_id: atletaId,
        descricao,
        comprovativo_url: key,
      })
      .select("*")
      .single();

    if (error) throw new Error(`Falha ao criar pagamento: ${error.message}`);
    return data as PagamentoRow;
  }
}

/* --------------------------------- Delete --------------------------------- */

export async function deletePagamento(row: PagamentoRow): Promise<void> {
  // remover storage primeiro (best-effort)
  if (row.comprovativo_url) {
    await supabase.storage.from(BUCKET).remove([row.comprovativo_url]).catch(() => {});
  }
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw new Error(`Falha a apagar pagamento: ${error.message}`);
}


/* ----------------- Helpers de plano/época (Setembro–Junho ----------------- */
// === ) ===
type PlanoPagamentoLocal = "Mensal" | "Trimestral" | "Anual";

function isAnuidadeObrigatoria(escalao?: string | null) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores sub 23") ||
    s.includes("seniores sub-23")
  );
}

// Setembro é mês 8 (0-based). Época começa sempre a 8 de setembro.
function currentSeasonStartYear(ref = new Date()) {
  const m = ref.getMonth(); // 0=Jan ... 11=Dez
  const y = ref.getFullYear();
  return m >= 8 ? y : y - 1;
}
function seasonStartDate(seasonStartYear: number) {
  return new Date(seasonStartYear, 8, 8); // 8 de setembro
}
function seasonEndDate(seasonStartYear: number) {
  return new Date(seasonStartYear + 1, 5, 30); // 30 de junho
}
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPagamentoLabel(plano: PlanoPagamentoLocal, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}

function buildScheduleForPlano(plano: PlanoPagamentoLocal, seasonStartYear: number) {
  const start = seasonStartDate(seasonStartYear);
  if (plano === "Anual") {
    return [{ tipo: "Anual", descricao: getPagamentoLabel("Anual", 0), devidoEm: ymd(start) }];
  }
  if (plano === "Trimestral") {
    const offsets = [0, 3, 6]; // Set, Dez, Mar
    return offsets.map((k, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + k, 8);
      return { tipo: "Trimestral", descricao: getPagamentoLabel("Trimestral", i), devidoEm: ymd(d) };
    });
  }
  // Mensal: 10 meses, Set–Jun, dia 8
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 8);
    return { tipo: "Mensal", descricao: getPagamentoLabel("Mensal", i), devidoEm: ymd(d) };
  });
}

function inThisSeason(dateISO: string, seasonStartYear: number) {
  const d = new Date(dateISO);
  return d >= seasonStartDate(seasonStartYear) && d <= seasonEndDate(seasonStartYear);
}

type MinimalAtleta = {
  id: string;
  escalao?: string | null;
  // nesta app o nome costuma ser "planoPagamento"; ajusta se fores usar outro
  planoPagamento?: "Mensal" | "Trimestral" | "Anual" | null;
};

/**
 * Garante que existem as linhas do calendário de pagamentos do atleta para a época corrente.
 * - Gera Set–Jun (Mensal 10x, Trimestral 3x, Anual 1x), sempre com devido_em no dia 8
 * - Respeita Anuidade obrigatória para Masters/Sénior Sub-23
 * - Se forceRebuild=true: apaga da época apenas as linhas não validadas e sem comprovativo, e volta a gerar
 */
export async function ensureScheduleForAtleta(
  atleta: MinimalAtleta,
  opts?: { seasonStartYear?: number; forceRebuild?: boolean }
) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Sessão não encontrada.");

  const seasonY = opts?.seasonStartYear ?? currentSeasonStartYear(new Date());

  const basePlano = (atleta.planoPagamento as PlanoPagamentoLocal | undefined) ?? "Mensal";
  const planoEfetivo: PlanoPagamentoLocal = isAnuidadeObrigatoria(atleta.escalao) ? "Anual" : basePlano;

  const schedule = buildScheduleForPlano(planoEfetivo, seasonY);

  // Ler existentes do atleta (filtrar por época em memória)
  const { data: existing, error: exErr } = await supabase
    .from("pagamentos")
    .select("id, descricao, devido_em, validado, comprovativo_url")
    .eq("atleta_id", atleta.id);

  if (exErr) throw new Error(`Falha a ler pagamentos existentes: ${exErr.message}`);

  const seasonExisting = (existing ?? []).filter((r: any) => r.devido_em && inThisSeason(r.devido_em, seasonY));

  // Se rebuild, apaga o que ainda não foi submetido/validado
  if (opts?.forceRebuild && seasonExisting.length) {
    const deletables = seasonExisting.filter(
      (e: any) => !e.validado && (!e.comprovativo_url || e.comprovativo_url.trim() === "")
    );
    if (deletables.length) {
      const { error: delErr } = await supabase
        .from("pagamentos")
        .delete()
        .in("id", deletables.map((d: any) => d.id));
      if (delErr) throw new Error(`Falha a limpar calendário: ${delErr.message}`);
    }
  }

  // Determinar quais faltam (por descricao)
  const have = new Set(seasonExisting.map((e: any) => e.descricao));
  const toInsert = schedule.filter((s) => !have.has(s.descricao));

  if (!toInsert.length) return;

  const payload = toInsert.map((s) => ({
    atleta_id: atleta.id,
    user_id: userId,
    descricao: s.descricao,
    tipo: s.tipo,
    devido_em: s.devidoEm, // YYYY-MM-DD
    validado: false,
  }));

  const { error: insErr } = await supabase.from("pagamentos").insert(payload);
  // Se criaste o índice único (atleta_id, descricao), uma corrida simultânea pode dar 23505 — ignorável
  if (insErr && insErr.code !== "23505") {
    throw new Error(`Falha a gerar calendário: ${insErr.message}`);
  }
}

// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";

export type PagamentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  descricao: string;
  devido_em: string | null;
  created_at: string | null;
  validado: boolean | null;
  comprovativo_url: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 8 de Setembro da época fiscal (usada como due date “base”). */
export function seasonStartDueDate(): string {
  const now = new Date();
  // se já passou Setembro deste ano, mantém o ano atual; senão, usa o atual na mesma
  const year = now.getFullYear();
  return `${year}-09-08`;
}

/* ------------------------ LISTAGENS ------------------------ */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as PagamentoRow[];
}

/** Linhas do Sócio (atleta_id NULL) – normalmente só “Inscrição de Sócio”. */
export async function listBySocio(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .order("devido_em", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as PagamentoRow[];
}

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null });
      continue;
    }
    const { data, error } = await supabase
      .storage
      .from("pagamentos")
      .createSignedUrl(r.comprovativo_url, 3600);
    out.push({ ...r, signedUrl: error ? null : data?.signedUrl ?? null });
  }
  return out;
}

/* ------------------------ UPLOAD / DELETE ------------------------ */

export async function saveComprovativo(opts: {
  userId: string;
  atletaId: string;
  descricao: string;
  file: File;
}) {
  // caminho no bucket
  const fileName = `${Date.now()}_${opts.file.name.replace(/\s+/g, "_")}`;
  const path = `${opts.userId}/atleta/${opts.atletaId}/${fileName}`;

  const up = await supabase.storage.from("pagamentos").upload(path, opts.file, { upsert: false });
  if (up.error) throw up.error;

  // insere nova linha (ou atualiza if-needed). Mantemos histórico por simplicidade, mas a UI usa o mais recente.
  const { error } = await supabase.from("pagamentos").insert({
    user_id: opts.userId,
    atleta_id: opts.atletaId,
    descricao: opts.descricao,
    devido_em: seasonStartDueDate(), // pode ser ajustado por slot, se quiseres granular
    comprovativo_url: path,
    validado: false,
  });
  if (error) throw error;
}

export async function deletePagamento(row: PagamentoRow) {
  // apaga storage (best effort)
  if (row.comprovativo_url) {
    await supabase.storage.from("pagamentos").remove([row.comprovativo_url]).catch(() => {});
  }
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw error;
}

/* ------------------------ SÓCIO ------------------------ */

/** Garante que existe a linha de “Inscrição de Sócio” (atleta_id NULL). */
export async function ensureSocioInscricao(userId: string) {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .ilike("descricao", "%inscri%")
    .limit(1);
  if (error) throw error;

  if (!data || data.length === 0) {
    const { error: insErr } = await supabase.from("pagamentos").insert({
      user_id: userId,
      atleta_id: null,
      descricao: "Inscrição de Sócio",
      devido_em: seasonStartDueDate(),
      validado: false,
      comprovativo_url: null,
    });
    if (insErr) throw insErr;
  }
}

/** Upload/substituição do comprovativo da Inscrição de Sócio. */
export async function saveComprovativoSocio(opts: {
  userId: string;
  file: File;
}) {
  const fileName = `${Date.now()}_${opts.file.name.replace(/\s+/g, "_")}`;
  const path = `${opts.userId}/socio/${fileName}`;

  const up = await supabase.storage.from("pagamentos").upload(path, opts.file, { upsert: false });
  if (up.error) throw up.error;

  // Insert de uma nova linha (histórico). A UI assume a mais recente como “ativa”.
  const { error } = await supabase.from("pagamentos").insert({
    user_id: opts.userId,
    atleta_id: null,
    descricao: "Inscrição de Sócio",
    devido_em: seasonStartDueDate(),
    comprovativo_url: path,
    validado: false,
  });
  if (error) throw error;
}

/* ------------------------ AGENDA ATLETA ------------------------ */

export type EnsureOpts = { forceRebuild?: boolean };

/** Cria/garante as linhas base do atleta para a época conforme plano. */
export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: "Mensal" | "Trimestral" | "Anual" },
  opts?: EnsureOpts
) {
  // Politica simples: se forceRebuild, removemos todas as linhas (não validadas) e recriamos.
  if (opts?.forceRebuild) {
    await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id)
      .eq("validado", false)
      .catch(() => {});
  }

  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,descricao,atleta_id,comprovativo_url,validado")
    .eq("atleta_id", atleta.id);

  if (error) throw error;

  const have = new Set((data || []).map((r) => (r.descricao || "").toLowerCase()));

  const dueBase = seasonStartDueDate();
  const inserts: Partial<PagamentoRow>[] = [];

  // 1) Inscrição do atleta
  if (![...have].some((d) => d.includes("inscri"))) {
    inserts.push({
      user_id: (await supabase.auth.getUser()).data.user?.id!,
      atleta_id: atleta.id,
      descricao: "Inscrição do atleta",
      devido_em: dueBase,
      validado: false,
      comprovativo_url: null,
    });
  }

  // 2) Slots conforme plano
  const mkDesc = (idx: number) =>
    atleta.planoPagamento === "Anual"
      ? "Pagamento da anuidade"
      : atleta.planoPagamento === "Trimestral"
      ? `Pagamento - ${idx + 1}º Trimestre`
      : `Pagamento - ${idx + 1}º Mês`;

  const slots = atleta.planoPagamento === "Mensal" ? 10 : atleta.planoPagamento === "Trimestral" ? 3 : 1;

  for (let i = 0; i < slots; i++) {
    const desc = mkDesc(i).toLowerCase();
    if (!have.has(desc)) {
      inserts.push({
        user_id: (await supabase.auth.getUser()).data.user?.id!,
        atleta_id: atleta.id,
        descricao: mkDesc(i),
        devido_em: dueBase,
        validado: false,
        comprovativo_url: null,
      });
    }
  }

  if (inserts.length) {
    const { error: insErr } = await supabase.from("pagamentos").insert(inserts);
    if (insErr) throw insErr;
  }
}

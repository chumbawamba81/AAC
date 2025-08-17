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

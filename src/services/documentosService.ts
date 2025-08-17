// src/services/documentosService.ts
import { supabase } from "../supabaseClient";

export type Nivel = "socio" | "atleta";

/**
 * Estrutura da tabela public.documentos (campos relevantes)
 */
export type DocumentoRow = {
  id: string;
  user_id: string;
  doc_nivel: Nivel;            // 'socio' | 'atleta'
  atleta_id: string | null;    // uuid ou null
  doc_tipo: string;            // ex: "Ficha de Sócio"
  page: number;                // normalmente 1 quando 1 ficheiro = 1 página
  file_path: string;           // path no Storage (igual a 'path')
  path: string;                // path no Storage
  nome: string;                // nome "humano" do ficheiro (podemos manter o original)
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  // Campo adicionado em runtime pelo serviço (não existe na DB):
  signedUrl?: string;
};

type UploadArgs =
  | { nivel: "socio"; userId: string; tipo: string; file: File; mode?: "new" | "replace" }
  | { nivel: "atleta"; userId: string; atletaId: string; tipo: string; file: File; mode?: "new" | "replace" };

type ReplaceArgs = { id: string; file: File };
type DeleteArgs = { id: string };

type ListArgs =
  | { nivel: "socio"; userId: string }
  | { nivel: "atleta"; userId: string; atletaId: string };

const BUCKET = "documentos";

/* -------------------------------------------------------------------------- */
/*                               Helpers (path)                               */
/* -------------------------------------------------------------------------- */

/**
 * Remove diacríticos, espaços, símbolos estranhos e normaliza para um segmento “seguro”.
 * Mantém [a-z0-9._-] e converte para minúsculas.
 */
function toSafeSegment(input: string, fallback = "item"): string {
  if (!input) return fallback;
  // remover diacríticos
  let s = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  // trocar espaços por '-'
  s = s.replace(/\s+/g, "-");
  // permitir apenas [a-z0-9._-]
  s = s.replace(/[^a-zA-Z0-9._-]/g, "-");
  // colapsar múltiplos '-' e '.'
  s = s.replace(/-+/g, "-").replace(/\.+/g, ".");
  // minúsculas e trim de traços/pontos nas pontas
  s = s.toLowerCase().replace(/^[-.]+|[-.]+$/g, "");
  return s || fallback;
}

/**
 * Gera um nome de ficheiro seguro preservando a extensão (normalizada).
 */
function toSafeFilename(name: string, fallback = "ficheiro.bin"): string {
  if (!name) return fallback;
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) {
    // sem extensão clara → normaliza tudo e adiciona .bin se necessário
    const base = toSafeSegment(name);
    return base.includes(".") ? base : `${base}.bin`;
  }
  const base = toSafeSegment(name.slice(0, idx)) || "ficheiro";
  const ext = toSafeSegment(name.slice(idx + 1)) || "bin";
  return `${base}.${ext}`;
}

/**
 * Junta segmentos de forma segura (sem //) e sem barra inicial.
 */
function joinPath(...parts: Array<string | undefined | null>): string {
  const cleaned = parts
    .filter(Boolean)
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0);
  return cleaned.join("/");
}

/* -------------------------------------------------------------------------- */
/*                                  Upload                                    */
/* -------------------------------------------------------------------------- */

export async function uploadDoc(args: UploadArgs): Promise<DocumentoRow> {
  const { nivel, userId, file } = args;
  if (!userId) throw new Error("uploadDoc: userId em falta");
  if (!file) throw new Error("uploadDoc: file em falta");

  const tipoSafe = toSafeSegment(args.tipo || "tipo");
  const fileSafe = toSafeFilename(file.name);

  const ts = Date.now();

  // Paths:
  //  - socio:  userId/socio/<tipo>/timestamp_nome.ext
  //  - atleta: userId/atleta/<atletaId>/<tipo>/timestamp_nome.ext
  const storagePath =
    nivel === "socio"
      ? joinPath(userId, "socio", tipoSafe, `${ts}_${fileSafe}`)
      : joinPath(userId, "atleta", (args as any).atletaId, tipoSafe, `${ts}_${fileSafe}`);

  // 1) Upload para Storage
  const up = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false, // não substituir por omissão
    contentType: file.type || undefined,
  });
  if (up.error) {
    throw new Error(`Storage upload falhou: ${up.error.message}`);
  }

  // 2) Inserir row na tabela
  const rowToInsert = {
    user_id: userId,
    doc_nivel: nivel,
    atleta_id: nivel === "atleta" ? (args as any).atletaId : null,
    doc_tipo: args.tipo,
    page: 1,
    file_path: storagePath,
    path: storagePath,
    nome: file.name, // nome "humano" original
    mime_type: file.type || null,
    file_size: file.size ?? null,
    uploaded_at: new Date().toISOString(),
  };

  const ins = await supabase.from<DocumentoRow>("documentos").insert(rowToInsert).select("*").single();
  if (ins.error) {
    // rollback storage se a DB falhar (opcional mas recomendado)
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`INSERT em public.documentos falhou: ${ins.error.message}`);
  }

  return ins.data;
}

/* -------------------------------------------------------------------------- */
/*                                  Replace                                   */
/* -------------------------------------------------------------------------- */

export async function replaceDoc(id: string, file: File): Promise<DocumentoRow> {
  if (!id) throw new Error("replaceDoc: id em falta");
  if (!file) throw new Error("replaceDoc: file em falta");

  // 1) Buscar row existente
  const sel = await supabase.from<DocumentoRow>("documentos").select("*").eq("id", id).single();
  if (sel.error || !sel.data) {
    throw new Error(`Não foi possível obter o registo (${id}): ${sel.error?.message || "not found"}`);
  }
  const current = sel.data;

  // 2) Substituir no mesmo path (upsert)
  const up = await supabase.storage.from(BUCKET).upload(current.path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type || undefined,
  });
  if (up.error) {
    throw new Error(`Storage replace falhou: ${up.error.message}`);
  }

  // 3) Atualizar metadados na tabela
  const upd = await supabase
    .from<DocumentoRow>("documentos")
    .update({
      nome: file.name,
      mime_type: file.type || null,
      file_size: file.size ?? null,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (upd.error || !upd.data) {
    throw new Error(`UPDATE em public.documentos falhou: ${upd.error?.message || "unknown"}`);
  }

  return upd.data;
}

/* -------------------------------------------------------------------------- */
/*                                  Delete                                    */
/* -------------------------------------------------------------------------- */

export async function deleteDoc(id: string): Promise<void> {
  if (!id) throw new Error("deleteDoc: id em falta");

  // 1) Descobrir path para remover do Storage
  const sel = await supabase.from<DocumentoRow>("documentos").select("path").eq("id", id).single();
  if (sel.error || !sel.data) {
    throw new Error(`Não foi possível obter o registo (${id}): ${sel.error?.message || "not found"}`);
  }

  // 2) Remover Storage (ignora erro de "not found")
  const rm = await supabase.storage.from(BUCKET).remove([sel.data.path]);
  if (rm.error && rm.error.message && !/Object not found/i.test(rm.error.message)) {
    throw new Error(`Storage remove falhou: ${rm.error.message}`);
  }

  // 3) Remover row
  const del = await supabase.from("documentos").delete().eq("id", id);
  if (del.error) {
    throw new Error(`DELETE em public.documentos falhou: ${del.error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/*                                   List                                     */
/* -------------------------------------------------------------------------- */

export async function listDocs(args: ListArgs): Promise<DocumentoRow[]> {
  const q = supabase.from<DocumentoRow>("documentos").select("*");

  let query = q.eq("user_id", (args as any).userId);

  if (args.nivel === "socio") {
    query = query.eq("doc_nivel", "socio").is("atleta_id", null);
  } else {
    query = query.eq("doc_nivel", "atleta").eq("atleta_id", (args as any).atletaId);
  }

  // Ordenação útil: por tipo e página
  query = query.order("doc_tipo", { ascending: true }).order("page", { ascending: true });

  const { data, error } = await query;
  if (error) {
    throw new Error(`SELECT public.documentos falhou: ${error.message}`);
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*                              Signed URL helper                             */
/* -------------------------------------------------------------------------- */

export async function withSignedUrls(rows: DocumentoRow[], expiresInSeconds = 3600): Promise<DocumentoRow[]> {
  if (!rows?.length) return [];
  const paths = rows.map((r) => r.path);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresInSeconds);
  if (error) {
    // mesmo que falhe, devolvemos as rows sem URL para a UI mostrar algo
    console.error("[withSignedUrls] createSignedUrls falhou:", error.message);
    return rows;
  }

  const byPath: Record<string, string | undefined> = {};
  data?.forEach((d) => {
    if (d?.path) byPath[d.path] = d.signedUrl;
  });

  return rows.map((r) => ({ ...r, signedUrl: byPath[r.path] }));
}

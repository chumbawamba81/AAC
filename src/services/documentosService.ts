// src/services/documentosService.ts
import { supabase } from "../supabaseClient";
import { joinPath, toSafeFilename, toSafeSegment } from "../utils/storagePath";

export type Nivel = "socio" | "atleta";

/** Estrutura da tabela public.documentos (campos relevantes) */
export type DocumentoRow = {
  id: string;
  user_id: string;
  doc_nivel: Nivel;            // 'socio' | 'atleta'
  atleta_id: string | null;    // uuid ou null
  doc_tipo: string;            // ex: "Ficha de Sócio"
  page: number;                // normalmente 1 quando 1 ficheiro = 1 página
  file_path: string;           // path no Storage (igual a 'path')
  path: string;                // path no Storage
  nome: string;                // nome "humano" do ficheiro (original)
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  // Campo só em runtime (não existe na DB)
  signedUrl?: string;
};

type UploadArgsBase = { tipo: string; file: File; mode?: "new" | "replace"; page?: number };
type UploadArgs =
  | ({ nivel: "socio"; userId: string } & UploadArgsBase)
  | ({ nivel: "atleta"; userId: string; atletaId: string } & UploadArgsBase);

const BUCKET = "documentos";

/* -------------------------------------------------------------------------- */
/*                                  Upload                                    */
/* -------------------------------------------------------------------------- */

export async function uploadDoc(args: UploadArgs): Promise<DocumentoRow> {
  const { nivel, userId, file } = args;
  if (!userId) throw new Error("uploadDoc: userId em falta");
  if (!file) throw new Error("uploadDoc: file em falta");

  // ——— Modo que já funcionava no Android (replicado p/ Sócio):
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
    upsert: false,
    contentType: file.type || "application/octet-stream",
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
    page: args.page ?? 1,
    file_path: storagePath,
    path: storagePath,
    nome: file.name,
    mime_type: file.type || null,
    file_size: file.size ?? null,
    uploaded_at: new Date().toISOString(),
  };

  const ins = await supabase.from("documentos").insert(rowToInsert).select("*").single();
  if (ins.error) {
    // rollback storage se a DB falhar
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(`INSERT em public.documentos falhou: ${ins.error.message}`);
  }

  return ins.data as DocumentoRow;
}

/* -------------------------------------------------------------------------- */
/*                                  Replace                                   */
/* -------------------------------------------------------------------------- */

export async function replaceDoc(id: string, file: File): Promise<DocumentoRow> {
  if (!id) throw new Error("replaceDoc: id em falta");
  if (!file) throw new Error("replaceDoc: file em falta");

  // 1) Buscar row existente
  const sel = await supabase.from("documentos").select("*").eq("id", id).single();
  if (sel.error || !sel.data) {
    throw new Error(`Não foi possível obter o registo (${id}): ${sel.error?.message || "not found"}`);
  }
  const current = sel.data as DocumentoRow;

  // 2) Construir NOVA key “segura” (evita Invalid key se a key antiga tiver acentos/espaços)
  const tipoSafe = toSafeSegment(current.doc_tipo || "tipo");
  const fileSafe = toSafeFilename(file.name);
  const ts = Date.now();

  const base =
    current.doc_nivel === "socio"
      ? joinPath(current.user_id, "socio", tipoSafe)
      : joinPath(current.user_id, "atleta", current.atleta_id || "", tipoSafe);

  const newPath = joinPath(base, `${ts}_${fileSafe}`);

  // 3) Upload para a nova key
  const up = await supabase.storage.from(BUCKET).upload(newPath, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || "application/octet-stream",
  });
  if (up.error) {
    throw new Error(`Storage replace (nova key) falhou: ${up.error.message}`);
  }

  // 4) Remover a key antiga (ignora "not found")
  const rm = await supabase.storage.from(BUCKET).remove([current.path]);
  if (rm.error && rm.error.message && !/Object not found/i.test(rm.error.message)) {
    console.warn("[replaceDoc] remove antigo falhou:", rm.error.message);
  }

  // 5) Atualizar metadados + path
  const upd = await supabase
    .from("documentos")
    .update({
      file_path: newPath,
      path: newPath,
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

  return upd.data as DocumentoRow;
}

/* -------------------------------------------------------------------------- */
/*                                  Delete                                    */
/* -------------------------------------------------------------------------- */

export async function deleteDoc(id: string): Promise<void> {
  if (!id) throw new Error("deleteDoc: id em falta");

  // 1) Descobrir path
  const sel = await supabase.from("documentos").select("path").eq("id", id).single();
  if (sel.error || !sel.data) {
    throw new Error(`Não foi possível obter o registo (${id}): ${sel.error?.message || "not found"}`);
  }
  const { path } = sel.data as { path: string };

  // 2) Remover Storage (ignora "not found")
  const rm = await supabase.storage.from(BUCKET).remove([path]);
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

export async function listDocs(args: { nivel: "socio"; userId: string } | { nivel: "atleta"; userId: string; atletaId: string }): Promise<DocumentoRow[]> {
  let query = supabase.from("documentos").select("*").eq("user_id", (args as any).userId);

  if ((args as any).nivel === "socio") {
    query = query.eq("doc_nivel", "socio").is("atleta_id", null);
  } else {
    query = query.eq("doc_nivel", "atleta").eq("atleta_id", (args as any).atletaId);
  }

  query = query.order("doc_tipo", { ascending: true }).order("page", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`SELECT public.documentos falhou: ${error.message}`);
  return (data || []) as DocumentoRow[];
}

/* -------------------------------------------------------------------------- */
/*                              Signed URL helper                             */
/* -------------------------------------------------------------------------- */

export async function withSignedUrls(rows: DocumentoRow[], expiresInSeconds = 3600): Promise<DocumentoRow[]> {
  if (!rows?.length) return [];
  const paths = rows.map((r) => r.path);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresInSeconds);
  if (error) {
    console.error("[withSignedUrls] createSignedUrls falhou:", error.message);
    return rows;
  }

  const byPath: Record<string, string | undefined> = {};
  (data || []).forEach((d: any) => {
    if (d?.path) byPath[d.path] = d.signedUrl;
  });

  return rows.map((r) => ({ ...r, signedUrl: byPath[r.path] }));
}

// src/services/documentosService.ts
import { supabase } from "../supabaseClient";

export const BUCKET = "documentos";
export type Nivel = "socio" | "atleta";

export type DocumentoRow = {
  id: string;
  user_id: string;
  doc_nivel: Nivel;
  atleta_id: string | null;
  doc_tipo: string;
  page: number | null;
  file_path: string;  // caminho no Storage
  path: string;       // mantém igual ao file_path para compatibilidade
  nome: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;

  // Campos computados para a UI
  signedUrl?: string;
  file_name?: string;
};

type ListArgs =
  | { nivel: "socio"; userId: string }
  | { nivel: "atleta"; userId: string; atletaId: string };

type UploadArgs = {
  nivel: Nivel;
  userId: string;
  tipo: string;
  file: File;
  mode?: "new" | "replace"; // 'replace' não é usado no UploadDocsSection; usar replaceDoc(...)
  atletaId?: string | null;
  page?: number; // se não vier, determinamos automaticamente o próximo
};

function ensure(value: any, message: string) {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

function fileNameFromPath(p: string) {
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}

/** Determina a próxima page (1..N) para um dado slot (user, nivel, tipo, atleta). */
async function nextPageForSlot(
  userId: string,
  nivel: Nivel,
  tipo: string,
  atletaId: string | null
): Promise<number> {
  let q = supabase
    .from("documentos")
    .select("page", { count: "exact", head: false })
    .eq("user_id", userId)
    .eq("doc_nivel", nivel)
    .eq("doc_tipo", tipo)
    .order("page", { ascending: false })
    .limit(1);

  if (nivel === "atleta") q = q.eq("atleta_id", ensure(atletaId, "atletaId em falta"));
  else q = q.is("atleta_id", null);

  const { data, error } = await q;
  if (error) throw new Error(`Falha ao obter próxima página: ${error.message}`);
  const last = (data?.[0]?.page as number | null) ?? null;
  return (last ?? 0) + 1;
}

/** Lista registos da tabela 'documentos' para o utilizador e nível (e atleta quando aplicável). */
export async function listDocs(args: ListArgs): Promise<DocumentoRow[]> {
  const { userId } = args;
  let q = supabase
    .from("documentos")
    .select(
      "id,user_id,doc_nivel,atleta_id,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at,path"
    )
    .eq("user_id", userId)
    .eq("doc_nivel", args.nivel as Nivel)
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true });

  if (args.nivel === "atleta") {
    q = q.eq("atleta_id", (args as any).atletaId);
  } else {
    q = q.is("atleta_id", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Falha a listar documentos: ${error.message}`);

  return (data || []).map((r) => ({
    ...r,
    file_name: fileNameFromPath(r.file_path ?? r.path),
  })) as DocumentoRow[];
}

/** Gera signed URLs para as linhas devolvidas por listDocs (ou equivalentes). */
export async function withSignedUrls<T extends { file_path?: string; path?: string }>(
  rows: (T & { signedUrl?: string })[],
  expiresInSeconds = 60 * 60 // 1h
): Promise<(T & { signedUrl?: string })[]> {
  const paths = rows.map((r) => (r.file_path || r.path) as string).filter(Boolean);
  if (paths.length === 0) return rows;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  if (error) throw new Error(`Falha a criar signed URLs: ${error.message}`);

  const lookup = new Map<string, string>();
  for (const obj of data || []) {
    if (obj?.signedUrl && obj?.path) {
      lookup.set(obj.path, obj.signedUrl);
    }
  }

  return rows.map((r) => {
    const p = (r.file_path || r.path) as string;
    return { ...r, signedUrl: lookup.get(p) };
  });
}

/** Upload de novo documento (e INSERT na tabela). Para substituições, usa replaceDoc(...). */
export async function uploadDoc({
  nivel,
  userId,
  tipo,
  file,
  mode = "new",
  atletaId = null,
  page,
}: UploadArgs) {
  if (!file) throw new Error("Ficheiro em falta");
  if (nivel === "atleta" && !atletaId) throw new Error("atletaId em falta para nível 'atleta'");

  // Caminho no Storage — tem de começar por <uid>/ ... para bater certo com as policies
  const timestamp = Date.now();
  const safeName = file.name.replace(/\s+/g, "_");
  const storagePath =
    nivel === "socio"
      ? `${userId}/socio/${tipo}/${timestamp}_${safeName}`
      : `${userId}/atleta/${atletaId}/${tipo}/${timestamp}_${safeName}`;

  // Upload para o Storage
  const up = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type });

  if (up.error) {
    throw new Error(`Storage upload falhou: ${up.error.message}`);
  }

  // Determinar page (se não foi passada)
  const resolvedPage =
    typeof page === "number" && page > 0
      ? page
      : await nextPageForSlot(userId, nivel, tipo, nivel === "atleta" ? atletaId! : null);

  // INSERT na tabela
  const row = {
    user_id: userId,
    doc_nivel: nivel,
    atleta_id: nivel === "atleta" ? atletaId : null,
    doc_tipo: tipo,
    page: resolvedPage,
    file_path: storagePath,
    path: storagePath,
    nome: file.name,
    mime_type: file.type,
    file_size: file.size,
    uploaded_at: new Date().toISOString(),
  };

  const ins = await supabase.from("documentos").insert(row).select("id").single();
  if (ins.error) {
    // rollback best-effort do ficheiro
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`INSERT em public.documentos falhou: ${ins.error.message}`);
  }

  return { object: up.data, record: ins.data };
}

/** Substitui o conteúdo do ficheiro mantendo o mesmo path; atualiza metadados na tabela. */
export async function replaceDoc(rowId: string, file: File) {
  if (!rowId || !file) throw new Error("Parâmetros inválidos");

  // 1) Ler a linha para obter o path
  const { data: row, error: readErr } = await supabase
    .from("documentos")
    .select(
      "id,user_id,doc_nivel,atleta_id,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at,path"
    )
    .eq("id", rowId)
    .single();

  if (readErr || !row) {
    throw new Error(`Documento inexistente ou sem acesso (id=${rowId})`);
  }

  const targetPath = row.file_path || row.path;
  if (!targetPath) throw new Error("Caminho do ficheiro não encontrado");

  // 2) Atualizar conteúdo no Storage (política de UPDATE cobre este caso)
  const up = await supabase.storage
    .from(BUCKET)
    .update(targetPath, file, { upsert: true, contentType: file.type });

  if (up.error) {
    throw new Error(`Storage update falhou: ${up.error.message}`);
  }

  // 3) Atualizar metadados na tabela
  const upd = await supabase
    .from("documentos")
    .update({
      nome: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", rowId)
    .select("id")
    .single();

  if (upd.error) {
    throw new Error(`UPDATE na tabela 'documentos' falhou: ${upd.error.message}`);
  }

  return { object: up.data, record: upd.data };
}

/** Apaga o ficheiro do Storage e remove a linha na tabela. */
export async function deleteDoc(rowId: string) {
  if (!rowId) throw new Error("rowId em falta");

  // 1) Ler a linha para obter path
  const { data: row, error: readErr } = await supabase
    .from("documentos")
    .select("id,file_path,path")
    .eq("id", rowId)
    .single();

  if (readErr || !row) {
    throw new Error(`Documento inexistente ou sem acesso (id=${rowId})`);
  }

  const targetPath = (row as any).file_path || (row as any).path;
  if (!targetPath) throw new Error("Caminho do ficheiro não encontrado");

  // 2) Remover objecto no Storage (ignora erro 404)
  const rm = await supabase.storage.from(BUCKET).remove([targetPath]);
  if (rm.error && rm.error.message && !/not found/i.test(rm.error.message)) {
    // se for "not found", seguimos, caso contrário falha
    throw new Error(`Storage remove falhou: ${rm.error.message}`);
  }

  // 3) Remover linha na tabela
  const del = await supabase.from("documentos").delete().eq("id", rowId);
  if (del.error) {
    throw new Error(`DELETE em 'documentos' falhou: ${del.error.message}`);
  }

  return { ok: true };
}

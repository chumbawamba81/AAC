// src/admin/services/adminDocumentosService.ts
import { supabase } from "../../supabaseClient";

/** Bucket de documentos no Storage */
const BUCKET_DOCS = "documentos";
/** Validade dos links assinados (segundos) */
const SIGNED_URL_SECONDS = 60 * 60; // 1h

export type Nivel = "socio" | "atleta";

export type DocumentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  doc_nivel: Nivel;
  doc_tipo: string;
  page: number | null;
  /** caminho no Storage (ex.: "USERID/socio/Ficha de Sócio/123_abc.pdf") */
  file_path: string;
  /** nome amigável (coluna 'nome' na tua tabela) */
  nome: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  /** gerado em runtime */
  signedUrl?: string;
};

export type ListArgs =
  | { nivel: "socio"; userId: string }
  | { nivel: "atleta"; userId: string; atletaId: string };

/** Util: nome para mostrar (fallback a partir do file_path) */
export function displayName(row: DocumentoRow): string {
  if (row.nome && row.nome.trim()) return row.nome.trim();
  const p = row.file_path || "";
  const last = p.split("/").pop();
  return last || "ficheiro";
}

/** Util: agrupa por tipo e ordena por page asc */
export function groupByTipo(rows: DocumentoRow[]): Map<string, DocumentoRow[]> {
  const map = new Map<string, DocumentoRow[]>();
  for (const r of rows) {
    const arr = map.get(r.doc_tipo) || [];
    arr.push(r);
    map.set(r.doc_tipo, arr);
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    map.set(k, arr);
  }
  return map;
}

/**
 * Lista documentos do sócio (nivel='socio') ou do atleta (nivel='atleta').
 */
export async function listDocs(args: ListArgs): Promise<DocumentoRow[]> {
  let q = supabase
    .from("documentos")
    .select(
      "id,user_id,atleta_id,doc_nivel,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at"
    )
    .eq("user_id", args.userId)
    .eq("doc_nivel", args.nivel);

  if (args.nivel === "socio") {
    q = q.is("atleta_id", null);
  } else {
    q = q.eq("atleta_id", args.atletaId);
  }

  q = q.order("doc_tipo", { ascending: true }).order("page", { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error("[adminDocumentosService.listDocs] erro:", error.message);
    throw error;
  }
  return (data || []) as DocumentoRow[];
}

/** Lista todos os docs (sócio + atletas) de um user */
export async function listAllDocsByUser(userId: string): Promise<DocumentoRow[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select(
      "id,user_id,atleta_id,doc_nivel,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at"
    )
    .eq("user_id", userId)
    .order("doc_nivel", { ascending: true })
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true });

  if (error) {
    console.error("[adminDocumentosService.listAllDocsByUser] erro:", error.message);
    throw error;
  }
  return (data || []) as DocumentoRow[];
}

/** Assina URLs para download */
export async function withSignedUrls(rows: DocumentoRow[]): Promise<DocumentoRow[]> {
  const out: DocumentoRow[] = [];
  for (const r of rows) {
    let signedUrl: string | undefined = undefined;
    if (r.file_path) {
      const { data, error } = await supabase
        .storage
        .from(BUCKET_DOCS)
        .createSignedUrl(r.file_path, SIGNED_URL_SECONDS);
      if (!error && data?.signedUrl) {
        signedUrl = data.signedUrl;
      } else if (error) {
        console.warn("[withSignedUrls] falha signedUrl:", r.file_path, error.message);
      }
    }
    out.push({ ...r, signedUrl });
  }
  return out;
}

/** Conveniências */
export async function listDocsSocio(userId: string): Promise<DocumentoRow[]> {
  return listDocs({ nivel: "socio", userId });
}
export async function listDocsAtleta(userId: string, atletaId: string): Promise<DocumentoRow[]> {
  return listDocs({ nivel: "atleta", userId, atletaId });
}

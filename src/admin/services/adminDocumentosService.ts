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
  /** campo apenas de conveniência para UI */
  signedUrl?: string;
};

export type ListArgs =
  | { nivel: "socio"; userId: string }
  | { nivel: "atleta"; userId: string; atletaId: string };

/**
 * Lista documentos do sócio (nivel='socio') ou do atleta (nivel='atleta').
 * - Para 'socio' devolve docs com atleta_id IS NULL
 * - Para 'atleta' exige atletaId e filtra por esse atleta
 */
export async function listDocs(args: ListArgs): Promise<DocumentoRow[]> {
  let q = supabase
    .from("documentos")
    .select(
      // NÃO usar generics para evitar "Expected 2 type arguments"
      "id,user_id,atleta_id,doc_nivel,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at"
    )
    .eq("user_id", args.userId)
    .eq("doc_nivel", args.nivel);

  if (args.nivel === "socio") {
    q = q.is("atleta_id", null);
  } else {
    q = q.eq("atleta_id", args.atletaId);
  }

  // Importante: ordenar por colunas reais, não pelo alias "file_name"
  q = q.order("doc_tipo", { ascending: true }).order("page", { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error("[adminDocumentosService.listDocs] erro:", error.message);
    throw error;
  }
  return (data || []) as DocumentoRow[];
}

/** Atalho: lista todos os docs (sócio + todos atletas) de um user */
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

/**
 * Gera signed URLs para cada linha (campo file_path) no bucket 'documentos'.
 * Devolve um novo array, imutável, com 'signedUrl' preenchido quando possível.
 */
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
        // Não rebentar a UI por falhar um link; só regista
        console.warn("[adminDocumentosService.withSignedUrls] falha signedUrl:", r.file_path, error.message);
      }
    }
    out.push({ ...r, signedUrl });
  }
  return out;
}

/** Conveniência: docs do sócio (nível 'socio') */
export async function listDocsSocio(userId: string): Promise<DocumentoRow[]> {
  return listDocs({ nivel: "socio", userId });
}

/** Conveniência: docs de um atleta específico (nível 'atleta') */
export async function listDocsAtleta(userId: string, atletaId: string): Promise<DocumentoRow[]> {
  return listDocs({ nivel: "atleta", userId, atletaId });
}

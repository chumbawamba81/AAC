// src/admin/services/adminDocumentosService.ts
import { supabase } from "../../supabaseClient";

/** Linha normalizada para a UI de admin */
export type DocumentoRow = {
  id: string;
  user_id: string | null;
  atleta_id: string | null;
  doc_nivel: "socio" | "atleta";
  doc_tipo: string;
  page: number | null;
  file_path: string;
  file_name: string | null;   // <- alias de "nome"
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  signedUrl?: string;
};

type SocioArgs = { userId: string };
type AtletaArgs = { atletaId: string };

/** Lista documentos do SÓCIO (nível 'socio'). */
export async function listSocioDocs({ userId }: SocioArgs): Promise<DocumentoRow[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select(`
      id,
      user_id,
      atleta_id,
      doc_nivel,
      doc_tipo,
      page,
      file_path,
      file_name:nome,     -- alias apenas na projeção
      mime_type,
      file_size,
      uploaded_at
    `)
    .eq("doc_nivel", "socio")
    .eq("user_id", userId)
    .is("atleta_id", null)
    // ⚠️ ordenar SEM usar o alias
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true, nullsFirst: true })
    .order("nome", { ascending: true });

  if (error) throw error;
  return (data as unknown as DocumentoRow[]) ?? [];
}

/** Lista documentos por ATLETA (nível 'atleta'). */
export async function listAtletaDocs({ atletaId }: AtletaArgs): Promise<DocumentoRow[]> {
  const { data, error } = await supabase
    .from("documentos")
    .select(`
      id,
      user_id,
      atleta_id,
      doc_nivel,
      doc_tipo,
      page,
      file_path,
      file_name:nome,     -- alias apenas na projeção
      mime_type,
      file_size,
      uploaded_at
    `)
    .eq("doc_nivel", "atleta")
    .eq("atleta_id", atletaId)
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true, nullsFirst: true })
    .order("nome", { ascending: true });

  if (error) throw error;
  return (data as unknown as DocumentoRow[]) ?? [];
}

/** Adiciona signed URLs (bucket 'documentos'). */
export async function withSignedUrls(rows: DocumentoRow[]): Promise<DocumentoRow[]> {
  if (!rows?.length) return [];
  const out: DocumentoRow[] = [];
  for (const r of rows) {
    const { data, error } = await supabase
      .storage
      .from("documentos")
      .createSignedUrl(r.file_path, 60 * 60); // 1 hora
    out.push({ ...r, signedUrl: error ? undefined : data?.signedUrl });
  }
  return out;
}

/** Agrupa por tipo (doc_tipo) e ordena por page ASC */
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

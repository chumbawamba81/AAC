// src/admin/services/adminDocumentosService.ts
import { supabase } from "../../supabaseClient";

export type DocumentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  doc_nivel: "socio" | "atleta";
  doc_tipo: string;
  page: number | null;
  file_path: string;      // caminho no bucket "documentos"
  nome: string | null;    // nome legível guardado na tabela
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  signedUrl?: string;     // gerado em runtime
};

export type ListArgs =
  | { nivel: "socio"; userId: string }
  | { nivel: "atleta"; userId: string; atletaId: string };

export async function listDocs(args: ListArgs): Promise<DocumentoRow[]> {
  const q = supabase
    .from("documentos")
    .select(
      "id,user_id,atleta_id,doc_nivel,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at"
    );

  if (args.nivel === "socio") {
    const { data, error } = await q
      .eq("user_id", args.userId)
      .eq("doc_nivel", "socio")
      .is("atleta_id", null)
      .order("doc_tipo", { ascending: true })
      .order("page", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DocumentoRow[];
  } else {
    const { data, error } = await q
      .eq("user_id", args.userId)
      .eq("doc_nivel", "atleta")
      .eq("atleta_id", args.atletaId)
      .order("doc_tipo", { ascending: true })
      .order("page", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DocumentoRow[];
  }
}

/** Gera signed URLs para cada row (bucket privado "documentos"). */
export async function withSignedUrls<T extends DocumentoRow>(
  rows: T[],
  expireSeconds = 3600
): Promise<T[]> {
  if (!rows?.length) return rows;

  // Gera URLs em série (simples). Se preferires, podes paralelizar com Promise.all.
  const out: T[] = [];
  for (const r of rows) {
    const { data, error } = await supabase
      .storage
      .from("documentos")
      .createSignedUrl(r.file_path, expireSeconds);

    out.push({
      ...r,
      signedUrl: data?.signedUrl ?? undefined,
    });
  }
  return out;
}

/** Agrupa por doc_tipo e ordena por page ascendente. */
export function groupByTipo(rows: DocumentoRow[]): Map<string, DocumentoRow[]> {
  const m = new Map<string, DocumentoRow[]>();
  for (const r of rows) {
    const arr = m.get(r.doc_tipo) ?? [];
    arr.push(r);
    m.set(r.doc_tipo, arr);
  }
  // ordenação por page
  for (const [k, arr] of m) {
    arr.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    m.set(k, arr);
  }
  return m;
}

/** Pequena ajuda para extrair um nome “legível” */
export function displayName(row: DocumentoRow): string {
  if (row.nome && row.nome.trim() !== "") return row.nome.trim();
  // fallback ao último segmento do path
  const seg = row.file_path.split("/").pop();
  return seg || "ficheiro";
}

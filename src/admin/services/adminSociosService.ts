// src/admin/services/adminSociosService.ts
import { supabase } from "../../supabaseClient";

export type SocioRow = {
  id: string;
  user_id: string;
  nome_completo: string;
  email: string;
  telefone: string | null;
  codigo_postal: string | null;
  situacao_tesouraria: "Regularizado" | "Pendente" | "Parcial" | string;
  created_at: string | null;
};

export type ListArgs = {
  search?: string;
  status?: "Regularizado" | "Pendente" | "Parcial";
  orderBy?: "created_at" | "nome_completo" | "email" | "situacao_tesouraria";
  orderDir?: "asc" | "desc";
  limit?: number;
  page?: number; // 1-based
};

export async function listSocios(args: ListArgs) {
  const {
    search,
    status,
    orderBy = "created_at",
    orderDir = "desc",
    limit = 25,
    page = 1,
  } = args || {};

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from("dados_pessoais")
    .select(
      "id,user_id,nome_completo,email,telefone,codigo_postal,situacao_tesouraria,created_at",
      { count: "exact", head: false }
    );

  if (search && search.trim() !== "") {
    const s = `%${search.trim()}%`;
    q = q.or(`nome_completo.ilike.${s},email.ilike.${s},telefone.ilike.${s}`);
  }
  if (status) {
    q = q.eq("situacao_tesouraria", status);
  }

  q = q.order(orderBy, { ascending: orderDir === "asc" }).range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    data: (data || []) as SocioRow[],
    count: count ?? 0,
  };
}

export async function updateSituacaoTesouraria(userId: string, nova: "Regularizado" | "Pendente" | "Parcial") {
  if (!userId) throw new Error("userId em falta");
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: nova })
    .eq("user_id", userId);
  if (error) throw error;
}

export type DocRow = {
  id: string;
  doc_tipo: string;
  page: number | null;
  file_name: string | null;
  file_path: string;
  signedUrl?: string;
};

export async function fetchSocioDocs(userId: string): Promise<DocRow[]> {
  if (!userId) return [];
  // documentos de nível "socio" (sem atleta_id)
  const { data, error } = await supabase
    .from("documentos")
    .select("id, doc_tipo, page, file_name, file_path")
    .eq("user_id", userId)
    .eq("doc_nivel", "socio")
    .is("atleta_id", null)
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true });

  if (error) throw error;

  const rows = (data || []) as DocRow[];

  // gerar signed URLs no bucket "documentos"
  const out: DocRow[] = [];
  for (const r of rows) {
    const { data: signed } = await supabase.storage.from("documentos").createSignedUrl(r.file_path, 60 * 60);
    out.push({ ...r, signedUrl: signed?.signedUrl });
  }
  return out;
}

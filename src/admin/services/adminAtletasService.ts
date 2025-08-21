// src/admin/services/adminAtletasService.ts
import { supabase } from "../../supabaseClient";

/** ------- Tipos ------- */

export type AtletaRow = {
  id: string;
  user_id: string | null;
  nome: string;
  data_nascimento: string;      // date (YYYY-MM-DD)
  genero: string | null;
  escalao: string | null;
  opcao_pagamento: string | null;
  alergias: string;
  morada: string | null;
  codigo_postal: string | null;
  contactos_urgencia: string | null;
  emails_preferenciais: string | null;
  created_at: string | null;

  // extras (não obrigatórios)
  nacionalidade?: string | null;
  nacionalidade_outra?: string | null;
  tipo_doc?: string | null;
  num_doc?: string | null;
  validade_doc?: string | null; // date
  nif?: string | null;
  nome_pai?: string | null;
  nome_mae?: string | null;
  telefone_opc?: string | null;
  email_opc?: string | null;
  escola?: string | null;
  ano_escolaridade?: string | null;
  encarregado_educacao?: string | null;
  parentesco_outro?: string | null;
  observacoes?: string | null;
};

export type TitularMinimal = {
  user_id: string;
  nome_completo: string | null;
  email: string | null;
  telefone: string | null;
  tipo_socio: string | null;
  codigo_postal: string | null;
  /** <- NOVO: vem de dados_pessoais.situacao_tesouraria */
  situacao_tesouraria?: string | null;
};

export type DocumentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  doc_nivel: "socio" | "atleta";
  doc_tipo: string;
  page: number | null;
  file_path: string;
  nome: string | null;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  signedUrl?: string;
};

export type PagamentoRow = {
  id: string;
  atleta_id: string | null;
  descricao: string;
  comprovativo_url: string | null; // caminho no bucket 'pagamentos'
  created_at: string | null;
  signedUrl?: string;
};

export const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
] as const; // <- retirado “Comprovativo de pagamento de inscrição”

/** ------- Helpers ------- */

export function displayFileName(r: Pick<DocumentoRow, "nome" | "file_path">): string {
  if (r.nome && r.nome.trim() !== "") return r.nome.trim();
  const last = r.file_path.split("/").pop();
  return last || "ficheiro";
}

/** batelada de URLs assinadas no bucket indicado */
async function attachSignedUrls<T extends { signedUrl?: string }>(
  bucket: "documentos" | "pagamentos",
  rows: (T & { [k: string]: any })[],
  pathKey: string,
  expireSeconds = 3600
) {
  const out: (T & { [k: string]: any })[] = [];
  for (const r of rows) {
    const key: string | undefined = r[pathKey];
    if (!key) { out.push({ ...r, signedUrl: undefined }); continue; }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expireSeconds);
    out.push({ ...r, signedUrl: error ? undefined : data?.signedUrl });
  }
  return out as T[];
}

/** Cast seguro via unknown (evita TS2352 por GenericStringError) */
function asType<T>(v: any): T {
  return v as unknown as T;
}

/** ------- Listagens principais ------- */

export async function listAtletasAdmin(opts?: {
  search?: string;
  genero?: "Feminino" | "Masculino" | "";
  escalao?: string | "";
  tipoSocio?: string | ""; // filtro por tipo de sócio (via dados_pessoais)
  sort?: "nome_asc" | "nome_desc" | "created_desc" | "created_asc";
}): Promise<
  Array<{
    atleta: AtletaRow;
    titular?: TitularMinimal;
  }>
> {
  let q = supabase
    .from("atletas")
    .select(
      "id,user_id,nome,data_nascimento,genero,escalao,opcao_pagamento,alergias," +
        "morada,codigo_postal,contactos_urgencia,emails_preferenciais,created_at," +
        "nacionalidade,nacionalidade_outra,tipo_doc,num_doc,validade_doc,nif," +
        "nome_pai,nome_mae,telefone_opc,email_opc,escola,ano_escolaridade,encarregado_educacao,parentesco_outro,observacoes"
    );

  if (opts?.search) {
    const s = opts.search.trim();
    if (s) q = q.ilike("nome", `%${s}%`);
  }
  if (opts?.genero) q = q.eq("genero", opts.genero);
  if (opts?.escalao) q = q.eq("escalao", opts.escalao);

  switch (opts?.sort) {
    case "nome_desc": q = q.order("nome", { ascending: false }); break;
    case "created_asc": q = q.order("created_at", { ascending: true, nullsFirst: true }); break;
    case "created_desc": q = q.order("created_at", { ascending: false, nullsFirst: true }); break;
    default: q = q.order("nome", { ascending: true });
  }

  const { data, error } = await q;
  if (error) throw error;

  const atletas = asType<AtletaRow[]>(data ?? []);

  // Buscar titulares (dados_pessoais) para os user_id encontrados
  const userIds = Array.from(new Set(atletas.map(a => a.user_id).filter(Boolean))) as string[];
  let titulares: TitularMinimal[] = [];
  if (userIds.length) {
    const { data: tdata, error: terr } = await supabase
      .from("dados_pessoais")
      .select("user_id,nome_completo,email,telefone,tipo_socio,codigo_postal,situacao_tesouraria")
      .in("user_id", userIds);
    if (terr) throw terr;
    titulares = asType<TitularMinimal[]>(tdata ?? []);
  }

  const byUser = new Map<string, TitularMinimal>();
  for (const t of titulares) if (t.user_id) byUser.set(t.user_id, t);

  // filtro por tipo de sócio (se pedido)
  const filtered = (opts?.tipoSocio && opts.tipoSocio !== "")
    ? atletas.filter(a => (a.user_id && (byUser.get(a.user_id)?.tipo_socio || "") === opts.tipoSocio))
    : atletas;

  return filtered.map(a => ({ atleta: a, titular: a.user_id ? byUser.get(a.user_id) : undefined }));
}

/** Missing por atleta, numa única query (em lote) */
export async function getMissingCountsForAtletas(atletaIds: string[]): Promise<Record<string, number>> {
  if (!atletaIds.length) return {};
  const { data, error } = await supabase
    .from("documentos")
    .select("atleta_id,doc_tipo")
    .eq("doc_nivel", "atleta")
    .in("atleta_id", atletaIds);
  if (error) throw error;

  const want = new Set<string>(DOCS_ATLETA as unknown as string[]);
  const byAth = new Map<string, Set<string>>();
  for (const r of asType<Array<{ atleta_id: string | null; doc_tipo: string }>>(data ?? [])) {
    if (!r.atleta_id) continue;
    const set = byAth.get(r.atleta_id) || new Set<string>();
    set.add(r.doc_tipo);
    byAth.set(r.atleta_id, set);
  }
  const out: Record<string, number> = {};
  for (const id of atletaIds) {
    const have = byAth.get(id) || new Set<string>();
    let miss = 0;
    for (const t of want) if (!have.has(t)) miss++;
    out[id] = miss;
  }
  return out;
}

/** Documentos (com URLs) por atleta */
export async function listDocsByAtleta(userId: string, atletaId: string) {
  const { data, error } = await supabase
    .from("documentos")
    .select("id,user_id,atleta_id,doc_nivel,doc_tipo,page,file_path,nome,mime_type,file_size,uploaded_at")
    .eq("user_id", userId)
    .eq("doc_nivel", "atleta")
    .eq("atleta_id", atletaId)
    .order("doc_tipo", { ascending: true })
    .order("page", { ascending: true });

  if (error) throw error;
  const rows = asType<DocumentoRow[]>(data ?? []);
  return attachSignedUrls<DocumentoRow>("documentos", rows, "file_path");
}

/** Pagamentos (com URLs) por atleta */
export async function listPagamentosByAtleta(atletaId: string) {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,atleta_id,descricao,comprovativo_url,created_at")
    .eq("atleta_id", atletaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = asType<PagamentoRow[]>(data ?? []);
  return attachSignedUrls<PagamentoRow>("pagamentos", rows, "comprovativo_url");
}

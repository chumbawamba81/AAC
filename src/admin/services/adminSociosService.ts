// src/admin/services/adminSociosService.ts
import { supabase } from "../../supabaseClient";

/** Linha “light” para a listagem */
export type SocioRow = {
  id: string;
  user_id: string;
  nome_completo: string;
  email: string;
  telefone: string | null;
  tipo_socio: string | null;
  situacao_tesouraria: "Regularizado" | "Pendente" | "Parcial" | string;
  created_at: string | null;
};

export type ListArgs = {
  search?: string;
  status?: "Regularizado" | "Pendente" | "Parcial";
  tipoSocio?: string;
  orderBy?: "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
  orderDir?: "asc" | "desc";
  limit?: number;
  page?: number; // 1-based
};

export async function listSocios(args: ListArgs) {
  const {
    search,
    status,
    tipoSocio,
    orderBy = "created_at",
    orderDir = "desc",
    limit = 25,
    page = 1,
  } = args || {};

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from("dados_pessoais")
    .select("id,user_id,nome_completo,email,telefone,tipo_socio,situacao_tesouraria,created_at", {
      count: "exact",
      head: false,
    });

  if (search && search.trim() !== "") {
    const s = `%${search.trim()}%`;
    // nome | email | telefone
    q = q.or(`nome_completo.ilike.${s},email.ilike.${s},telefone.ilike.${s}`);
  }
  if (status) q = q.eq("situacao_tesouraria", status);
  if (tipoSocio) q = q.eq("tipo_socio", tipoSocio);

  q = q.order(orderBy, { ascending: orderDir === "asc" }).range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;

  return {
    data: (data || []) as SocioRow[],
    count: count ?? 0,
  };
}

/** Atualiza situação de tesouraria */
export async function updateSituacaoTesouraria(
  userId: string,
  nova: "Regularizado" | "Pendente" | "Parcial"
) {
  if (!userId) throw new Error("userId em falta");
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: nova })
    .eq("user_id", userId);
  if (error) throw error;
}

/** Linha detalhada (para modal) — usamos select * para ser resiliente a colunas novas */
export type SocioFullRow = {
  [k: string]: any;
  id: string;
  user_id: string;
  nome_completo: string;
  email: string;
  telefone: string | null;
  tipo_socio: string | null;
  data_nascimento: string | null;
  genero: string | null;
  nif: string | null;
  profissao: string | null;
  morada: string | null;
  codigo_postal: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  data_validade_documento?: string | null;
  situacao_tesouraria: string;
  created_at: string | null;
};

export async function fetchSocioFull(userId: string): Promise<SocioFullRow> {
  const { data, error } = await supabase
    .from("dados_pessoais")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Sócio não encontrado.");
  return data as SocioFullRow;
}

/** Documentos de nível "socio" com signed URLs */
export type DocRow = {
  id: string;
  doc_tipo: string;
  page: number | null;
  file_name: string | null;
  file_path: string;
  signedUrl?: string;
};

export async function fetchSocioDocs(userId: string): Promise<DocRow[]> {
  try {
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

    const out: DocRow[] = [];
    for (const r of rows) {
      // gerar signed URL (requer policy SELECT em storage.objects para admins)
      const { data: signed, error: sErr } = await supabase.storage
        .from("documentos")
        .createSignedUrl(r.file_path, 60 * 60);
      // mesmo que falhe um, não bloqueia restantes
      out.push({ ...r, signedUrl: signed?.signedUrl });
      if (sErr) console.warn("[adminSociosService] signedUrl falhou:", sErr.message, r.file_path);
    }
    return out;
  } catch (e) {
    console.error("[adminSociosService] fetchSocioDocs:", e);
    // não atirar erro para o UI ficar preso em "A carregar…"
    return [];
  }
}

/** Atletas do titular (user_id) */
export type AtletaRow = {
  id: string;
  user_id: string | null;
  nome: string;
  data_nascimento: string | null;
  escalao: string | null;
  alergias: string | null;
  opcao_pagamento: string | null;
  morada: string | null;
  codigo_postal: string | null;
  contactos_urgencia: string | null;
  emails_preferenciais: string | null;
  genero: string | null;
  observacoes?: string | null;
};

export async function listAtletasByUser(userId: string): Promise<AtletaRow[]> {
  const { data, error } = await supabase
    .from("atletas")
    .select(
      "id,user_id,nome,data_nascimento,escalao,alergias,opcao_pagamento,morada,codigo_postal,contactos_urgencia,emails_preferenciais,genero,observacoes"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as AtletaRow[];
}

/** Exportar CSV de toda a listagem atual (ignora paginação) */
export async function exportSociosAsCsv(args: Omit<ListArgs, "limit" | "page">) {
  const { search, status, tipoSocio, orderBy = "created_at", orderDir = "desc" } = args;

  let q = supabase
    .from("dados_pessoais")
    .select(
      "id,user_id,nome_completo,email,telefone,tipo_socio,situacao_tesouraria,created_at",
      { count: "exact", head: false }
    );

  if (search && search.trim() !== "") {
    const s = `%${search.trim()}%`;
    q = q.or(`nome_completo.ilike.${s},email.ilike.${s},telefone.ilike.${s}`);
  }
  if (status) q = q.eq("situacao_tesouraria", status);
  if (tipoSocio) q = q.eq("tipo_socio", tipoSocio);

  q = q.order(orderBy, { ascending: orderDir === "asc" }).limit(5000);

  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as SocioRow[];
  const headers = [
    "id",
    "user_id",
    "nome_completo",
    "email",
    "telefone",
    "tipo_socio",
    "situacao_tesouraria",
    "created_at",
  ];

  const csv =
    headers.join(";") +
    "\n" +
    rows
      .map((r) =>
        [
          r.id,
          r.user_id,
          safe(r.nome_completo),
          safe(r.email),
          safe(r.telefone || ""),
          safe(r.tipo_socio || ""),
          safe(r.situacao_tesouraria || ""),
          r.created_at || "",
        ].join(";")
      )
      .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "socios.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safe(v: string) {
  // escapa ; e quebras simples
  const s = (v || "").replace(/;/g, ",").replace(/\r?\n/g, " ");
  return `"${s.replace(/"/g, '""')}"`;
}

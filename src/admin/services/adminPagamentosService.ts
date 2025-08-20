// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Linha base da tabela pagamentos (mínimo necessário) */
type PgPagamento = {
  id: string;
  created_at: string | null;
  descricao: string | null;
  validado: boolean | null;
  comprovativo_url: string | null; // chave no bucket "pagamentos" ou URL completo
  user_id: string | null;          // titular/EE (pode vir a null em pagamentos por atleta)
  atleta_id: string | null;
};

/** Linhas auxiliares */
type PgAtleta = { id: string; nome: string | null; user_id: string | null };
type PgPessoa = { user_id: string; nome_completo: string | null; email: string | null };

export type AdminPagamento = {
  id: string;
  createdAt: string | null;
  descricao: string | null;
  validado: boolean;
  signedUrl: string | null;

  titularUserId: string | null;
  titularName: string | null;
  titularEmail: string | null;

  atletaId: string | null;
  atletaNome: string | null;
};

/** Se a string já for um URL http(s), usa-a; caso contrário cria signed URL no bucket "pagamentos". */
async function toSignedUrlMaybe(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const { data, error } = await supabase.storage
    .from("pagamentos")
    .createSignedUrl(key, 60 * 60); // 1h
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Carrega todos os pagamentos com enriquecimento (nome/email do titular e nome do atleta) */
export async function listPagamentosAdmin(): Promise<AdminPagamento[]> {
  // 1) pagamentos base
  const { data: base, error: e1 } = await supabase
    .from("pagamentos")
    .select("id, created_at, descricao, validado, comprovativo_url, user_id, atleta_id")
    .order("created_at", { ascending: false });
  if (e1) throw e1;

  const rows = (base ?? []) as PgPagamento[];
  if (rows.length === 0) return [];

  // 2) mapear ids para fetch em lote
  const atletaIds = Array.from(new Set(rows.map(r => r.atleta_id).filter(Boolean))) as string[];

  // 3) ler atletas (para obter nome e user_id do titular associado ao atleta)
  let mapAtleta = new Map<string, PgAtleta>();
  if (atletaIds.length) {
    const { data: aData, error: eA } = await supabase
      .from("atletas")
      .select("id, nome, user_id")
      .in("id", atletaIds);
    if (eA) throw eA;
    for (const a of (aData ?? []) as PgAtleta[]) mapAtleta.set(a.id, a);
  }

  // 4) construir conjunto de titulares a pedir aos dados_pessoais
  const titularIds = new Set<string>();
  for (const r of rows) {
    const viaPagamento = r.user_id;
    const viaAtleta = r.atleta_id ? mapAtleta.get(r.atleta_id)?.user_id ?? null : null;
    const uid = viaPagamento ?? viaAtleta ?? null;
    if (uid) titularIds.add(uid);
  }

  // 5) ler dados_pessoais desses titulares
  let mapPessoa = new Map<string, PgPessoa>();
  if (titularIds.size) {
    const ids = Array.from(titularIds);
    const { data: pData, error: eP } = await supabase
      .from("dados_pessoais")
      .select("user_id, nome_completo, email")
      .in("user_id", ids);
    if (eP) throw eP;
    for (const p of (pData ?? []) as PgPessoa[]) mapPessoa.set(p.user_id, p);
  }

  // 6) montar saída + obter signed URLs
  const out: AdminPagamento[] = [];
  for (const r of rows) {
    const a = r.atleta_id ? mapAtleta.get(r.atleta_id) ?? null : null;
    const titularUserId = r.user_id ?? a?.user_id ?? null;
    const pessoa = titularUserId ? mapPessoa.get(titularUserId) ?? null : null;

    const signedUrl = await toSignedUrlMaybe(r.comprovativo_url);

    out.push({
      id: r.id,
      createdAt: r.created_at,
      descricao: r.descricao,
      validado: !!r.validado,
      signedUrl,

      titularUserId,
      titularName: pessoa?.nome_completo ?? null,
      titularEmail: pessoa?.email ?? null,

      atletaId: r.atleta_id,
      atletaNome: a?.nome ?? null,
    });
  }

  return out;
}

/** Alterna o estado de validação do pagamento (RLS deve permitir UPDATE para admin) */
export async function marcarPagamentoValidado(id: string, to: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado: to })
    .eq("id", id);
  if (error) throw error;
}

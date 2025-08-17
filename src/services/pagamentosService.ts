import { supabase } from '../supabaseClient';

type DbPagamento = {
  id: string;
  atleta_id: string | null;
  descricao: string;
  comprovativo_url: string | null;
  created_at?: string | null;
};

export type Pagamento = {
  id: string;
  atletaId: string;
  descricao: string;
  comprovativoUrl: string | null;
  createdAt?: string | null;
};

function mapDbToDomain(r: DbPagamento): Pagamento {
  return {
    id: r.id,
    atletaId: r.atleta_id ?? '',
    descricao: r.descricao,
    comprovativoUrl: r.comprovativo_url,
    createdAt: r.created_at ?? undefined,
  };
}

/** Lista pagamentos de um atleta (ordenados por created_at asc) */
export async function listPagamentos(atletaId: string): Promise<Pagamento[]> {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('id, atleta_id, descricao, comprovativo_url, created_at')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: true })
    .returns<DbPagamento[]>(); // <- aqui

  if (error) throw error;
  return (data ?? []).map(mapDbToDomain);
}

/** Um pagamento específico por descrição */
export async function getPagamento(atletaId: string, descricao: string): Promise<Pagamento | null> {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('id, atleta_id, descricao, comprovativo_url, created_at')
    .eq('atleta_id', atletaId)
    .eq('descricao', descricao)
    .maybeSingle()
    .returns<DbPagamento | null>(); // <- aqui

  if (error) throw error;
  return data ? mapDbToDomain(data) : null;
}

/** Upsert por (atleta_id, descricao) — requer índice único correspondente */
export async function upsertComprovativo(
  atletaId: string,
  descricao: string,
  comprovativoUrl: string | null
): Promise<Pagamento> {
  const payload = { atleta_id: atletaId, descricao, comprovativo_url: comprovativoUrl };

  const { data, error } = await supabase
    .from('pagamentos')
    .upsert(payload, { onConflict: 'atleta_id,descricao' })
    .select('id, atleta_id, descricao, comprovativo_url, created_at')
    .single()
    .returns<DbPagamento>(); // <- aqui

  if (error) throw error;
  return mapDbToDomain(data);
}

export async function deleteComprovativo(atletaId: string, descricao: string): Promise<void> {
  const { error } = await supabase
    .from('pagamentos')
    .delete()
    .eq('atleta_id', atletaId)
    .eq('descricao', descricao);

  if (error) throw error;
}

export async function deleteAllComprovativosDoAtleta(atletaId: string): Promise<void> {
  const { error } = await supabase
    .from('pagamentos')
    .delete()
    .eq('atleta_id', atletaId);

  if (error) throw error;
}

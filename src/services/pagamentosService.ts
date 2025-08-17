// src/services/pagamentosService.ts
import { supabase } from '../supabaseClient';

/**
 * Estrutura na BD (public.pagamentos)
 */
type DbPagamento = {
  id: string;
  atleta_id: string | null;
  descricao: string;                 // p.ex.: "Pagamento - 1º Mês" | "Pagamento - 2º Trimestre" | "Pagamento da anuidade"
  comprovativo_url: string | null;   // URL (storage) ou outro identificador
  created_at?: string | null;
};

/**
 * Tipo de domínio usado no front-end
 */
export type Pagamento = {
  id: string;
  atletaId: string;
  descricao: string;
  comprovativoUrl: string | null;
  createdAt?: string | null;
};

/** Mapeadores BD ⇄ Domínio */
function mapDbToDomain(r: DbPagamento): Pagamento {
  return {
    id: r.id,
    atletaId: r.atleta_id ?? '',
    descricao: r.descricao,
    comprovativoUrl: r.comprovativo_url,
    createdAt: r.created_at ?? undefined,
  };
}

/**
 * IMPORTANTE: para o upsert por (atleta_id, descricao)
 * deves ter o índice único criado na BD:
 *
 *  create unique index if not exists pagamentos_atleta_descricao_key
 *    on public.pagamentos(atleta_id, descricao);
 */

/** Lista pagamentos de um atleta (ordenados por created_at ascendente) */
export async function listPagamentos(atletaId: string): Promise<Pagamento[]> {
  const { data, error } = await supabase
    .from('pagamentos')
    .select<DbPagamento>('id, atleta_id, descricao, comprovativo_url, created_at')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapDbToDomain);
}

/** Obtém (se existir) um pagamento específico por descrição */
export async function getPagamento(atletaId: string, descricao: string): Promise<Pagamento | null> {
  const { data, error } = await supabase
    .from('pagamentos')
    .select<DbPagamento>('id, atleta_id, descricao, comprovativo_url, created_at')
    .eq('atleta_id', atletaId)
    .eq('descricao', descricao)
    .maybeSingle();

  if (error) throw error;
  return data ? mapDbToDomain(data) : null;
}

/**
 * Guarda/substitui um comprovativo para uma dada descrição (slot).
 * Requer o índice único em (atleta_id, descricao).
 */
export async function upsertComprovativo(
  atletaId: string,
  descricao: string,
  comprovativoUrl: string | null
): Promise<Pagamento> {
  const payload = { atleta_id: atletaId, descricao, comprovativo_url: comprovativoUrl };

  const { data, error } = await supabase
    .from('pagamentos')
    .upsert(payload, { onConflict: 'atleta_id,descricao' })
    .select<DbPagamento>('id, atleta_id, descricao, comprovativo_url, created_at')
    .single();

  if (error) throw error;
  return mapDbToDomain(data);
}

/** Apaga um comprovativo (linha) por descrição */
export async function deleteComprovativo(atletaId: string, descricao: string): Promise<void> {
  const { error } = await supabase
    .from('pagamentos')
    .delete()
    .eq('atleta_id', atletaId)
    .eq('descricao', descricao);

  if (error) throw error;
}

/** Apaga todos os comprovativos de um atleta (útil em remoções cascata no UI) */
export async function deleteAllComprovativosDoAtleta(atletaId: string): Promise<void> {
  const { error } = await supabase
    .from('pagamentos')
    .delete()
    .eq('atleta_id', atletaId);

  if (error) throw error;
}

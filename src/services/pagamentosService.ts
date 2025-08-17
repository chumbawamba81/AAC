import { supabase } from '../supabaseClient';

/** Lista pagamentos (linhas) por atleta */
export async function listPagamentos(atletaId: string) {
  const { data, error } = await supabase
    .from('pagamentos')
    .select('*')
    .eq('atleta_id', atletaId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Guarda/substitui um comprovativo para uma dada descrição (slot) */
export async function upsertComprovativo(atletaId: string, descricao: string, comprovativoUrl: string | null) {
  const { data, error } = await supabase
    .from('pagamentos')
    .upsert({ atleta_id: atletaId, descricao, comprovativo_url: comprovativoUrl }, { onConflict: 'atleta_id,descricao' })
    .select()
    .single();
  if (error) throw error;
  return data;
}
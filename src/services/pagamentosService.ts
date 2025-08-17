import { supabase } from '../supabaseClient';

export async function savePagamento(formData: any) {
  const { data, error } = await supabase.rpc('pagamentos_upsert', formData);
  if (error) throw error;
  return data;
}

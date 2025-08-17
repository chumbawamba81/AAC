import { supabase } from '../supabaseClient';

export async function saveDadosPessoais(formData: any) {
  const { data, error } = await supabase.rpc('dados_pessoais_upsert', formData);
  if (error) throw error;
  return data;
}

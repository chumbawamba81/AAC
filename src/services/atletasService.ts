import { supabase } from '../supabaseClient';

export async function saveAtleta(formData: any) {
  const { data, error } = await supabase.rpc('atletas_upsert', formData);
  if (error) throw error;
  return data;
}

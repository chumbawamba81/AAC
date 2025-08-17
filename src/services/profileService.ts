import { supabase } from '../supabaseClient';
import type { PessoaDados } from '../types/PessoaDados';

const TBL = 'dados_pessoais';

async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sem sessão activa');
  return data.user.id;
}

export async function getMyProfile(): Promise<(PessoaDados & { id: string }) | null> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from(TBL)
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nomeCompleto: data.nome_completo,
    dataNascimento: data.data_nascimento,
    genero: data.genero ?? undefined,
    morada: data.morada ?? '',
    codigoPostal: data.codigo_postal ?? '',
    telefone: data.telefone ?? '',
    email: data.email,
    situacaoTesouraria: data.situacao_tesouraria ?? 'Campo em atualização',
    noticias: data.noticias ?? '',
  };
}

export async function upsertMyProfile(payload: PessoaDados): Promise<{ id: string }> {
  const uid = await getUserId();
  const row = {
    user_id: uid,
    nome_completo: payload.nomeCompleto,
    data_nascimento: payload.dataNascimento,
    genero: payload.genero ?? null,
    morada: payload.morada ?? null,
    codigo_postal: payload.codigoPostal ?? null,
    telefone: payload.telefone ?? null,
    email: payload.email,
    situacao_tesouraria: payload.situacaoTesouraria ?? 'Campo em atualização',
    noticias: payload.noticias ?? null,
  };
  const { data, error } = await supabase
    .from(TBL)
    .upsert(row, { onConflict: 'user_id' })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id };
}
import { supabase } from '../supabaseClient';
import type { Atleta } from '../types/Atleta';

/**
 * Serviço para operações relacionadas com atletas. Permite listar,
 * criar/actualizar e remover atletas. O acesso é filtrado pelo
 * utilizador autenticado através das policies de RLS no Supabase.
 */
const TABLE_NAME = 'atletas';

/**
 * Obtém todos os atletas do utilizador autenticado. Retorna uma
 * lista vazia se o utilizador não tiver sessão ou não existirem
 * registos. Os campos do registo da base de dados são mapeados para
 * o tipo Atleta usado no frontend.
 */
export async function listAtletas(): Promise<Atleta[]> {
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = userData.user;
  if (!user) return [];
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => {
    const atleta: Atleta = {
      id: row.id,
      nomeCompleto: row.nome_completo,
      dataNascimento: row.data_nascimento,
      genero: row.genero,
      escalao: row.escalao,
      planoPagamento: row.plano_pagamento,
      escola: row.escola ?? '',
      morada: row.morada ?? '',
      codigoPostal: row.codigo_postal ?? '',
      alergias: row.alergias ?? '',
      emailPreferencial: row.email_preferencial ?? '',
      contactoUrgencia: row.contacto_urgencia ?? '',
    };
    return atleta;
  });
}

/**
 * Cria ou actualiza um atleta. Se existir um registo com o mesmo id,
 * o registo será actualizado; caso contrário, será criado um novo
 * registo. O campo user_id é preenchido com o utilizador
 * autenticado. O mapeamento converte o objecto Atleta em colunas da
 * tabela.
 */
export async function upsertAtleta(a: Atleta): Promise<void> {
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw authErr;
  const user = userData.user;
  if (!user) throw new Error('Sem sessão');
  const row = {
    id: a.id,
    user_id: user.id,
    nome_completo: a.nomeCompleto,
    data_nascimento: a.dataNascimento,
    genero: a.genero,
    escalao: a.escalao,
    plano_pagamento: a.planoPagamento,
    escola: a.escola ?? null,
    morada: a.morada ?? null,
    codigo_postal: a.codigoPostal ?? null,
    alergias: a.alergias ?? null,
    email_preferencial: a.emailPreferencial ?? null,
    contacto_urgencia: a.contactoUrgencia ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from(TABLE_NAME).upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

/**
 * Remove um atleta da base de dados através do seu identificador.
 */
export async function deleteAtleta(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
  if (error) throw error;
}
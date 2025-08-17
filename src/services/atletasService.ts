import { supabase } from '../supabaseClient';
import type { Atleta, PlanoPagamento } from '../types/Atleta';
import { getMyProfile } from './profileService';

const TBL = 'atletas';

async function getPerfilId(): Promise<string> {
  const p = await getMyProfile();
  if (!p?.id) throw new Error('Crie/guarde primeiro os Dados Pessoais.');
  return p.id;
}

export async function listAtletas(): Promise<Atleta[]> {
  const perfilId = await getPerfilId();
  const { data, error } = await supabase
    .from(TBL)
    .select('*')
    .eq('dados_pessoais_id', perfilId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map((r: any) => ({
    id: r.id,
    nomeCompleto: r.nome,
    dataNascimento: r.data_nascimento,
    genero: r.genero ?? undefined,
    // suporta ambas colunas: escalao (ASCII) ou "escalão" (acentos)
    escalao: (r.escalao ?? r['escalão']) ?? undefined,
    alergias: r.alergias ?? '',
    planoPagamento: (r.opcao_pagamento as PlanoPagamento) ?? 'Mensal',
    morada: r.morada ?? '',
    codigoPostal: r.codigo_postal ?? '',
    contactosUrgencia: r.contactos_urgencia ?? '',
    emailsPreferenciais: r.emails_preferenciais ?? '',
  }));
}

export async function upsertAtleta(a: Atleta): Promise<void> {
  const perfilId = await getPerfilId();
  const base: any = {
    id: a.id,
    dados_pessoais_id: perfilId,
    nome: a.nomeCompleto,
    data_nascimento: a.dataNascimento,
    genero: a.genero ?? null,
    alergias: a.alergias ?? '',
    opcao_pagamento: a.planoPagamento,
    morada: a.morada ?? null,
    codigo_postal: a.codigoPostal ?? null,
    contactos_urgencia: a.contactosUrgencia ?? null,
    emails_preferenciais: a.emailsPreferenciais ?? null,
  };

  // escreve na coluna correta conforme exista
  base.escalao = a.escalao ?? null;
  // Se mantiveres a coluna com acento, remove a linha acima e usa:
  // base['escalão'] = a.escalao ?? null;

  const { error } = await supabase.from(TBL).upsert(base, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteAtleta(id: string) {
  const { error } = await supabase.from(TBL).delete().eq('id', id);
  if (error) throw error;
}
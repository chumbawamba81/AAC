// src/services/atletasService.ts
import { supabase } from '../supabaseClient';
import type { Atleta, PlanoPagamento } from '../types/Atleta';
import { getMyProfile } from './profileService';

const TBL = 'atletas';

type DbAtleta = {
  id: string;
  dados_pessoais_id: string | null;
  nome: string;
  data_nascimento: string;        // YYYY-MM-DD
  genero: string | null;          // 'Masculino' | 'Feminino' | null
  escalao?: string | null;        // <- sem acento
  alergias: string;
  opcao_pagamento: string | null; // 'Mensal' | 'Trimestral' | 'Anual' | null
  morada: string | null;
  codigo_postal: string | null;
  contactos_urgencia: string | null;
  emails_preferenciais: string | null;
  created_at?: string | null;
};

async function getPerfilId(): Promise<string> {
  const p = await getMyProfile();
  if (!p?.id) throw new Error('Crie/guarde primeiro os Dados Pessoais.');
  return p.id;
}

// devolve exatamente o tipo do domínio
function coerceGenero(x: string | null | undefined): Atleta['genero'] {
  return (x === 'Masculino' || x === 'Feminino' ? (x as Atleta['genero']) : undefined);
}

function coercePlano(x: string | null | undefined): PlanoPagamento {
  return x === 'Trimestral' || x === 'Anual' ? x : 'Mensal';
}

/** BD → Domínio */
function mapDbToDomain(r: DbAtleta): Atleta {
  return {
    id: r.id,
    nomeCompleto: r.nome,
    dataNascimento: r.data_nascimento,
    genero: coerceGenero(r.genero),
    escalao: r.escalao ?? undefined,
    alergias: r.alergias ?? '',
    planoPagamento: coercePlano(r.opcao_pagamento),
    morada: r.morada ?? '',
    codigoPostal: r.codigo_postal ?? '',
    contactosUrgencia: r.contactos_urgencia ?? '',
    emailsPreferenciais: r.emails_preferenciais ?? '',
  };
}

/** Domínio → BD */
function mapDomainToDb(perfilId: string, a: Atleta): Partial<DbAtleta> {
  return {
    id: a.id, // necessário para onConflict:'id'
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
    escalao: a.escalao ?? null,
  };
}

export async function listAtletas(): Promise<Atleta[]> {
  const perfilId = await getPerfilId();

  const { data, error } = await supabase
    .from(TBL)
    .select(
      'id, dados_pessoais_id, nome, data_nascimento, genero, escalao, alergias, opcao_pagamento, morada, codigo_postal, contactos_urgencia, emails_preferenciais, created_at'
    )
    .eq('dados_pessoais_id', perfilId)
    .order('created_at', { ascending: false })
    .returns<DbAtleta[]>();

  if (error) throw error;
  return (data ?? []).map(mapDbToDomain);
}

export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  const perfilId = await getPerfilId();
  const row = mapDomainToDb(perfilId, a);

  const { data, error } = await supabase
    .from(TBL)
    .upsert(row, { onConflict: 'id' })
    .select(
      'id, dados_pessoais_id, nome, data_nascimento, genero, escalao, alergias, opcao_pagamento, morada, codigo_postal, contactos_urgencia, emails_preferenciais, created_at'
    )
    .single()
    .returns<DbAtleta>();

  if (error) throw error;
  return mapDbToDomain(data);
}

export async function deleteAtleta(id: string) {
  const perfilId = await getPerfilId();
  const { error } = await supabase
    .from(TBL)
    .delete()
    .eq('id', id)
    .eq('dados_pessoais_id', perfilId);
  if (error) throw error;
}

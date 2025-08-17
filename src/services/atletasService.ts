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
    ema

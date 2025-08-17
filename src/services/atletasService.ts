// src/services/atletasService.ts
import { supabase } from '../supabaseClient';
import type { Atleta, PlanoPagamento, Genero } from '../types/Atleta'; // <- importa Genero daqui
import { getMyProfile } from './profileService';

const TBL = 'atletas';

type DbAtleta = {
  id: string;
  dados_pessoais_id: string | null;
  nome: string;
  data_nascimento: string; // YYYY-MM-DD
  genero: string | null;
  escalao?: string | null;
  ['escalão']?: string | null;
  alergias: string;
  opcao_pagamento: string | null; // Mensal|Trimestral|Anual
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

// Usa o tipo Genero do teu módulo (ou poderias usar: Atleta['genero'])
function coerceGenero(x: string | null | undefined): Genero | undefined {
  return x === "Masculino" || x === "Feminino" || x === "Outro" ? x : undefined;
}

function coercePlano(x: string | null | undefined): PlanoPagamento {
  return x === "Trimestral" || x === "Anual" ? x : "Mensal";
}

/** BD → Domínio */
function mapDbToDomain(r: DbAtleta): Atleta {
  const escalao = (r.escalao ?? (r as any)['escalão']) ?? undefined;
  return {
    id: r.id,
    nomeCompleto: r.nome,
    dataNascimento: r.data_nascimento,
    genero: coerceGenero(r.genero),
    escalao,
    al

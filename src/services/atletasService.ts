// src/services/atletasService.ts
import { supabase } from '../supabaseClient';
import type {
  Atleta, Genero, PlanoPagamento, Escalao, Nacionalidade, TipoDocId
} from '../types/Atleta';

type DBAtletaRow = {
  id: string;
  dados_pessoais_id: string | null;
  user_id: string | null;

  nome: string;
  data_nascimento: string; // date
  escalao: string | null;
  alergias: string;

  opcao_pagamento: string | null; // 'Mensal'|'Trimestral'|'Anual'
  created_at: string | null;

  morada: string | null;
  codigo_postal: string | null;
  contactos_urgencia: string | null;
  emails_preferenciais: string | null;
  genero: string | null; // 'Feminino'|'Masculino'

  nacionalidade: string | null;
  nacionalidade_outra: string | null;
  tipo_doc: string | null;
  num_doc: string | null;
  validade_doc: string | null; // date
  nif: string | null;
  nome_pai: string | null;
  nome_mae: string | null;
  telefone_opc: string | null;
  email_opc: string | null;
  escola: string | null;
  ano_escolaridade: string | null;
  encarregado_educacao: string | null; // 'Pai'|'Mãe'|'Outro'
  parentesco_outro: string | null;
  observacoes: string | null;
};

/* ---------------- Helpers ---------------- */
function toGenero(v: string | null | undefined): Genero {
  return v === 'Masculino' ? 'Masculino' : 'Feminino';
}
function toPlano(v: string | null | undefined): PlanoPagamento {
  return v === 'Trimestral' || v === 'Anual' ? v : 'Mensal';
}
function toEscalao(v: string | null | undefined): Escalao {
  return (v as Escalao) ?? 'Fora de escalões';
}
function nonEmpty(s: string | null | undefined): string {
  return s ?? '';
}

async function requireSessionUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error('Sessão inválida. Inicie sessão novamente.');
  return uid;
}

/* --------------- Conversores DB ↔ UI ---------------- */
function fromRow(r: DBAtletaRow): Atleta {
  return {
    id: r.id,
    nomeCompleto: r.nome,
    dataNascimento: r.data_nascimento,
    genero: toGenero(r.genero),
    escalao: toEscalao(r.escalao),
    planoPagamento: toPlano(r.opcao_pagamento),

    alergias: nonEmpty(r.alergias),
    morada: nonEmpty(r.morada),
    codigoPostal: nonEmpty(r.codigo_postal),
    contactosUrgencia: nonEmpty(r.contactos_urgencia),
    emailsPreferenciais: nonEmpty(r.emails_preferenciais),

    nacionalidade: (r.nacionalidade as Nacionalidade) ?? 'Portuguesa',
    nacionalidadeOutra: r.nacionalidade_outra ?? undefined,
    tipoDoc: (r.tipo_doc as TipoDocId) ?? 'Cartão de cidadão',
    numDoc: nonEmpty(r.num_doc),
    validadeDoc: r.validade_doc ?? '',
    nif: nonEmpty(r.nif),
    nomePai: nonEmpty(r.nome_pai),
    nomeMae: nonEmpty(r.nome_mae),
    telefoneOpc: r.telefone_opc ?? undefined,
    emailOpc: r.email_opc ?? undefined,
    escola: nonEmpty(r.escola),
    anoEscolaridade: nonEmpty(r.ano_escolaridade),
    encarregadoEducacao: (r.encarregado_educacao as Atleta['encarregadoEducacao']) ?? undefined,
    parentescoOutro: r.parentesco_outro ?? undefined,
    observacoes: r.observacoes ?? undefined,
  };
}

async function toRow(a: Atleta): Promise<Partial<DBAtletaRow>> {
  const uid = await requireSessionUserId();

  // Força plano 'Anual' para Masters/Sub23
  const forceAnnual =
    a.escalao === 'Masters (<1995)' ||
    a.escalao === 'Seniores masculinos Sub23 (2002-2007)';

  return {
    id: a.id,
    user_id: uid,

    nome: a.nomeCompleto.trim(),
    data_nascimento: a.dataNascimento,
    genero: a.genero,
    escalao: a.escalao,
    opcao_pagamento: forceAnnual ? 'Anual' : a.planoPagamento,

    alergias: a.alergias ?? '',
    morada: a.morada ?? null,
    codigo_postal: a.codigoPostal ?? null,
    contactos_urgencia: a.contactosUrgencia ?? null,
    emails_preferenciais: a.emailsPreferenciais ?? null,

    nacionalidade: a.nacionalidade,
    nacionalidade_outra: a.nacionalidade === 'Outra' ? (a.nacionalidadeOutra ?? null) : null,
    tipo_doc: a.tipoDoc,
    num_doc: a.numDoc,
    validade_doc: a.validadeDoc || null,
    nif: a.nif || null,
    nome_pai: a.nomePai || null,
    nome_mae: a.nomeMae || null,
    telefone_opc: a.telefoneOpc || null,
    email_opc: a.emailOpc || null,
    escola: a.escola || null,
    ano_escolaridade: a.anoEscolaridade || null,
    encarregado_educacao: a.encarregadoEducacao || null,
    parentesco_outro: a.parentescoOutro || null,
    observacoes: a.observacoes || null,
  };
}

/* --------------------------- API --------------------------- */
export async function listAtletas(): Promise<Atleta[]> {
  const { data, error } = await supabase
    .from('atletas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as DBAtletaRow[] | null)?.map(fromRow) ?? [];
}

export async function getAtleta(id: string): Promise<Atleta | null> {
  const { data, error } = await supabase
    .from('atletas')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as DBAtletaRow) : null;
}

export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  const payload = await toRow(a);

  // Verifica se existe (e evita "upsert" a linha de outro user)
  const { data: existing, error: exErr } = await supabase
    .from('atletas')
    .select('id, user_id')
    .eq('id', a.id)
    .maybeSingle();
  if (exErr) throw exErr;

  if (!existing) {
    // INSERT (cumpre INSERT policy; trigger ainda preenche user_id se faltar)
    const { data, error } = await supabase
      .from('atletas')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;
    return fromRow(data as DBAtletaRow);
  }

  // UPDATE (só se a linha for do próprio utilizador)
  const { data, error } = await supabase
    .from('atletas')
    .update(payload)
    .eq('id', a.id)
    .select('*')
    .single();

  if (error) {
    // Ajuda de diagnóstico para RLS
    if ((error as any).code === '42501') {
      throw new Error('Sem permissão para alterar este atleta (RLS). A linha não pertence ao utilizador atual.');
    }
    throw error;
  }
  return fromRow(data as DBAtletaRow);
}

export async function deleteAtleta(id: string): Promise<void> {
  const { error } = await supabase.from('atletas').delete().eq('id', id);
  if (error) throw error;
}

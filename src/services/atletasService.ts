// src/services/atletasService.ts
import { supabase } from "../supabaseClient";
import type { Atleta } from "../types/Atleta";

// ---------- helpers ----------
function isUuid(v?: string) {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// Espelho da tabela 'atletas'
type Row = {
  id: string;
  dados_pessoais_id: string | null;
  nome: string;
  data_nascimento: string; // date
  escalao: string | null;
  alergias: string;
  opcao_pagamento: string | null;
  created_at: string | null;
  morada: string | null;
  codigo_postal: string | null;
  contactos_urgencia: string | null;
  emails_preferenciais: string | null;
  genero: string | null;
  user_id: string | null;

  nacionalidade: string | null;
  nacionalidade_outra: string | null;
  tipo_doc: string | null;
  num_doc: string | null;
  validade_doc: string | null;
  nif: string | null;
  nome_pai: string | null;
  nome_mae: string | null;
  telefone_opc: string | null;
  email_opc: string | null;
  escola: string | null;
  ano_escolaridade: string | null;
  encarregado_educacao: string | null;
  parentesco_outro: string | null;
  observacoes: string | null;
};

function fromRow(r: Row): Atleta {
  return {
    id: r.id,
    nomeCompleto: r.nome,
    dataNascimento: r.data_nascimento,
    genero: (r.genero as Atleta["genero"]) || "Feminino",
    nacionalidade: (r.nacionalidade as any) || "Portuguesa",
    nacionalidadeOutra: r.nacionalidade_outra || undefined,
    tipoDoc: (r.tipo_doc as any) || "Cartão de cidadão",
    numDoc: r.num_doc || "",
    validadeDoc: r.validade_doc || "",
    nif: r.nif || "",
    nomePai: r.nome_pai || "",
    nomeMae: r.nome_mae || "",
    morada: r.morada || "",
    codigoPostal: r.codigo_postal || "",
    telefoneOpc: r.telefone_opc || undefined,
    emailOpc: r.email_opc || undefined,
    escola: r.escola || "",
    anoEscolaridade: r.ano_escolaridade || "",
    alergias: r.alergias || "",
    encarregadoEducacao: (r.encarregado_educacao as any) || undefined,
    parentescoOutro: r.parentesco_outro || undefined,
    contactosUrgencia: r.contactos_urgencia || "",
    emailsPreferenciais: r.emails_preferenciais || "",
    escalao: (r.escalao as any) || "Fora de escalões",
    planoPagamento: (r.opcao_pagamento as any) || "Mensal",
    observacoes: r.observacoes || undefined,
  };
}

function toPayload(a: Atleta) {
  return {
    nome: a.nomeCompleto,
    data_nascimento: a.dataNascimento,
    escalao: a.escalao,
    alergias: a.alergias,
    opcao_pagamento: a.planoPagamento,
    morada: a.morada,
    codigo_postal: a.codigoPostal,
    contactos_urgencia: a.contactosUrgencia,
    emails_preferenciais: a.emailsPreferenciais,
    genero: a.genero,

    nacionalidade: a.nacionalidade,
    nacionalidade_outra: a.nacionalidadeOutra ?? null,
    tipo_doc: a.tipoDoc,
    num_doc: a.numDoc,
    validade_doc: a.validadeDoc,
    nif: a.nif,
    nome_pai: a.nomePai,
    nome_mae: a.nomeMae,
    telefone_opc: a.telefoneOpc ?? null,
    email_opc: a.emailOpc ?? null,
    escola: a.escola,
    ano_escolaridade: a.anoEscolaridade,
    encarregado_educacao: a.encarregadoEducacao ?? null,
    parentesco_outro: a.parentescoOutro ?? null,
    observacoes: a.observacoes ?? null,

    // se tiveres o id do perfil e quiseres associar
    // dados_pessoais_id: '<uuid-perfil>'  // ou deixa null
  } as Record<string, any>;
}

// ---------- API ----------
export async function listAtletas(): Promise<Atleta[]>> {
  const { data, error } = await supabase
    .from("atletas")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Row[] | null)?.map(fromRow) ?? [];
}

export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  // Garante que há sessão (diagnóstico amigável)
  const { data: s } = await supabase.auth.getSession();
  if (!s.session?.access_token) {
    throw new Error("Sessão em falta. Entre novamente.");
  }

  if (isUuid(a.id)) {
    // UPDATE via RPC (confirma ownership no servidor)
    const payload = toPayload(a);
    const { data, error } = await supabase.rpc("rpc_update_atleta", {
      p_id: a.id,
      p: payload as any,
    });
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  } else {
    // INSERT via RPC SECURITY DEFINER (carimba user_id no servidor)
    const payload = toPayload(a);
    const { data, error } = await supabase.rpc("rpc_create_atleta", {
      p: payload as any,
    });
    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
}

export async function deleteAtleta(id: string): Promise<void> {
  // Delete direto (RLS de DELETE por dono continua válida)
  const { error } = await supabase.from("atletas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

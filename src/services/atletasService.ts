import { supabase } from "../supabaseClient";
import type { Atleta } from "../types/Atleta";

// ---- helpers ----
function isUuid(v?: string) {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type Row = {
  id: string;
  user_id: string | null;
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

  nacionalidade?: string | null;
  nacionalidade_outra?: string | null;
  tipo_doc?: string | null;
  num_doc?: string | null;
  validade_doc?: string | null;
  nif?: string | null;
  nome_pai?: string | null;
  nome_mae?: string | null;
  telefone_opc?: string | null;
  email_opc?: string | null;
  escola?: string | null;
  ano_escolaridade?: string | null;
  encarregado_educacao?: string | null;
  parentesco_outro?: string | null;
  observacoes?: string | null;
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

function toInsertUpdate(a: Atleta, userId: string) {
  // Não incluímos 'id' — no update filtramos por .eq('id', ...)
  const payload: Partial<Row> = {
    user_id: userId,
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
  };
  return payload;
}

// ---- API ----

export async function listAtletas(): Promise<Atleta[]> {
  const { data, error } = await supabase
    .from<Row>("atletas")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(fromRow);
}

export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sessão em falta");

  const payload = toInsertUpdate(a, userId);

  if (isUuid(a.id)) {
    // UPDATE
    const { data, error } = await supabase
      .from<Row>("atletas")
      .update(payload)
      .eq("id", a.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  } else {
    // INSERT (não enviar 'id' — deixa o default uuid_generate_v4())
    const { data, error } = await supabase
      .from<Row>("atletas")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return fromRow(data as Row);
  }
}

export async function deleteAtleta(id: string): Promise<void> {
  const { error } = await supabase.from("atletas").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

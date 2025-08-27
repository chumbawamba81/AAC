// src/services/atletasService.ts
import { supabase } from "../supabaseClient";
import type { Atleta, PlanoPagamento } from "../types/Atleta";

function isUUID(s: string | undefined | null) {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** DB -> App */
function rowToAtleta(r: any): Atleta {
  return {
    id: r.id,
    nomeCompleto: r.nome ?? "",
    dataNascimento: r.data_nascimento ?? "",
    genero: r.genero ?? "Feminino",
    escalao: r.escalao ?? "Fora de escalões",
    planoPagamento: (r.opcao_pagamento as PlanoPagamento) ?? "Mensal",

    nacionalidade: r.nacionalidade ?? "Portuguesa",
    nacionalidadeOutra: r.nacionalidade_outra ?? undefined,
    tipoDoc: r.tipo_doc ?? "Cartão de cidadão",
    numDoc: r.num_doc ?? "",
    validadeDoc: r.validade_doc ?? "",
    nif: r.nif ?? "",
    nomePai: r.nome_pai ?? "",
    nomeMae: r.nome_mae ?? "",

    morada: r.morada ?? "",
    codigoPostal: r.codigo_postal ?? "",
    telefoneOpc: r.telefone_opc ?? undefined,
    emailOpc: r.email_opc ?? undefined,

    escola: r.escola ?? "",
    anoEscolaridade: r.ano_escolaridade ?? "",
    alergias: r.alergias ?? "",
    encarregadoEducacao: r.encarregado_educacao ?? undefined,
    parentescoOutro: r.parentesco_outro ?? undefined,

    contactosUrgencia: r.contactos_urgencia ?? "",
    emailsPreferenciais: r.emails_preferenciais ?? "",
    observacoes: r.observacoes ?? undefined,
  };
}

/** App -> DB */
function atletaToRow(a: Atleta, userId: string) {
  return {
    user_id: userId,
    id: isUUID(a.id) ? a.id : undefined, // deixa o DB gerar se não for uuid
    nome: a.nomeCompleto ?? "",
    data_nascimento: a.dataNascimento ?? "",
    genero: a.genero ?? null,
    escalao: a.escalao ?? null,
    opcao_pagamento: a.planoPagamento ?? null,

    nacionalidade: a.nacionalidade ?? null,
    nacionalidade_outra: a.nacionalidadeOutra ?? null,
    tipo_doc: a.tipoDoc ?? null,
    num_doc: a.numDoc ?? null,
    validade_doc: a.validadeDoc ?? null,
    nif: a.nif ?? null,
    nome_pai: a.nomePai ?? null,
    nome_mae: a.nomeMae ?? null,

    morada: a.morada ?? null,
    codigo_postal: a.codigoPostal ?? null,
    telefone_opc: a.telefoneOpc ?? null,
    email_opc: a.emailOpc ?? null,

    escola: a.escola ?? null,
    ano_escolaridade: a.anoEscolaridade ?? null,
    alergias: a.alergias ?? null,
    encarregado_educacao: a.encarregadoEducacao ?? null,
    parentesco_outro: a.parentescoOutro ?? null,

    contactos_urgencia: a.contactosUrgencia ?? null,
    emails_preferenciais: a.emailsPreferenciais ?? null,
    observacoes: a.observacoes ?? null,
  };
}

export async function listAtletas(): Promise<Atleta[]> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("atletas")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToAtleta);
}

export async function deleteAtleta(id: string): Promise<void> {
  const { error } = await supabase.from("atletas").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Cria/atualiza atleta.
 * - Se mudar o plano (Mensal/Trimestral/Anual) chamamos a função para re-semear
 *   as mensalidades (apaga e recria os slots).
 * - Após inserir um novo atleta, também semeamos.
 */
export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) throw new Error("Sessão inválida");

  const row = atletaToRow(a, userId);

  // Descobrir plano atual (se existir registo) para saber se mudou
  let previousPlano: string | null = null;
  if (isUUID(a.id)) {
    const { data: prev } = await supabase
      .from("atletas")
      .select("opcao_pagamento")
      .eq("id", a.id)
      .maybeSingle();
    previousPlano = prev?.opcao_pagamento ?? null;
  }

  const isUpdate = isUUID(a.id) && previousPlano !== null;

  if (isUpdate) {
    const { data, error } = await supabase
      .from("atletas")
      .update(row)
      .eq("id", a.id)
      .select("*")
      .single();

    if (error) throw error;
    const saved = rowToAtleta(data);

    // Se plano mudou, re-seed mensalidades
    if (previousPlano !== saved.planoPagamento) {
      await seedMensalidades(saved.id, saved.planoPagamento);
    }
    return saved;
  } else {
    // INSERT (deixa o DB gerar id)
    const insertRow = { ...row };
    delete (insertRow as any).id;

    const { data, error } = await supabase
      .from("atletas")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) throw error;
    const saved = rowToAtleta(data);

    // Novo atleta => semear mensalidades consoante o plano
    await seedMensalidades(saved.id, saved.planoPagamento);

    return saved;
  }
}


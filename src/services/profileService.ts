// src/services/profileService.ts
import { supabase } from "../supabaseClient";
import type { PessoaDados } from "../types/PessoaDados";

/**
 * Tabela no Supabase (schema public): dados_pessoais
 * Colunas (atuais): id, user_id, nome_completo, data_nascimento, genero, morada,
 * codigo_postal, telefone, email, situacao_tesouraria, noticias, created_at
 *
 * NOTA: O teu modelo PessoaDados tem mais campos (nif, tipoDocumento, numeroDocumento,
 * profissao, tipoSocio, etc.). Como a tabela ainda não os tem, estes campos são
 * mantidos apenas em memória na app e NÃO são persistidos aqui.
 * Quando quiseres persistir, adiciona as colunas à tabela e mapeia-as abaixo.
 */

type DbRow = {
  id: string;
  user_id: string | null;
  nome_completo: string;
  data_nascimento: string; // YYYY-MM-DD
  genero: string | null;
  morada: string | null;
  codigo_postal: string | null;
  telefone: string | null;
  email: string;
  situacao_tesouraria: string;
  noticias: string | null;
  created_at: string | null;
};

function dbToPessoa(r: DbRow, fallbackEmail?: string): PessoaDados {
  return {
    nomeCompleto: r?.nome_completo ?? "",
    // Estes campos não existem na tabela; devolvemos defaults seguros
    tipoSocio: "Não pretendo ser sócio",
    dataNascimento: r?.data_nascimento ?? "",
    morada: r?.morada ?? "",
    codigoPostal: r?.codigo_postal ?? "",
    tipoDocumento: "Cartão de cidadão",
    numeroDocumento: "",
    nif: "",
    telefone: r?.telefone ?? "",
    email: r?.email ?? fallbackEmail ?? "",
    profissao: "",
  };
}

function pessoaToDb(p: PessoaDados, userId: string): Partial<DbRow> & { user_id: string } {
  return {
    user_id: userId,
    nome_completo: p.nomeCompleto ?? "",
    data_nascimento: p.dataNascimento ?? "",
    morada: p.morada ?? null,
    codigo_postal: p.codigoPostal ?? null,
    telefone: p.telefone ?? null,
    email: p.email ?? "",
    // campos não existentes ficam de fora
  };
}

/**
 * Lê o perfil do utilizador autenticado (por user_id).
 * Devolve `null` se não existir.
 */
export async function getMyProfile(): Promise<PessoaDados | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("dados_pessoais")
    .select(
      "id,user_id,nome_completo,data_nascimento,genero,morada,codigo_postal,telefone,email,situacao_tesouraria,noticias,created_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    // Se a política RLS estiver mal, verás erro aqui
    console.error("[profileService] getMyProfile error:", error.message);
    throw error;
  }

  if (!data) return null;
  return dbToPessoa(data as DbRow, user.email ?? undefined);
}

/**
 * Cria/atualiza o perfil do utilizador autenticado.
 * Usa upsert por `user_id` (precisa do índice único ou constraint).
 */
export async function upsertMyProfile(p: PessoaDados): Promise<PessoaDados> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Sessão não encontrada.");

  // Obter o registo atual (se existir)
  const { data: existing, error: getErr } = await supabase
    .from("dados_pessoais")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (getErr) {
    console.error("[profileService] read-before-upsert error:", getErr.message);
    throw getErr;
  }

  const row = pessoaToDb(p, user.id);

  if (existing?.id) {
    // UPDATE
    const { data, error } = await supabase
      .from("dados_pessoais")
      .update(row)
      .eq("id", existing.id)
      .select(
        "id,user_id,nome_completo,data_nascimento,genero,morada,codigo_postal,telefone,email,situacao_tesouraria,noticias,created_at"
      )
      .single();

    if (error) {
      console.error("[profileService] update error:", error.message);
      throw error;
    }
    return dbToPessoa(data as DbRow, user.email ?? undefined);
  } else {
    // INSERT
    const { data, error } = await supabase
      .from("dados_pessoais")
      .insert(row)
      .select(
        "id,user_id,nome_completo,data_nascimento,genero,morada,codigo_postal,telefone,email,situacao_tesouraria,noticias,created_at"
      )
      .single();

    if (error) {
      console.error("[profileService] insert error:", error.message);
      throw error;
    }
    return dbToPessoa(data as DbRow, user.email ?? undefined);
  }
}

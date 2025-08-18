// src/services/profileService.ts
import { supabase } from "../supabaseClient";
import type { PessoaDados } from "../types/PessoaDados";

/** Converte uma linha da BD -> modelo da app (carrega também validade_documento) */
function rowToPessoa(row: any): PessoaDados {
  const out: any = {
    nomeCompleto: row?.nome_completo ?? "",
    tipoSocio: row?.tipo_socio ?? "Não pretendo ser sócio",
    dataNascimento: row?.data_nascimento ?? "",
    morada: row?.morada ?? "",
    codigoPostal: row?.codigo_postal ?? "",
    tipoDocumento: row?.tipo_documento ?? "Cartão de cidadão",
    numeroDocumento: row?.numero_documento ?? "",
    nif: row?.nif ?? "",
    telefone: row?.telefone ?? "",
    email: row?.email ?? "",
    profissao: row?.profissao ?? "",
  };

  // Campo extra do formulário: data de validade do documento
  // Guardamos como ISO yyyy-mm-dd (string) para o <input type="date">
  if (row?.validade_documento) {
    // row.validade_documento já vem como 'YYYY-MM-DD' na maioria dos casos
    out.dataValidadeDocumento = String(row.validade_documento);
  } else {
    out.dataValidadeDocumento = "";
  }

  return out as PessoaDados;
}

/** Converte o modelo da app -> payload para a BD (snake_case) */
function pessoaToRow(p: PessoaDados & { dataValidadeDocumento?: string }, userId: string) {
  const nz = (v: unknown) =>
    typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null;

  // Converter string ISO para DATE (o Postgres aceita 'YYYY-MM-DD' em text)
  const validade = p.dataValidadeDocumento && /^\d{4}-\d{2}-\d{2}$/.test(p.dataValidadeDocumento)
    ? p.dataValidadeDocumento
    : null;

  return {
    user_id: userId,
    nome_completo: nz(p.nomeCompleto),
    tipo_socio: nz(p.tipoSocio),
    data_nascimento: nz(p.dataNascimento),
    morada: nz(p.morada),
    codigo_postal: nz(p.codigoPostal),
    tipo_documento: nz(p.tipoDocumento),
    numero_documento: nz(p.numeroDocumento),
    nif: nz(p.nif),
    telefone: nz(p.telefone),
    email: nz(p.email),
    profissao: nz(p.profissao),
    validade_documento: validade, // <- NOVO
  };
}

/** Lê o meu perfil; devolve null se ainda não existir */
export async function getMyProfile(): Promise<PessoaDados | null> {
  const { data: u, error: uerr } = await supabase.auth.getUser();
  if (uerr) throw uerr;
  const userId = u?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("dados_pessoais")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToPessoa(data);
}

/**
 * Cria/atualiza o meu perfil.
 * Usa upsert com onConflict em user_id (necessita índice único em user_id).
 */
export async function upsertMyProfile(p: PessoaDados & { dataValidadeDocumento?: string }): Promise<PessoaDados> {
  const { data: u, error: uerr } = await supabase.auth.getUser();
  if (uerr) throw uerr;
  const userId = u?.user?.id;
  if (!userId) throw new Error("Sessão inválida (sem utilizador).");

  const payload = pessoaToRow(p, userId);

  const { data, error } = await supabase
    .from("dados_pessoais")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[profileService.upsertMyProfile] erro:", error.message, {
      code: (error as any)?.code,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
    });
    throw error;
  }

  return rowToPessoa(data);
}

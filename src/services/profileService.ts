import { supabase } from '../supabaseClient';
import type { PessoaDados } from '../types/PessoaDados';

/**
 * Service functions for managing a user's personal profile in Supabase.
 *
 * The profile is stored in the `perfis` table keyed by the authenticated
 * user's ID. Only a single profile row is stored per user (enforced via
 * unique constraint on `user_id`).
 */

const TABLE_NAME = 'perfis';

/**
 * Fetch the current user's profile from Supabase.
 * Returns `null` if no profile exists yet.
 */
export async function getMyProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const user = userData.user;
  if (!user) return null;
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) return null;
  // Map database columns back to our PessoaDados type
  const perfil: PessoaDados = {
    nomeCompleto: data.nome_completo,
    tipoSocio: data.tipo_socio,
    dataNascimento: data.data_nascimento,
    morada: data.morada,
    codigoPostal: data.codigo_postal,
    tipoDocumento: data.tipo_documento,
    numeroDocumento: data.numero_documento,
    nif: data.nif,
    telefone: data.telefone,
    email: data.email,
    profissao: data.profissao ?? '',
  };
  return perfil;
}

/**
 * Create or update the current user's profile.
 * Accepts a PessoaDados object and returns the saved profile (mapped back
 * to PessoaDados). Requires that the user is authenticated.
 */
export async function upsertMyProfile(payload: PessoaDados) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw userError;
  }
  const user = userData.user;
  if (!user) {
    throw new Error('Sem sessão');
  }
  // Map our type to the database column names
  const row = {
    user_id: user.id,
    nome_completo: payload.nomeCompleto,
    tipo_socio: payload.tipoSocio,
    data_nascimento: payload.dataNascimento,
    morada: payload.morada,
    codigo_postal: payload.codigoPostal,
    tipo_documento: payload.tipoDocumento,
    numero_documento: payload.numeroDocumento,
    nif: payload.nif,
    telefone: payload.telefone,
    email: payload.email,
    profissao: payload.profissao ?? null,
  };
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) {
    throw error;
  }
  // Map back to PessoaDados
  const saved: PessoaDados = {
    nomeCompleto: data.nome_completo,
    tipoSocio: data.tipo_socio,
    dataNascimento: data.data_nascimento,
    morada: data.morada,
    codigoPostal: data.codigo_postal,
    tipoDocumento: data.tipo_documento,
    numeroDocumento: data.numero_documento,
    nif: data.nif,
    telefone: data.telefone,
    email: data.email,
    profissao: data.profissao ?? '',
  };
  return saved;
}
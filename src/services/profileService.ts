// src/services/profileService.ts
import { supabase } from '../supabaseClient';
import type { PessoaDados } from '../types/PessoaDados';

const TBL = 'dados_pessoais';

/** Row tal como está na BD (schema public.dados_pessoais) */
type DbDadosPessoaisRow = {
  id: string;
  user_id: string | null;
  nome_completo: string;
  data_nascimento: string; // Supabase devolve 'date' como string YYYY-MM-DD
  genero: string | null;
  morada: string | null;
  codigo_postal: string | null;
  telefone: string | null;
  email: string;
  situacao_tesouraria: string | null;
  noticias: string | null;
  created_at?: string | null;
};

async function getUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sem sessão activa');
  return data.user.id;
}

/** BD → Domínio */
function mapDbToDomain(row: DbDadosPessoaisRow): (PessoaDados & { id: string }) {
  return {
    id: row.id,
    nomeCompleto: row.nome_completo,
    dataNascimento: row.data_nascimento,
    genero: row.genero ?? undefined,
    morada: row.morada ?? '',
    codigoPostal: row.codigo_postal ?? '',
    telefone: row.telefone ?? '',
    email: row.email,
    situacaoTesouraria: row.situacao_tesouraria ?? 'Campo em atualização',
    noticias: row.noticias ?? '',
  };
}

/** Domínio → BD */
function mapDomainToDb(uid: string, payload: PessoaDados): Omit<DbDadosPessoaisRow, 'id'> {
  return {
    user_id: uid,
    nome_completo: payload.nomeCompleto,
    data_nascimento: payload.dataNascimento,
    genero: payload.genero ?? null,
    morada: payload.morada ?? null,
    codigo_postal: payload.codigoPostal ?? null,
    telefone: payload.telefone ?? null,
    email: payload.email,
    situacao_tesouraria: payload.situacaoTesouraria ?? 'Campo em atualização',
    noticias: payload.noticias ?? null,
  };
}

/**
 * Lê o meu perfil. Assume 1-registo-por-user via UNIQUE(user_id).
 */
export async function getMyProfile(): Promise<(PessoaDados & { id: string }) | null> {
  const uid = await getUserId();

  const { data, error } = await supabase
    .from(TBL)
    .select<DbDadosPessoaisRow>('id, user_id, nome_completo, data_nascimento, genero, morada, codigo_postal, telefone, email, situacao_tesouraria, noticias, created_at')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapDbToDomain(data);
}

/**
 * Cria/actualiza o meu perfil com base em user_id.
 * Requer índice único:
 *   create unique index if not exists dados_pessoais_user_id_key on public.dados_pessoais(user_id);
 */
export async function upsertMyProfile(payload: PessoaDados): Promise<PessoaDados & { id: string }> {
  const uid = await getUserId();
  const row = mapDomainToDb(uid, payload);

  const { data, error } = await supabase
    .from(TBL)
    .upsert(row, { onConflict: 'user_id' })
    .select<DbDadosPessoaisRow>('id, user_id, nome_completo, data_nascimento, genero, morada, codigo_postal, telefone, email, situacao_tesouraria, noticias, created_at')
    .single(); // após upsert, queremos a linha final

  if (error) throw error;
  return mapDbToDomain(data);
}

/**
 * (Opcional) Garante que existe sempre um registo; se não existir, cria com mínimos.
 */
export async function getOrCreateMyProfile(minimos?: Partial<PessoaDados>): Promise<PessoaDados & { id: string }> {
  const existing = await getMyProfile();
  if (existing) return existing;

  const uid = await getUserId();
  const base: PessoaDados = {
    nomeCompleto: minimos?.nomeCompleto ?? '',
    dataNascimento: minimos?.dataNascimento ?? '',
    genero: minimos?.genero,
    morada: minimos?.morada ?? '',
    codigoPostal: minimos?.codigoPostal ?? '',
    telefone: minimos?.telefone ?? '',
    email: minimos?.email ?? '',
    situacaoTesouraria: minimos?.situacaoTesouraria ?? 'Campo em atualização',
    noticias: minimos?.noticias ?? '',
    // Campos de sócio/documento se existirem no teu tipo PessoaDados:
    tipoSocio: (minimos as any)?.tipoSocio ?? 'Não pretendo ser sócio',
    tipoDocumento: (minimos as any)?.tipoDocumento ?? 'Cartão de cidadão',
    numeroDocumento: (minimos as any)?.numeroDocumento ?? '',
    nif: (minimos as any)?.nif ?? '',
    profissao: (minimos as any)?.profissao ?? '',
  };

  // Usa upsert por user_id para criar
  return upsertMyProfile({ ...base, email: base.email || (await inferEmailFromSession(uid)) });
}

async function inferEmailFromSession(_uid: string): Promise<string> {
  // Tenta ler o email do utilizador autenticado (evita criar perfil com email vazio)
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? '';
}

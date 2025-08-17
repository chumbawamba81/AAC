import { supabase } from '../supabaseClient';
import type { PessoaDados } from '../types/PessoaDados';

// Se no teu domínio existir o tipo Genero, usa-o aqui; caso contrário, define-o:
type Genero = "Masculino" | "Feminino";

const TBL = 'dados_pessoais';

type DbDadosPessoaisRow = {
  id: string;
  user_id: string | null;
  nome_completo: string;
  data_nascimento: string; // YYYY-MM-DD
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

function coerceGenero(x: string | null | undefined): Genero | undefined {
  return x === "Masculino" || x === "Feminino" ? x : undefined;
}

function mapDbToDomain(row: DbDadosPessoaisRow): (PessoaDados & { id: string }) {
  return {
    id: row.id,
    nomeCompleto: row.nome_completo,
    dataNascimento: row.data_nascimento,
    genero: coerceGenero(row.genero),
    morada: row.morada ?? '',
    codigoPostal: row.codigo_postal ?? '',
    telefone: row.telefone ?? '',
    email: row.email,
    situacaoTesouraria: row.situacao_tesouraria ?? 'Campo em atualização',
    noticias: row.noticias ?? '',
  };
}

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

export async function getMyProfile(): Promise<(PessoaDados & { id: string }) | null> {
  const uid = await getUserId();
  const { data, error } = await supabase
    .from(TBL)
    .select('id, user_id, nome_completo, data_nascimento, genero, morada, codigo_postal, telefone, email, situacao_tesouraria, noticias, created_at')
    .eq('user_id', uid)
    .maybeSingle()
    .returns<DbDadosPessoaisRow | null>(); // <- aqui

  if (error) throw error;
  if (!data) return null;
  return mapDbToDomain(data);
}

export async function upsertMyProfile(payload: PessoaDados): Promise<PessoaDados & { id: string }> {
  const uid = await getUserId();
  const row = mapDomainToDb(uid, payload);

  const { data, error } = await supabase
    .from(TBL)
    .upsert(row, { onConflict: 'user_id' })
    .select('id, user_id, nome_completo, data_nascimento, genero, morada, codigo_postal, telefone, email, situacao_tesouraria, noticias, created_at')
    .single()
    .returns<DbDadosPessoaisRow>(); // <- aqui

  if (error) throw error;
  return mapDbToDomain(data);
}

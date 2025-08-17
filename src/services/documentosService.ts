// src/services/documentosService.ts
import { supabase } from '../supabaseClient';

export type DocumentoTipo = 'socio' | 'atleta';

export type Documento = {
  id: string;
  tipo: DocumentoTipo;
  nome: string;
  pessoa_id: string | null;
  atleta_id: string | null;
  created_at?: string | null;
};

export type DocumentoFicheiro = {
  id: string;
  documento_id: string;
  path: string;
  page?: number | null;
  created_at?: string | null;
  // enriquecido no cliente
  signedUrl?: string;
  file_name?: string;
};

const BUCKET = 'documentos';

/** Garante (ou cria) o registo “documento” para um dado scope (socio/atleta + chaves) */
export async function ensureDocumento(
  tipo: DocumentoTipo,
  nome: string,
  opts: { pessoaId?: string | null; atletaId?: string | null } = {},
): Promise<Documento> {
  const payload: any = {
    tipo,
    nome,
    pessoa_id: opts.pessoaId ?? null,
    atleta_id: opts.atletaId ?? null,
  };

  // onConflict precisa de um índice único compatível (pessoa_id, atleta_id, tipo)
  // cria no SQL: create unique index documentos_scope_unique on documentos (coalesce(pessoa_id,'00000000-0000-0000-0000-000000000000'), coalesce(atleta_id,'00000000-0000-0000-0000-000000000000'), tipo);
  const { data, error } = await supabase
    .from('documentos')
    .upsert(payload, { onConflict: 'pessoa_id,atleta_id,tipo' })
    .select('*')
    .single();

  if (error) throw error;
  return data as Documento;
}

/** Lista documentos por scope */
export async function listDocumentos(
  tipo: DocumentoTipo,
  opts: { pessoaId?: string | null; atletaId?: string | null } = {},
) {
  let q = supabase.from('documentos').select('id, tipo, nome, pessoa_id, atleta_id, created_at').eq('tipo', tipo);
  if (opts.pessoaId) q = q.eq('pessoa_id', opts.pessoaId);
  if (opts.atletaId) q = q.eq('atleta_id', opts.atletaId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Documento[];
}

/** Lista ficheiros de um documento */
export async function listFicheiros(documentoId: string): Promise<DocumentoFicheiro[]> {
  const { data, error } = await supabase
    .from('documentos_ficheiros')
    .select('id, documento_id, path, page, created_at')
    .eq('documento_id', documentoId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DocumentoFicheiro[];
}

/** Cria signed URLs para ficheiros */
export async function withSignedUrls(items: DocumentoFicheiro[], expiresIn = 60 * 60) {
  if (!items.length) return items;
  const paths = items.map((i) => i.path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw error;

  const map = new Map(data.map((d) => [d.path, d.signedUrl]));
  return items.map((i) => ({
    ...i,
    signedUrl: map.get(i.path) ?? undefined,
    file_name: i.path.split('/').pop(),
  }));
}

/** Upload de 1 ficheiro para um documento (cria documento se necessário) */
export async function uploadDocumento(
  tipo: DocumentoTipo,
  nome: string,
  file: File,
  opts: { pessoaId?: string | null; atletaId?: string | null; page?: number | null } = {},
) {
  // 1) garante documento
  const doc = await ensureDocumento(tipo, nome, { pessoaId: opts.pessoaId ?? null, atletaId: opts.atletaId ?? null });

  // 2) upload
  const path = `${doc.id}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  // 3) registo do ficheiro
  const row = { documento_id: doc.id, path, page: opts.page ?? null };
  const { error: insErr } = await supabase.from('documentos_ficheiros').insert(row);
  if (insErr) throw insErr;

  return { documento: doc, path };
}

/** Substitui o binário mantendo o registo (gera novo path e atualiza a linha) */
export async function replaceDocumentoFile(fileId: string, file: File) {
  // ler a linha
  const { data: row, error } = await supabase
    .from('documentos_ficheiros')
    .select('id, documento_id, path')
    .eq('id', fileId)
    .single();
  if (error) throw error;

  const newPath = `${row.documento_id}/${Date.now()}_${file.name}`;
  // upload novo
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, { upsert: false });
  if (upErr) throw upErr;

  // apaga antigo (best-effort)
  await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});

  // update path
  const { error: updErr } = await supabase
    .from('documentos_ficheiros')
    .update({ path: newPath })
    .eq('id', fileId);

  if (updErr) throw updErr;
}

/** Apaga 1 ficheiro (linha e binário) */
export async function deleteDocumentoFile(fileId: string) {
  // ler path
  const { data: row, error } = await supabase
    .from('documentos_ficheiros')
    .select('id, path')
    .eq('id', fileId)
    .single();
  if (error) throw error;

  // apaga DB
  const { error: delErr } = await supabase.from('documentos_ficheiros').delete().eq('id', fileId);
  if (delErr) throw delErr;

  // apaga storage (best-effort)
  await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});
}

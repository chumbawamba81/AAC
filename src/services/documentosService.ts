// src/services/documentosService.ts
import { supabase } from '../supabaseClient';

/** A tua tabela é única (1 linha = 1 ficheiro/página) */
export type Nivel = 'socio' | 'atleta';

export type DocumentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  doc_nivel: Nivel;
  doc_tipo: string;
  page: number | null;
  path: string;
  created_at?: string | null;
  // enriquecido no cliente
  signedUrl?: string;
  file_name?: string;
};

const BUCKET = 'documentos';

/** User actual */
export async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sem sessão ativa');
  return data.user.id;
}

/** Lista ficheiros por nível/tipo; filtra por atleta se aplicável */
export async function listDocs(nivel: Nivel, tipo: string, opts?: { atletaId?: string | null }) {
  const uid = await getUserId();
  let q = supabase
    .from('documentos')
    .select('id,user_id,atleta_id,doc_nivel,doc_tipo,page,path,created_at')
    .eq('user_id', uid)
    .eq('doc_nivel', nivel)
    .eq('doc_tipo', tipo);

  if (nivel === 'atleta') {
    // quando for por atleta, filtra também por atleta_id
    q = q.eq('atleta_id', opts?.atletaId ?? null);
  }

  const { data, error } = await q.order('page', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as DocumentoRow[];
  return rows.map((r) => ({ ...r, file_name: r.path.split('/').pop() }));
}

/** Cria signed URLs (privado) */
export async function withSignedUrls(items: DocumentoRow[], expiresIn = 3600) {
  if (!items.length) return items;
  const paths = items.map((i) => i.path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw error;
  const map = new Map(data.map((d) => [d.path, d.signedUrl]));
  return items.map((i) => ({ ...i, signedUrl: map.get(i.path) ?? undefined }));
}

/**
 * Faz upload de um novo ficheiro:
 * - Usa onConflict na tua unique (user_id, doc_nivel, doc_tipo, page)
 * - NOTA: a tua unique não inclui atleta_id. Portanto, em docs de atleta,
 *   duas entradas com o mesmo (doc_tipo,page) para o MESMO user vão conflitar
 *   mesmo que sejam atletas diferentes. (Este é o comportamento imposto pelo teu índice.)
 */
export async function uploadDoc(
  nivel: Nivel,
  tipo: string,
  file: File,
  opts?: { atletaId?: string | null; page?: number | null }
) {
  const uid = await getUserId();

  // 1) cria o path e faz upload no bucket
  const path = `${uid}/${nivel}/${opts?.atletaId ?? 'na'}/${tipo}/${Date.now()}_${file.name}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  // 2) upsert na tabela 'documentos' usando a tua constraint única
  const payload = {
    user_id: uid,
    atleta_id: nivel === 'atleta' ? (opts?.atletaId ?? null) : null,
    doc_nivel: nivel,
    doc_tipo: tipo,
    page: opts?.page ?? null,
    path,
  };

  const { data, error } = await supabase
    .from('documentos')
    .upsert(payload as any, { onConflict: 'user_id,doc_nivel,doc_tipo,page' })
    .select('id,user_id,atleta_id,doc_nivel,doc_tipo,page,path,created_at')
    .single();

  if (error) throw error;
  const row = data as DocumentoRow;
  return { ...row, file_name: row.path.split('/').pop() };
}

/** Substitui binário mantendo a linha (gera novo path e atualiza) */
export async function replaceDoc(rowId: string, newFile: File) {
  // obter a linha
  const { data, error } = await supabase
    .from('documentos')
    .select('id,user_id,atleta_id,doc_nivel,doc_tipo,page,path')
    .eq('id', rowId)
    .single();
  if (error) throw error;

  const row = data as DocumentoRow;
  const newPath = `${row.user_id}/${row.doc_nivel}/${row.atleta_id ?? 'na'}/${row.doc_tipo}/${Date.now()}_${newFile.name}`;

  // upload novo
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, newFile, { upsert: false });
  if (upErr) throw upErr;

  // apaga antigo (best effort)
  await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});

  // update
  const { error: updErr } = await supabase.from('documentos').update({ path: newPath }).eq('id', rowId);
  if (updErr) throw updErr;
}

/** Apaga 1 linha + binário */
export async function deleteDoc(rowId: string) {
  // ler path
  const { data, error } = await supabase.from('documentos').select('id,path').eq('id', rowId).single();
  if (error) throw error;

  const path = (data as any).path as string;

  // apaga DB
  const { error: delErr } = await supabase.from('documentos').delete().eq('id', rowId);
  if (delErr) throw delErr;

  // apaga storage (best effort)
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

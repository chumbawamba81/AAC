// src/services/documentosService.ts
import { supabase } from '../supabaseClient';

export type NivelDoc = 'socio' | 'atleta';

export type Documento = {
  id: string;
  user_id: string;
  doc_nivel: NivelDoc;
  atleta_id: string | null;
  doc_tipo: string;
  page: number;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at?: string;
  signedUrl?: string;
};

function slugify(x: string) {
  return x
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sem sessão activa');
  return data.user.id;
}

async function nextPage(userId: string, nivel: NivelDoc, docTipo: string, atletaId?: string) {
  let q = supabase
    .from('documentos')
    .select('page')
    .eq('user_id', userId)
    .eq('doc_nivel', nivel)
    .eq('doc_tipo', docTipo)
    .order('page', { ascending: false })
    .limit(1);

  if (nivel === 'atleta' && atletaId) q = q.eq('atleta_id', atletaId);

  const { data, error } = await q;
  if (error) throw error;
  const max = data && data[0]?.page ? Number(data[0].page) : 0;
  return max + 1;
}

/** Upload 1 ficheiro (nova página no fim por defeito) */
export async function uploadDocumento(
  nivel: NivelDoc,
  docTipo: string,
  file: File,
  opts?: { atletaId?: string; page?: number }
): Promise<Documento> {
  const userId = await getUserId();
  const slug = slugify(docTipo);

  const folder =
    nivel === 'socio' ? `socio/${userId}/${slug}` : `atleta/${opts?.atletaId}/${slug}`;
  const name = `${crypto.randomUUID()}-${file.name}`;
  const path = `${folder}/${name}`;

  // 1) upload Storage
  const up = await supabase.storage.from('inscricoes').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (up.error) throw up.error;

  // 2) calcular página (se não fornecida)
  const page = opts?.page ?? (await nextPage(userId, nivel, docTipo, opts?.atletaId));

  // 3) inserir índice BD
  const row = {
    user_id: userId,
    doc_nivel: nivel,
    atleta_id: nivel === 'atleta' ? (opts?.atletaId ?? null) : null,
    doc_tipo: docTipo,
    page,
    file_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    file_size: (file as any).size ?? null,
  };

  const ins = await supabase.from('documentos').insert(row).select('*').single();
  if (ins.error) {
    // rollback storage
    await supabase.storage.from('inscricoes').remove([path]).catch(() => {});
    throw ins.error;
  }
  return ins.data as Documento;
}

/** Lista documentos por nível/doc_tipo (e atleta opcional), ordenados por página */
export async function listDocumentos(
  nivel: NivelDoc,
  docTipo: string,
  atletaId?: string
): Promise<Documento[]> {
  const userId = await getUserId();
  let q = supabase
    .from('documentos')
    .select('*')
    .eq('user_id', userId)
    .eq('doc_nivel', nivel)
    .eq('doc_tipo', docTipo)
    .order('page', { ascending: true });

  if (nivel === 'atleta' && atletaId) q = q.eq('atleta_id', atletaId);

  const { data, error } = await q;
  if (error) throw error;
  return (data as Documento[]) ?? [];
}

/** Adiciona signed URLs (bucket privado) */
export async function withSignedUrls(
  docs: Documento[],
  expiresInSeconds = 600
): Promise<Documento[]> {
  if (docs.length === 0) return [];
  const paths = docs.map((d) => d.file_path);
  const { data, error } = await supabase
    .storage
    .from('inscricoes')
    .createSignedUrls(paths, expiresInSeconds);
  if (error) throw error;
  const map = new Map(data.map((d) => [d.path, d.signedUrl]));
  return docs.map((d) => ({ ...d, signedUrl: map.get(d.file_path) }));
}

/** Substitui o ficheiro (mantém page) */
export async function replaceDocumento(id: string, newFile: File): Promise<Documento> {
  const userId = await getUserId();

  const cur = await supabase
    .from('documentos')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (cur.error) throw cur.error;
  const doc = cur.data as Documento;

  const folder = doc.file_path.split('/').slice(0, -1).join('/');
  const name = `${crypto.randomUUID()}-${newFile.name}`;
  const newPath = `${folder}/${name}`;

  const up = await supabase
    .storage
    .from('inscricoes')
    .upload(newPath, newFile, { cacheControl: '3600', upsert: false, contentType: newFile.type || undefined });
  if (up.error) throw up.error;

  const upd = await supabase
    .from('documentos')
    .update({
      file_path: newPath,
      file_name: newFile.name,
      mime_type: newFile.type || null,
      file_size: (newFile as any).size ?? null,
      uploaded_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (upd.error) {
    await supabase.storage.from('inscricoes').remove([newPath]).catch(() => {});
    throw upd.error;
  }

  // limpar ficheiro anterior
  await supabase.storage.from('inscricoes').remove([doc.file_path]).catch(() => {});
  return upd.data as Documento;
}

/** Apagar (BD + Storage) */
export async function deleteDocumento(id: string): Promise<void> {
  const userId = await getUserId();

  const cur = await supabase
    .from('documentos')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  if (cur.error) throw cur.error;

  const del = await supabase
    .from('documentos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (del.error) throw del.error;

  await supabase.storage.from('inscricoes').remove([cur.data.file_path]).catch(() => {});
}

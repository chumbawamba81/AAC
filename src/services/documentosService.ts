// src/services/documentosService.ts
import { supabase } from '../supabaseClient';

/**
 * Esquema assumido para a tabela `documentos`:
 *  id uuid PK
 *  user_id uuid NOT NULL
 *  atleta_id uuid NULL
 *  doc_nivel text NOT NULL    -- 'socio' | 'atleta'
 *  doc_tipo text NOT NULL     -- ex: 'Ficha de Sócio', 'Exame médico', ...
 *  page int NULL              -- múltiplas páginas por (user_id,doc_nivel,doc_tipo)
 *  path text NOT NULL         -- caminho no Storage
 *  created_at timestamptz DEFAULT now()
 *
 * Índice único:
 *  (user_id, doc_nivel, doc_tipo, page)
 */

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

// ----------------- helpers para nomes de ficheiros/paths seguros -----------------

function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function sanitizeSegment(s: string) {
  const ascii = stripDiacritics(s);
  return ascii
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._\-()+]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\-|\-$/g, '');
}
function safeFileName(name: string) {
  const idx = name.lastIndexOf('.');
  const base = idx > 0 ? name.slice(0, idx) : name;
  const ext = idx > 0 ? name.slice(idx + 1) : '';
  const b = sanitizeSegment(base) || 'ficheiro';
  const e = sanitizeSegment(ext);
  return e ? `${b}.${e}` : b;
}

// ----------------------------- API pública ---------------------------------

/** Lista documentos filtrando por nível, user e/ou atleta e/ou tipo */
export async function listDocs(params: {
  nivel: Nivel;
  userId: string;
  atletaId?: string | null;
  tipo?: string;
}): Promise<DocumentoRow[]> {
  let q = supabase
    .from('documentos')
    .select('id, user_id, atleta_id, doc_nivel, doc_tipo, page, path, created_at')
    .eq('doc_nivel', params.nivel)
    .eq('user_id', params.userId);

  if (params.atletaId) q = q.eq('atleta_id', params.atletaId);
  if (params.tipo) q = q.eq('doc_tipo', params.tipo);

  const { data, error } = await q.order('doc_tipo', { ascending: true }).order('page', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as DocumentoRow[];
  return rows.map((r) => ({
    ...r,
    file_name: r.path.split('/').pop(),
  }));
}

/** Cria signed URLs para ver/baixar os ficheiros */
export async function withSignedUrls(items: DocumentoRow[], expiresIn = 60 * 60) {
  if (!items.length) return items;
  const paths = items.map((i) => i.path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw error;

  const map = new Map(data.map((d) => [d.path, d.signedUrl]));
  return items.map((i) => ({
    ...i,
    signedUrl: map.get(i.path) ?? undefined,
  }));
}

/**
 * Faz upload de 1 ficheiro. Se existir já uma linha para (user_id, nivel, tipo, page),
 * podes optar por:
 *   - `mode: "replace"`  → substitui essa página (atualiza path e apaga binário antigo)
 *   - `mode: "new"`      → cria NOVA página (page = max(page)+1) mantendo as anteriores
 */
export async function uploadDoc(params: {
  nivel: Nivel;
  userId: string;
  atletaId?: string | null;
  tipo: string;
  file: File;
  page?: number | null;           // se omitido e mode === 'new', calcula próxima página
  mode?: 'replace' | 'new';
}) {
  const { nivel, userId, atletaId = null, tipo, file } = params;
  const mode = params.mode ?? 'new';

  // tenta ler linha existente para este (user, nivel, tipo, page)
  let targetPage: number | null = params.page ?? null;

  if (mode === 'replace') {
    if (targetPage === null) targetPage = 0; // default: página 0
    const { data: existing, error: selErr } = await supabase
      .from('documentos')
      .select('id, path')
      .eq('user_id', userId)
      .eq('doc_nivel', nivel)
      .eq('doc_tipo', tipo)
      .eq('page', targetPage)
      .maybeSingle();
    if (selErr) throw selErr;

    const safeName = safeFileName(file.name);
    const newPath = `${userId}/${nivel}/${sanitizeSegment(tipo)}/${Date.now()}_${safeName}`;

    // upload novo
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, { upsert: false });
    if (upErr) throw upErr;

    if (existing) {
      // apaga antigo (best-effort)
      if (existing.path) await supabase.storage.from(BUCKET).remove([existing.path]).catch(() => {});

      // update
      const { error: updErr } = await supabase
        .from('documentos')
        .update({ path: newPath })
        .eq('id', existing.id);
      if (updErr) throw updErr;

      return { id: existing.id, path: newPath, page: targetPage };
    } else {
      // não existia — insere novo (vai respeitar o unique index; page precisa estar definida)
      const row = {
        user_id: userId,
        atleta_id: atletaId,
        doc_nivel: nivel,
        doc_tipo: tipo,
        page: targetPage,
        path: newPath,
      };
      const { data: ins, error: insErr } = await supabase
        .from('documentos')
        .insert(row)
        .select('id, path, page')
        .single();
      if (insErr) throw insErr;
      return ins;
    }
  }

  // mode === 'new': cria sempre nova página
  let page = targetPage;
  if (page === null) {
    const { data: maxRow, error: maxErr } = await supabase
      .from('documentos')
      .select('page')
      .eq('user_id', userId)
      .eq('doc_nivel', nivel)
      .eq('doc_tipo', tipo)
      .order('page', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxErr) throw maxErr;
    const prev = (maxRow?.page ?? -1) as number;
    page = Number.isFinite(prev) ? prev + 1 : 0;
  }

  const safeName = safeFileName(file.name);
  const path = `${userId}/${nivel}/${sanitizeSegment(tipo)}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const row = {
    user_id: userId,
    atleta_id: atletaId,
    doc_nivel: nivel,
    doc_tipo: tipo,
    page,
    path,
  };

  const { data: ins, error: insErr } = await supabase
    .from('documentos')
    .insert(row)
    .select('id, path, page')
    .single();
  if (insErr) throw insErr;

  return ins;
}

/** Substitui o binário mantendo a mesma linha (por ID) */
export async function replaceDoc(id: string, file: File) {
  const { data: row, error } = await supabase
    .from('documentos')
    .select('id, user_id, doc_nivel, doc_tipo, path')
    .eq('id', id)
    .single();
  if (error) throw error;

  const safeName = safeFileName(file.name);
  const newPath = `${row.user_id}/${row.doc_nivel}/${sanitizeSegment(row.doc_tipo)}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(newPath, file, { upsert: false });
  if (upErr) throw upErr;

  // apaga antigo (best-effort)
  if (row.path) await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});

  const { error: updErr } = await supabase.from('documentos').update({ path: newPath }).eq('id', id);
  if (updErr) throw updErr;

  return { id, path: newPath };
}

/** Apaga 1 registo e o ficheiro correspondente */
export async function deleteDoc(id: string) {
  // lê path
  const { data: row, error } = await supabase.from('documentos').select('path').eq('id', id).single();
  if (error) throw error;

  // apaga DB
  const { error: delErr } = await supabase.from('documentos').delete().eq('id', id);
  if (delErr) throw delErr;

  // apaga Storage (best-effort)
  if (row?.path) await supabase.storage.from(BUCKET).remove([row.path]).catch(() => {});
}

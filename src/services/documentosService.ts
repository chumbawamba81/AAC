// src/services/documentosService.ts
import { supabase } from '../supabaseClient';

// ... (resto do ficheiro igual)

const BUCKET = 'documentos';

// 🔧 Helpers para gerar keys seguras no Storage
function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function sanitizeSegment(s: string) {
  // remove acentos, troca espaços por '-', remove caracteres problemáticos, corta duplicados
  const ascii = stripDiacritics(s);
  return ascii
    .replace(/[\/\\]/g, '-')      // nunca permitir / ou \ no segmento
    .replace(/\s+/g, '-')         // espaços → '-'
    .replace(/[^A-Za-z0-9._\-()+]/g, '-') // só ASCII seguro
    .replace(/-+/g, '-')          // '-' consecutivos
    .replace(/^\-|\-$/g, '');     // trim '-'
}
function safeFileName(name: string) {
  // separa base e extensão e sanitiza ambos
  const idx = name.lastIndexOf('.');
  const base = idx > 0 ? name.slice(0, idx) : name;
  const ext = idx > 0 ? name.slice(idx + 1) : '';
  const b = sanitizeSegment(base) || 'ficheiro';
  const e = sanitizeSegment(ext);
  return e ? `${b}.${e}` : b;
}

/** Upload de 1 ficheiro para um documento (cria documento se necessário) */
export async function uploadDoc(
  tipo: DocumentoTipo,
  nome: string,
  file: File,
  opts: { pessoaId?: string | null; atletaId?: string | null; page?: number | null } = {},
) {
  // 1) garante documento
  const doc = await ensureDocumento(tipo, nome, { pessoaId: opts.pessoaId ?? null, atletaId: opts.atletaId ?? null });

  // 2) path simples e seguro: <doc.id>/<timestamp>_<safeName>
  const path = `${doc.id}/${Date.now()}_${safeFileName(file.name)}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  // 3) registo do ficheiro
  const row = { documento_id: doc.id, path, page: opts.page ?? null };
  const { error: insErr } = await supabase.from('documentos_ficheiros').insert(row);
  if (insErr) throw insErr;

  return { documento: doc, path };
}

/** Substitui o binário mantendo o registo (gera novo path e atualiza a linha) */
export async function replaceDoc(fileId: string, file: File) {
  // ler a linha
  const { data: row, error } = await supabase
    .from('documentos_ficheiros')
    .select('id, documento_id, path')
    .eq('id', fileId)
    .single();
  if (error) throw error;

  const newPath = `${row.documento_id}/${Date.now()}_${safeFileName(file.name)}`;

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

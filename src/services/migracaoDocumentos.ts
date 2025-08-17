// src/services/migracaoDocumentos.ts
import { uploadDoc, type Nivel } from './documentosService';

/** Converte um DataURL (da DEMO antiga) num File */
async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

/**
 * Migra documentos guardados no localStorage (DEMO antiga)
 *  - docsSocio: { [docNome]: { name, dataUrl, uploadedAt } }
 *  - docsAtleta: { [atletaId]: { [docNome]: { name, dataUrl, uploadedAt } } }
 *  - Ignora "pagamentos" (não tratado aqui)
 */
export async function migrateLocalDocs(lsKey = 'bb_app_payments_v1') {
  const raw = localStorage.getItem(lsKey);
  if (!raw) return { migrated: 0, message: 'Sem dados antigos' };

  const s = JSON.parse(raw);
  let migrated = 0;

  // 1) Documentos do SÓCIO
  if (s.docsSocio && typeof s.docsSocio === 'object') {
    for (const [docNome, meta] of Object.entries<any>(s.docsSocio)) {
      if (meta?.dataUrl && meta?.name) {
        const f = await dataUrlToFile(meta.dataUrl, meta.name);
        // page=null (sem ordenação por páginas nesta migração)
        await uploadDoc('socio', docNome as string, f, { page: null });
        migrated++;
      }
    }
  }

  // 2) Documentos por ATLETA
  if (s.docsAtleta && typeof s.docsAtleta === 'object') {
    for (const [atletaId, docs] of Object.entries<any>(s.docsAtleta)) {
      if (docs && typeof docs === 'object') {
        for (const [docNome, meta] of Object.entries<any>(docs)) {
          if (meta?.dataUrl && meta?.name) {
            const f = await dataUrlToFile(meta.dataUrl, meta.name);
            await uploadDoc('atleta', docNome as string, f, { atletaId, page: null });
            migrated++;
          }
        }
      }
    }
  }

  return { migrated, message: 'Migração concluída' };
}

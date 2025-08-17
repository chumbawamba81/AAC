// src/services/migracaoDocumentos.ts
import { uploadDocumento } from './documentosService';
import { dataUrlToFile } from '../utils/dataurl';

// Mantém estes tipos em linha com o que usas no front
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };
type DocSocio = "Ficha de Sócio" | "Comprovativo de pagamento de sócio";
type DocAtleta =
  | "Ficha de sócio de atleta"
  | "Ficha de jogador FPB"
  | "Ficha inscrição AAC"
  | "Exame médico"
  | "Comprovativo de pagamento de inscrição";

type StateAntigo = {
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<DocAtleta, UploadMeta>>>;
  atletas: Array<{ id: string; nomeCompleto: string }>;
};

// chave para memoizar a migração
const MIG_KEY = 'docs_migrados_v1';

export function jaMigrado(): boolean {
  return localStorage.getItem(MIG_KEY) === '1';
}

function marcaMigrado() {
  localStorage.setItem(MIG_KEY, '1');
}

/** 
 * Faz a migração dos DataURLs locais para Storage + BD.
 * - SÓCIO: 1 ficheiro por tipo → página 1
 * - ATLETA: 1 ficheiro por tipo → página 1
 * Devolve um pequeno relatório.
 */
export async function migrarDocumentosLocais(state: StateAntigo) {
  const relatorio: string[] = [];
  let total = 0, sucesso = 0, falhas = 0;

  // Sócio
  for (const [tipo, meta] of Object.entries(state.docsSocio || {})) {
    if (!meta) continue;
    try {
      total++;
      const file = dataUrlToFile(meta.dataUrl, meta.name || 'documento.pdf');
      await uploadDocumento('socio', tipo as DocSocio, file, { page: 1 });
      sucesso++;
      relatorio.push(`Sócio • ${tipo}: OK (${meta.name})`);
    } catch (e: any) {
      falhas++;
      relatorio.push(`Sócio • ${tipo}: ERRO — ${e?.message || e}`);
    }
  }

  // Atletas
  for (const a of state.atletas || []) {
    const pack = state.docsAtleta?.[a.id] || {};
    for (const [tipo, meta] of Object.entries(pack)) {
      if (!meta) continue;
      try {
        total++;
        const file = dataUrlToFile(meta.dataUrl, meta.name || 'documento.pdf');
        await uploadDocumento('atleta', tipo as DocAtleta, file, { atletaId: a.id, page: 1 });
        sucesso++;
        relatorio.push(`Atleta ${a.nomeCompleto} • ${tipo}: OK (${meta.name})`);
      } catch (e: any) {
        falhas++;
        relatorio.push(`Atleta ${a.nomeCompleto} • ${tipo}: ERRO — ${e?.message || e}`);
      }
    }
  }

  if (falhas === 0) marcaMigrado();

  return {
    total, sucesso, falhas,
    linhas: relatorio,
    // Se quiseres, devolve aqui listas para limpar/atualizar o estado local antigo
  };
}

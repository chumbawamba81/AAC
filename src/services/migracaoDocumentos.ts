// src/services/migracaoDocumentos.ts
import { uploadDoc } from './documentosService';

type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

type State = {
  docsSocio: Partial<Record<string, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<string, UploadMeta>>>;
};

function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], filename || 'ficheiro', { type: mime });
}

export async function migrateLocalDataUrls(args: {
  state: State;
  userId: string;
  onProgress?: (msg: string) => void;
}) {
  const { state, userId, onProgress } = args;

  // Sócio
  for (const [tipo, meta] of Object.entries(state.docsSocio || {})) {
    if (!meta?.dataUrl) continue;
    onProgress?.(`Sócio: ${tipo}`);
    const file = dataUrlToFile(meta.dataUrl, meta.name);
    await uploadDoc({
      nivel: 'socio',
      userId,
      tipo,
      file,
      mode: 'new',
      page: 0, // primeira página
    });
  }

  // Atleta
  for (const [atletaId, porTipo] of Object.entries(state.docsAtleta || {})) {
    for (const [tipo, meta] of Object.entries(porTipo || {})) {
      if (!meta?.dataUrl) continue;
      onProgress?.(`Atleta ${atletaId}: ${tipo}`);
      const file = dataUrlToFile(meta.dataUrl, meta.name);
      await uploadDoc({
        nivel: 'atleta',
        userId,
        atletaId,
        tipo,
        file,
        mode: 'new',
        page: 0,
      });
    }
  }
}

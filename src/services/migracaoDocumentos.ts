// src/services/migracaoDocumentos.ts
import { uploadDoc } from "./documentosService";
import type { State } from "../types/AppState";

type Args = {
  state: State;
  userId: string;
  onProgress?: (msg: string) => void;
};

function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  if (arr.length < 2) {
    const blob = new Blob([""], { type: "application/octet-stream" });
    return new File([blob], filename || "ficheiro.bin");
  }
  const header = arr[0];
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  const blob = new Blob([u8], { type: mime });
  return new File([blob], filename || "ficheiro.bin", { type: mime });
}

export async function migrateLocalDataUrls({ state, userId, onProgress }: Args): Promise<void> {
  const log = (m: string) => onProgress?.(m);

  // ---- Sócio ----
  const socio = state.docsSocio || {};
  for (const [tipo, meta] of Object.entries(socio)) {
    if (!meta?.dataUrl) continue;
    log(`Migrar sócio → ${tipo}`);
    const file = dataUrlToFile(meta.dataUrl, meta.name || `${tipo}.pdf`);
    await uploadDoc({ nivel: "socio", userId, tipo, file, mode: "new" });
  }

  // ---- Atletas ----
  const atletas = state.docsAtleta || {};
  for (const [atletaId, mapa] of Object.entries(atletas)) {
    if (!mapa) continue;
    for (const [tipo, meta] of Object.entries(mapa)) {
      if (!meta?.dataUrl) continue;
      log(`Migrar atleta ${atletaId} → ${tipo}`);
      const file = dataUrlToFile(meta.dataUrl, meta.name || `${tipo}.pdf`);
      await uploadDoc({ nivel: "atleta", userId, atletaId, tipo, file, mode: "new" });
    }
  }
}

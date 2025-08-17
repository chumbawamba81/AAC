// src/types/AppState.ts
import type { Atleta } from "../types/Atleta";
import type { PessoaDados } from "../types/PessoaDados";

export type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

// Mantemos DOCS_SOCIO aqui para partilhar entre componentes
export const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;
export type DocSocio = (typeof DOCS_SOCIO)[number];

// Estado global da app (sem dependência de DocAtleta local do App)
export type State = {
  conta: { email: string } | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<string, UploadMeta>>>;
  pagamentos: Record<string, Array<UploadMeta | null>>;
  tesouraria?: string;
  noticias?: string;
  verificationPendingEmail?: string | null;
};

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Upload, FileUp, CheckCircle2, AlertCircle } from "lucide-react";
import FilePickerButton from "./FilePickerButton";
import type { PessoaDados } from "../types/PessoaDados";
import type { Atleta } from "../types/Atleta";

/** Listas de documentos */
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
  "Comprovativo de pagamento de inscrição",
] as const;
type DocAtleta = (typeof DOCS_ATLETA)[number];

const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;
type DocSocio = (typeof DOCS_SOCIO)[number];

/** Tipos auxiliares (reutilizam os tipos globais do projeto) */
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

type UploadStateSlice = {
  conta: { email: string } | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<DocAtleta, UploadMeta>>>;
};

/** Util local: File -> dataURL (mantemos compat local; quando houver Storage, trocamos por upload) */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function UploadDocsSection({
  state,
  setState,
  saveState,
}: {
  state: UploadStateSlice;
  setState: React.Dispatch<React.SetStateAction<any>>;
  saveState: (s: any) => void;
}) {
  async function toMeta(file: File) {
    const dataUrl = await toDataUrl(file);
    return { name: file.name, dataUrl, uploadedAt: new Date().toISOString() } as UploadMeta;
  }

  async function uploadSocio(doc: DocSocio, file: File) {
    const meta = await toMeta(file);
    const next: UploadStateSlice = {
      ...state,
      docsSocio: { ...state.docsSocio, [doc]: meta },
    };
    setState(next);
    saveState(next as any);
  }

  async function uploadAtleta(athleteId: string, doc: DocAtleta, file: File) {
    const meta = await toMeta(file);
    const current = state.docsAtleta[athleteId] || {};
    const next: UploadStateSlice = {
      ...state,
      docsAtleta: { ...state.docsAtleta, [athleteId]: { ...current, [doc]: meta } },
    };
    setState(next);
    saveState(next as any);
  }

  const socioMissing = DOCS_SOCIO.filter((d) => !state.docsSocio[d]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" /> Upload de Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Documentos do Sócio */}
        <section>
          <div className="font-medium">
            Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {socioMissing.length > 0 ? (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {socioMissing.length} documento(s) em falta
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Completo
              </span>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map((doc) => {
              const meta = state.docsSocio[doc];
              return (
                <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {doc}
                      {state.perfil?.tipoSocio && doc === "Ficha de Sócio"
                        ? ` (${state.perfil.tipoSocio})`
                        : ""}
                    </div>
                    <div className="text-xs text-gray-500">
                      {"Comprovativo " + (meta ? "carregado no sistema" : "em falta")}
                    </div>
                  </div>

                  <FilePickerButton
                    variant={meta ? "secondary" : "outline"}
                    accept="image/*,application/pdf"
                    onFiles={(files) => files[0] && uploadSocio(doc, files[0])}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {meta ? "Substituir" : "Carregar"}
                  </FilePickerButton>
                </div>
              );
            })}
          </div>
        </section>

        {/* Documentos por Atleta */}
        <section className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {state.atletas.length === 0 && (
            <p className="text-sm text-gray-500">Sem atletas criados.</p>
          )}

          {state.atletas.map((a) => {
            const missing = DOCS_ATLETA.filter(
              (d) => !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]
            );
            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}{" "}
                    {missing.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" /> {missing.length} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Completo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map((doc) => {
                    const meta = state.docsAtleta[a.id]?.[doc];
                    return (
                      <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{doc}</div>
                          <div className="text-xs text-gray-500">
                            {"Comprovativo " + (meta ? "carregado no sistema" : "em falta")}
                          </div>
                        </div>

                        <FilePickerButton
                          variant={meta ? "secondary" : "outline"}
                          accept="image/*,application/pdf"
                          onFiles={(files) => files[0] && uploadAtleta(a.id, doc, files[0])}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {meta ? "Substituir" : "Carregar"}
                        </FilePickerButton>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </CardContent>
    </Card>
  );
}

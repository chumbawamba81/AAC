// src/components/UploadDocsSection.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";

import { AlertCircle, CheckCircle2, FileUp, Plus, Trash2, Upload } from "lucide-react";

import type { Atleta } from "../types/Atleta";
import type { PessoaDados } from "../types/PessoaDados";

import {
  Documento,
  DocumentoFicheiro,
  uploadDocumento,
  listDocumentos,
  listFicheiros,
  withSignedUrls,
  replaceDocumentoFile,
  deleteDocumentoFile,
} from "../services/documentosService";

import { getMyProfile } from "../services/profileService";

// Estes arrays devem bater certo com o que pretendes no UI
const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;
type DocSocio = (typeof DOCS_SOCIO)[number];

const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
  "Comprovativo de pagamento de inscrição",
] as const;
type DocAtleta = (typeof DOCS_ATLETA)[number];

type Props = {
  state: {
    conta: { email: string } | null;
    perfil: PessoaDados | null; // pode não ter id, vamos buscá-lo a getMyProfile()
    atletas: Atleta[];
    // estruturas antigas (DataURL) — usamos só para migração:
    docsSocio: Partial<Record<DocSocio, { name: string; dataUrl: string; uploadedAt: string }>>;
    docsAtleta: Record<string, Partial<Record<DocAtleta, { name: string; dataUrl: string; uploadedAt: string }>>>;
  };
  setState: (s: any) => void; // não mexemos no tipo para não rebentar com o resto
};

/* ----------------------------- Helpers ----------------------------- */

// dataURL -> File
async function dataURLtoFile(dataURL: string, filename: string): Promise<File> {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  return new File([blob], filename || "upload.bin", { type: blob.type || "application/octet-stream" });
}

// Refs de inputs por chave
function useInputRefs() {
  const map = useRef(new Map<string, HTMLInputElement | null>());
  const setRef = (key: string) => (el: HTMLInputElement | null) => map.current.set(key, el);
  const openFor = (key: string) => () => map.current.get(key)?.click();
  return { setRef, openFor };
}

// Faz fetch dos ficheiros de um Documento (com signed URLs)
async function hydrateDocumentoWithFiles(doc: Documento) {
  const files = await listFicheiros(doc.id);
  const withUrls = await withSignedUrls(files);
  return { doc, files: withUrls };
}

/* ----------------------------- UI ----------------------------- */

export default function UploadDocsSection({ state, setState }: Props) {
  const [loading, setLoading] = useState(false);
  const [pessoaId, setPessoaId] = useState<string | null>(null);

  // Sócio
  const [socioDocs, setSocioDocs] = useState<
    Array<{ doc: Documento; files: DocumentoFicheiro[] }>
  >([]);

  // Por atleta: id -> docs
  const [docsByAtleta, setDocsByAtleta] = useState<
    Record<string, Array<{ doc: Documento; files: DocumentoFicheiro[] }>>
  >({});

  // Migração
  const [migrOpen, setMigrOpen] = useState(false);
  const hasLocalLegacy = useMemo(() => {
    const hasSocio = Object.keys(state.docsSocio || {}).length > 0;
    const hasAt = Object.keys(state.docsAtleta || {}).length > 0;
    return hasSocio || hasAt;
  }, [state.docsSocio, state.docsAtleta]);

  // Busca o id do perfil (pessoa_id) e carrega docs
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const perfil = await getMyProfile(); // este serviço devolve { id, ... }
        setPessoaId(perfil?.id ?? null);

        // Carregar docs de sócio
        if (perfil?.id) {
          const docs = await listDocumentos("socio", { pessoaId: perfil.id });
          const hydrated = await Promise.all(docs.map(hydrateDocumentoWithFiles));
          setSocioDocs(hydrated);
        } else {
          setSocioDocs([]);
        }

        // Carregar docs por atleta
        const byA: Record<string, Array<{ doc: Documento; files: DocumentoFicheiro[] }>> = {};
        for (const a of state.atletas) {
          const docsA = await listDocumentos("atleta", { atletaId: a.id });
          const hydratedA = await Promise.all(docsA.map(hydrateDocumentoWithFiles));
          byA[a.id] = hydratedA;
        }
        setDocsByAtleta(byA);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [state.atletas]);

  // Mapas auxiliares de “faltas”
  const socioMissingCount = useMemo(() => {
    const present = new Set(socioDocs.map((x) => x.doc.nome));
    return DOCS_SOCIO.filter((n) => !present.has(n)).length;
  }, [socioDocs]);

  function missingCountForAtleta(athleteId: string) {
    const present = new Set((docsByAtleta[athleteId] || []).map((x) => x.doc.nome));
    return DOCS_ATLETA.filter((n) => !present.has(n)).length;
  }

  /* ------------------------- Upload handlers ------------------------- */

  // Adicionar ficheiros a um documento (sócio)
  async function addFilesSocio(docName: DocSocio, files: FileList | null) {
    if (!files || !files.length || !pessoaId) return;
    setLoading(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento("socio", docName, f, { pessoaId });
      }
      // refresh secção sócio
      const docs = await listDocumentos("socio", { pessoaId });
      const hydrated = await Promise.all(docs.map(hydrateDocumentoWithFiles));
      setSocioDocs(hydrated);
    } catch (e: any) {
      alert(e.message || "Falha no upload");
    } finally {
      setLoading(false);
    }
  }

  // Adicionar ficheiros a um documento (atleta)
  async function addFilesAtleta(docName: DocAtleta, atletaId: string, files: FileList | null) {
    if (!files || !files.length) return;
    setLoading(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento("atleta", docName, f, { atletaId });
      }
      // refresh do atleta
      const docsA = await listDocumentos("atleta", { atletaId });
      const hydratedA = await Promise.all(docsA.map(hydrateDocumentoWithFiles));
      setDocsByAtleta((prev) => ({ ...prev, [atletaId]: hydratedA }));
    } catch (e: any) {
      alert(e.message || "Falha no upload");
    } finally {
      setLoading(false);
    }
  }

  // Substituir um ficheiro concreto
  async function replaceFile(fileId: string, newFile: File | null, atletaId?: string) {
    if (!newFile) return;
    setLoading(true);
    try {
      await replaceDocumentoFile(fileId, newFile);
      // refresh
      if (typeof atletaId === "string") {
        const docsA = await listDocumentos("atleta", { atletaId });
        const hydratedA = await Promise.all(docsA.map(hydrateDocumentoWithFiles));
        setDocsByAtleta((prev) => ({ ...prev, [atletaId]: hydratedA }));
      } else if (pessoaId) {
        const docs = await listDocumentos("socio", { pessoaId });
        const hydrated = await Promise.all(docs.map(hydrateDocumentoWithFiles));
        setSocioDocs(hydrated);
      }
    } catch (e: any) {
      alert(e.message || "Falha ao substituir ficheiro");
    } finally {
      setLoading(false);
    }
  }

  // Apagar um ficheiro concreto
  async function deleteFile(fileId: string, atletaId?: string) {
    if (!confirm("Remover este ficheiro?")) return;
    setLoading(true);
    try {
      await deleteDocumentoFile(fileId);
      if (typeof atletaId === "string") {
        const docsA = await listDocumentos("atleta", { atletaId });
        const hydratedA = await Promise.all(docsA.map(hydrateDocumentoWithFiles));
        setDocsByAtleta((prev) => ({ ...prev, [atletaId]: hydratedA }));
      } else if (pessoaId) {
        const docs = await listDocumentos("socio", { pessoaId });
        const hydrated = await Promise.all(docs.map(hydrateDocumentoWithFiles));
        setSocioDocs(hydrated);
      }
    } catch (e: any) {
      alert(e.message || "Falha ao remover ficheiro");
    } finally {
      setLoading(false);
    }
  }

  /* --------------------------- Refs de inputs --------------------------- */

  const socioRefs = useInputRefs(); // chave: `SOCIO::<docName>`
  const atletaAddRefs = useInputRefs(); // chave: `ATLETA_ADD::<atletaId>::<docName>`
  const fileReplaceRefs = useInputRefs(); // chave: `REPLACE::<fileId>`

  /* --------------------------- Migração (DataURL) --------------------------- */

  const [migrLog, setMigrLog] = useState<string[]>([]);
  const [migrBusy, setMigrBusy] = useState(false);

  async function migrateLocalToStorage() {
    if (!pessoaId) {
      alert("Sem id do perfil (pessoa). Guarde primeiro os dados pessoais.");
      return;
    }
    setMigrBusy(true);
    setMigrLog([]);

    const log = (s: string) => setMigrLog((prev) => [...prev, s]);

    try {
      // Sócio
      for (const docName of Object.keys(state.docsSocio || {}) as DocSocio[]) {
        const meta = state.docsSocio[docName];
        if (!meta) continue;
        log(`Sócio: ${docName} — a migrar...`);
        const file = await dataURLtoFile(meta.dataUrl, meta.name || `${docName}.bin`);
        await uploadDocumento("socio", docName, file, { pessoaId });
        log(`Sócio: ${docName} — OK`);
      }

      // Atletas
      for (const atleta of state.atletas) {
        const docs = state.docsAtleta[atleta.id] || {};
        for (const docName of Object.keys(docs) as DocAtleta[]) {
          const meta = docs[docName];
          if (!meta) continue;
          log(`Atleta ${atleta.nomeCompleto}: ${docName} — a migrar...`);
          const file = await dataURLtoFile(meta.dataUrl, meta.name || `${docName}.bin`);
          await uploadDocumento("atleta", docName, file, { atletaId: atleta.id });
          log(`Atleta ${atleta.nomeCompleto}: ${docName} — OK`);
        }
      }

      // Limpa legacy do localStorage (mantém demais estado)
      setState((prev: any) => ({
        ...prev,
        docsSocio: {},
        docsAtleta: {},
      }));
      log("Limpeza do legacy (localStorage) concluída.");

      // Refresh da listagem
      const docs = await listDocumentos("socio", { pessoaId });
      const hydrated = await Promise.all(docs.map(hydrateDocumentoWithFiles));
      setSocioDocs(hydrated);

      const byA: Record<string, Array<{ doc: Documento; files: DocumentoFicheiro[] }>> = {};
      for (const a of state.atletas) {
        const docsA = await listDocumentos("atleta", { atletaId: a.id });
        const hydratedA = await Promise.all(docsA.map(hydrateDocumentoWithFiles));
        byA[a.id] = hydratedA;
      }
      setDocsByAtleta(byA);

      log("Migração terminada ✅");
    } catch (e: any) {
      log("Erro: " + (e.message || String(e)));
    } finally {
      setMigrBusy(false);
    }
  }

  /* ----------------------------- Render ----------------------------- */

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Upload de Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Barra de estado + migração */}
        <section className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {loading ? "A carregar…" : "Pronto"}
            {pessoaId ? null : (
              <span className="ml-2 text-red-600">• Guarde os Dados Pessoais para ativar uploads</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasLocalLegacy && (
              <Button variant="secondary" onClick={() => setMigrOpen(true)}>
                Migrar ficheiros antigos
              </Button>
            )}
          </div>
        </section>

        {/* Documentos do Sócio */}
        <section>
          <div className="font-medium">
            Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {socioMissingCount > 0 ? (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {socioMissingCount} documento(s) em falta
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Completo
              </span>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map((docName) => {
              const existing = socioDocs.find((x) => x.doc.nome === docName);
              const files = existing?.files || [];
              const inputKey = `SOCIO::${docName}`;

              return (
                <div key={docName} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {docName}
                        {state.perfil?.tipoSocio && docName === "Ficha de Sócio"
                          ? ` (${state.perfil.tipoSocio})`
                          : ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {files.length > 0 ? `${files.length} ficheiro(s)` : "Nenhum ficheiro"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={socioRefs.setRef(inputKey)}
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (!e.target.files) return;
                          void addFilesSocio(docName, e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        variant={files.length > 0 ? "secondary" : "outline"}
                        onClick={socioRefs.openFor(inputKey)}
                        disabled={!pessoaId}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {files.length > 0 ? "Adicionar" : "Carregar"}
                      </Button>
                    </div>
                  </div>

                  {files.length > 0 && (
                    <ul className="mt-2 space-y-2 text-sm">
                      {files.map((f) => {
                        const repKey = `REPLACE::${f.id}`;
                        return (
                          <li key={f.id} className="flex items-center justify-between gap-2">
                            <a
                              href={f.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate underline"
                              title={f.file_name}
                            >
                              {f.file_name}
                            </a>
                            <div className="flex items-center gap-2">
                              <input
                                ref={fileReplaceRefs.setRef(repKey)}
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  void replaceFile(f.id, file);
                                  e.currentTarget.value = "";
                                }}
                              />
                              <Button size="sm" variant="outline" onClick={fileReplaceRefs.openFor(repKey)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Substituir
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteFile(f.id)}>
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remover
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
            const packs = docsByAtleta[a.id] || [];
            const filesByName = new Map<string, DocumentoFicheiro[]>(
              packs.map((p) => [p.doc.nome, p.files]),
            );

            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}
                    {missingCountForAtleta(a.id) > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" />
                        {missingCountForAtleta(a.id)} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Completo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map((docName) => {
                    const files = filesByName.get(docName) || [];
                    const addKey = `ATLETA_ADD::${a.id}::${docName}`;

                    return (
                      <div key={docName} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{docName}</div>
                            <div className="text-xs text-gray-500">
                              {files.length > 0 ? `${files.length} ficheiro(s)` : "Nenhum ficheiro"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              ref={atletaAddRefs.setRef(addKey)}
                              type="file"
                              accept="image/*,application/pdf"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (!e.target.files) return;
                                void addFilesAtleta(docName, a.id, e.target.files);
                                e.currentTarget.value = "";
                              }}
                            />
                            <Button
                              variant={files.length > 0 ? "secondary" : "outline"}
                              onClick={atletaAddRefs.openFor(addKey)}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              {files.length > 0 ? "Adicionar" : "Carregar"}
                            </Button>
                          </div>
                        </div>

                        {files.length > 0 && (
                          <ul className="mt-2 space-y-2 text-sm">
                            {files.map((f) => {
                              const repKey = `REPLACE::${f.id}`;
                              return (
                                <li key={f.id} className="flex items-center justify-between gap-2">
                                  <a
                                    href={f.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="truncate underline"
                                    title={f.file_name}
                                  >
                                    {f.file_name}
                                  </a>
                                  <div className="flex items-center gap-2">
                                    <input
                                      ref={fileReplaceRefs.setRef(repKey)}
                                      type="file"
                                      accept="image/*,application/pdf"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        void replaceFile(f.id, file, a.id);
                                        e.currentTarget.value = "";
                                      }}
                                    />
                                    <Button size="sm" variant="outline" onClick={fileReplaceRefs.openFor(repKey)}>
                                      <Plus className="h-4 w-4 mr-1" />
                                      Substituir
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => deleteFile(f.id, a.id)}>
                                      <Trash2 className="h-4 w-4 mr-1" />
                                      Remover
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      </CardContent>

      {/* Diálogo de migração */}
      <Dialog open={migrOpen} onOpenChange={setMigrOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Migração de ficheiros locais → Storage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Isto vai enviar os comprovativos/ficheiros guardados localmente (DataURL) para o Storage do Supabase e
              criar os registos nas tabelas <code>documentos</code>/<code>documentos_ficheiros</code>. No final, os
              dados antigos serão limpos do armazenamento local.
            </p>
            <div className="rounded-lg border p-2 h-40 overflow-auto text-xs bg-gray-50">
              {migrLog.length === 0 ? <span className="text-gray-500">Sem logs ainda…</span> : migrLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setMigrOpen(false)} disabled={migrBusy}>
                Fechar
              </Button>
              <Button onClick={() => void migrateLocalToStorage()} disabled={migrBusy || !pessoaId}>
                {migrBusy ? "A migrar…" : "Iniciar migração"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

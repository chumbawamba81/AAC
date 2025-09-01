// src/components/UploadDocsSection.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import {
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Plus,
  FileUp,
  RefreshCw,
} from "lucide-react";

import { supabase } from "../supabaseClient";
import type { State } from "../types/AppState";

import {
  listDocs,
  withSignedUrls,
  uploadDoc,
  replaceDoc,
  deleteDoc,
  type DocumentoRow,
} from "../services/documentosService";

/** ⚠️ Nesta UI não mostramos os comprovativos de inscrição:
 *  - Sócio: "Comprovativo de pagamento de sócio"
 *  - Atleta: "Comprovativo de pagamento de inscrição"
 *  porque vivem em “Situação de Tesouraria”.
 */
const DOCS_SOCIO_UI = ["Ficha de Sócio"] as const;
const DOCS_ATLETA_UI = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Termo de responsabilidade",
  "Exame médico",
] as const;

type DocSocioUI = (typeof DOCS_SOCIO_UI)[number];
type DocAtletaUI = (typeof DOCS_ATLETA_UI)[number];

type Props = {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  /** Quando true, não mostra a Ficha de Sócio e apresenta a mensagem de “Sem documentos…” */
  hideSocioDoc?: boolean;
};

function groupByTipo(rows: DocumentoRow[]) {
  const map = new Map<string, DocumentoRow[]>();
  for (const r of rows) {
    const arr = map.get(r.doc_tipo) || [];
    arr.push(r);
    map.set(r.doc_tipo, arr);
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    map.set(k, arr);
  }
  return map;
}

/* --------- Utilitários para Android/Honor --------- */

// Mapa básico para inferir MIME por extensão (inclui HEIC/HEIF)
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function inferMimeFromName(name?: string): string | null {
  if (!name) return null;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase().split("?")[0];
  return EXT_TO_MIME[ext] || null;
}

/** Alguns seletores (Honor/Huawei) entregam File com type vazio ou HEIC/HEIF.
 *  Esta função cria um novo File com `type` ajustado quando necessário.
 */
async function normalizeFileMime(original: File): Promise<File> {
  let type = original.type;
  if (!type || type === "" || type === "application/octet-stream") {
    const guessed = inferMimeFromName(original.name);
    if (guessed) type = guessed;
  }
  // Mantemos HEIC/HEIF (o Supabase aceita; browsers podem não pré-visualizar, mas o upload funciona).
  if (type === original.type && original.size > 0) return original;

  // Recria o File com o tipo corrigido para ajudar o storage/preview
  const buf = await original.arrayBuffer();
  return new File([new Uint8Array(buf)], original.name, { type: type || "application/octet-stream", lastModified: original.lastModified });
}

/** Input invisível mas clicável (evita display:none em Android) */
function StealthFileInput(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    inputRef?: (el: HTMLInputElement | null) => void;
  }
) {
  const { inputRef, style, ...rest } = props;
  return (
    <input
      {...rest}
      ref={inputRef as any}
      type="file"
      style={{
        position: "fixed",
        inset: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "auto",
        ...style,
      }}
      tabIndex={-1}
      aria-hidden
    />
  );
}

export default function UploadDocsSection({ state, setState, hideSocioDoc }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});

  const socioPickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const replacePickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const atletaPickersRef = useRef<Record<string, Record<string, HTMLInputElement | null>>>({});

  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function refreshAll() {
    if (!userId) return;
    setLoading(true);
    try {
      // Sócio
      const socioRows = await listDocs({ nivel: "socio", userId });
      const socioWithUrls = await withSignedUrls(socioRows);
      setSocioDocs(groupByTipo(socioWithUrls));

      // Atletas
      const nextAth: Record<string, Map<string, DocumentoRow[]>> = {};
      for (const a of state.atletas) {
        const rows = await listDocs({ nivel: "atleta", userId, atletaId: a.id });
        const withUrls = await withSignedUrls(rows);
        nextAth[a.id] = groupByTipo(withUrls);
      }
      setAthDocs(nextAth);
    } catch (e: any) {
      console.error("[refreshAll]", e);
      alert(`Falha ao carregar documentos: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state.atletas.map((a) => a.id).join(",")]);

  const socioMissingCount = useMemo(() => {
    if (hideSocioDoc) return 0;
    let miss = 0;
    for (const t of DOCS_SOCIO_UI) {
      if (!socioDocs.get(t)?.length) miss++;
    }
    return miss;
  }, [socioDocs, hideSocioDoc]);

  /* ======================= Upload Many ======================= */

  async function handleUploadSocioMany(tipo: DocSocioUI, filesList: FileList | null) {
    if (!userId || !filesList || filesList.length === 0) {
      alert("Sessão ou ficheiros em falta");
      return;
    }
    setLoading(true);
    try {
      const current = socioDocs.get(tipo) || [];
      const start = current.length + 1;
      const files = Array.from(filesList);

      for (let i = 0; i < files.length; i++) {
        let f = files[i];
        console.log("[upload socio] original:", { name: f.name, type: f.type, size: f.size });
        if (f.size === 0) {
          alert(`Atenção: o ficheiro "${f.name}" foi reportado com 0 bytes. No Honor, use a opção "Guardar localmente" na galeria antes de selecionar, ou reabra o seletor e escolha novamente.`);
        }
        f = await normalizeFileMime(f);
        console.log("[upload socio] normalizado:", { name: f.name, type: f.type, size: f.size });

        await uploadDoc({
          nivel: "socio",
          userId,
          tipo,
          file: f,
          mode: "new",
          page: start + i,
        });
      }
      await refreshAll();
      alert(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
    } catch (e: any) {
      console.error("[upload socio many]", e);
      alert(`Falha no upload (sócio): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadAtletaMany(atletaId: string, tipo: DocAtletaUI, filesList: FileList | null) {
    if (!userId || !filesList || filesList.length === 0) {
      alert("Sessão ou ficheiros em falta");
      return;
    }
    setLoading(true);
    try {
      const mapa = athDocs[atletaId] || new Map<string, DocumentoRow[]>();
      const current = mapa.get(tipo) || [];
      const start = current.length + 1;
      const files = Array.from(filesList);

      for (let i = 0; i < files.length; i++) {
        let f = files[i];
        console.log("[upload atleta] original:", { name: f.name, type: f.type, size: f.size });
        if (f.size === 0) {
          alert(`Atenção: o ficheiro "${f.name}" foi reportado com 0 bytes. Se veio do "Seletor de meios" do Honor, escolha "Explorador de Ficheiros" ou "Galeria" e tente de novo.`);
        }
        f = await normalizeFileMime(f);
        console.log("[upload atleta] normalizado:", { name: f.name, type: f.type, size: f.size });

        await uploadDoc({
          nivel: "atleta",
          userId,
          atletaId,
          tipo,
          file: f,
          mode: "new",
          page: start + i,
        });
      }
      await refreshAll();
      alert(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
    } catch (e: any) {
      console.error("[upload atleta many]", e);
      alert(`Falha no upload (atleta): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ======================= Replace / Delete ======================= */

  async function handleReplace(row: DocumentoRow, file: File) {
    if (!file) return;
    setLoading(true);
    try {
      let f = file;
      console.log("[replace] original:", { name: f.name, type: f.type, size: f.size });
      if (f.size === 0) {
        alert(`Atenção: o ficheiro "${f.name}" tem 0 bytes.`);
      }
      f = await normalizeFileMime(f);
      console.log("[replace] normalizado:", { name: f.name, type: f.type, size: f.size });

      await replaceDoc(row.id, f);
      await refreshAll();
      alert("Documento substituído.");
    } catch (e: any) {
      console.error("[replace]", e);
      alert(`Falha a substituir: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(row: DocumentoRow) {
    if (!confirm("Apagar este ficheiro?")) return;
    setLoading(true);
    try {
      await deleteDoc(row.id);
      await refreshAll();
      alert("Apagado.");
    } catch (e: any) {
      console.error("[delete]", e);
      alert(`Falha a apagar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ======================= Render ======================= */

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Upload de Documentos {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ---- Aviso: comprovativos migrados ---- */}
        <div className="border rounded-lg p-3 bg-blue-50 text-blue-900">
          <div className="text-sm">
            <p className="text-sm text-gray-700">
              Os comprovativos de pagamento (inscrição do sócio e inscrição do atleta) encontram-se disponíveis
              para upload na secção <strong>Situação de Tesouraria</strong>.
              <br />
              <span className="text-gray-600">
                Recomenda-se a utilização de apps de digitalização (Adobe Scan / CamScanner) para garantir boa legibilidade.
              </span>
            </p>
          </div>
        </div>

        {/* ---- SOCIO ---- */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium">
              Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
            </div>

            { (hideSocioDoc ? 0 : DOCS_SOCIO_UI.filter((t)=>!(socioDocs.get(t)||[]).length).length) > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700">
                <AlertCircle className="h-3 w-3" /> {DOCS_SOCIO_UI.filter((t)=>!(socioDocs.get(t)||[]).length).length} doc(s) em falta
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700">
                <CheckCircle2 className="h-3 w-3" /> Sem documentos
              </span>
            )}
          </div>

          {hideSocioDoc ? null : (
            <div className="grid md:grid-cols-2 gap-3">
              {DOCS_SOCIO_UI.map((tipo) => {
                const files = socioDocs.get(tipo) || [];
                return (
                  <div key={tipo} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        {tipo}
                        {state.perfil?.tipoSocio && tipo === "Ficha de Sócio" ? ` (${state.perfil.tipoSocio})` : ""}
                      </div>
                      <div className="flex gap-2">
                        <StealthFileInput
                          inputRef={(el) => (socioPickersRef.current[tipo] = el)}
                          // Aceitação ampla para contornar o seletor do Honor
                          accept="image/*,application/pdf,application/*,*/*"
                          multiple
                          onChange={async (e) => {
                            const fs = (e.target as HTMLInputElement).files;
                            await handleUploadSocioMany(tipo, fs || null);
                            (e.currentTarget as HTMLInputElement).value = "";
                          }}
                        />
                        <Button variant="outline" onClick={() => socioPickersRef.current[tipo]?.click()}>
                          <Plus className="h-4 w-4 mr-1" /> Adicionar
                        </Button>
                      </div>
                    </div>

                    {files.length === 0 ? (
                      <div className="text-xs text-gray-500">Nenhum ficheiro carregado.</div>
                    ) : (
                      <ul className="space-y-2">
                        {files.map((row, idx) => (
                          <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                            <div className="text-sm flex items-center gap-2">
                              <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                Ficheiro {idx + 1}
                              </span>
                              <a
                                href={row.signedUrl || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="underline inline-flex items-center gap-1"
                              >
                                <LinkIcon className="h-4 w-4" />
                                {row.nome || "ficheiro"}
                              </a>
                            </div>
                            <div className="flex items-center gap-2">
                              <StealthFileInput
                                inputRef={(el) => (replacePickersRef.current[row.id] = el)}
                                accept="image/*,application/pdf,application/*,*/*"
                                onChange={async (e) => {
                                  const f = (e.target as HTMLInputElement).files?.[0];
                                  if (f) await handleReplace(row, f);
                                  (e.currentTarget as HTMLInputElement).value = "";
                                }}
                              />
                              <Button variant="outline" onClick={() => replacePickersRef.current[row.id]?.click()}>
                                <RefreshCw className="h-4 w-4 mr-1" /> Substituir
                              </Button>
                              <Button variant="destructive" onClick={() => handleDelete(row)}>
                                <Trash2 className="h-4 w-4 mr-1" /> Apagar
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- ATLETAS ---- */}
        <section className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas criados.</p>}
          {state.atletas.map((a) => {
            const mapa = athDocs[a.id] || new Map<string, DocumentoRow[]>();
            const missing = DOCS_ATLETA_UI.filter((t) => !(mapa.get(t) || []).length).length;

            return (
              <div key={a.id} className="border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}{" "}
                    {missing > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" /> {missing} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Completo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  {DOCS_ATLETA_UI.map((tipo) => {
                    if (!atletaPickersRef.current[a.id]) atletaPickersRef.current[a.id] = {};
                    const files = mapa.get(tipo) || [];
                    return (
                      <div key={tipo} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{tipo}</div>
                          <div className="flex gap-2">
                            <StealthFileInput
                              inputRef={(el) => (atletaPickersRef.current[a.id][tipo] = el)}
                              accept="image/*,application/pdf,application/*,*/*"
                              multiple
                              onChange={async (e) => {
                                const fs = (e.target as HTMLInputElement).files;
                                await handleUploadAtletaMany(a.id, tipo, fs || null);
                                (e.currentTarget as HTMLInputElement).value = "";
                              }}
                            />
                            <Button variant="outline" onClick={() => atletaPickersRef.current[a.id][tipo]?.click()}>
                              <Plus className="h-4 w-4 mr-1" /> Adicionar
                            </Button>
                          </div>
                        </div>

                        {files.length === 0 ? (
                          <div className="text-xs text-gray-500">Nenhum ficheiro carregado.</div>
                        ) : (
                          <ul className="space-y-2">
                            {files.map((row, idx) => (
                              <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                                <div className="text-sm flex items-center gap-2">
                                  <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">Ficheiro {idx + 1}</span>
                                  <a href={row.signedUrl || undefined} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                                    <LinkIcon className="h-4 w-4" />
                                    {row.nome || "ficheiro"}
                                  </a>
                                </div>
                                <div className="flex items-center gap-2">
                                  <StealthFileInput
                                    inputRef={(el) => (replacePickersRef.current[row.id] = el)}
                                    accept="image/*,application/pdf,application/*,*/*"
                                    onChange={async (e) => {
                                      const f = (e.target as HTMLInputElement).files?.[0];
                                      if (f) await handleReplace(row, f);
                                      (e.currentTarget as HTMLInputElement).value = "";
                                    }}
                                  />
                                  <Button variant="outline" onClick={() => replacePickersRef.current[row.id]?.click()}>
                                    <RefreshCw className="h-4 w-4 mr-1" /> Substituir
                                  </Button>
                                  <Button variant="destructive" onClick={() => handleDelete(row)}>
                                    <Trash2 className="h-4 w-4 mr-1" /> Apagar
                                  </Button>
                                </div>
                              </li>
                            ))}
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
    </Card>
  );
}

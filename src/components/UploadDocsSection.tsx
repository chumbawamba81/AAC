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
import { showToast } from "./MiniToast";

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

/* ======================= Normalização de nomes ======================= */
function sanitizeFileName(originalName: string, maxBaseLen = 80): string {
  const dot = originalName.lastIndexOf(".");
  const rawBase = dot > 0 ? originalName.slice(0, dot) : originalName;
  const rawExt = dot > 0 ? originalName.slice(dot + 1) : "";

  const base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  const safeBase = (base || "ficheiro").slice(0, maxBaseLen);
  const ext = rawExt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  return ext ? `${safeBase}.${ext}` : safeBase;
}

/** Recria um File com nome “limpo”, mantendo conteúdo e tipo. (Android-safe) */
async function withSafeName(file: File): Promise<File> {
  const safeName = sanitizeFileName(file.name);
  // Mesmo que o nome já esteja "safe", clonar melhora a fiabilidade no Android/WebView
  const buf = await file.arrayBuffer();
  return new File([new Uint8Array(buf)], safeName, {
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified,
  });
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

  const refreshAll = React.useCallback(async () => {
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
      console.error("[UploadDocsSection.refreshAll]", e);
      showToast(`Falha ao carregar documentos: ${e?.message || e}`, "err");
    } finally {
      setLoading(false);
    }
  }, [userId, state.atletas]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // ➜ Importante para Android: refresca ao regressar do picker/scan app
  useEffect(() => {
    function onFocus() {
      refreshAll();
    }
    function onVis() {
      if (document.visibilityState === "visible") refreshAll();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshAll]);

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
      showToast("Sessão ou ficheiros em falta", "err");
      return;
    }
    setLoading(true);
    try {
      const current = socioDocs.get(tipo) || [];
      const start = current.length + 1;
      const files = Array.from(filesList);
      for (let i = 0; i < files.length; i++) {
        const safe = await withSafeName(files[i]); // ➜ normaliza + clona (Android)
        await uploadDoc({
          nivel: "socio",
          userId,
          tipo,
          file: safe,
          mode: "new",
          page: start + i,
        });
      }
      await refreshAll();
      showToast(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
    } catch (e: any) {
      console.error("[upload socio many]", e);
      showToast(`Falha no upload (sócio): ${e?.message || e}`, "err");
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadAtletaMany(atletaId: string, tipo: DocAtletaUI, filesList: FileList | null) {
    if (!userId || !filesList || filesList.length === 0) {
      showToast("Sessão ou ficheiros em falta", "err");
      return;
    }
    setLoading(true);
    try {
      const mapa = athDocs[atletaId] || new Map<string, DocumentoRow[]>();
      const current = mapa.get(tipo) || [];
      const start = current.length + 1;
      const files = Array.from(filesList);
      for (let i = 0; i < files.length; i++) {
      const safe = await withSafeName(files[i]); // ➜ normaliza + clona (Android)
      await uploadDoc({
        nivel: "atleta",
        userId,
        atletaId,
        tipo,
        file: safe,
        mode: "new",
        page: start + i,
      });
    }
    await refreshAll();
    showToast(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
  } catch (e: any) {
    console.error("[upload atleta many]", e);
    showToast(`Falha no upload (atleta): ${e?.message || e}`, "err");
  } finally {
    setLoading(false);
  }
}

/* ======================= Replace / Delete ======================= */

async function handleReplace(row: DocumentoRow, file: File) {
  if (!file) return;
  setLoading(true);
  try {
    const safe = await withSafeName(file); // ➜ normaliza + clona (Android)
    await replaceDoc(row.id, safe);
    await refreshAll();
    showToast("Documento substituído.");
  } catch (e: any) {
    console.error("[replace]", e);
    showToast(`Falha a substituir: ${e?.message || e}`, "err");
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
    showToast("Apagado.", "ok");
  } catch (e: any) {
    console.error("[delete]", e);
    showToast(`Falha a apagar: ${e?.message || e}`, "err");
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
      <p className="text-sm text-gray-700">
        Os comprovativos de pagamento (inscrição do sócio e inscrição do atleta) encontram-se disponíveis
        para upload na secção <strong>Situação de Tesouraria</strong>.
      </p>
    </div>

    {/* ---- SOCIO ---- */}
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-medium">
          Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
        </div>
        {socioMissingCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-red-100 text-red-700">
            <AlertCircle className="h-3 w-3" /> {socioMissingCount} doc(s) em falta
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
                    <input
                      ref={(el) => (socioPickersRef.current[tipo] = el)}
                      type="file"
                      accept="image/*,application/pdf"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const fs = e.target.files;
                        if (fs && fs.length) {
                          // normaliza + clona todos os ficheiros antes do upload
                          const arr = await Promise.all(Array.from(fs).map(withSafeName));
                          const dt = new DataTransfer();
                          arr.forEach((f) -> dt.items.add(f));
                          await handleUploadSocioMany(tipo, dt.files);
                        } else {
                          await handleUploadSocioMany(tipo, fs);
                        }
                        e.currentTarget.value = "";
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
                        <div className="text-sm flex items-center gap-2 min-w-0">
                          <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                            Ficheiro {idx + 1}
                          </span>
                          <a
                            href={row.signedUrl || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="underline inline-flex items-center gap-1 min-w-0"
                          >
                            <LinkIcon className="h-4 w-4 flex-shrink-0" />
                            <span className="inline-block max-w-[240px] truncate">
                              {row.nome || "ficheiro"}
                            </span>
                          </a>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(el) => (replacePickersRef.current[row.id] = el)}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                const safe = await withSafeName(f);
                                await handleReplace(row, safe);
                              }
                              e.currentTarget.value = "";
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
                  <span className="inline-flex items gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
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
                        <input
                          ref={(el) => (atletaPickersRef.current[a.id][tipo] = el)}
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          className="hidden"
                          onChange={async (e) => {
                            const fs = e.target.files;
                            if (fs && fs.length) {
                              const arr = await Promise.all(Array.from(fs).map(withSafeName));
                              const dt = new DataTransfer();
                              arr.forEach((f) -> dt.items.add(f));
                              await handleUploadAtletaMany(a.id, tipo, dt.files);
                            } else {
                              await handleUploadAtletaMany(a.id, tipo, fs);
                            }
                            e.currentTarget.value = "";
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
                            <div className="text-sm flex items-center gap-2 min-w-0">
                              <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                Ficheiro {idx + 1}
                              </span>
                              <a
                                href={row.signedUrl || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="underline inline-flex items-center gap-1 min-w-0"
                              >
                                <LinkIcon className="h-4 w-4 flex-shrink-0" />
                                <span className="inline-block max-w-[240px] truncate">
                                  {row.nome || "ficheiro"}
                                </span>
                              </a>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                ref={(el) => (replacePickersRef.current[row.id] = el)}
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    const safe = await withSafeName(f);
                                    await handleReplace(row, safe);
                                  }
                                  e.currentTarget.value = "";
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

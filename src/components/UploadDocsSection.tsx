// src/components/UploadDocsSection.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import {
  Upload,
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
  "Ficha inscrição AAC",
  "Exame médico",
] as const;

type DocSocioUI = (typeof DOCS_SOCIO_UI)[number];
type DocAtletaUI = (typeof DOCS_ATLETA_UI)[number];

type Props = {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
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

export default function UploadDocsSection({ state, setState }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [diagMsg, setDiagMsg] = useState<string>("");

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
    let miss = 0;
    for (const t of DOCS_SOCIO_UI) {
      if (!socioDocs.get(t)?.length) miss++;
    }
    return miss;
  }, [socioDocs]);

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
        await uploadDoc({
          nivel: "socio",
          userId,
          tipo,
          file: files[i],
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
        await uploadDoc({
          nivel: "atleta",
          userId,
          atletaId,
          tipo,
          file: files[i],
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
      await replaceDoc(row.id, file);
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

  /* ======================= Diagnóstico opcional ======================= */

  async function testStorage() {
    try {
      setDiagMsg("A testar Storage…");
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Sem sessão");
      const blob = new Blob(["hello"], { type: "text/plain" });
      const file = new File([blob], "teste.txt", { type: "text/plain" });
      const path = `${u.user.id}/socio/Teste/${Date.now()}_teste.txt`;
      const up = await supabase.storage.from("documentos").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const sig = await supabase.storage.from("documentos").createSignedUrl(path, 60);
      if (sig.error) throw sig.error;
      setDiagMsg("Storage + signed URL OK.");
      alert("Storage OK ✅");
    } catch (e: any) {
      console.error("[diag storage]", e);
      setDiagMsg(`Storage FAIL: ${e?.message || e}`);
      alert(`Storage FAIL ❌: ${e?.message || e}`);
    }
  }

  async function testTable() {
    try {
      setDiagMsg("A testar tabela…");
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Sem sessão");
      const row = {
        user_id: u.user.id,
        doc_nivel: "socio",
        atleta_id: null,
        doc_tipo: "Teste",
        page: 1,
        file_path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        nome: "dummy.txt",
        mime_type: "text/plain",
        file_size: 5,
        uploaded_at: new Date().toISOString(),
      };
      const ins = await supabase.from("documentos").insert(row).select("id").single();
      if (ins.error) throw ins.error;
      setDiagMsg("Tabela OK.");
      alert("Tabela OK ✅");
    } catch (e: any) {
      console.error("[diag table]", e);
      setDiagMsg(`Tabela FAIL: ${e?.message || e}`);
      alert(`Tabela FAIL ❌: ${e?.message || e}`);
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
    Recomenda-se a utilização das aplicações de digitalização no smartphone, como as apps
    <strong> Adobe Scan</strong>{" "}
    <span className="whitespace-nowrap">
      (
      <a
        className="underline inline"
        href="https://play.google.com/store/apps/details?id=com.adobe.scan.android"
        target="_blank"
        rel="noreferrer"
        title="Adobe Scan (Android)"
      >
        Android
      </a>
      {" / "}
      <a
        className="underline inline"
        href="https://apps.apple.com/app/adobe-scan-pdf-scanner-ocr/id1199564834"
        target="_blank"
        rel="noreferrer"
        title="Adobe Scan (iOS)"
      >
        iOS
      </a>
      )
    </span>
    {" "}ou<strong> CamScanner</strong>{" "}
    <span className="whitespace-nowrap">
      (
      <a
        className="underline inline"
        href="https://play.google.com/store/apps/details?id=com.intsig.camscanner"
        target="_blank"
        rel="noreferrer"
        title="CamScanner (Android)"
      >
        Android
      </a>
      {" / "}
      <a
        className="underline inline"
        href="https://apps.apple.com/app/camscanner-pdf-scanner-app/id388627783"
        target="_blank"
        rel="noreferrer"
        title="CamScanner (iOS)"
      >
        iOS
      </a>
      )
    </span>
    , para garantir boa legibilidade dos documentos.
  </span>
</p>

          </div>
        </div>

        {/* ---- DIAGNÓSTICO ---- */}
			{/*        <div className="border rounded-lg p-3 bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Diagnóstico rápido</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={testStorage}>Testar Storage</Button>
              <Button variant="outline" onClick={testTable}>Testar Tabela</Button>
            </div>
          </div>
          {!!diagMsg && <div className="text-xs text-gray-600 mt-2">{diagMsg}</div>}
        </div>
*/}
        {/* ---- SOCIO ---- */}
        <section>
          <div className="mb-2">
            <div className="font-medium">
              Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
            </div>
            <div className="text-xs text-gray-500">
              {socioMissingCount > 0 ? (
                <span className="text-red-600 inline-flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {socioMissingCount} documento(s) em falta
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Completo
                </span>
              )}
            </div>
          </div>

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
                          await handleUploadSocioMany(tipo, fs);
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
                          <div className="text-sm flex items-center gap-2">
                            <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">Ficheiro {idx + 1}</span>
                            <a href={row.signedUrl || undefined} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                              <LinkIcon className="h-4 w-4" />
                              {row.nome || "ficheiro"}
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
                                if (f) await handleReplace(row, f);
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
                            <input
                              ref={(el) => (atletaPickersRef.current[a.id][tipo] = el)}
                              type="file"
                              accept="image/*,application/pdf"
                              multiple
                              className="hidden"
                              onChange={async (e) => {
                                const fs = e.target.files;
                                await handleUploadAtletaMany(a.id, tipo, fs);
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
                                <div className="text-sm flex items-center gap-2">
                                  <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">Ficheiro {idx + 1}</span>
                                  <a href={row.signedUrl || undefined} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                                    <LinkIcon className="h-4 w-4" />
                                    {row.nome || "ficheiro"}
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
                                      if (f) await handleReplace(row, f);
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
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import {
  Upload,
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Plus,
  FileUp,
  RefreshCw,
} from 'lucide-react';

import { supabase } from '../supabaseClient';
import type { Atleta } from '../types/Atleta';

import {
  listDocs,
  withSignedUrls,
  uploadDoc,
  replaceDoc,
  deleteDoc,
  type DocumentoRow,
} from '../services/documentosService';

import { migrateLocalDataUrls } from '../services/migracaoDocumentos';
import type { State } from '../types/AppState';

type Props = {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
};

const DOCS_SOCIO = ['Ficha de Sócio', 'Comprovativo de pagamento de sócio'] as const;
const DOCS_ATLETA = [
  'Ficha de sócio de atleta',
  'Ficha de jogador FPB',
  'Ficha inscrição AAC',
  'Exame médico',
  'Comprovativo de pagamento de inscrição',
] as const;

type DocSocio = (typeof DOCS_SOCIO)[number];
type DocAtleta = (typeof DOCS_ATLETA)[number];

function groupByTipo(rows: DocumentoRow[]) {
  const map = new Map<string, DocumentoRow[]>();
  for (const r of rows) {
    const arr = map.get(r.doc_tipo) || [];
    arr.push(r);
    map.set(r.doc_tipo, arr);
  }
  // ordenar por "page" ascend.
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

  // Sócio
  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  // Atletas -> tipo -> páginas
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});

  // refs de inputs de ficheiro
  const socioPickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const replacePickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const atletaPickersRef = useRef<Record<string, Record<string, HTMLInputElement | null>>>({}); // atletaId -> tipo -> input

  // obter o user id atual
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

  // carregar documentos do supabase
  async function refreshAll() {
    if (!userId) return;
    setLoading(true);
    try {
      // Sócio
      const socioRows = await listDocs({ nivel: 'socio', userId });
      const socioWithUrls = await withSignedUrls(socioRows);
      setSocioDocs(groupByTipo(socioWithUrls));

      // por atleta
      const nextAth: Record<string, Map<string, DocumentoRow[]>> = {};
      for (const a of state.atletas) {
        const rows = await listDocs({ nivel: 'atleta', userId, atletaId: a.id });
        const withUrls = await withSignedUrls(rows);
        nextAth[a.id] = groupByTipo(withUrls);
      }
      setAthDocs(nextAth);
    } catch (e: any) {
      console.error('[refreshAll]', e);
      alert(`Falha ao carregar documentos: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state.atletas.map(a => a.id).join(',')]);

  const socioMissingCount = useMemo(() => {
    let miss = 0;
    for (const t of DOCS_SOCIO) {
      if (!socioDocs.get(t)?.length) miss++;
    }
    return miss;
  }, [socioDocs]);

  /* ======================= UPLOAD: múltiplos ficheiros ======================= */

  async function handleUploadSocioMany(tipo: DocSocio, filesList: FileList | null) {
    if (!userId || !filesList || filesList.length === 0) {
      alert('Sessão ou ficheiros em falta');
      return;
    }
    setLoading(true);
    try {
      const current = socioDocs.get(tipo) || [];
      const start = current.length + 1;
      const files = Array.from(filesList);
      // envia em série para manter ordem de page
      for (let i = 0; i < files.length; i++) {
        await uploadDoc({
          nivel: 'socio',
          userId,
          tipo,
          file: files[i],
          mode: 'new',
          page: start + i,
        });
      }
      await refreshAll();
      alert(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
    } catch (e: any) {
      console.error('[upload socio many]', e);
      alert(`Falha no upload (sócio): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadAtletaMany(atletaId: string, tipo: DocAtleta, filesList: FileList | null) {
    if (!userId || !filesList || filesList.length === 0) {
      alert('Sessão ou ficheiros em falta');
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
          nivel: 'atleta',
          userId,
          atletaId,
          tipo,
          file: files[i],
          mode: 'new',
          page: start + i,
        });
      }
      await refreshAll();
      alert(`${files.length} ficheiro(s) carregado(s) para ${tipo}.`);
    } catch (e: any) {
      console.error('[upload atleta many]', e);
      alert(`Falha no upload (atleta): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ======================= Replace/Delete (1-a-1) ======================= */

  async function handleReplaceSocio(row: DocumentoRow, file: File) {
    if (!file) return;
    setLoading(true);
    try {
      await replaceDoc(row.id, file);
      await refreshAll();
      alert('Documento substituído.');
    } catch (e: any) {
      console.error('[replace socio]', e);
      alert(`Falha a substituir: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSocio(row: DocumentoRow) {
    if (!confirm('Apagar este ficheiro?')) return;
    setLoading(true);
    try {
      await deleteDoc(row.id);
      await refreshAll();
      alert('Apagado.');
    } catch (e: any) {
      console.error('[delete socio]', e);
      alert(`Falha a apagar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReplaceAtleta(row: DocumentoRow, file: File) {
    if (!file) return;
    setLoading(true);
    try {
      await replaceDoc(row.id, file);
      await refreshAll();
      alert('Documento substituído.');
    } catch (e: any) {
      console.error('[replace atleta]', e);
      alert(`Falha a substituir: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAtleta(row: DocumentoRow) {
    if (!confirm('Apagar este ficheiro?')) return;
    setLoading(true);
    try {
      await deleteDoc(row.id);
      await refreshAll();
      alert('Apagado.');
    } catch (e: any) {
      console.error('[delete atleta]', e);
      alert(`Falha a apagar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  /* ======================= Migração DataURLs locais ======================= */

  async function migrateLocal() {
    if (!userId) {
      alert('Sessão não encontrada.');
      return;
    }
    setLoading(true);
    try {
      await migrateLocalDataUrls({
        state,
        userId,
        onProgress: (msg) => console.log('[migrate]', msg),
      });
      // Limpa DataURLs locais
      setState((prev) => ({ ...prev, docsSocio: {}, docsAtleta: {} }));
      await refreshAll();
      alert('Migração concluída.');
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Falha na migração');
    } finally {
      setLoading(false);
    }
  }

  /* ======================= UI helpers ======================= */

  function openSocioPicker(tipo: string) {
    const el = socioPickersRef.current[tipo];
    if (el) el.click();
  }
  function openAthPicker(atletaId: string, tipo: string) {
    if (!atletaPickersRef.current[atletaId]) atletaPickersRef.current[atletaId] = {};
    const el = atletaPickersRef.current[atletaId][tipo];
    if (el) el.click();
  }
  function openReplacePicker(rowId: string) {
    const el = replacePickersRef.current[rowId];
    if (el) el.click();
  }

  /* ======================= Diagnóstico opcional ======================= */

  /* async function testStorage() {
    try {
      setDiagMsg('A testar Storage…');
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error('Sem sessão');
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const file = new File([blob], 'teste.txt', { type: 'text/plain' });
      const path = `${u.user.id}/socio/Teste/${Date.now()}_teste.txt`;
      const up = await supabase.storage.from('documentos').upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      const sig = await supabase.storage.from('documentos').createSignedUrl(path, 60);
      if (sig.error) throw sig.error;
      setDiagMsg('Storage + signed URL OK.');
      alert('Storage OK ✅');
    } catch (e: any) {
      console.error('[diag storage]', e);
      setDiagMsg(`Storage FAIL: ${e?.message || e}`);
      alert(`Storage FAIL ❌: ${e?.message || e}`);
    }
  }

  async function testTable() {
    try {
      setDiagMsg('A testar tabela…');
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error('Sem sessão');
      const row = {
        user_id: u.user.id,
        doc_nivel: 'socio',
        atleta_id: null,
        doc_tipo: 'Teste',
        page: 1,
        file_path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        nome: 'dummy.txt',
        mime_type: 'text/plain',
        file_size: 5,
        uploaded_at: new Date().toISOString(),
      };
      const ins = await supabase.from('documentos').insert(row).select('id').single();
      if (ins.error) throw ins.error;
      setDiagMsg('Tabela OK.');
      alert('Tabela OK ✅');
    } catch (e: any) {
      console.error('[diag table]', e);
      setDiagMsg(`Tabela FAIL: ${e?.message || e}`);
      alert(`Tabela FAIL ❌: ${e?.message || e}`);
    }
  }
*/
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

        {/* ---- DIAGNÓSTICO ---- */}
        <div className="border rounded-lg p-3 bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Diagnóstico rápido</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={testStorage}>Testar Storage</Button>
              <Button variant="outline" onClick={testTable}>Testar Tabela</Button>
            </div>
          </div>
          {!!diagMsg && <div className="text-xs text-gray-600 mt-2">{diagMsg}</div>}
        </div>

        {/* ---- MIGRAÇÃO LOCAL ---- */}
        {(state.docsSocio && Object.keys(state.docsSocio).length > 0) ||
        (state.docsAtleta && Object.keys(state.docsAtleta).length > 0) ? (
          <div className="border rounded-lg p-3 bg-amber-50">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                Encontrámos comprovativos <strong>locais</strong> guardados no browser. Queres migrá-los para o Storage?
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => refreshAll()}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Atualizar
                </Button>
                <Button variant="destructive" onClick={migrateLocal}>
                  <Upload className="h-4 w-4 mr-1" />
                  Migrar para o Storage
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ---- SOCIO ---- */}
        <section>
          <div className="mb-2">
            <div className="font-medium">
              Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || 'Conta'})
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
            {DOCS_SOCIO.map((tipo) => {
              const files = socioDocs.get(tipo) || [];
              return (
                <div key={tipo} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {tipo}
                      {state.perfil?.tipoSocio && tipo === 'Ficha de Sócio' ? ` (${state.perfil.tipoSocio})` : ''}
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
                          e.currentTarget.value = '';
                        }}
                      />
                      <Button variant="outline" onClick={() => openSocioPicker(tipo)}>
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
                              {/* Se quiseres apenas o número, troca por: {idx+1} */}
                              Ficheiro {idx + 1}
                            </span>
                            <a
                              href={row.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline inline-flex items-center gap-1"
                            >
                              <LinkIcon className="h-4 w-4" />
                              {row.nome || 'ficheiro'}
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
                                if (f) await handleReplaceSocio(row, f);
                                e.currentTarget.value = '';
                              }}
                            />
                            <Button variant="outline" onClick={() => openReplacePicker(row.id)}>
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Substituir
                            </Button>
                            <Button variant="destructive" onClick={() => handleDeleteSocio(row)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Apagar
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
          {state.atletas.length === 0 && (
            <p className="text-sm text-gray-500">Sem atletas criados.</p>
          )}
          {state.atletas.map((a) => {
            const mapa = athDocs[a.id] || new Map<string, DocumentoRow[]>();
            const missing = DOCS_ATLETA.filter((t) => !(mapa.get(t) || []).length).length;

            return (
              <div key={a.id} className="border rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}{' '}
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
                  {DOCS_ATLETA.map((tipo) => {
                    const files = mapa.get(tipo) || [];
                    if (!atletaPickersRef.current[a.id]) atletaPickersRef.current[a.id] = {};
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
                                e.currentTarget.value = '';
                              }}
                            />
                            <Button variant="outline" onClick={() => openAthPicker(a.id, tipo)}>
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
                                    href={row.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline inline-flex items-center gap-1"
                                  >
                                    <LinkIcon className="h-4 w-4" />
                                    {row.nome || 'ficheiro'}
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
                                      if (f) await handleReplaceAtleta(row, f);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                  <Button variant="outline" onClick={() => openReplacePicker(row.id)}>
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Substituir
                                  </Button>
                                  <Button variant="destructive" onClick={() => handleDeleteAtleta(row)}>
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Apagar
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

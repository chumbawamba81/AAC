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

// Serviço unificado de documentos
import {
  listDocs,
  withSignedUrls,
  uploadDoc,
  replaceDoc,
  deleteDoc,
  type DocumentoRow,
  type Nivel,
} from '../services/documentosService';

// (para migração de DataURLs locais)
import { migrateLocalDataUrls } from '../services/migracaoDocumentos';

// 👉 Tipos partilhados de estado
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
  // ordenar páginas por page ASC
  for (const [k, arr] of map) {
    arr.sort((a, b) => (a.page ?? 0) - (b.page ?? 0));
    map.set(k, arr);
  }
  return map;
}

export default function UploadDocsSection({ state, setState }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sócio
  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  // Atletas -> tipo -> páginas
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});

  // refs de inputs de ficheiro (um por “slot”, para abrir o picker sem depender de <label>)
  const socioPickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const replacePickersRef = useRef<Record<string, HTMLInputElement | null>>({});
  const atletaPickersRef = useRef<Record<string, Record<string, HTMLInputElement | null>>>({}); // atletaId -> tipo -> input

  // obter o user id atual
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user && mounted) {
        setUserId(data.user.id);
      }
    })();
    return () => {
      mounted = false;
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

  // -------------------- Handlers: Sócio --------------------

  async function handleUploadSocio(tipo: DocSocio, file: File, mode: 'new' | 'replace' = 'new') {
    if (!userId || !file) return;
    await uploadDoc({ nivel: 'socio', userId, tipo, file, mode });
    await refreshAll();
  }

  async function handleReplaceSocio(row: DocumentoRow, file: File) {
    if (!file) return;
    await replaceDoc(row.id, file);
    await refreshAll();
  }

  async function handleDeleteSocio(row: DocumentoRow) {
    if (!confirm('Apagar este ficheiro?')) return;
    await deleteDoc(row.id);
    await refreshAll();
  }

  // -------------------- Handlers: Atleta --------------------

  async function handleUploadAtleta(atletaId: string, tipo: DocAtleta, file: File, mode: 'new' | 'replace' = 'new') {
    if (!userId || !file) return;
    await uploadDoc({ nivel: 'atleta', userId, atletaId, tipo, file, mode });
    await refreshAll();
  }

  async function handleReplaceAtleta(row: DocumentoRow, file: File) {
    if (!file) return;
    await replaceDoc(row.id, file);
    await refreshAll();
  }

  async function handleDeleteAtleta(row: DocumentoRow) {
    if (!confirm('Apagar este ficheiro?')) return;
    await deleteDoc(row.id);
    await refreshAll();
  }

  // -------------------- Migração DataURLs locais --------------------

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
      // Limpa os DataURLs locais (só depois de migrar sem erros)
      setState(prev => ({ ...prev, docsSocio: {}, docsAtleta: {} }));
      // Atualiza UI com o que foi para o Storage
      await refreshAll();
      alert('Migração concluída.');
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Falha na migração');
    } finally {
      setLoading(false);
    }
  }

  // ------- UI helpers -------

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          Upload de Documentos {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">

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
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await handleUploadSocio(tipo, f, 'new');
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
                      {files.map((row) => (
                        <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                          <div className="text-sm flex items-center gap-2">
                            <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                              Página {row.page ?? 0}
                            </span>
                            <a
                              href={row.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline inline-flex items-center gap-1"
                            >
                              <LinkIcon className="h-4 w-4" />
                              {row.file_name || 'ficheiro'}
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
            const missing =
              DOCS_ATLETA.filter((t) => !(mapa.get(t) || []).length).length;

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
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (f) await handleUploadAtleta(a.id, tipo, f, 'new');
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
                            {files.map((row) => (
                              <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                                <div className="text-sm flex items-center gap-2">
                                  <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                    Página {row.page ?? 0}
                                  </span>
                                  <a
                                    href={row.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline inline-flex items-center gap-1"
                                  >
                                    <LinkIcon className="h-4 w-4" />
                                    {row.file_name || 'ficheiro'}
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

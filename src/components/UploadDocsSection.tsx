// src/components/UploadDocsSection.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, AlertCircle, CheckCircle2, Upload, Replace, Trash2, RefreshCw, HardDriveUpload } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import type { Atleta } from '../types/Atleta';

import {
  listDocs,
  withSignedUrls,
  uploadDoc,
  replaceDoc,
  deleteDoc,
  type DocumentoRow,
} from '../services/documentosService';

const DOCS_SOCIO = ['Ficha de Sócio', 'Comprovativo de pagamento de sócio'] as const;
type DocSocio = (typeof DOCS_SOCIO)[number];

const DOCS_ATLETA = [
  'Ficha de sócio de atleta',
  'Ficha de jogador FPB',
  'Ficha inscrição AAC',
  'Exame médico',
  'Comprovativo de pagamento de inscrição',
] as const;
type DocAtleta = (typeof DOCS_ATLETA)[number];

type Props = {
  perfilNome?: string | null;
  contaEmail?: string | null;
  atletas: Atleta[];
};

function useFileInput() {
  const ref = useRef<HTMLInputElement | null>(null);
  const open = () => ref.current?.click();
  const InputEl = (
    <input
      ref={ref}
      type="file"
      accept="image/*,application/pdf"
      className="hidden"
      onClick={(e) => {
        // permite re-selecionar o mesmo ficheiro
        (e.target as HTMLInputElement).value = '';
      }}
    />
  );
  return { ref, open, InputEl };
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'application/octet-stream' });
}

export default function UploadDocsSection({ perfilNome, contaEmail, atletas }: Props) {
  // Estado de listagens (com URLs assinadas)
  const [docsSocio, setDocsSocio] = useState<Record<DocSocio, DocumentoRow[]>>({} as any);
  const [docsPorAtleta, setDocsPorAtleta] = useState<Record<string, Record<DocAtleta, DocumentoRow[]>>>({});
  const [loading, setLoading] = useState(false);
  const [migOpen, setMigOpen] = useState(false);
  const [migRunning, setMigRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Inputs escondidos reutilizáveis
  const socioPicker = useFileInput();
  const atletaPicker = useFileInput();

  async function refreshAll() {
    setLoading(true);
    try {
      // Sócio
      const socioObj: Record<DocSocio, DocumentoRow[]> = {} as any;
      for (const t of DOCS_SOCIO) {
        const rows = await listDocs('socio', t);
        socioObj[t] = await withSignedUrls(rows);
      }
      setDocsSocio(socioObj);

      // Atletas
      const porAtleta: Record<string, Record<DocAtleta, DocumentoRow[]>> = {};
      for (const a of atletas) {
        const d: Record<DocAtleta, DocumentoRow[]> = {} as any;
        for (const t of DOCS_ATLETA) {
          const rows = await listDocs('atleta', t, { atletaId: a.id });
          d[t] = await withSignedUrls(rows);
        }
        porAtleta[a.id] = d;
      }
      setDocsPorAtleta(porAtleta);
    } catch (e: any) {
      setMsg(e.message || 'Falha ao listar documentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atletas.map(a => a.id).join('|')]);

  /* ---------- Ações Sócio ---------- */

  async function handleUploadSocio(tipo: DocSocio, file: File) {
    try {
      const row = await uploadDoc('socio', tipo, file, { page: null });
      // atualiza cache
      const next = { ...docsSocio };
      next[tipo] = await withSignedUrls(await listDocs('socio', tipo));
      setDocsSocio(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha no upload');
    }
  }

  async function handleReplaceSocio(fileRowId: string, file: File, tipo: DocSocio) {
    try {
      await replaceDoc(fileRowId, file);
      const next = { ...docsSocio };
      next[tipo] = await withSignedUrls(await listDocs('socio', tipo));
      setDocsSocio(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha ao substituir');
    }
  }

  async function handleDeleteSocio(fileRowId: string, tipo: DocSocio) {
    if (!confirm('Apagar este ficheiro?')) return;
    try {
      await deleteDoc(fileRowId);
      const next = { ...docsSocio };
      next[tipo] = await withSignedUrls(await listDocs('socio', tipo));
      setDocsSocio(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha ao apagar');
    }
  }

  /* ---------- Ações Atleta ---------- */

  async function handleUploadAtleta(atletaId: string, tipo: DocAtleta, file: File) {
    try {
      const row = await uploadDoc('atleta', tipo, file, { atletaId, page: null });
      const next = { ...docsPorAtleta };
      next[atletaId][tipo] = await withSignedUrls(await listDocs('atleta', tipo, { atletaId }));
      setDocsPorAtleta(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha no upload');
    }
  }

  async function handleReplaceAtleta(atletaId: string, fileRowId: string, tipo: DocAtleta, file: File) {
    try {
      await replaceDoc(fileRowId, file);
      const next = { ...docsPorAtleta };
      next[atletaId][tipo] = await withSignedUrls(await listDocs('atleta', tipo, { atletaId }));
      setDocsPorAtleta(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha ao substituir');
    }
  }

  async function handleDeleteAtleta(atletaId: string, fileRowId: string, tipo: DocAtleta) {
    if (!confirm('Apagar este ficheiro?')) return;
    try {
      await deleteDoc(fileRowId);
      const next = { ...docsPorAtleta };
      next[atletaId][tipo] = await withSignedUrls(await listDocs('atleta', tipo, { atletaId }));
      setDocsPorAtleta(next);
    } catch (e: any) {
      setMsg(e.message || 'Falha ao apagar');
    }
  }

  /* ---------------- Migração DataURL -> Storage ---------------- */

  function openMigration() {
    setMigOpen(true);
  }

  async function runMigration() {
    setMigRunning(true);
    setMsg(null);
    try {
      const LS_KEY = 'bb_app_payments_v1';
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        setMsg('Não foram encontrados dados antigos para migrar.');
        setMigRunning(false);
        return;
      }
      const s = JSON.parse(raw);

      // docs do sócio: s.docsSocio: { [nomeDoc]: { name, dataUrl, uploadedAt } }
      if (s.docsSocio && typeof s.docsSocio === 'object') {
        for (const [nome, meta] of Object.entries<any>(s.docsSocio)) {
          if (meta?.dataUrl && meta?.name) {
            const f = await dataUrlToFile(meta.dataUrl, meta.name);
            await uploadDoc('socio', nome, f, { page: null });
          }
        }
      }

      // docs por atleta: s.docsAtleta: { [atletaId]: { [nomeDoc]: { name, dataUrl } } }
      if (s.docsAtleta && typeof s.docsAtleta === 'object') {
        for (const [athleteId, setByDoc] of Object.entries<any>(s.docsAtleta)) {
          if (setByDoc && typeof setByDoc === 'object') {
            for (const [nome, meta] of Object.entries<any>(setByDoc)) {
              if (meta?.dataUrl && meta?.name) {
                const f = await dataUrlToFile(meta.dataUrl, meta.name);
                await uploadDoc('atleta', nome, f, { atletaId: athleteId, page: null });
              }
            }
          }
        }
      }

      // pagamentos antigos não tratados aqui (apenas docs)
      setMsg('Migração concluída com sucesso.');
      // opcionalmente, limpar chaves antigas
      // localStorage.removeItem(LS_KEY);

      // refrescar listagens
      await refreshAll();
    } catch (e: any) {
      setMsg(e.message || 'Falha na migração');
    } finally {
      setMigRunning(false);
      setMigOpen(false);
    }
  }

  const socioMissingCount = useMemo(() => {
    let m = 0;
    for (const d of DOCS_SOCIO) if (!(docsSocio[d]?.length)) m++;
    return m;
  }, [docsSocio]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" /> Upload de Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ações topo */}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshAll} title="Atualizar">
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
          </Button>
          <Button variant="secondary" onClick={openMigration} title="Migrar DataURLs antigos">
            <HardDriveUpload className="h-4 w-4 mr-2" /> Migrar dados antigos (localStorage)
          </Button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>

        {/* Sócio */}
        <section>
          <div className="font-medium">
            Documentos do Sócio ({perfilNome || contaEmail || 'Conta'})
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
            {DOCS_SOCIO.map((tipo) => {
              const rows = docsSocio[tipo] || [];
              return (
                <div key={tipo} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{tipo}</div>
                      <div className="text-xs text-gray-500">
                        {rows.length ? `${rows.length} ficheiro(s)` : 'Em falta'}
                      </div>
                    </div>

                    {/* Picker hidden para este bloco */}
                    {socioPicker.InputEl}

                    <div className="flex gap-2">
                      <Button
                        variant={rows.length ? 'secondary' : 'outline'}
                        onClick={() => {
                          // anexar handler 1x e abrir
                          const el = socioPicker.ref.current!;
                          el.onchange = async (e: any) => {
                            const f: File | undefined = e.target.files?.[0];
                            if (!f) return;
                            await handleUploadSocio(tipo, f);
                          };
                          socioPicker.open();
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {rows.length ? 'Adicionar' : 'Carregar'}
                      </Button>
                    </div>
                  </div>

                  {rows.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {rows.map((r) => (
                        <li key={r.id} className="flex items-center justify-between rounded-md bg-gray-50 p-2">
                          <a
                            className="truncate underline text-sm"
                            href={r.signedUrl || '#'}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.file_name || r.path}
                          </a>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                const el = socioPicker.ref.current!;
                                el.onchange = async (e: any) => {
                                  const f: File | undefined = e.target.files?.[0];
                                  if (!f) return;
                                  await handleReplaceSocio(r.id, f, tipo);
                                };
                                socioPicker.open();
                              }}
                            >
                              <Replace className="h-4 w-4 mr-1" /> Substituir
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteSocio(r.id, tipo)}
                            >
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

        {/* Atletas */}
        <section className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas criados.</p>}

          {atletas.map((a) => {
            const byType = docsPorAtleta[a.id] || {};
            const missing = DOCS_ATLETA.filter((t) => !(byType[t]?.length)).length;

            return (
              <div key={a.id} className="border rounded-xl p-3">
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

                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map((tipo) => {
                    const rows = byType[tipo] || [];

                    return (
                      <div key={tipo} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{tipo}</div>
                            <div className="text-xs text-gray-500">
                              {rows.length ? `${rows.length} ficheiro(s)` : 'Em falta'}
                            </div>
                          </div>

                          {/* Picker hidden reusável para atleta */}
                          {atletaPicker.InputEl}

                          <div className="flex gap-2">
                            <Button
                              variant={rows.length ? 'secondary' : 'outline'}
                              onClick={() => {
                                const el = atletaPicker.ref.current!;
                                el.onchange = async (e: any) => {
                                  const f: File | undefined = e.target.files?.[0];
                                  if (!f) return;
                                  await handleUploadAtleta(a.id, tipo, f);
                                };
                                atletaPicker.open();
                              }}
                            >
                              <Upload className="h-4 w-4 mr-1" />
                              {rows.length ? 'Adicionar' : 'Carregar'}
                            </Button>
                          </div>
                        </div>

                        {rows.length > 0 && (
                          <ul className="mt-3 space-y-2">
                            {rows.map((r) => (
                              <li key={r.id} className="flex items-center justify-between rounded-md bg-gray-50 p-2">
                                <a
                                  className="truncate underline text-sm"
                                  href={r.signedUrl || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.file_name || r.path}
                                </a>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => {
                                      const el = atletaPicker.ref.current!;
                                      el.onchange = async (e: any) => {
                                        const f: File | undefined = e.target.files?.[0];
                                        if (!f) return;
                                        await handleReplaceAtleta(a.id, r.id, tipo, f);
                                      };
                                      atletaPicker.open();
                                    }}
                                  >
                                    <Replace className="h-4 w-4 mr-1" /> Substituir
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleDeleteAtleta(a.id, r.id, tipo)}
                                  >
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

      {/* Diálogo de migração */}
      <Dialog open={migOpen} onOpenChange={setMigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Migrar documentos antigos (localStorage → Storage)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Isto vai procurar ficheiros guardados localmente em DataURL (demo antiga) e carregá-los para o
            Storage privado, criando entradas na tabela <code>documentos</code>.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setMigOpen(false)} disabled={migRunning}>
              Cancelar
            </Button>
            <Button onClick={runMigration} disabled={migRunning}>
              {migRunning ? 'A migrar…' : 'Migrar agora'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

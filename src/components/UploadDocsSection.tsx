// src/components/UploadDocsSection.tsx
import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Upload, Trash2, RefreshCw, File as FileIcon } from 'lucide-react';

import {
  Documento,
  DocumentoFicheiro,
  DocumentoTipo,
  listDocumentos,
  listFicheiros,
  withSignedUrls,
  uploadDocumento,
  replaceDocumentoFile,
  deleteDocumentoFile,
} from '../services/documentosService';

type DocSocio = 'Ficha de Sócio' | 'Comprovativo de pagamento de sócio';
const DOCS_SOCIO: DocSocio[] = ['Ficha de Sócio', 'Comprovativo de pagamento de sócio'];

type DocAtleta =
  | 'Ficha de sócio de atleta'
  | 'Ficha de jogador FPB'
  | 'Ficha inscrição AAC'
  | 'Exame médico'
  | 'Comprovativo de pagamento de inscrição';

const DOCS_ATLETA: DocAtleta[] = [
  'Ficha de sócio de atleta',
  'Ficha de jogador FPB',
  'Ficha inscrição AAC',
  'Exame médico',
  'Comprovativo de pagamento de inscrição',
];

export default function UploadDocsSection({
  state,
}: {
  state: any; // usa o state do teu App; precisa de state.perfil?.id e state.atletas (id,nomeCompleto,escalao)
}) {
  const pessoaId = state?.perfil?.id ?? null;

  // Sócio
  const [docsSocio, setDocsSocio] = useState<Record<DocSocio, Documento & { ficheiros: DocumentoFicheiro[] } | null>>({
    'Ficha de Sócio': null,
    'Comprovativo de pagamento de sócio': null,
  });

  // Atleta -> tipo -> documento
  const [docsAtleta, setDocsAtleta] = useState<
    Record<string, Record<DocAtleta, (Documento & { ficheiros: DocumentoFicheiro[] }) | null>>
  >({});

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reloadSocio() {
    if (!pessoaId) return;
    const all = await listDocumentos('socio', { pessoaId });
    const out: typeof docsSocio = { 'Ficha de Sócio': null, 'Comprovativo de pagamento de sócio': null };
    for (const tipo of DOCS_SOCIO) {
      const doc = all.find((d) => d.nome === tipo) ?? null;
      if (!doc) { out[tipo] = null; continue; }
      const files = await withSignedUrls(await listFicheiros(doc.id));
      out[tipo] = { ...doc, ficheiros: files };
    }
    setDocsSocio(out);
  }

  async function reloadAtletas() {
    const base: typeof docsAtleta = {};
    for (const a of state.atletas || []) {
      const all = await listDocumentos('atleta', { atletaId: a.id });
      const map: Record<DocAtleta, (Documento & { ficheiros: DocumentoFicheiro[] }) | null> = {
        'Ficha de sócio de atleta': null,
        'Ficha de jogador FPB': null,
        'Ficha inscrição AAC': null,
        'Exame médico': null,
        'Comprovativo de pagamento de inscrição': null,
      };
      for (const tipo of DOCS_ATLETA) {
        const doc = all.find((d) => d.nome === tipo) ?? null;
        if (!doc) { map[tipo] = null; continue; }
        const files = await withSignedUrls(await listFicheiros(doc.id));
        map[tipo] = { ...doc, ficheiros: files };
      }
      base[a.id] = map;
    }
    setDocsAtleta(base);
  }

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      await Promise.all([reloadSocio(), reloadAtletas()]);
    } catch (e: any) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((state.atletas || []).map((x: any) => x.id)), pessoaId]);

  // --------- Ações ---------
  async function doUploadSocio(tipo: DocSocio, files: FileList) {
    if (!pessoaId || !files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento('socio', tipo, f, { pessoaId });
      }
      await reloadSocio();
    } catch (e: any) {
      setMsg(`Erro no upload (sócio): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function doUploadAtleta(atletaId: string, tipo: DocAtleta, files: FileList) {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento('atleta', tipo, f, { atletaId });
      }
      await reloadAtletas();
    } catch (e: any) {
      setMsg(`Erro no upload (atleta): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function doReplace(fileId: string, file: File) {
    setBusy(true);
    try {
      await replaceDocumentoFile(fileId, file);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro ao substituir: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(fileId: string) {
    if (!confirm('Apagar este ficheiro?')) return;
    setBusy(true);
    try {
      await deleteDocumentoFile(fileId);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro ao apagar: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Upload de Documentos</CardTitle>
        <Button variant="secondary" onClick={refresh} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Recarregar
        </Button>
      </CardHeader>

      <CardContent className="space-y-8">
        {msg && <p className="text-sm text-red-600">{msg}</p>}

        {/* Sócio */}
        <section>
          <div className="font-medium mb-2">Documentos do Sócio</div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map((tipo) => {
              const doc = docsSocio[tipo];
              return (
                <div key={tipo} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{tipo}</div>
                    <FileTrigger
                      multiple
                      disabled={busy || !pessoaId}
                      label="Carregar"
                      leftIcon={<Upload className="h-4 w-4 mr-1" />}
                      onPick={(files) => doUploadSocio(tipo, files)}
                    />
                  </div>
                  <DocList doc={doc} onReplace={doReplace} onDelete={doDelete} busy={busy} />
                </div>
              );
            })}
          </div>
        </section>

        {/* Atletas */}
        <section className="space-y-4">
          <div className="font-medium">Documentos por Atleta</div>
          {(state.atletas || []).length === 0 ? (
            <p className="text-sm text-gray-500">Sem atletas criados.</p>
          ) : (
            (state.atletas || []).map((a: any) => (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="mb-2 font-medium">
                  {a.nomeCompleto} — Escalão: {a.escalao}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {DOCS_ATLETA.map((tipo) => {
                    const doc = docsAtleta[a.id]?.[tipo] ?? null;
                    return (
                      <div key={tipo} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{tipo}</div>
                          <FileTrigger
                            multiple
                            disabled={busy}
                            label="Carregar"
                            leftIcon={<Upload className="h-4 w-4 mr-1" />}
                            onPick={(files) => doUploadAtleta(a.id, tipo, files)}
                          />
                        </div>
                        <DocList doc={doc} onReplace={doReplace} onDelete={doDelete} busy={busy} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/* ---------- Lista de ficheiros por documento ---------- */

function DocList({
  doc,
  onReplace,
  onDelete,
  busy,
}: {
  doc: (Documento & { ficheiros: DocumentoFicheiro[] }) | null;
  onReplace: (fileId: string, file: File) => void;
  onDelete: (fileId: string) => void;
  busy: boolean;
}) {
  if (!doc || !doc.ficheiros?.length) {
    return <p className="text-sm text-gray-500">Sem ficheiros.</p>;
  }
  return (
    <div className="space-y-2">
      {doc.ficheiros.map((f) => (
        <div key={f.id} className="flex items-center justify-between border rounded-md p-2">
          <div className="text-sm">
            <div className="font-medium flex items-center">
              <FileIcon className="h-4 w-4 mr-2" />
              {f.file_name || f.path.split('/').pop()}
            </div>
            {f.signedUrl && (
              <a href={f.signedUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                Abrir
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SingleFileTrigger
              disabled={busy}
              label="Substituir"
              leftIcon={<Upload className="h-4 w-4 mr-1" />}
              onPickOne={(file) => onReplace(f.id, file)}
            />
            <Button variant="destructive" disabled={busy} onClick={() => onDelete(f.id)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Apagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Botões de upload com ref (sem display:none) ---------- */

function FileTrigger({
  multiple,
  disabled,
  onPick,
  label,
  leftIcon,
}: {
  multiple?: boolean;
  disabled?: boolean;
  onPick: (files: FileList) => void;
  label: string;
  leftIcon?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        multiple={!!multiple}
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) onPick(fs);
          e.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="outline" disabled={disabled} onClick={() => ref.current?.click()}>
        {leftIcon}
        {label}
      </Button>
    </>
  );
}

function SingleFileTrigger({
  disabled,
  onPickOne,
  label,
  leftIcon,
}: {
  disabled?: boolean;
  onPickOne: (file: File) => void;
  label: string;
  leftIcon?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickOne(f);
          e.currentTarget.value = '';
        }}
      />
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => ref.current?.click()}>
        {leftIcon}
        {label}
      </Button>
    </>
  );
}

// src/components/UploadDocsSection.tsx
import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Upload, Trash2, RefreshCw } from 'lucide-react';

import {
  listDocumentos,
  uploadDocumento,
  replaceDocumento,
  deleteDocumento,
  withSignedUrls,
  type Documento,
} from '../services/documentosService';

import {
  migrarDocumentosLocais,
  jaMigrado,
} from '../services/migracaoDocumentos';

// --- Tipos/constantes locais ---
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

// Limpeza do estado local antigo após migração
function limparDataUrlsAntigos(nextState: any) {
  nextState.docsSocio = {};
  nextState.docsAtleta = {};
}

// ---------- Pequenos componentes utilitários ----------
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
        className="hidden"
        multiple={!!multiple}
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) onPick(fs);
          // permitir re-escolher o mesmo ficheiro
          e.currentTarget.value = '';
        }}
      />
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
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
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickOne(f);
          e.currentTarget.value = '';
        }}
      />
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        {leftIcon}
        {label}
      </Button>
    </>
  );
}
// ------------------------------------------------------

export default function UploadDocsSection({
  state,
  setState,
}: {
  state: any;
  setState: (s: any) => void;
}) {
  const [docsSocio, setDocsSocio] = useState<Record<DocSocio, Documento[]>>({
    'Ficha de Sócio': [],
    'Comprovativo de pagamento de sócio': [],
  });

  // Por atleta: { [atletaId]: { [docTipo]: Documento[] } }
  const [docsAtleta, setDocsAtleta] = useState<Record<string, Record<DocAtleta, Documento[]>>>(
    {},
  );

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      // Sócio
      const socioEntries = await Promise.all(
        DOCS_SOCIO.map(async (t) => {
          const rows = await listDocumentos('socio', t);
          const withUrls = await withSignedUrls(rows);
          return [t, withUrls] as const;
        }),
      );
      setDocsSocio(Object.fromEntries(socioEntries) as Record<DocSocio, Documento[]>);

      // Atletas
      const atl: Record<string, Record<DocAtleta, Documento[]>> = {};
      for (const a of state.atletas || []) {
        atl[a.id] = {} as Record<DocAtleta, Documento[]>;
        for (const t of DOCS_ATLETA) {
          const rows = await listDocumentos('atleta', t, a.id);
          atl[a.id][t] = await withSignedUrls(rows);
        }
      }
      setDocsAtleta(atl);
    } catch (e: any) {
      setMsg(`Erro ao carregar documentos: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((state.atletas || []).map((x: any) => x.id))]);

  // --- Handlers Sócio / Atleta ---
  async function uploadSocio(tipo: DocSocio, files: FileList) {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento('socio', tipo, f);
      }
      await refresh();
    } catch (e: any) {
      setMsg(`Erro no upload (sócio): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAtleta(atletaId: string, tipo: DocAtleta, files: FileList) {
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        await uploadDocumento('atleta', tipo, f, { atletaId });
      }
      await refresh();
    } catch (e: any) {
      setMsg(`Erro no upload (atleta): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function replaceOne(id: string, file: File) {
    setBusy(true);
    try {
      await replaceDocumento(id, file);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro ao substituir: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeOne(id: string) {
    if (!confirm('Apagar este ficheiro?')) return;
    setBusy(true);
    try {
      await deleteDocumento(id);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro ao apagar: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  // --- Migração DataURLs → Storage/BD ---
  async function handleMigracao() {
    if (jaMigrado()) {
      setMsg('Migração já executada anteriormente. (Podes limpar os DataURLs locais com segurança.)');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const rel = await migrarDocumentosLocais({
        docsSocio: state.docsSocio || {},
        docsAtleta: state.docsAtleta || {},
        atletas: state.atletas || [],
      });
      // Limpa DataURLs locais se não houve falhas
      if (rel.falhas === 0) {
        const next = { ...state };
        limparDataUrlsAntigos(next);
        setState(next); // o teu App já persiste no localStorage ao mudar o state
      }
      setMsg(`Migração: ${rel.sucesso}/${rel.total} OK, ${rel.falhas} falha(s).`);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro na migração: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Upload de Documentos</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={refresh} disabled={busy}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Recarregar
          </Button>
          <Button variant="outline" onClick={handleMigracao} disabled={busy}>
            <Upload className="h-4 w-4 mr-1" />
            Migrar ficheiros locais
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {msg && <p className="text-sm">{msg}</p>}

        {/* Documentos do Sócio */}
        <section>
          <div className="font-medium mb-2">Documentos do Sócio</div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map((tipo) => (
              <div key={tipo} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{tipo}</div>
                  <FileTrigger
                    multiple
                    disabled={busy}
                    label="Carregar"
                    leftIcon={<Upload className="h-4 w-4 mr-1" />}
                    onPick={(files) => uploadSocio(tipo, files)}
                  />
                </div>
                <DocList
                  items={docsSocio[tipo] || []}
                  onReplace={replaceOne}
                  onDelete={removeOne}
                  busy={busy}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Documentos por Atleta */}
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
                  {DOCS_ATLETA.map((tipo) => (
                    <div key={tipo} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{tipo}</div>
                        <FileTrigger
                          multiple
                          disabled={busy}
                          label="Carregar"
                          leftIcon={<Upload className="h-4 w-4 mr-1" />}
                          onPick={(files) => uploadAtleta(a.id, tipo, files)}
                        />
                      </div>
                      <DocList
                        items={(docsAtleta[a.id]?.[tipo] || []) as Documento[]}
                        onReplace={replaceOne}
                        onDelete={removeOne}
                        busy={busy}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function DocList({
  items,
  onReplace,
  onDelete,
  busy,
}: {
  items: Documento[];
  onReplace: (id: string, f: File) => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-500">Sem ficheiros.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="flex items-center justify-between border rounded-md p-2">
          <div className="text-sm">
            <div className="font-medium">
              Página {it.page} — {it.file_name}
            </div>
            {it.signedUrl ? (
              <a
                href={it.signedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline"
              >
                Abrir
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <SingleFileTrigger
              disabled={busy}
              label="Substituir"
              leftIcon={<Upload className="h-4 w-4 mr-1" />}
              onPickOne={(file) => onReplace(it.id, file)}
            />
            <Button variant="destructive" onClick={() => onDelete(it.id)} disabled={busy}>
              <Trash2 className="h-4 w-4 mr-1" />
              Apagar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

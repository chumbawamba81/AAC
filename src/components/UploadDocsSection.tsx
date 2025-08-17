// src/components/UploadDocsSection.tsx
import { useEffect, useState } from 'react';
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

// --- Tipos/constantes locais (alinha com o que tens no resto da app) ---
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

// Pequena ajuda para limpar os DataURLs locais antigos após migração com sucesso
function limparDataUrlsAntigos(nextState: any) {
  nextState.docsSocio = {};
  nextState.docsAtleta = {};
}

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
    // Recarrega quando a lista de atletas muda
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify((state.atletas || []).map((x: any) => x.id))]);

  // --- Handlers Sócio / Atleta ---
  async function uploadSocio(tipo: DocSocio, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadDocumento('socio', tipo, f);
      await refresh();
    } catch (e: any) {
      setMsg(`Erro no upload (sócio): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadAtleta(atletaId: string, tipo: DocAtleta, files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await uploadDocumento('atleta', tipo, f, { atletaId });
      await refresh();
    } catch (e: any) {
      setMsg(`Erro no upload (atleta): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  async function replaceOne(id: string, file: File | null) {
    if (!file) return;
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
      setBusy(false

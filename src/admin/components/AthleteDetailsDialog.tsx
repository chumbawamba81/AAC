// src/admin/components/AthleteDetailsDialog.tsx
import React, { useEffect, useRef, useState } from "react";
import { X, Link as LinkIcon, FileText, FileCheck2, CreditCard, Edit, Upload } from "lucide-react";
import {
  listDocsByAtleta,
  listPagamentosByAtleta,
  displayFileName,
  DocumentoRow,
  PagamentoRow,
  DOCS_ATLETA,
  TitularMinimal,
  AtletaRow,
} from "../services/adminAtletasService";
import { uploadDoc } from "../../services/documentosService";
import { uploadComprovativoForPagamento } from "../services/adminPagamentosService";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/MiniToast";

type Props = {
  open: boolean;
  onClose: () => void;
  atleta: AtletaRow;
  titular?: TitularMinimal;
  onEdit?: () => void;
};

type Tab = "dados" | "docs" | "pag";

const DOC_TIPO_INSCRICAO_ATLETA = "Comprovativo de pagamento de inscrição";

/* --------------------- helpers --------------------- */
const isBlank = (v: any) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

const fmtDate = (d?: string | null) =>
  isBlank(d) ? "" : new Date(String(d)).toLocaleDateString("pt-PT");

function FieldIf({
  label,
  value,
  className = "",
  fmt,
}: {
  label: string;
  value: any;
  className?: string;
  fmt?: (v: any) => React.ReactNode;
}) {
  if (isBlank(value)) return null;
  return (
    <div className={["space-y-1", className].join(" ")}>
      <div className="text-left text-xs font-semibold text-heading underline decoration-success decoration-dotted">{label}</div>
      <div className="text-sm">{fmt ? fmt(value) : value}</div>
    </div>
  );
}

/* --------------------- componente --------------------- */
const DOC_TIPOS_TAB = DOCS_ATLETA.filter((t) => String(t) !== DOC_TIPO_INSCRICAO_ATLETA);

export default function AthleteDetailsDialog({ open, onClose, atleta, titular, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>("dados");
  const [docs, setDocs] = useState<DocumentoRow[]>([]);
  const [pags, setPags] = useState<PagamentoRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingPags, setLoadingPags] = useState(false);
  const [uploadingDocTipo, setUploadingDocTipo] = useState<string | null>(null);
  const [uploadingPagamentoId, setUploadingPagamentoId] = useState<string | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const pagFileRef = useRef<HTMLInputElement>(null);
  const docTipoRef = useRef<string | null>(null);
  const pagamentoIdRef = useRef<string | null>(null);

  async function loadDocs() {
    if (!atleta.user_id) return;
    setLoadingDocs(true);
    try {
      const all = await listDocsByAtleta(atleta.user_id, atleta.id);
      setDocs(all);
    } catch {
      setDocs([]);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function loadPags() {
    setLoadingPags(true);
    try {
      const pg = await listPagamentosByAtleta(atleta.id);
      setPags(pg);
    } catch {
      setPags([]);
    } finally {
      setLoadingPags(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadDocs();
    loadPags();
  }, [open, atleta.id]);

  async function handleDocUpload(tipo: string, file: File) {
    if (!atleta.user_id) {
      showToast("Atleta sem titular associado; não é possível carregar documentos.", "err");
      return;
    }
    setUploadingDocTipo(tipo);
    try {
      await uploadDoc({
        nivel: "atleta",
        userId: atleta.user_id,
        atletaId: atleta.id,
        tipo,
        file,
      });
      await loadDocs();
      showToast(`Documento "${tipo}" carregado.`, "ok");
    } catch (e) {
      showToast((e as Error)?.message || "Falha no carregamento do documento", "err");
    } finally {
      setUploadingDocTipo(null);
      if (docFileRef.current) docFileRef.current.value = "";
    }
  }

  async function handlePagamentoUpload(pagamentoId: string, file: File) {
    setUploadingPagamentoId(pagamentoId);
    try {
      await uploadComprovativoForPagamento({
        pagamentoId,
        atletaId: atleta.id,
        userId: atleta.user_id ?? null,
        file,
      });
      await loadPags();
      showToast("Comprovativo carregado.", "ok");
    } catch (e) {
      showToast((e as Error)?.message || "Falha no carregamento do comprovativo", "err");
    } finally {
      setUploadingPagamentoId(null);
      if (pagFileRef.current) pagFileRef.current.value = "";
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white shadow-xl w-[95vw] max-w-4xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between flex-none bg-amber-500 text-white">
          <div className="font-semibold">Atleta · {atleta.nome}</div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button
                id="edit-atleta-button"
                variant="destructive"
                onClick={onEdit}
                aria-label="Editar"
              >
                <Edit className="h-4 w-4" />
                Editar
              </Button>
            )}
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3 flex-none">
          <div className="flex gap-2 text-sm mb-3">
            <button
              className={`px-3 py-1.5 rounded ${tab === "dados" ? "bg-black text-white" : "bg-gray-100"}`}
              onClick={() => setTab("dados")}
            >
              <FileText className="inline h-4 w-4 mr-1" />
              Dados
            </button>
            <button
              className={`px-3 py-1.5 rounded ${tab === "docs" ? "bg-black text-white" : "bg-gray-100"}`}
              onClick={() => setTab("docs")}
            >
              <FileCheck2 className="inline h-4 w-4 mr-1" />
              Documentos
            </button>
            <button
              className={`px-3 py-1.5 rounded ${tab === "pag" ? "bg-black text-white" : "bg-gray-100"}`}
              onClick={() => setTab("pag")}
            >
              <CreditCard className="inline h-4 w-4 mr-1" />
              Pagamentos
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0 overscroll-contain">
          {/* --- DADOS --- */}
          {tab === "dados" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Identificação e dados base */}
              <FieldIf label="Nome" value={atleta.nome} />
              {/* Género removido para consistência com MemberDetailsDialog */}
              <FieldIf label="Data de nascimento" value={atleta.data_nascimento} fmt={fmtDate} />
              <FieldIf label="Escalão" value={atleta.escalao} />
              <FieldIf label="Opção de pagamento" value={atleta.opcao_pagamento} />
              <FieldIf label="NIF" value={atleta.nif} />

              {/* Saúde e contactos */}
              <FieldIf className="md:col-span-2" label="Alergias / saúde" value={atleta.alergias} />
              <FieldIf className="md:col-span-2" label="Morada" value={atleta.morada} />
              <FieldIf label="Código postal" value={atleta.codigo_postal} />
              <FieldIf label="Contactos de urgência" value={atleta.contactos_urgencia} />

              {/* Emails/telefone */}
              <FieldIf className="md:col-span-2" label="Emails preferenciais" value={atleta.emails_preferenciais} />
              <FieldIf label="Email opcional" value={atleta.email_opc} />
              <FieldIf label="Telefone opcional" value={atleta.telefone_opc} />

              {/* Encarregados e família */}
              <FieldIf label="Encarregado de educação" value={atleta.encarregado_educacao} />
              <FieldIf label="Nome do pai" value={atleta.nome_pai} />
              <FieldIf label="Nome da mãe" value={atleta.nome_mae} />
              <FieldIf label="Parentesco — outro" value={atleta.parentesco_outro} />

              {/* Escola */}
              <FieldIf label="Escola" value={atleta.escola} />
              <FieldIf label="Ano de escolaridade" value={atleta.ano_escolaridade} />

              {/* Nacionalidade */}
              <FieldIf label="Nacionalidade" value={atleta.nacionalidade} />
              <FieldIf label="Nacionalidade — outra" value={atleta.nacionalidade_outra} />

              {/* Documento de identificação */}
              <FieldIf label="Tipo de documento" value={atleta.tipo_doc} />
              <FieldIf label="N.º documento" value={atleta.num_doc} />
              <FieldIf label="Validade do documento" value={atleta.validade_doc} fmt={fmtDate} />

              {/* Observações */}
              <FieldIf className="md:col-span-2" label="Observações" value={atleta.observacoes} />

              {/* Titular */}
              {(titular?.nome_completo || titular?.tipo_socio || titular?.email || titular?.telefone) && (
                <div className="md:col-span-2 border-t pt-3 mt-2">
                  <div className="font-medium mb-2">Titular/Encarregado de Educação</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <FieldIf label="Nome" value={titular?.nome_completo} />
                    <FieldIf label="Tipo de sócio" value={titular?.tipo_socio} />
                    <FieldIf label="Email" value={titular?.email} />
                    <FieldIf label="Telefone" value={titular?.telefone} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- DOCUMENTOS (exclui comprovativo de inscrição) --- */}
          {tab === "docs" && (
            <div className="space-y-3">
              <input
                type="file"
                ref={docFileRef}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const tipo = docTipoRef.current;
                  if (file && tipo) handleDocUpload(tipo, file);
                  docTipoRef.current = null;
                }}
              />
              {loadingDocs ? (
                <p className="text-sm text-gray-500">A carregar documentos…</p>
              ) : !atleta.user_id ? (
                <p className="text-sm text-amber-600">Sem titular associado; não é possível carregar documentos.</p>
              ) : (
                <>
                  {DOC_TIPOS_TAB.map((tipo) => {
                    const files = docs.filter((d) => d.doc_tipo === tipo);
                    const isUploading = uploadingDocTipo === tipo;
                    return (
                      <div key={String(tipo)} className="border rounded-lg p-3">
                        <div className="font-medium mb-2 flex items-center justify-between gap-2 flex-wrap">
                          <span>{String(tipo)}</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploading}
                            onClick={() => {
                              docTipoRef.current = tipo;
                              docFileRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {isUploading ? "A carregar…" : "Carregar documento"}
                          </Button>
                        </div>
                        {files.length === 0 ? (
                          <p className="text-sm text-gray-500">Sem ficheiros.</p>
                        ) : (
                          <ul className="space-y-2">
                            {files.map((row) => (
                              <li key={row.id} className="flex items-center justify-between">
                                <div className="text-sm flex items-center gap-2 min-w-0">
                                  <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5 shrink-0">
                                    {(row.page ?? 0) > 0 ? `Ficheiro ${row.page}` : "Ficheiro"}
                                  </span>
                                  {(row as any).signedUrl ? (
                                    <a
                                      href={(row as any).signedUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline inline-flex items-center gap-1 truncate"
                                      title={displayFileName(row)}
                                    >
                                      <LinkIcon className="h-4 w-4 shrink-0" />
                                      <span className="truncate">{displayFileName(row)}</span>
                                    </a>
                                  ) : (
                                    <span className="text-gray-500">{displayFileName(row)}</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* --- PAGAMENTOS (inclui comprovativos) --- */}
          {tab === "pag" && (
            <div className="space-y-3">
              <input
                type="file"
                ref={pagFileRef}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const id = pagamentoIdRef.current;
                  if (file && id) handlePagamentoUpload(id, file);
                  pagamentoIdRef.current = null;
                }}
              />
              {loadingPags ? (
                <p className="text-sm text-gray-500">A carregar pagamentos…</p>
              ) : pags.length === 0 ? (
                <p className="text-sm text-gray-500">Sem pagamentos registados.</p>
              ) : (
                <ul className="space-y-2">
                  {pags.map((p) => {
                    const due = (p as any)?.devido_em as string | null | undefined;
                    const signed = (p as any)?.signedUrl as string | null | undefined;
                    const isUploading = uploadingPagamentoId === p.id;
                    return (
                      <li key={p.id} className="border rounded-lg p-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm min-w-0">
                          <div className="font-medium">{p.descricao}</div>
                          <div className="text-xs text-gray-500">
                            {fmtDate(due) ? `Devido em: ${fmtDate(due)} · ` : ""}
                            {fmtDate(p.created_at) ? `Registado: ${fmtDate(p.created_at)}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {signed ? (
                            <>
                              <a className="underline inline-flex items-center gap-1 text-sm" href={signed} target="_blank" rel="noreferrer">
                                <LinkIcon className="h-4 w-4" />
                                Abrir
                              </a>
                              {p.created_at && (
                                <span className="text-xs text-gray-500">Carregado em: {fmtDate(p.created_at)}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-500">Sem ficheiro</span>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isUploading}
                            onClick={() => {
                              pagamentoIdRef.current = p.id;
                              pagFileRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {isUploading ? "A carregar…" : "Carregar comprovativo"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

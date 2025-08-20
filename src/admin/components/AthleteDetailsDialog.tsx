// src/admin/components/AthleteDetailsDialog.tsx
import React, { useEffect, useState } from "react";
import { X, Link as LinkIcon, FileText, FileCheck2, CreditCard } from "lucide-react";
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

type Props = {
  open: boolean;
  onClose: () => void;
  atleta: AtletaRow;
  titular?: TitularMinimal;
};

type Tab = "dados" | "docs" | "pag";

// Nome do tipo exatamente como usado na tua app/tabela
const DOC_TIPO_COMPROVATIVO_INSCRICAO = "Comprovativo de pagamento de inscrição";

export default function AthleteDetailsDialog({ open, onClose, atleta, titular }: Props) {
  const [tab, setTab] = useState<Tab>("dados");
  const [docs, setDocs] = useState<DocumentoRow[]>([]);
  const [pags, setPags] = useState<PagamentoRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingPags, setLoadingPags] = useState(false);

  useEffect(() => {
    if (!open) return;
    // docs
    (async () => {
      if (!atleta.user_id) return;
      setLoadingDocs(true);
      try {
        setDocs(await listDocsByAtleta(atleta.user_id, atleta.id));
      } catch {
        setDocs([]);
      } finally {
        setLoadingDocs(false);
      }
    })();
    // pagamentos
    (async () => {
      setLoadingPags(true);
      try {
        setPags(await listPagamentosByAtleta(atleta.id));
      } catch {
        setPags([]);
      } finally {
        setLoadingPags(false);
      }
    })();
  }, [open, atleta]);

  if (!open) return null;

  // Documentos excepto “Comprovativo de pagamento de inscrição”
  const docsSemComprovativoInscricao = docs.filter((d) => d.doc_tipo !== DOC_TIPO_COMPROVATIVO_INSCRICAO);
  // Documentos que são “Comprovativo de pagamento de inscrição” (para mostrar em Pagamentos)
  const docsComprovativoInscricao = docs.filter((d) => d.doc_tipo === DOC_TIPO_COMPROVATIVO_INSCRICAO);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Atleta · {atleta.nome}</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 pt-3">
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

        {/* Conteúdo com scroll */}
        <div className="px-4 pb-4 overflow-y-auto flex-1">
          {tab === "dados" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome">{atleta.nome}</Field>
              <Field label="Género">{atleta.genero || "—"}</Field>
              <Field label="Data de nascimento">{atleta.data_nascimento}</Field>
              <Field label="Escalão">{atleta.escalao || "—"}</Field>
              <Field label="Opção de pagamento">{atleta.opcao_pagamento || "—"}</Field>
              <Field label="NIF">{atleta.nif || "—"}</Field>
              <Field className="md:col-span-2" label="Alergias / saúde">
                {atleta.alergias || "—"}
              </Field>
              <Field className="md:col-span-2" label="Morada">
                {atleta.morada || "—"}
              </Field>
              <Field label="Código postal">{atleta.codigo_postal || "—"}</Field>
              <Field label="Contactos urgência">{atleta.contactos_urgencia || "—"}</Field>
              <Field className="md:col-span-2" label="Emails preferenciais">
                {atleta.emails_preferenciais || "—"}
              </Field>
              <div className="md:col-span-2 border-t pt-3 mt-2">
                <div className="font-medium mb-2">Titular</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Nome">{titular?.nome_completo || "—"}</Field>
                  <Field label="Tipo de sócio">{titular?.tipo_socio || "—"}</Field>
                  <Field label="Email">{titular?.email || "—"}</Field>
                  <Field label="Telefone">{titular?.telefone || "—"}</Field>
                </div>
              </div>
            </div>
          )}

          {tab === "docs" && (
            <div className="space-y-3">
              {loadingDocs ? (
                <p className="text-sm text-gray-500">A carregar documentos…</p>
              ) : (
                <>
                  {(
                    // esconder o “Comprovativo de pagamento de inscrição”
                    DOCS_ATLETA.filter((tipo) => tipo !== DOC_TIPO_COMPROVATIVO_INSCRICAO)
                  ).map((tipo) => {
                    const files = docsSemComprovativoInscricao.filter((d) => d.doc_tipo === tipo);
                    return (
                      <div key={tipo} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">{tipo}</div>
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
                                  {row.signedUrl ? (
                                    <a
                                      href={row.signedUrl}
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

          {tab === "pag" && (
            <div className="space-y-4">
              {/* Secção extra: Comprovativo(s) de pagamento de inscrição (vindos de Documentos) */}
              {loadingDocs ? (
                <p className="text-sm text-gray-500">A verificar comprovativos…</p>
              ) : docsComprovativoInscricao.length > 0 ? (
                <div className="border rounded-lg p-3">
                  <div className="font-medium mb-2">Comprovativo(s) de pagamento de inscrição</div>
                  <ul className="space-y-2">
                    {docsComprovativoInscricao.map((row) => (
                      <li key={row.id} className="flex items-center justify-between">
                        <div className="text-sm flex items-center gap-2 min-w-0">
                          <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5 shrink-0">
                            {(row.page ?? 0) > 0 ? `Ficheiro ${row.page}` : "Ficheiro"}
                          </span>
                          {row.signedUrl ? (
                            <a
                              href={row.signedUrl}
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
                        <div className="text-xs text-gray-500">
                          {/* uploaded_at pode estar em DocumentoRow; se não estiver, mostra “—” */}
                          {("uploaded_at" in row && (row as any).uploaded_at) || "—"}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Secção de pagamentos (tabela original) */}
              {loadingPags ? (
                <p className="text-sm text-gray-500">A carregar pagamentos…</p>
              ) : pags.length === 0 ? (
                <p className="text-sm text-gray-500">Sem pagamentos registados.</p>
              ) : (
                <ul className="space-y-2">
                  {pags.map((p) => (
                    <li key={p.id} className="border rounded-lg p-2 flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{p.descricao}</div>
                        <div className="text-xs text-gray-500">{p.created_at || "—"}</div>
                      </div>
                      {p.signedUrl ? (
                        <a
                          className="underline inline-flex items-center gap-1"
                          href={p.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <LinkIcon className="h-4 w-4" />
                          Abrir
                        </a>
                      ) : (
                        <span className="text-xs text-gray-500">Sem ficheiro</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={["space-y-1", className].join(" ")}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

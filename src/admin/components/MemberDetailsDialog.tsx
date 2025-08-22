import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Link as LinkIcon, RefreshCw } from "lucide-react";

import {
  listDocs,
  withSignedUrls,
  groupByTipo,
  displayName,
  type DocumentoRow,
} from "../services/adminDocumentosService";

/* ---------------------------- Tipos de entrada ---------------------------- */

export type MemberRow = {
  user_id: string;
  nome_completo?: string | null;
  email?: string | null;
  telefone?: string | null;
  codigo_postal?: string | null;
  tipo_socio?: string | null;
};

/* --------------------------------- Helpers -------------------------------- */

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

function InscricaoBadge({ status }: { status: InscStatus }) {
  const map = {
    Regularizado: "bg-green-100 text-green-800",
    "Pendente de validação": "bg-yellow-100 text-yellow-800",
    "Por regularizar": "bg-gray-100 text-gray-800",
    "Em atraso": "bg-red-100 text-red-800",
  } as const;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>{status}</span>;
}

function deriveInscStatus(row: { validado?: boolean | null; comprovativo_url?: string | null; devido_em?: string | null }): InscStatus {
  const validado = !!row.validado;
  const comprovativo = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;
  if (validado) return "Regularizado";
  if (comprovativo) return "Pendente de validação";
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-PT");
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-500">{children}</div>;
}
function Value({ children }: { children: React.ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

/* -------------------------------- Componente ------------------------------- */

export default function MemberDetailsDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberRow;
}) {
  const userId = member.user_id;

  // Perfil completo (dados_pessoais)
  const [perfil, setPerfil] = useState<any | null>(null);

  // Inscrição de sócio
  const isSocio =
    !!(member.tipo_socio || "").toLowerCase().includes("sócio") &&
    !(member.tipo_socio || "").toLowerCase().includes("não pretendo");
  const [inscStatus, setInscStatus] = useState<InscStatus | null>(null);
  const [inscDue, setInscDue] = useState<string | null>(null);
  const [inscComprov, setInscComprov] = useState<string | null>(null);

  // Atletas do titular
  const [athletes, setAthletes] = useState<any[]>([]);
  const [loadingAth, setLoadingAth] = useState(false);

  // Documentos do Sócio e por Atleta
  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  const [loadingSocio, setLoadingSocio] = useState(false);
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});
  const [loadingDocsByAth, setLoadingDocsByAth] = useState(false);

  /* ------------------------------ Loads ------------------------------ */

  async function fetchPerfil() {
    const { data, error } = await supabase
      .from("dados_pessoais")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[MemberDetailsDialog] dados_pessoais:", error);
      setPerfil(null);
    } else {
      setPerfil(data ?? null);
    }
  }

  async function fetchAthletes() {
    setLoadingAth(true);
    try {
      const { data, error } = await supabase
        .from("atletas")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setAthletes(Array.isArray(data) ? data : []);
    } finally {
      setLoadingAth(false);
    }
  }

  async function fetchSocioDocs() {
    setLoadingSocio(true);
    try {
      const rows = await listDocs({ nivel: "socio", userId });
      const rowsWithUrls = await withSignedUrls(rows);
      setSocioDocs(groupByTipo(rowsWithUrls));
    } finally {
      setLoadingSocio(false);
    }
  }

  async function fetchDocsByAthlete(nextAthletes: any[]) {
    setLoadingDocsByAth(true);
    try {
      const next: Record<string, Map<string, DocumentoRow[]>> = {};
      for (const a of nextAthletes) {
        const rows = await listDocs({ nivel: "atleta", userId, atletaId: a.id });
        const withUrls = await withSignedUrls(rows);
        next[a.id] = groupByTipo(withUrls);
      }
      setAthDocs(next);
    } finally {
      setLoadingDocsByAth(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchPerfil().catch(console.error);
    fetchAthletes().then(() => fetchDocsByAthlete(athletes)).catch(console.error);
    fetchSocioDocs().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    fetchDocsByAthlete(athletes).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, athletes.map((a) => a.id).join(",")]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open || !isSocio) {
        setInscStatus(null);
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, validado, comprovativo_url, devido_em")
        .eq("user_id", userId)
        .is("atleta_id", null)
        .eq("tipo", "inscricao")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!mounted) return;
      if (error) {
        console.error("[MemberDetailsDialog] inscrição sócio:", error);
        setInscStatus(null);
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      const r = (data || [])[0];
      if (!r) {
        setInscStatus("Por regularizar");
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      setInscStatus(deriveInscStatus(r));
      setInscDue(r.devido_em ?? null);
      setInscComprov(r.comprovativo_url ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [open, userId, isSocio]);

  const hasSocioDocs = useMemo(() => {
    for (const arr of socioDocs.values()) if (arr.length) return true;
    return false;
  }, [socioDocs]);

  /* ----------------------------------- UI ----------------------------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detalhes do Titular
            <span className="block text-xs text-gray-500">
              {(perfil?.nome_completo || member.nome_completo || "—")} · {(perfil?.email || member.email || "—")} · Tipo de sócio:{" "}
              {(perfil?.tipo_socio || member.tipo_socio || "—")}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="atletas">Atletas</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
          </TabsList>

          {/* ------------------------------ Resumo ------------------------------ */}
          <TabsContent value="resumo">
            <Card>
              <CardHeader>
                <CardTitle>Dados do titular</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6 text-sm">
                <div>
                  <Label>Nome</Label>
                  <Value>{perfil?.nome_completo || "—"}</Value>
                </div>
                <div>
                  <Label>Email</Label>
                  <Value>{perfil?.email || "—"}</Value>
                </div>

                <div>
                  <Label>Telefone</Label>
                  <Value>{perfil?.telefone || "—"}</Value>
                </div>
                <div>
                  <Label>Data de nascimento</Label>
                  <Value>{perfil?.data_nascimento || "—"}</Value>
                </div>

                <div>
                  <Label>NIF</Label>
                  <Value>{perfil?.nif || "—"}</Value>
                </div>
                <div>
                  <Label>Profissão</Label>
                  <Value>{perfil?.profissao || "—"}</Value>
                </div>

                <div className="md:col-span-2">
                  <Label>Morada</Label>
                  <Value>{perfil?.morada || "—"}</Value>
                </div>

                <div>
                  <Label>Código postal</Label>
                  <Value>{perfil?.codigo_postal || "—"}</Value>
                </div>
                <div>
                  <Label>Tipo de documento</Label>
                  <Value>{perfil?.tipo_documento || "—"}</Value>
                </div>

                <div>
                  <Label>N.º documento</Label>
                  <Value>{perfil?.numero_documento || "—"}</Value>
                </div>
                <div>
                  <Label>Validade do documento</Label>
                  <Value>{fmtDate(perfil?.validade_documento)}</Value>
                </div>

                <div>
                  <Label>Tipo de sócio</Label>
                  <Value>{perfil?.tipo_socio || "—"}</Value>
                </div>
                <div>
                  <Label>Notícias</Label>
                  <Value>{perfil?.noticias || "—"}</Value>
                </div>

                {/* Situação de tesouraria = estado da inscrição de sócio */}
                <div className="md:col-span-2">
                  <Label>Inscrição de sócio</Label>
                  <Value>
                    {isSocio && inscStatus ? (
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <InscricaoBadge status={inscStatus} />
                        {inscDue && <span className="text-xs text-gray-500">Data limite: {fmtDate(inscDue)}</span>}
                        {inscComprov && (
                          <a
                            href={inscComprov}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline inline-flex items-center gap-1"
                          >
                            <LinkIcon className="h-3 w-3" /> Ver comprovativo
                          </a>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </Value>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ Atletas ----------------------------- */}
          <TabsContent value="atletas">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Atletas do titular</CardTitle>
                <Button
                  variant="outline"
                  onClick={() => fetchAthletes().then(() => fetchDocsByAthlete(athletes))}
                  disabled={loadingAth}
                >
                  {loadingAth ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Atualizar"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {athletes.length === 0 ? (
                  <p className="text-sm text-gray-500">Sem atletas associados.</p>
                ) : (
                  athletes.map((a) => (
                    <div key={a.id} className="border rounded-lg p-4">
                      <div className="text-base font-semibold mb-4">
                        {a.nome || "—"}
                      </div>
                      <div className="grid md:grid-cols-2 gap-6 text-sm">
                        <div>
                          <Label>Data de nascimento</Label>
                          <Value>{a.data_nascimento || "—"}</Value>
                        </div>
                        <div>
                          <Label>Escalão</Label>
                          <Value>{a.escalao || "—"}</Value>
                        </div>

                        <div>
                          <Label>Género</Label>
                          <Value>{a.genero || "—"}</Value>
                        </div>
                        <div>
                          <Label>NIF</Label>
                          <Value>{a.nif || "—"}</Value>
                        </div>

                        <div>
                          <Label>Opção de pagamento</Label>
                          <Value>{a.opcao_pagamento || "—"}</Value>
                        </div>
                        <div>
                          <Label>Tipo de documento</Label>
                          <Value>{a.tipo_doc || "—"}</Value>
                        </div>

                        <div>
                          <Label>N.º documento</Label>
                          <Value>{a.num_doc || "—"}</Value>
                        </div>
                        <div>
                          <Label>Validade do documento</Label>
                          <Value>{fmtDate(a.validade_doc)}</Value>
                        </div>

                        <div className="md:col-span-2">
                          <Label>Alergias / saúde</Label>
                          <Value>{a.alergias || "—"}</Value>
                        </div>

                        <div className="md:col-span-2">
                          <Label>Morada</Label>
                          <Value>{a.morada || "—"}</Value>
                        </div>

                        <div>
                          <Label>Código postal</Label>
                          <Value>{a.codigo_postal || "—"}</Value>
                        </div>
                        <div>
                          <Label>Contactos de urgência</Label>
                          <Value>{a.contactos_urgencia || "—"}</Value>
                        </div>

                        <div>
                          <Label>Email(s) preferencial(is)</Label>
                          <Value>{a.emails_preferenciais || "—"}</Value>
                        </div>
                        <div>
                          <Label>Email opcional</Label>
                          <Value>{a.email_opc || "—"}</Value>
                        </div>

                        <div>
                          <Label>Telefone opcional</Label>
                          <Value>{a.telefone_opc || "—"}</Value>
                        </div>
                        <div>
                          <Label>Encarregado de educação</Label>
                          <Value>{a.encarregado_educacao || "—"}</Value>
                        </div>

                        <div>
                          <Label>Nome do pai</Label>
                          <Value>{a.nome_pai || "—"}</Value>
                        </div>
                        <div>
                          <Label>Nome da mãe</Label>
                          <Value>{a.nome_mae || "—"}</Value>
                        </div>

                        <div>
                          <Label>Parentesco — outro</Label>
                          <Value>{a.parentesco_outro || "—"}</Value>
                        </div>
                        <div>
                          <Label>Nacionalidade</Label>
                          <Value>{a.nacionalidade || "—"}</Value>
                        </div>

                        <div>
                          <Label>Nacionalidade — outra</Label>
                          <Value>{a.nacionalidade_outra || "—"}</Value>
                        </div>
                        <div>
                          <Label>Escola</Label>
                          <Value>{a.escola || "—"}</Value>
                        </div>

                        <div>
                          <Label>Ano de escolaridade</Label>
                          <Value>{a.ano_escolaridade || "—"}</Value>
                        </div>

                        <div className="md:col-span-2">
                          <Label>Observações</Label>
                          <Value>{a.observacoes || "—"}</Value>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------ Documentos ------------------------------ */}
          <TabsContent value="docs">
            <div className="space-y-6">
              {/* Documentos do Sócio */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Documentos do Sócio</CardTitle>
                  <Button variant="outline" onClick={fetchSocioDocs} disabled={loadingSocio}>
                    {loadingSocio ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Atualizar"}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!hasSocioDocs ? (
                    <p className="text-sm text-gray-500">Sem documentos do sócio.</p>
                  ) : (
                    Array.from(socioDocs.entries()).map(([tipo, files]) => (
                      <div key={tipo} className="border rounded-lg p-3">
                        <div className="font-medium mb-2">{tipo}</div>
                        <ul className="space-y-2">
                          {files.map((row) => (
                            <li key={row.id} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                  {(row.page ?? 0) > 0 ? `Ficheiro ${row.page}` : "Ficheiro"}
                                </span>
                                {row.signedUrl ? (
                                  <a
                                    href={row.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline inline-flex items-center gap-1"
                                  >
                                    <LinkIcon className="h-4 w-4" />
                                    {displayName(row)}
                                  </a>
                                ) : (
                                  <span>{displayName(row)}</span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {row.mime_type || "—"} · {(row.file_size ?? 0) > 0 ? `${row.file_size} bytes` : "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Documentos por Atleta */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Documentos por Atleta</CardTitle>
                  <Button variant="outline" onClick={() => fetchDocsByAthlete(athletes)} disabled={loadingDocsByAth}>
                    {loadingDocsByAth ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Atualizar"}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {athletes.length === 0 ? (
                    <p className="text-sm text-gray-500">Sem atletas associados.</p>
                  ) : (
                    athletes.map((a) => {
                      const mapa = athDocs[a.id] || new Map<string, DocumentoRow[]>();
                      const hasDocs = Array.from(mapa.values()).some((arr) => arr.length > 0);
                      return (
                        <div key={a.id} className="border rounded-lg p-3">
                          <div className="font-medium mb-2">
                            {a.nome || "—"} — Escalão: {a.escalao || "—"}
                          </div>
                          {!hasDocs ? (
                            <p className="text-xs text-gray-500">Sem documentos deste atleta.</p>
                          ) : (
                            Array.from(mapa.entries()).map(([tipo, files]) => (
                              <div key={tipo} className="border rounded-md p-2 mb-2">
                                <div className="text-sm font-medium mb-1">{tipo}</div>
                                <ul className="space-y-1">
                                  {files.map((row) => (
                                    <li key={row.id} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                          {(row.page ?? 0) > 0 ? `Ficheiro ${row.page}` : "Ficheiro"}
                                        </span>
                                        {row.signedUrl ? (
                                          <a
                                            href={row.signedUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="underline inline-flex items-center gap-1"
                                          >
                                            <LinkIcon className="h-4 w-4" />
                                            {displayName(row)}
                                          </a>
                                        ) : (
                                          <span>{displayName(row)}</span>
                                        )}
                                      </div>
                                      <span className="text-xs text-gray-500">
                                        {row.mime_type || "—"} · {(row.file_size ?? 0) > 0 ? `${row.file_size} bytes` : "—"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

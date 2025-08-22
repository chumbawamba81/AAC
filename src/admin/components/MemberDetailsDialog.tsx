// src/admin/components/MemberDetailsDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Link as LinkIcon, RefreshCw } from "lucide-react";
import { listDocs, withSignedUrls, groupByTipo, displayName, type DocumentoRow } from "../services/adminDocumentosService";

/* --------- helpers --------- */
type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
const isEmpty = (v: any) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const fmtDate = (d?: string | null) => (isEmpty(d) ? "" : new Date(d as string).toLocaleDateString("pt-PT"));
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
  const comp = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;
  if (validado) return "Regularizado";
  if (comp) return "Pendente de validação";
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}
const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-left text-xs text-gray-500">{children}</div>
);
const Value = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-4 text-left">{children}</div>
);

function Field({ label, value, fmt }: { label: string; value: any; fmt?: (v: any) => React.ReactNode }) {
  if (isEmpty(value)) return null;
  return (
    <div>
      <Label>{label}</Label>
      <Value>{fmt ? fmt(value) : value}</Value>
    </div>
  );
}

/* --------- componente --------- */
export type MemberRow = { user_id: string; nome_completo?: string | null; email?: string | null; telefone?: string | null; tipo_socio?: string | null; };

export default function MemberDetailsDialog({ open, onOpenChange, member }: { open: boolean; onOpenChange: (v: boolean) => void; member: MemberRow; }) {
  const userId = member.user_id;
  const [perfil, setPerfil] = useState<any | null>(null);

  const isSocio = !!(member.tipo_socio || "").toLowerCase().includes("sócio") && !(member.tipo_socio || "").toLowerCase().includes("não pretendo");
  const [inscStatus, setInscStatus] = useState<InscStatus | null>(null);
  const [inscDue, setInscDue] = useState<string | null>(null);
  const [inscComprov, setInscComprov] = useState<string | null>(null);

  const [athletes, setAthletes] = useState<any[]>([]);
  const [loadingAth, setLoadingAth] = useState(false);

  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  const [loadingSocio, setLoadingSocio] = useState(false);
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});
  const [loadingDocsByAth, setLoadingDocsByAth] = useState(false);

  async function fetchPerfil() {
    const { data, error } = await supabase.from("dados_pessoais").select("*").eq("user_id", userId).maybeSingle();
    if (error) console.error("[MemberDetailsDialog] dados_pessoais:", error);
    setPerfil(data ?? null);
  }
  async function fetchAthletes() {
    setLoadingAth(true);
    try {
      const { data, error } = await supabase.from("atletas").select("*").eq("user_id", userId).order("created_at", { ascending: true });
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
        setInscStatus(null); setInscDue(null); setInscComprov(null); return;
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
      if (error) { console.error("[MemberDetailsDialog] inscrição sócio:", error); setInscStatus(null); setInscDue(null); setInscComprov(null); return; }
      const r = (data || [])[0];
      if (!r) { setInscStatus("Por regularizar"); setInscDue(null); setInscComprov(null); return; }
      setInscStatus(deriveInscStatus(r)); setInscDue(r.devido_em ?? null); setInscComprov(r.comprovativo_url ?? null);
    })();
    return () => { mounted = false; };
  }, [open, userId, isSocio]);

  const hasSocioDocs = useMemo(() => Array.from(socioDocs.values()).some((arr) => arr.length > 0), [socioDocs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detalhes do Titular
            <span className="block text-xs text-gray-500">
              {(perfil?.nome_completo || member.nome_completo || "—")} · {(perfil?.email || member.email || "—")} · Tipo de sócio: {(perfil?.tipo_socio || member.tipo_socio || "—")}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="atletas">Atletas</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
          </TabsList>

          {/* Resumo */}
          <TabsContent value="resumo">
            <Card>
              <CardHeader><CardTitle>Dados do titular</CardTitle></CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-6 text-sm text-left">
                <Field label="Nome" value={perfil?.nome_completo} />
                <Field label="Email" value={perfil?.email} />
                <Field label="Telefone" value={perfil?.telefone} />
                <Field label="Data de nascimento" value={perfil?.data_nascimento} />
                <Field label="NIF" value={perfil?.nif} />
                <Field label="Profissão" value={perfil?.profissao} />
                <Field label="Morada" value={perfil?.morada} />
                <Field label="Código postal" value={perfil?.codigo_postal} />
                <Field label="Tipo de documento" value={perfil?.tipo_documento} />
                <Field label="N.º documento" value={perfil?.numero_documento} />
                <Field label="Validade do documento" value={perfil?.validade_documento} fmt={fmtDate} />
                <Field label="Tipo de sócio" value={perfil?.tipo_socio} />
                <Field label="Notícias" value={perfil?.noticias} />

                {/* Inscrição de sócio */}
                {!isEmpty(inscStatus) && (
                  <div className="md:col-span-2">
                    <Label>Inscrição de sócio</Label>
                    <Value>
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        {inscStatus && <InscricaoBadge status={inscStatus} />}
                        {!isEmpty(inscDue) && <span className="text-xs text-gray-500">Data limite: {fmtDate(inscDue)}</span>}
                        {!isEmpty(inscComprov) && (
                          <a href={inscComprov!} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-1">
                            <LinkIcon className="h-3 w-3" /> Ver comprovativo
                          </a>
                        )}
                      </span>
                    </Value>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Atletas */}
          <TabsContent value="atletas">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Atletas do titular</CardTitle>
                <Button variant="outline" onClick={() => fetchAthletes().then(() => fetchDocsByAthlete(athletes))} disabled={loadingAth}>
                  {loadingAth ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Atualizar"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {athletes.length === 0 ? (
                  <p className="text-sm text-gray-500">Sem atletas associados.</p>
                ) : (
                  athletes.map((a) => (
                    <div key={a.id} className="border rounded-lg p-4">
                      <div className="text-base font-semibold mb-4">{a.nome || "—"}</div>
                      <div className="grid md:grid-cols-2 gap-6 text-sm text-left">
                        <Field label="Data de nascimento" value={a.data_nascimento} />
                        <Field label="Escalão" value={a.escalao} />
                        <Field label="NIF" value={a.nif} />
                        <Field label="Opção de pagamento" value={a.opcao_pagamento} />
                        <Field label="Tipo de documento" value={a.tipo_doc} />
                        <Field label="N.º documento" value={a.num_doc} />
                        <Field label="Validade do documento" value={a.validade_doc} fmt={fmtDate} />
                        <Field label="Alergias / saúde" value={a.alergias} />
                        <Field label="Morada" value={a.morada} />
                        <Field label="Código postal" value={a.codigo_postal} />
                        <Field label="Contactos de urgência" value={a.contactos_urgencia} />
                        <Field label="Email(s) preferencial(is)" value={a.emails_preferenciais} />
                        <Field label="Email opcional" value={a.email_opc} />
                        <Field label="Telefone opcional" value={a.telefone_opc} />
                        <Field label="Encarregado de educação" value={a.encarregado_educacao} />
                        <Field label="Nome do pai" value={a.nome_pai} />
                        <Field label="Nome da mãe" value={a.nome_mae} />
                        <Field label="Parentesco — outro" value={a.parentesco_outro} />
                        <Field label="Nacionalidade" value={a.nacionalidade} />
                        <Field label="Nacionalidade — outra" value={a.nacionalidade_outra} />
                        <Field label="Escola" value={a.escola} />
                        <Field label="Ano de escolaridade" value={a.ano_escolaridade} />
                        <Field label="Observações" value={a.observacoes} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documentos */}
          <TabsContent value="docs">
            <div className="space-y-6">
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
                                  <a href={row.signedUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
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
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

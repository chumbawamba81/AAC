// src/admin/components/MemberDetailsDialog.tsx
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

// Tipo base do “member” que recebes na tabela da Admin
export type MemberRow = {
  user_id: string;
  nome_completo?: string | null;
  email?: string | null;
  telefone?: string | null;
  codigo_postal?: string | null;
  tipo_socio?: string | null;
};

type Athlete = {
  id: string;
  nome: string;
  data_nascimento: string;
  escalao: string | null;
};

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

  // Atletas do titular
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loadingAth, setLoadingAth] = useState(false);

  // Documentos do Sócio
  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());
  const [loadingSocio, setLoadingSocio] = useState(false);

  // Documentos por atleta
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});
  const [loadingDocsByAth, setLoadingDocsByAth] = useState(false);

  // Carrega atletas do titular
  async function fetchAthletes() {
    setLoadingAth(true);
    try {
      const { data, error } = await supabase
        .from("atletas")
        .select("id,nome,data_nascimento,escalao")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setAthletes((data ?? []) as Athlete[]);
    } finally {
      setLoadingAth(false);
    }
  }

  // Carrega docs do sócio
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

  // Carrega docs por atleta
  async function fetchDocsByAthlete() {
    setLoadingDocsByAth(true);
    try {
      const next: Record<string, Map<string, DocumentoRow[]>> = {};
      for (const a of athletes) {
        const rows = await listDocs({ nivel: "atleta", userId, atletaId: a.id });
        const withUrls = await withSignedUrls(rows);
        next[a.id] = groupByTipo(withUrls);
      }
      setAthDocs(next);
    } finally {
      setLoadingDocsByAth(false);
    }
  }

  // Sempre que abrir, ou muda o member, atualiza
  useEffect(() => {
    if (!open) return;
    fetchAthletes().catch(console.error);
    fetchSocioDocs().catch(console.error);
  }, [open, userId]);

  // Sempre que haja atletas, carrega docs por atleta
  useEffect(() => {
    if (!open) return;
    fetchDocsByAthlete().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, athletes.map(a => a.id).join(",")]);

  const hasSocioDocs = useMemo(() => {
    for (const arr of socioDocs.values()) if (arr.length) return true;
    return false;
  }, [socioDocs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detalhes do Titular
            <span className="block text-xs text-gray-500">
              {member.nome_completo || "—"} · {member.email || "—"} · Tipo de sócio: {member.tipo_socio || "—"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="atletas">Atletas</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <Card>
              <CardHeader>
                <CardTitle>Dados do titular</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div><strong>Nome:</strong> {member.nome_completo || "—"}</div>
                <div><strong>Email:</strong> {member.email || "—"}</div>
                <div><strong>Telefone:</strong> {member.telefone || "—"}</div>
                <div><strong>Código-postal:</strong> {member.codigo_postal || "—"}</div>
                <div><strong>Tipo de sócio:</strong> {member.tipo_socio || "—"}</div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="atletas">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Atletas do titular</CardTitle>
                <Button variant="outline" onClick={fetchAthletes} disabled={loadingAth}>
                  {loadingAth ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Atualizar"}
                </Button>
              </CardHeader>
              <CardContent>
                {athletes.length === 0 ? (
                  <p className="text-sm text-gray-500">Sem atletas associados.</p>
                ) : (
                  <div className="space-y-2">
                    {athletes.map((a) => (
                      <div key={a.id} className="border rounded-lg p-3 text-sm flex items-center justify-between">
                        <div>
                          <div className="font-medium">{a.nome}</div>
                          <div className="text-gray-500">
                            Nasc.: {a.data_nascimento} · Escalão: {a.escalao || "—"}
                          </div>
                        </div>
                        {/* aqui podes ligar a outra dialog com detalhes de atleta, se quiseres */}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

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
                  <Button variant="outline" onClick={fetchDocsByAthlete} disabled={loadingDocsByAth}>
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
                            {a.nome} — Escalão: {a.escalao || "—"}
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

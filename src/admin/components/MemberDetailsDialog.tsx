// src/admin/components/MemberDetailsDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Link as LinkIcon, RefreshCw } from "lucide-react";

import { supabase } from "../../supabaseClient";
import { listDocs, withSignedUrls, groupByTipo, type DocumentoRow } from "../services/adminDocumentosService";

type AtletaLite = {
  id: string;
  nome: string;
  escalao: string | null;
  data_nascimento: string;
  genero: string | null;
};

export type SocioRow = {
  user_id: string;
  nome_completo: string;
  email: string;
  telefone: string | null;
  morada: string | null;
  codigo_postal: string | null;
  tipo_socio: string | null;
  situacao_tesouraria: string | null;
};

export default function MemberDetailsDialog({
  open,
  onOpenChange,
  socio,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  socio: SocioRow | null;
}) {
  const userId = socio?.user_id || null;

  const [loading, setLoading] = useState(false);
  const [atletas, setAtletas] = useState<AtletaLite[]>([]);

  // Documentos do Sócio
  const [socioDocs, setSocioDocs] = useState<Map<string, DocumentoRow[]>>(new Map());

  // Documentos por Atleta
  const [athDocs, setAthDocs] = useState<Record<string, Map<string, DocumentoRow[]>>>({});

  async function refresh() {
    if (!userId) return;
    setLoading(true);
    try {
      // Sócio
      const sRows = await listDocs({ nivel: "socio", userId });
      const sWith = await withSignedUrls(sRows);
      setSocioDocs(groupByTipo(sWith));

      // Atletas do titular
      const { data: aData, error: aErr } = await supabase
        .from("atletas")
        .select("id,nome,escalao,data_nascimento,genero")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (aErr) throw aErr;
      setAtletas((aData || []) as AtletaLite[]);

      // Doc por atleta
      const next: Record<string, Map<string, DocumentoRow[]>> = {};
      for (const a of (aData || []) as AtletaLite[]) {
        const rows = await listDocs({ nivel: "atleta", atletaId: a.id });
        const withUrls = await withSignedUrls(rows);
        next[a.id] = groupByTipo(withUrls);
      }
      setAthDocs(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const socioDocsMissing = useMemo(() => {
    const OBRIG = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"];
    let miss = 0;
    for (const k of OBRIG) {
      if (!socioDocs.get(k)?.length) miss++;
    }
    return miss;
  }, [socioDocs]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Titular</DialogTitle>
        </DialogHeader>

        {!socio ? (
          <div className="text-sm text-gray-500">Sem registo selecionado.</div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Titular</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div><strong>Nome:</strong> {socio.nome_completo}</div>
                <div><strong>Email:</strong> {socio.email}</div>
                <div><strong>Telefone:</strong> {socio.telefone || "—"}</div>
                <div><strong>Morada:</strong> {socio.morada || "—"}</div>
                <div><strong>CP:</strong> {socio.codigo_postal || "—"}</div>
                <div><strong>Tipo de sócio:</strong> {socio.tipo_socio || "Não definido"}</div>
                <div><strong>Tesouraria:</strong> {socio.situacao_tesouraria || "—"}</div>
              </CardContent>
            </Card>

            <Tabs defaultValue="socio">
              <TabsList>
                <TabsTrigger value="socio">Documentos do Sócio {loading && <RefreshCw className="h-3 w-3 ml-1 animate-spin" />}</TabsTrigger>
                <TabsTrigger value="atletas">Atletas</TabsTrigger>
                <TabsTrigger value="ath_docs">Documentos dos Atletas</TabsTrigger>
              </TabsList>

              {/* TAB: Documentos do Sócio */}
              <TabsContent value="socio">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Documentos do Sócio {socioDocsMissing > 0 ? `— ${socioDocsMissing} em falta` : "— Completo"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {socioDocs.size === 0 ? (
                      <p className="text-sm text-gray-500">Sem documentos.</p>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-3">
                        {[...socioDocs.entries()].map(([tipo, files]) => (
                          <div key={tipo} className="border rounded-lg p-3 space-y-2">
                            <div className="font-medium">{tipo}</div>
                            <ul className="space-y-2">
                              {files.map((row) => (
                                <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                                  <div className="text-sm flex items-center gap-2">
                                    <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                      {row.page ?? 0}
                                    </span>
                                    {row.signedUrl ? (
                                      <a href={row.signedUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                                        <LinkIcon className="h-4 w-4" />
                                        {row.file_name || row.file_path}
                                      </a>
                                    ) : (
                                      <span className="text-gray-500">{row.file_name || row.file_path}</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB: Atletas (lista simples) */}
              <TabsContent value="atletas">
                <Card>
                  <CardHeader><CardTitle className="text-base">Atletas</CardTitle></CardHeader>
                  <CardContent>
                    {atletas.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem atletas associados.</p>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-3">
                        {atletas.map((a) => (
                          <div key={a.id} className="border rounded-lg p-3 space-y-1">
                            <div className="font-medium">{a.nome}</div>
                            <div className="text-xs text-gray-500">
                              {a.genero || "—"} · Nasc.: {a.data_nascimento} · Escalão: {a.escalao || "—"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* TAB: Documentos dos Atletas */}
              <TabsContent value="ath_docs">
                <Card>
                  <CardHeader><CardTitle className="text-base">Documentos dos Atletas</CardTitle></CardHeader>
                  <CardContent>
                    {atletas.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem atletas associados.</p>
                    ) : (
                      <div className="space-y-4">
                        {atletas.map((a) => {
                          const mapa = athDocs[a.id] || new Map<string, DocumentoRow[]>();
                          if (mapa.size === 0) {
                            return (
                              <div key={a.id} className="border rounded-lg p-3">
                                <div className="font-medium">{a.nome}</div>
                                <div className="text-xs text-gray-500 mb-2">
                                  {a.genero || "—"} · Nasc.: {a.data_nascimento} · Escalão: {a.escalao || "—"}
                                </div>
                                <div className="text-sm text-gray-500">Sem documentos.</div>
                              </div>
                            );
                          }
                          return (
                            <div key={a.id} className="border rounded-lg p-3 space-y-2">
                              <div className="font-medium">{a.nome}</div>
                              <div className="text-xs text-gray-500">
                                {a.genero || "—"} · Nasc.: {a.data_nascimento} · Escalão: {a.escalao || "—"}
                              </div>

                              <div className="grid md:grid-cols-2 gap-3 mt-2">
                                {[...mapa.entries()].map(([tipo, files]) => (
                                  <div key={tipo} className="border rounded-md p-2 space-y-2">
                                    <div className="font-medium">{tipo}</div>
                                    <ul className="space-y-2">
                                      {files.map((row) => (
                                        <li key={row.id} className="flex items-center justify-between border rounded-md p-2">
                                          <div className="text-sm flex items-center gap-2">
                                            <span className="inline-block text-xs rounded bg-gray-100 px-2 py-0.5">
                                              {row.page ?? 0}
                                            </span>
                                            {row.signedUrl ? (
                                              <a href={row.signedUrl} target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-1">
                                                <LinkIcon className="h-4 w-4" />
                                                {row.file_name || row.file_path}
                                              </a>
                                            ) : (
                                              <span className="text-gray-500">{row.file_name || row.file_path}</span>
                                            )}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

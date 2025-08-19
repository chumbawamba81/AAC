// src/admin/components/MemberDetailsDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Link as LinkIcon, RefreshCw } from "lucide-react";

import {
  listDocsSocio,
  listDocsAtleta,
  withSignedUrls,
  groupByTipo,
  displayName,
  type DocumentoRow,
} from "../services/adminDocumentosService";

import { supabase } from "../../supabaseClient";

type AtletaRow = {
  id: string;
  user_id: string;
  nome: string;
  escalao: string | null;
  data_nascimento: string;
  genero: string | null;
};

type Member = {
  user_id: string;
  nome_completo?: string | null;
  email?: string | null;
  telefone?: string | null;
  codigo_postal?: string | null;
  tipo_socio?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: Member;
};

export default function MemberDetailsDialog({ open, onOpenChange, member }: Props) {
  const userId = member.user_id;
  const [busy, setBusy] = useState(false);

  // atletas do titular
  const [atletas, setAtletas] = useState<AtletaRow[]>([]);
  // docs: sócio
  const [docsSocio, setDocsSocio] = useState<DocumentoRow[]>([]);
  // docs por atletaId
  const [docsByAth, setDocsByAth] = useState<Record<string, DocumentoRow[]>>({});

  async function refresh() {
    if (!userId) return;
    setBusy(true);
    try {
      // atletas
      const { data: ath, error: aerr } = await supabase
        .from("atletas")
        .select("id,user_id,nome,escalao,data_nascimento,genero")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (aerr) throw aerr;
      setAtletas((ath || []) as AtletaRow[]);

      // docs sócio
      const socio = await listDocsSocio(userId).then(withSignedUrls);
      setDocsSocio(socio);

      // docs por atleta
      const next: Record<string, DocumentoRow[]> = {};
      for (const a of (ath || []) as AtletaRow[]) {
        const rows = await listDocsAtleta(userId, a.id).then(withSignedUrls);
        next[a.id] = rows;
      }
      setDocsByAth(next);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const socioGrouped = useMemo(() => groupByTipo(docsSocio), [docsSocio]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes — {member.nome_completo || "Titular"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <div className="text-sm">
            <div><strong>Email:</strong> {member.email || "—"}</div>
            <div><strong>Telefone:</strong> {member.telefone || "—"}</div>
            <div><strong>Tipo de sócio:</strong> {member.tipo_socio || "—"}</div>
          </div>
          <div>
            <Button variant="outline" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
          </div>
        </div>

        {/* ---- Documentos do Sócio ---- */}
        <section className="mt-4">
          <h3 className="font-semibold mb-2">Documentos do Sócio</h3>
          {docsSocio.length === 0 ? (
            <p className="text-sm text-gray-500">Sem ficheiros.</p>
          ) : (
            <div className="space-y-2">
              {[...socioGrouped.entries()].map(([tipo, rows]) => (
                <div key={tipo} className="border rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{tipo}</div>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((r) => (
                      <li key={r.id} className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2">
                          <Badge variant="secondary">Ficheiro {r.page ?? 1}</Badge>
                          <a
                            href={r.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline inline-flex items-center gap-1"
                          >
                            <LinkIcon className="h-4 w-4" />
                            {displayName(r)}
                          </a>
                        </span>
                        <span className="text-xs text-gray-500">
                          {(r.mime_type || "").split("/")[1] || "doc"} · {r.file_size ? `${r.file_size} B` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---- Atletas + documentos ---- */}
        <section className="mt-6">
          <h3 className="font-semibold mb-2">Atletas do titular</h3>
          {atletas.length === 0 ? (
            <p className="text-sm text-gray-500">Sem atletas associados.</p>
          ) : (
            <div className="space-y-4">
              {atletas.map((a) => {
                const rows = docsByAth[a.id] || [];
                const grouped = groupByTipo(rows);
                return (
                  <div key={a.id} className="border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{a.nome}</div>
                      <div className="text-xs text-gray-500">{a.escalao || "—"} · Nasc.: {a.data_nascimento}</div>
                    </div>

                    {rows.length === 0 ? (
                      <p className="text-sm text-gray-500">Sem ficheiros.</p>
                    ) : (
                      <div className="space-y-2">
                        {[...grouped.entries()].map(([tipo, rws]) => (
                          <div key={tipo} className="border rounded-lg p-2">
                            <div className="font-medium mb-1">{tipo}</div>
                            <ul className="space-y-1">
                              {rws.map((r) => (
                                <li key={r.id} className="flex items-center justify-between text-sm">
                                  <span className="inline-flex items-center gap-2">
                                    <Badge variant="secondary">Ficheiro {r.page ?? 1}</Badge>
                                    <a
                                      href={r.signedUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline inline-flex items-center gap-1"
                                    >
                                      <LinkIcon className="h-4 w-4" />
                                      {displayName(r)}
                                    </a>
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {(r.mime_type || "").split("/")[1] || "doc"} · {r.file_size ? `${r.file_size} B` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {busy && (
          <div className="mt-3 text-xs text-gray-500 inline-flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin" /> A carregar…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

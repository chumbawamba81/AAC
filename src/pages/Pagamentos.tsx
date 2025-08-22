// src/pages/Pagamentos.tsx
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { RefreshCw, Upload, Trash2, Link as LinkIcon } from "lucide-react";
import FilePickerButton from "../components/FilePickerButton";

import type { Atleta } from "../types/Atleta";
import { listAtletas } from "../services/atletasService";
import {
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
} from "../services/pagamentosService";

import { eur, estimateCosts } from "../utils/pricing";

// Helpers locais
function isFutureDateStr(s?: string | null) {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
}
const isOverdue = (row?: PagamentoRowWithUrl | null) =>
  !!(row?.devido_em && !row.validado && !isFutureDateStr(row.devido_em));

export default function Pagamentos() {
  const [userId, setUserId] = useState<string | null>(null);
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [rowsByAtleta, setRowsByAtleta] = useState<Record<string, PagamentoRowWithUrl[]>>({});
  const [athleteInscricao, setAthleteInscricao] = useState<Record<string, PagamentoRowWithUrl | null>>({});

  // sessão
  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const refreshAtletas = useCallback(async () => {
    const data = await listAtletas();
    setAtletas(data);
  }, []);

  const refreshPagamentos = useCallback(async () => {
    const map: Record<string, PagamentoRowWithUrl[]> = {};
    const inscrMap: Record<string, PagamentoRowWithUrl | null> = {};

    for (const a of atletas) {
      const rows = await listPagamentosByAtleta(a.id);
      const rowsWithUrl = await withSignedUrlsPagamentos(rows);
      map[a.id] = rowsWithUrl;

      // procurar inscrição
      const inscrArr = rowsWithUrl.filter(
        (r) =>
          (r as any).tipo === "inscricao" ||
          (r.descricao || "").toLowerCase() === "taxa de inscrição"
      );
      inscrArr.sort(
        (x, y) =>
          new Date(y.created_at || 0).getTime() -
          new Date(x.created_at || 0).getTime()
      );
      inscrMap[a.id] = inscrArr[0] || null;
    }
    setRowsByAtleta(map);
    setAthleteInscricao(inscrMap);
  }, [atletas]);

  useEffect(() => {
    refreshAtletas().catch(console.error);
  }, [userId, refreshAtletas]);

  useEffect(() => {
    if (atletas.length) refreshPagamentos().catch(console.error);
  }, [atletas, refreshPagamentos]);

  const handleUpload = useCallback(
    async (a: Atleta, descricao: string, file: File) => {
      if (!userId) return;
      await saveComprovativoPagamento({
        userId,
        atletaId: a.id,
        descricao,
        file,
      });
      await refreshPagamentos();
    },
    [userId, refreshPagamentos]
  );

  const handleUploadInscricao = useCallback(
    async (a: Atleta, file: File) => {
      if (!userId) return;
      await saveComprovativoPagamento({
        userId,
        atletaId: a.id,
        descricao: "Taxa de inscrição",
        file,
      });
      await refreshPagamentos();
    },
    [userId, refreshPagamentos]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deletePagamento(id);
      await refreshPagamentos();
    },
    [refreshPagamentos]
  );

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Pagamentos</CardTitle>
        <Button variant="outline" onClick={() => refreshPagamentos()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {!atletas.length ? (
          <div className="text-sm text-gray-600">Sem atletas registados.</div>
        ) : (
          <div className="space-y-4">
            {atletas.map((a) => {
              const rows = rowsByAtleta[a.id] || [];
              const inscr = athleteInscricao[a.id] || null;

              // custos segundo pricing.ts
              const est = estimateCosts({ escalao: a.escalao || "" });
              const temQuotas = !(est.onlyAnnual ?? false);

              return (
                <div key={a.id} className="border rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {a.nomeCompleto} — {a.escalao || "esc."}
                    </div>
                    <div className="text-xs text-gray-500">
                      {temQuotas
                        ? "Comprovativos de quotas"
                        : "Sem quotas (apenas taxa de inscrição)"}
                    </div>
                  </div>

                  {/* NOVO bloco de INSCRIÇÃO */}
                  <div className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">Taxa de inscrição</div>
                      <div className="text-xs text-gray-500">
                        {inscr?.comprovativo_url
                          ? inscr.validado
                            ? "Comprovativo validado"
                            : isOverdue(inscr)
                            ? "Comprovativo pendente (em atraso)"
                            : "Comprovativo pendente"
                          : isOverdue(inscr)
                          ? "Comprovativo em falta (em atraso)"
                          : "Comprovativo em falta"}
                        {inscr?.devido_em && (
                          <span className="ml-2">· Limite: {inscr.devido_em}</span>
                        )}
                        {inscr?.signedUrl && (
                          <a
                            className="underline inline-flex items-center gap-1 p-1 ml-2"
                            href={inscr.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <LinkIcon className="h-3 w-3" /> Abrir
                          </a>
                        )}
                      </div>
                    </div>
                    <FilePickerButton
                      accept="image/*,application/pdf"
                      onFiles={(fs) => fs?.[0] && handleUploadInscricao(a, fs[0])}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {inscr?.comprovativo_url ? "Substituir" : "Carregar"}
                    </FilePickerButton>
                  </div>

                  {/* Grelha de QUOTAS (já existente e mantida) */}
                  {temQuotas && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {["mensal10", "trimestre3", "anual1"].map((key, idx) => {
                        const label =
                          key === "mensal10"
                            ? "Pagamento Mensal"
                            : key === "trimestre3"
                            ? "Pagamento Trimestral"
                            : "Pagamento da anuidade";
                        const row =
                          rows.find(
                            (r) =>
                              (r.descricao || "").toLowerCase() ===
                              label.toLowerCase()
                          ) || null;
                        const overdue = isOverdue(row);
                        const valor = (est as any)[key];
                        return (
                          <div
                            key={`${a.id}-${key}-${idx}`}
                            className="border rounded-lg p-3 flex items-center justify-between"
                          >
                            <div>
                              <div className="font-medium">
                                {label} — {eur(valor)}
                              </div>
                              <div className="text-xs text-gray-500">
                                {row?.comprovativo_url
                                  ? row.validado
                                    ? "Comprovativo validado"
                                    : overdue
                                    ? "Comprovativo pendente (em atraso)"
                                    : "Comprovativo pendente"
                                  : overdue
                                  ? "Comprovativo em falta (em atraso)"
                                  : "Comprovativo em falta"}
                                {row?.devido_em && (
                                  <span className="ml-2">
                                    · Limite: {row.devido_em}
                                  </span>
                                )}
                                {row?.signedUrl && (
                                  <a
                                    className="underline inline-flex items-center gap-1 p-1 ml-2"
                                    href={row.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <LinkIcon className="h-3 w-3" /> Abrir
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <FilePickerButton
                                accept="image/*,application/pdf"
                                onFiles={(fs) =>
                                  fs?.[0] && handleUpload(a, label, fs[0])
                                }
                              >
                                <Upload className="h-4 w-4 mr-1" /> Carregar
                              </FilePickerButton>
                              {row?.id && (
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDelete(row.id!)}
                                  title="Remover registo"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

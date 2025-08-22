// src/pages/pagamentos.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";

// Supabase
import { supabase } from "../supabaseClient";

// Services (auth-adjacent)
import { getMyProfile } from "../services/profileService";
import { listAtletas } from "../services/atletasService";

// Services (pagamentos)
import {
  createInscricaoSocioIfMissing,
  listSocioInscricao,
  saveComprovativoSocioInscricao,
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  sep8OfCurrentYear,
  sep30OfCurrentYear,
  getSlotsForPlano,
  getPagamentoLabel,
  type PagamentoRowWithUrl,
} from "../services/pagamentosService";

// UI
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import FilePickerButton from "../components/FilePickerButton";
import { RefreshCw, Upload, Trash2, Link as LinkIcon } from "lucide-react";

// Types & utils
import type { PessoaDados } from "../types/PessoaDados";
import type { Atleta, PlanoPagamento } from "../types/Atleta";
import { estimateCosts, eur, socioInscricaoAmount } from "../utils/pricing";

/* -------------------------------- Helpers -------------------------------- */

const isAnuidadeObrigatoria = (escalao?: string | null) => {
  const s = (escalao || "").toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores sub 23") ||
    s.includes("seniores sub-23")
  );
};

const isSocio = (tipo?: string | null) => !!tipo && !/não\s*pretendo/i.test(tipo);

/* ------------------------------- Componente ------------------------------- */

export default function PagamentosPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [perfil, setPerfil] = useState<PessoaDados | null>(null);
  const [atletas, setAtletas] = useState<Atleta[]>([]);

  // Sócio
  const [socioRows, setSocioRows] = useState<PagamentoRowWithUrl[]>([]);

  // Atletas
  const [payments, setPayments] = useState<Record<string, Array<PagamentoRowWithUrl | null>>>({});
  const [athleteInscricao, setAthleteInscricao] = useState<Record<string, PagamentoRowWithUrl | null>>({});

  /* ----------------------------- Auth bootstrap ---------------------------- */

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

  /* ------------------------------- Data load ------------------------------- */

  const hydrate = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([getMyProfile(), listAtletas()]);
      setPerfil(p ?? null);
      setAtletas(Array.isArray(a) ? a : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // carregar perfil/atletas assim que houver sessão
    if (userId) void hydrate();
    else {
      setPerfil(null);
      setAtletas([]);
      setLoading(false);
    }
  }, [userId, hydrate]);

  /* ------------------------- Refresh da tesouraria ------------------------- */

  const refreshPayments = useCallback(async () => {
    if (!userId) return;

    // Sócio — garantir linha e listar
    if (isSocio(perfil?.tipoSocio)) {
      await createInscricaoSocioIfMissing(userId);
      const socio = await listSocioInscricao(userId);
      setSocioRows(await withSignedUrlsPagamentos(socio));
    } else {
      setSocioRows([]);
    }

    // Atletas (quotas + inscrição)
    const inscrNext: Record<string, PagamentoRowWithUrl | null> = {};
    const next: Record<string, Array<PagamentoRowWithUrl | null>> = {};

    for (const a of atletas) {
      const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
      const slots = getSlotsForPlano(planoEfetivo);
      const labels = Array.from({ length: slots }, (_, i) => getPagamentoLabel(planoEfetivo, i));

      const rows = await listPagamentosByAtleta(a.id);
      const rowsWithUrl = await withSignedUrlsPagamentos(rows);

      const byDesc = new Map<string, PagamentoRowWithUrl[]>();
      for (const r of rowsWithUrl) {
        const arr = byDesc.get(r.descricao) || [];
        arr.push(r);
        byDesc.set(r.descricao, arr);
      }

      // Inscrição do atleta: pegar a mais recente de tipo inscrição (ou descrição com "inscri")
      const inscrArr = rowsWithUrl.filter(
        (r) => (r as any).tipo === "inscricao" || (r.descricao || "").toLowerCase().includes("inscri")
      );
      inscrArr.sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
      inscrNext[a.id] = inscrArr[0] || null;

      next[a.id] = labels.map((lab) => {
        const arr = byDesc.get(lab) || [];
        if (arr.length === 0) return null;
        arr.sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
        return arr[0];
      });
    }

    setPayments(next);
    setAthleteInscricao(inscrNext);
  }, [userId, atletas, perfil?.tipoSocio]);

  useEffect(() => {
    if (!userId) return;
    void refreshPayments();
  }, [userId, atletas.map((a) => a.id).join(","), perfil?.tipoSocio, refreshPayments]);

  // Live updates via Realtime
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("rt-pagamentos-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, () => {
        void refreshPayments();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshPayments]);

  /* ------------------------------- Handlers -------------------------------- */

  const isOverdue = (row: PagamentoRowWithUrl | null): boolean => {
    if (!row || row.validado) return false;
    const due = row.devido_em || sep8OfCurrentYear();
    const dt = new Date(due + "T23:59:59");
    return new Date().getTime() > dt.getTime();
  };

  async function handleUploadInscricao(athlete: Atleta, file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      // Reutiliza a descrição existente (evita “desencontros” de texto)
      const currentDesc = athleteInscricao[athlete.id]?.descricao || "Inscrição de Atleta";
      await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: currentDesc, file });
      await refreshPayments();
    } catch (e: any) {
      alert(e?.message || "Falha no upload");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteQuota(athlete: Atleta, idx: number) {
    const row = payments[athlete.id]?.[idx];
    if (!row) return;
    if (!confirm("Remover este comprovativo?")) return;

    setBusy(true);
    try {
      await deletePagamento(row);
      await refreshPayments();
    } catch (e: any) {
      alert(e?.message || "Falha a remover");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadSocio(file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      await saveComprovativoSocioInscricao(userId, file);
      await refreshPayments();
    } catch (e: any) {
      alert(e?.message || "Falha no upload");
    } finally {
      setBusy(false);
    }
  }

  // Handler único para quotas: usa a descrição (label) do slot
  async function handleUploadQuota(a: Atleta, descricao: string, file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      await saveComprovativoPagamento({
        userId,
        atletaId: a.id,
        descricao,
        file,
      });
      await refreshPayments();
    } catch (e: any) {
      alert(e?.message || "Falha no upload");
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- Derivados -------------------------------- */

  const numAtletasAgregado = useMemo(
    () => atletas.filter((a) => !isAnuidadeObrigatoria(a.escalao)).length,
    [atletas]
  );

  /* --------------------------------- Render -------------------------------- */

  if (!userId) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Situação de Tesouraria</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">Inicie sessão para ver e carregar comprovativos de pagamento.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-sm text-gray-600 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" />
        A carregar a sua informação…
      </div>
    );
  }

  const mostrarSocio = isSocio(perfil?.tipoSocio);
  const temAtletas = atletas.length > 0;

  if (!mostrarSocio && !temAtletas) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Situação de Tesouraria</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">
              Para usar esta página, ative a opção de sócio nos seus dados pessoais ou inscreva um atleta.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Situação de Tesouraria</h1>
        {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Pagamentos e comprovativos</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* ===== Sócio: Inscrição ===== */}
          {mostrarSocio && (
            <div className="border rounded-xl p-3">
              {(() => {
                const row = socioRows[0] || null;
                const overdue = row ? isOverdue(row) : false;
                const val = socioInscricaoAmount(perfil?.tipoSocio);
                const due = row?.devido_em || sep30OfCurrentYear(); // 30/09 por defeito

                return (
                  <div className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium">Inscrição de Sócio — {eur(val)}</div>
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
                        {due && <span className="ml-2">· Limite: {due}</span>}
                        {row?.signedUrl && (
                          <a
                            className="underline inline-flex items-center gap-1 ml-2"
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
                        variant={row?.comprovativo_url ? "secondary" : "outline"}
                        accept="image/*,application/pdf"
                        onPick={async (file) => {
                          await handleUploadSocio(file);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {row?.comprovativo_url ? "Substituir" : "Carregar"}
                      </FilePickerButton>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ===== Atletas ===== */}
          {atletas.map((a) => {
            const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
            const slots = getSlotsForPlano(planoEfetivo);
            const rows = payments[a.id] || Array.from({ length: slots }, () => null);

            const est = estimateCosts({
              escalao: a.escalao || "",
              tipoSocio: perfil?.tipoSocio,
              numAtletasAgregado: Math.max(1, numAtletasAgregado),
            });

            const amountForIdx = (idx: number) => {
              if (planoEfetivo === "Mensal") return est.mensal10;
              if (planoEfetivo === "Trimestral") return est.trimestre3;
              return est.anual1;
            };

            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Atleta — {a.nomeCompleto}</div>
                  <div className="text-xs text-gray-500">
                    Plano: {planoEfetivo}
                    {isAnuidadeObrigatoria(a.escalao) ? " (obrigatório pelo escalão)" : ""} · {slots} comprovativo(s)
                  </div>
                </div>

                {/* Inscrição do atleta */}
                {(() => {
                  const row = athleteInscricao[a.id] || null;
                  const overdue = row?.devido_em ? new Date() > new Date(row.devido_em + "T23:59:59") : false;
                  return (
                    <div className="border rounded-lg p-3 mb-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">Taxa de inscrição</div>
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
                          {row?.devido_em && <span className="ml-2">· Limite: {row.devido_em}</span>}
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
                      <FilePickerButton
                        variant={row?.comprovativo_url ? "secondary" : "outline"}
                        accept="image/*,application/pdf"
                        onPick={async (file) => {
                          await handleUploadInscricao(a, file);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        {row?.comprovativo_url ? "Substituir" : "Carregar"}
                      </FilePickerButton>
                    </div>
                  );
                })()}

                {/* Quotas (slots do plano) */}
                <div className="grid md:grid-cols-2 gap-3">
                  {Array.from({ length: slots }).map((_, i) => {
                    const meta = rows[i];
                    const label = getPagamentoLabel(planoEfetivo, i);
                    const overdue = meta ? isOverdue(meta) : false;
                    const due = meta?.devido_em || undefined;

                    return (
                      <div key={i} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {label} — {eur(amountForIdx(i))}
                          </div>
                          <div className="text-xs text-gray-500">
                            {meta?.comprovativo_url ? (
                              <span className="inline-flex items-center gap-2">
                                {meta.validado
                                  ? "Comprovativo validado"
                                  : overdue
                                  ? "Comprovativo pendente (em atraso)"
                                  : "Comprovativo pendente"}
                                {meta.signedUrl && (
                                  <a
                                    className="underline inline-flex items-center gap-1"
                                    href={meta.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <LinkIcon className="h-3 w-3" /> Abrir
                                  </a>
                                )}
                              </span>
                            ) : overdue ? (
                              "Comprovativo em falta (em atraso)"
                            ) : (
                              "Comprovativo em falta"
                            )}
                            {due && <span className="ml-2">· Limite: {due}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <FilePickerButton
                            variant={meta?.comprovativo_url ? "secondary" : "outline"}
                            accept="image/*,application/pdf"
                            onPick={async (file) => {
                              // Usar sempre o label calculado, não meta?.descricao (pode ser null)
                              await handleUploadQuota(a, label, file);
                            }}
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {meta?.comprovativo_url ? "Substituir" : "Carregar"}
                          </FilePickerButton>
                          {meta?.comprovativo_url && (
                            <Button variant="destructive" onClick={() => handleDeleteQuota(a, i)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import FilePickerButton from "./FilePickerButton";
import { Input } from "./ui/input"; // kept for parity if needed later
import { Label } from "./ui/label"; // kept for parity if needed later

import { RefreshCw, Upload, Trash2, Link as LinkIcon, EuroIcon } from "lucide-react";

import { supabase } from "../supabaseClient";

import { estimateCosts, eur, socioInscricaoAmount } from "../utils/pricing";
import {
  createInscricaoSocioIfMissing,
  listSocioInscricao,
  saveComprovativoSocioInscricao,
  saveComprovativoInscricaoAtleta,
  clearComprovativo,
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
  deleteSocioInscricaoIfAny,
} from "../services/pagamentosService";

import type { State } from "../App";
import type { Atleta, PlanoPagamento } from "../types/Atleta";
import { inferFileName, showToast } from "./MiniToast";

// Local helpers (duplicated to avoid coupling to App.tsx internals)
function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isMasters = s.includes("masters");
  const isSub23 = /(sub|seniores)[^\d]*23/.test(s) || /sub[-\s]?23/.test(s);
  return isMasters || isSub23;
}
function getSlotsForPlano(p: PlanoPagamento) {
  return p === "Mensal" ? 10 : p === "Trimestral" ? 3 : 1;
}
function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
function sep8OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-08`;
}

export default function HomePagamentos({ state }: { state: State }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [payments, setPayments] = useState<
    Record<string, Array<PagamentoRowWithUrl | null>
  >>({});
  const [socioRows, setSocioRows] = useState<PagamentoRowWithUrl[]>([]);
  const [athleteInscricao, setAthleteInscricao] = useState<
    Record<string, PagamentoRowWithUrl | null>
  >({});
  const [busy, setBusy] = useState(false);

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

  const isSocio = (t?: string | null) => !!t && !/não\s*pretendo\s*ser\s*sócio/i.test(t);

  const refreshPayments = useCallback(async () => {
    if (!userId) return;

    // Sócio — garantir linha e listar
    if (isSocio(state.perfil?.tipoSocio)) {
      await createInscricaoSocioIfMissing(userId);
      const socio = await listSocioInscricao(userId);
      setSocioRows(await withSignedUrlsPagamentos(socio));
    } else {
      setSocioRows([]);
      try {
        const n = await deleteSocioInscricaoIfAny(userId);
        console.debug("[refreshPayments] limpeza socio inscrição:", n);
      } catch (e) {
        console.error("[refreshPayments] delete socio inscrição", e);
      }
    }

    // Atletas
    const inscrNext: Record<string, PagamentoRowWithUrl | null> = {};
    const next: Record<string, Array<PagamentoRowWithUrl | null>> = {};
    for (const a of state.atletas) {
      const planoEfetivo = isAnuidadeObrigatoria(a.escalao)
        ? "Anual"
        : a.planoPagamento;
      const slots = getSlotsForPlano(planoEfetivo);
      const labels = Array.from({ length: slots }, (_, i) =>
        getPagamentoLabel(planoEfetivo, i)
      );
      const rows = await listPagamentosByAtleta(a.id);
      const rowsWithUrl = await withSignedUrlsPagamentos(rows);

      const byDesc = new Map<string, PagamentoRowWithUrl[]>();
      for (const r of rowsWithUrl) {
        const arr = byDesc.get(r.descricao) || [];
        arr.push(r);
        byDesc.set(r.descricao, arr);
      }

      // Inscrição do atleta
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
      inscrNext[a.id] = inscrArr[0] || null;

      next[a.id] = labels.map((lab) => {
        const arr = byDesc.get(lab) || [];
        if (arr.length === 0) return null;
        arr.sort(
          (x, y) =>
            new Date(y.created_at || 0).getTime() -
            new Date(x.created_at || 0).getTime()
        );
        return arr[0];
      });
    }
    setPayments(next);
    setAthleteInscricao(inscrNext);
  }, [userId, state.atletas, state.perfil?.tipoSocio]);

  useEffect(() => {
    refreshPayments();
  }, [refreshPayments]);

  useEffect(() => {
    const channel = supabase
      .channel("rt-pagamentos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagamentos" },
        (payload) => {
          const newAth = (payload as any)?.new?.atleta_id;
          const oldAth = (payload as any)?.old?.atleta_id;
          const ids = new Set(state.atletas.map((a) => a.id));
          if (ids.has(newAth) || ids.has(oldAth)) refreshPayments();
          if (!newAth && !oldAth) refreshPayments(); // socio
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.atletas, refreshPayments]);

  // === Helpers de normalização de nomes (Android-friendly) ===
  function sanitizeFileName(originalName: string, maxBaseLen = 80): string {
    const dot = originalName.lastIndexOf(".");
    const rawBase = dot > 0 ? originalName.slice(0, dot) : originalName;
    const rawExt = dot > 0 ? originalName.slice(dot + 1) : "";

    const base = rawBase
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[\-_.]+|[\-_.]+$/g, "");

    const safeBase = (base || "ficheiro").slice(0, maxBaseLen);
    const ext = rawExt
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    return ext ? `${safeBase}.${ext}` : safeBase;
  }
  async function withSafeName(file: File): Promise<File> {
    const safeName = sanitizeFileName(file.name);
    const buf = await file.arrayBuffer();
    return new File([new Uint8Array(buf)], safeName, {
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified,
    });
  }

  function isOverdue(row: PagamentoRowWithUrl | null): boolean {
    if (!row || row.validado) return false;
    const due = row.devido_em || sep8OfCurrentYear();
    const dt = new Date(due + "T23:59:59");
    return new Date().getTime() > dt.getTime();
  }

  async function handleUpload(athlete: Atleta, idx: number, file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      const safe = await withSafeName(file);
      const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao)
        ? "Anual"
        : athlete.planoPagamento;
      const label = getPagamentoLabel(planoEfetivo, idx);
      await saveComprovativoPagamento({
        userId,
        atletaId: athlete.id,
        descricao: label,
        file: safe,
      });
      await refreshPayments();
      showToast("Comprovativo carregado", "ok");
    } catch (e: any) {
      console.error("[Pagamentos] upload/replace", e);
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadInscricao(athlete: Atleta, file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      const safe = await withSafeName(file);
      await saveComprovativoInscricaoAtleta({
        userId,
        atletaId: athlete.id,
        file: safe,
      });
      await refreshPayments();
      showToast("Comprovativo de inscrição carregado", "ok");
    } catch (e: any) {
      console.error("[Pagamentos] upload inscrição", e);
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(athlete: Atleta, idx: number) {
    const row = payments[athlete.id]?.[idx];
    if (!row) return;
    if (!confirm("Remover este comprovativo?")) return;
    setBusy(true);
    try {
      await clearComprovativo(row);
      await refreshPayments();
      showToast("Comprovativo removido", "ok");
    } catch (e: any) {
      console.error("[Pagamentos] clear", e);
      showToast(e?.message || "Falha a remover", "err");
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
      const safe = await withSafeName(file);
      await saveComprovativoSocioInscricao(userId, safe);
      await refreshPayments();
      showToast("Comprovativo de sócio carregado", "ok");
    } catch (e: any) {
      console.error("[Pagamentos] socio upload", e);
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSocioInscricao(row: PagamentoRowWithUrl) {
    if (!confirm("Remover o comprovativo da inscrição de sócio?")) return;
    setBusy(true);
    try {
      await clearComprovativo(row);
      await refreshPayments();
      showToast("Comprovativo removido", "ok");
    } catch (e: any) {
      showToast(e?.message || "Falha a remover", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAtletaInscricao(row: PagamentoRowWithUrl) {
    if (!confirm("Remover o comprovativo da inscrição do atleta?")) return;
    setBusy(true);
    try {
      await clearComprovativo(row);
      await refreshPayments();
      showToast("Comprovativo removido", "ok");
    } catch (e: any) {
      showToast(e?.message || "Falha a remover", "err");
    } finally {
      setBusy(false);
    }
  }

  const numAtletasAgregado = state.atletas.filter(
    (a) => !isAnuidadeObrigatoria(a.escalao)
  ).length;
  const rankMap = (function build() {
    const elegiveis = state.atletas
      .filter((a) => !isAnuidadeObrigatoria(a.escalao))
      .slice()
      .sort(
        (a, b) =>
          new Date(a.dataNascimento).getTime() -
          new Date(b.dataNascimento).getTime()
      );
    const m: Record<string, number> = {};
    elegiveis.forEach((a, i) => {
      m[a.id] = i;
    });
    return m;
  })();

  if (state.atletas.length === 0 && !isSocio(state.perfil?.tipoSocio)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Situação de Tesouraria</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">
            Crie primeiro um atleta ou ative a opção de sócio.
          </p>
        </CardContent>
      </Card>
    );
  }

  const FileName = ({
    row,
    fallbackIndex,
  }: {
    row?: PagamentoRowWithUrl | null;
    fallbackIndex: number;
  }) => {
    const name = inferFileName(row) || `Ficheiro ${fallbackIndex}`;
    return (
      <span
        className="inline-block max-w-[220px] align-middle truncate"
        title={name}
      >
        {name}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <EuroIcon className="h-5 w-5 mr-2" />
          Situação de Tesouraria
          {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="p-2 pb-0 m-0">
          <div className="border rounded-lg p-3 bg-blue-50 text-blue-900">
            <p className="text-sm text-blue-900">
              Os pagamentos devem ser realizados até à data limite indicada, para o
              seguinte IBAN:
              <strong className="ml-1">PT50 0036 0414 99106005021 95</strong>
              <span className="ml-1">(Banco Montepio)</span>.
            </p>
          </div>
        </div>

        <div className="p-2 text-sm m-0">
          {isSocio(state.perfil?.tipoSocio) && (
            <div>
              {(() => {
                const row = socioRows[0] || null;
                const overdue = isOverdue(row);
                const val = socioInscricaoAmount(state.perfil?.tipoSocio);
                const due = row?.devido_em || sep8OfCurrentYear();
                const name = inferFileName(row);
                return (
                  <div className="border bg-neutral-50 rounded-lg p-3 space-y-2">
                    <div className="flex flex-col sm:flex-row">
                      <div className="flex-1 flex-col space-y-1 p-1">
                        <div className="font-medium">
                          Inscrição de Sócio — {eur(val)}
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
                          {due && <span className="ml-2">· Limite: {due}</span>}
                        </div>

                        {row?.signedUrl && (
                          <div className="text-xs mt-1">
                            <a
                              className="underline inline-flex items-center gap-1"
                              href={row.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={name || "Abrir comprovativo"}
                            >
                              <LinkIcon className="h-3 w-3" />
                              <span className="inline-block max-w-[240px] truncate">
                                {name || "Ficheiro 1"}
                              </span>
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex-none space-y-1 p-1">
                        <div className="inline-flex rounded-md shadow-xs text-xs" role="group">
                          <FilePickerButton size="sm"
                            variant={row?.comprovativo_url ? "default_left_group" : "outline"}
                            accept="image/*,application/pdf"
                            onFiles={(files) =>
                              files?.[0] && handleUploadSocio(files[0])
                            }
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {row?.comprovativo_url ? "Substituir" : "Carregar"}
                          </FilePickerButton>

                          {row?.comprovativo_url && (
                            <Button size="sm"
                              variant="destructive_right_group"
                              onClick={() => handleRemoveSocioInscricao(row)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  
                  </div>
                );
              })()}
            </div>
          )}
        </div>





        {state.atletas.map((a) => {
          const planoEfetivo = isAnuidadeObrigatoria(a.escalao)
            ? "Anual"
            : a.planoPagamento;

          const est = estimateCosts({
            escalao: a.escalao || "",
            tipoSocio: state.perfil?.tipoSocio,
            numAtletasAgregado: Math.max(1, numAtletasAgregado),
            proRank: rankMap[a.id],
          });

          const onlyInscricao = isAnuidadeObrigatoria(a.escalao);
          const slots = getSlotsForPlano(planoEfetivo);
          const rows =
            payments[a.id] || Array.from({ length: slots }, () => null);

          const amountForIdx = (idx: number) => {
            if (planoEfetivo === "Mensal") return est.mensal10;
            if (planoEfetivo === "Trimestral") return est.trimestre3;
            return est.anual1;
          };

          return (
            <div key={a.id} className="p-2">
              <div className="flex flex-col sm:flex-row">
                <div className="flex-1 flex-col space-y-1 p-1">
                  <div className="font-medium">Atleta — {a.nomeCompleto}</div>
                </div>
                <div className="flex-none flex-col space-y-1 p-1 align-middle">
                  <span className="inline-block rounded-md px-2 py-0.5 text-xs font-medium bg-green-700 text-white">
                      Plano: {onlyInscricao ? "Sem quotas (apenas inscrição)" : planoEfetivo}
                      {isAnuidadeObrigatoria(a.escalao)
                        ? " (obrigatório pelo escalão)"
                        : ""}
                      {!onlyInscricao && <> · {slots} comprovativo(s)</>}
                  </span>
                </div>
              </div>


              

              {(() => {
                const row = athleteInscricao[a.id] || null;
                const overdue = row?.devido_em
                  ? new Date() > new Date(row.devido_em + "T23:59:59")
                  : false;
                const name = inferFileName(row);
                return (
                  <div className="border bg-neutral-50 rounded-lg p-3 space-y-2 mb-2">
                    <div className="flex flex-col sm:flex-row">
                      <div className="flex-1 flex-col space-y-1 p-1">
                        <div className="font-medium">
                          Inscrição de Atleta — {eur(est.taxaInscricao)}
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
                            <span className="ml-2">· Limite: {row.devido_em}</span>
                          )}
                        </div>
                        <div>
                          {row?.signedUrl && (
                            <div className="text-xs mt-1">
                              <a
                                className="underline inline-flex items-center gap-1"
                                href={row.signedUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={name || "Abrir comprovativo"}
                              >
                                <LinkIcon className="h-3 w-3" />
                                <span className="inline-block max-w-[240px] truncate">
                                  {name || "Ficheiro 1"}
                                </span>
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex-none space-y-1 p-1">
                        <div className="inline-flex rounded-md shadow-xs" role="group">
                          <FilePickerButton size="sm"
                            variant={row?.comprovativo_url ? "default_left_group" : "outline"}
                            accept="image/*,application/pdf"
                            onFiles={(files) =>
                              files?.[0] && handleUploadInscricao(a, files[0])
                            }
                          >
                            <Upload className="h-4 w-4 mr-1" />
                            {row?.comprovativo_url ? "Substituir" : "Carregar"}
                          </FilePickerButton>
                          {row?.comprovativo_url && (
                            <Button size="sm"
                              variant="destructive_right_group"
                              onClick={() => handleRemoveAtletaInscricao(row)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}



              {!isAnuidadeObrigatoria(a.escalao) && (
                <div className="grid md:grid-cols-2 gap-3">
                  {Array.from({ length: slots }).map((_, i) => {
                    const meta = rows[i];
                    const label = getPagamentoLabel(planoEfetivo, i);
                    const overdue = isOverdue(meta);
                    const due = meta?.devido_em || undefined;

                    return (
                      <div key={i}
                        className="border bg-neutral-50 rounded-lg p-3 space-y-2">
                        <div className="flex flex-col sm:flex-row">
                          <div className="flex-1 flex-col space-y-1 p-1">
                            <div className="font-medium">
                              {label} — {eur(amountForIdx(i))}
                            </div>
                            <div className="text-xs text-gray-500">
                              {meta?.comprovativo_url
                                ? meta.validado
                                  ? "Comprovativo validado"
                                  : overdue
                                  ? "Comprovativo pendente (em atraso)"
                                  : "Comprovativo pendente"
                                : overdue
                                ? "Comprovativo em falta (em atraso)"
                                : "Comprovativo em falta"}
                              {due && (
                                <span className="ml-2">· Limite: {due}</span>
                              )}
                            </div>

                            {meta?.signedUrl && (
                              <div className="text-xs mt-1">
                                <a
                                  className="underline inline-flex items-center gap-1"
                                  href={meta.signedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={
                                    inferFileName(meta) || `Ficheiro ${i + 1}`
                                  }
                                >
                                  <LinkIcon className="h-3 w-3" />
                                  <FileName row={meta} fallbackIndex={i + 1} />
                                </a>
                              </div>
                            )}
                          </div>
                          <div className="flex-none space-y-1 p-1">
                            <div className="inline-flex rounded-md shadow-xs" role="group">
                              <FilePickerButton size="sm"
                                variant={meta?.comprovativo_url ? "default_left_group" : "outline"}
                                accept="image/*,application/pdf"
                                onFiles={(files) =>
                                  files?.[0] && handleUpload(a, i, files[0])
                                }
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                {meta?.comprovativo_url ? "Substituir" : "Carregar"}
                              </FilePickerButton>

                              {meta?.comprovativo_url && (
                                <Button size="sm"
                                  variant="destructive_right_group"
                                  onClick={() => handleDelete(a, i)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Remover
                                </Button>
                              )}

                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}



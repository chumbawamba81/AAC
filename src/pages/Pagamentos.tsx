// src/pages/Pagamentos.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

// UI
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { RefreshCw, Upload, Trash2, Link as LinkIcon } from "lucide-react";
import FilePickerButton from "../components/FilePickerButton";

// Tipos/serviços
import type { Atleta, PlanoPagamento } from "../types/Atleta";
import { listAtletas } from "../services/atletasService";
import {
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
} from "../services/pagamentosService";

// NOVO: para calcular valores
import { estimateCosts, eur } from "../utils/pricing";
// NOVO: para obter tipo de sócio do utilizador (para preços corretos)
import { getMyProfile } from "../services/profileService";

/* ---------------- Helpers de plano/labels ---------------- */
function getSlotsForPlano(p: PlanoPagamento) {
  if (p === "Mensal") return 10;
  if (p === "Trimestral") return 3;
  return 1; // "Anual"
}
function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
function isAnuidadeObrigatoria(escalao: string | undefined) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores sub 23") ||
    s.includes("seniores sub-23")
  );
}
// NOVO: limite default (igual ao usado no App.tsx)
function sep8OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-08`;
}

/* ---------------- Página pública ---------------- */
export default function PagamentosPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<Record<string, Array<PagamentoRowWithUrl | null>>>({});
  // NOVO: inscrição mais recente por atleta
  const [inscricaoByAtleta, setInscricaoByAtleta] = useState<Record<string, PagamentoRowWithUrl | null>>({});
  // NOVO: tipo de sócio (para preços corretos)
  const [tipoSocio, setTipoSocio] = useState<string | null>(null);

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

  // obter tipo de sócio do perfil (para pricing)
  useEffect(() => {
    if (!userId) return;
    getMyProfile().then((p) => setTipoSocio(p?.tipoSocio ?? null)).catch(() => {});
  }, [userId]);

  // atletas do utilizador
  const refreshAtletas = useCallback(async () => {
    try {
      const rows = await listAtletas();
      setAtletas(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error("[PagamentosPage] listAtletas", e);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshAtletas();
  }, [userId, refreshAtletas]);

  const refreshPayments = useCallback(async () => {
    if (!userId) return;
    const next: Record<string, Array<PagamentoRowWithUrl | null>> = {};
    const inscrNext: Record<string, PagamentoRowWithUrl | null> = {};

    for (const a of atletas) {
      const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
      const slots = getSlotsForPlano(planoEfetivo);
      const labels = Array.from({ length: slots }, (_, i) => getPagamentoLabel(planoEfetivo, i));

      const rows = await listPagamentosByAtleta(a.id);
      const rowsWithUrl = await withSignedUrlsPagamentos(rows);

      const byDesc = new Map<string, PagamentoRowWithUrl[]>();
      for (const r of rowsWithUrl) {
        const key = (r.descricao || "").toString();
        const arr = byDesc.get(key) || [];
        arr.push(r);
        byDesc.set(key, arr);
      }

      // NOVO: inscrição do atleta — aceitar “inscricao”, “inscrição de atleta” e legado “taxa de inscrição”
      const inscrArr = rowsWithUrl.filter(
        (r) =>
          (r as any).tipo === "inscricao" ||
          (r.descricao || "").toLowerCase() === "inscrição de atleta" ||
          (r.descricao || "").toLowerCase() === "inscrição" ||
          (r.descricao || "").toLowerCase() === "taxa de inscrição"
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
    setInscricaoByAtleta(inscrNext);
  }, [userId, atletas]);

  useEffect(() => {
    if (!userId) return;
    refreshPayments();
  }, [userId, atletas.map(a => a.id).join(","), refreshPayments]);

  // realtime: pagamentos
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("rt-pagamentos-public")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagamentos" },
        () => refreshPayments()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshPayments]);

  // ações
  async function handleUpload(athlete: Atleta, idx: number, file: File) {
    if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
    setBusy(true);
    try {
      const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao) ? "Anual" : athlete.planoPagamento;
      const label = getPagamentoLabel(planoEfetivo, idx);
      await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: label, file });
      await refreshPayments();
    } catch (e: any) {
      console.error("[PagamentosPage] upload", e);
      alert(e?.message || "Falha no upload");
    } finally { setBusy(false); }
  }

  // NOVO: upload/substituição do comprovativo de INSCRIÇÃO
  async function handleUploadInscricao(athlete: Atleta, file: File) {
    if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
    setBusy(true);
    try {
      await saveComprovativoPagamento({
        userId,
        atletaId: athlete.id,
        descricao: "Inscrição de atleta", // novo rótulo
        file,
      });
      await refreshPayments();
    } catch (e: any) {
      console.error("[PagamentosPage] upload inscrição atleta", e);
      alert(e?.message || "Falha no upload");
    } finally { setBusy(false); }
  }

  async function handleDelete(athlete: Atleta, idx: number) {
    const row = payments[athlete.id]?.[idx];
    if (!row) return;
    if (!confirm("Remover este comprovativo?")) return;
    setBusy(true);
    try {
      await deletePagamento(row);
      await refreshPayments();
    } catch (e: any) {
      console.error("[PagamentosPage] delete", e);
      alert(e?.message || "Falha a remover");
    } finally { setBusy(false); }
  }

  // helpers de valor
  const hasSession = !!userId;
  const numAtletasAgregado = useMemo(
    () => atletas.filter(a => !isAnuidadeObrigatoria(a.escalao)).length || 1,
    [atletas]
  );
  const totalSlots = useMemo(
    () =>
      atletas.reduce((acc, a) => {
        const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
        return acc + getSlotsForPlano(planoEfetivo);
      }, 0),
    [atletas]
  );

  function isOverdue(row: PagamentoRowWithUrl | null): boolean {
    if (!row || row.validado) return false;
    const due = row.devido_em || sep8OfCurrentYear();
    const dt = new Date(due + "T23:59:59");
    return new Date().getTime() > dt.getTime();
  }

  if (!hasSession) {
    return (
      <Card>
        <CardHeader><CardTitle>Pagamentos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Precisa de iniciar sessão para gerir os comprovativos de pagamento.</p>
        </CardContent>
      </Card>
    );
  }

  if (atletas.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Pagamentos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">Crie primeiro um atleta para registar pagamentos.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Pagamentos {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {atletas.map((a) => {
          const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
          const slots = getSlotsForPlano(planoEfetivo);
          const rows = payments[a.id] || Array.from({ length: slots }, () => null);

          // valores para este atleta (usam tipo de sócio real, quando disponível)
          const est = estimateCosts({
            escalao: a.escalao || "",
            tipoSocio: tipoSocio,
            numAtletasAgregado: Math.max(1, numAtletasAgregado),
          });
          const amountForIdx = (idx: number) => {
            if (planoEfetivo === "Mensal") return est.mensal10;
            if (planoEfetivo === "Trimestral") return est.trimestre3;
            return est.anual1;
          };

          const inscr = inscricaoByAtleta[a.id] || null;
          const inscrDue = inscr?.devido_em || sep8OfCurrentYear();

          return (
            <div key={a.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{a.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  Plano: {planoEfetivo}{isAnuidadeObrigatoria(a.escalao) ? " (obrigatório pelo escalão)" : ""} · {slots} comprovativo(s)
                </div>
              </div>

              {/* NOVO — Inscrição de atleta (antes das quotas) */}
              <div className="border rounded-lg p-3 mb-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">Inscrição de atleta — {eur(est.taxaInscricao)}</div>
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
                    {inscrDue && <span className="ml-2">· Limite: {inscrDue}</span>}
                    {inscr?.signedUrl && (
                      <a
                        className="underline inline-flex items-center gap-1 ml-2"
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
                  variant={inscr?.comprovativo_url ? "secondary" : "outline"}
                  accept="image/*,application/pdf"
                  onFiles={(files) => files?.[0] && handleUploadInscricao(a, files[0])}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {inscr?.comprovativo_url ? "Substituir" : "Carregar"}
                </FilePickerButton>
              </div>

              {/* Grelha de quotas (mantida), agora com valor e prazo */}
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: slots }).map((_, i) => {
                  const meta = rows[i];
                  const label = getPagamentoLabel(planoEfetivo, i);
                  const overdue = isOverdue(meta);
                  const due = meta?.devido_em || undefined;

                  return (
                    <div key={i} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{label} — {eur(amountForIdx(i))}</div>
                        <div className="text-xs text-gray-500">
                          {meta?.comprovativo_url
                            ? (
                              <span className="inline-flex items-center gap-2">
                                {meta.validado ? "Comprovativo validado" : (overdue ? "Comprovativo pendente (em atraso)" : "Comprovativo pendente")}
                                {meta.signedUrl && (
                                  <a className="underline inline-flex items-center gap-1" href={meta.signedUrl} target="_blank" rel="noreferrer">
                                    <LinkIcon className="h-3 w-3" /> Abrir
                                  </a>
                                )}
                              </span>
                            )
                            : (overdue ? "Comprovativo em falta (em atraso)" : "Comprovativo em falta")
                          }
                          {due && <span className="ml-2">· Limite: {due}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <FilePickerButton
                          variant={meta ? "secondary" : "outline"}
                          accept="image/*,application/pdf"
                          onFiles={(files) => handleUpload(a, i, files[0])}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {meta ? "Substituir" : "Carregar"}
                        </FilePickerButton>

                        {meta && (
                          <Button variant="destructive" onClick={() => handleDelete(a, i)}>
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
        <div className="text-xs text-gray-500">Total de slots nesta conta: {totalSlots}</div>
      </CardContent>
    </Card>
  );
}

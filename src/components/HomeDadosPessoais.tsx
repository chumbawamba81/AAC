import React, { useEffect, useState, useCallback } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import ImagesDialog from "./ImagesDialog";

import { supabase } from "../supabaseClient";

import { upsertMyProfile } from "../services/profileService";
import {
  createInscricaoSocioIfMissing,
  listSocioInscricao,
  listByAtleta as listPagamentosByAtleta,
} from "../services/pagamentosService";

import { estimateCosts, eur, socioInscricaoAmount } from "../utils/pricing";
import { isValidPostalCode, isValidNIF } from "../utils/form-utils";

import type { PessoaDados } from "../types/PessoaDados";
import type { Atleta, PlanoPagamento } from "../types/Atleta";
import type { State } from "../App";

import { AlertCircle, CheckCircle2, FileUp, PencilLine, Shield } from "lucide-react";

// Local copies of constants used for document counters
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Termo de responsabilidade",
  "Exame médico",
] as const;

const DOCS_SOCIO = ["Ficha de Sócio"] as const;

function wantsSocio(tipo?: string | null) {
  return !!tipo && !/não\s*pretendo\s*ser\s*sócio/i.test(tipo);
}

function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isMasters = s.includes("masters");
  const isSub23 = /(sub|seniores)[^\d]*23/.test(s) || /sub[-\s]?23/.test(s);
  return isMasters || isSub23;
}

function normalizePessoaDados(x: any, fallbackEmail?: string): PessoaDados {
  return {
    nomeCompleto: x?.nomeCompleto ?? "",
    tipoSocio: x?.tipoSocio ?? "Não pretendo ser sócio",
    dataNascimento: x?.dataNascimento ?? "",
    morada: x?.morada ?? "",
    codigoPostal: x?.codigoPostal ?? "",
    tipoDocumento: x?.tipoDocumento ?? "Cartão de cidadão",
    numeroDocumento: x?.numeroDocumento ?? "",
    nif: x?.nif ?? "",
    telefone: x?.telefone ?? "",
    email: x?.email ?? fallbackEmail ?? "",
    profissao: x?.profissao ?? "",
  };
}

type PessoaDadosWithVal = PessoaDados & { dataValidadeDocumento?: string };

export default function HomeDadosPessoais({
  state,
  setState,
  onAfterSave,
  goTesouraria,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  onAfterSave: () => void;
  goTesouraria: () => void;
}) {
  function formatPostal(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 7);
    if (d.length <= 4) return d;
    return d.slice(0, 4) + "-" + d.slice(4);
  }

  const basePerfil = state.perfil
    ? normalizePessoaDados(state.perfil, state.conta?.email)
    : null;

  const [editMode, setEditMode] = useState<boolean>(!basePerfil);
  const [form, setForm] = useState<PessoaDadosWithVal>(
    () =>
      (basePerfil as PessoaDadosWithVal) || {
        nomeCompleto: "",
        tipoSocio: "Não pretendo ser sócio",
        dataNascimento: "",
        morada: "",
        codigoPostal: "",
        tipoDocumento: "Cartão de cidadão",
        numeroDocumento: "",
        nif: "",
        telefone: "",
        email: state.conta?.email || "",
        profissao: "",
        dataValidadeDocumento: "",
      }
  );

  useEffect(() => {
    if (basePerfil) {
      setForm((prev) => ({ ...prev, ...(basePerfil as PessoaDadosWithVal) }));
      setEditMode(false);
    }
  }, [state.perfil]);

  // ===== Contadores reais do Supabase (documentos) =====
  const [userId, setUserId] = useState<string | null>(null);
  const [socioMissingCount, setSocioMissingCount] = useState<number>(
    DOCS_SOCIO.length
  );
  const [athMissingCount, setAthMissingCount] = useState<number>(
    state.atletas.length * DOCS_ATLETA.length
  );

  // Resumo Tesouraria — inscrições + quotas
  type ResumoStatus =
    | "regularizado"
    | "pendente"
    | "em_dia"
    | "em_atraso"
    | "sem_lancamento";
  const [athInscr, setAthInscr] = useState<
    Record<
      string,
      { status: ResumoStatus; due?: string | null; valor?: number }
    >
  >({});
  const [athQuotaNext, setAthQuotaNext] = useState<
    Record<
      string,
      { status: ResumoStatus; due?: string | null; valor?: number }
    >
  >({});
  const [socioInscrResumo, setSocioInscrResumo] = useState<{
    status: ResumoStatus;
    due?: string | null;
    valor?: number;
  } | null>(null);

  function StatusBadge({ s }: { s: ResumoStatus }) {
    const map: Record<ResumoStatus, string> = {
      regularizado: "bg-green-700 text-white",
      pendente: "bg-blue-100 text-blue-700",
      em_dia: "bg-gray-100 text-gray-700",
      em_atraso: "bg-red-100 text-red-700",
      sem_lancamento: "bg-gray-100 text-gray-500",
    };
    const label: Record<ResumoStatus, string> = {
      regularizado: "Regularizado",
      pendente: "Pendente de validação",
      em_dia: "Dentro do prazo",
      em_atraso: "Em atraso",
      sem_lancamento: "Sem lançamento",
    };
    return (
      <span
        className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${map[s]}`}
      >
        {label[s]}
      </span>
    );
  }

  function buildProRankMap(atletas: Atleta[]) {
    const elegiveis = atletas
      .filter((a) => !isAnuidadeObrigatoria(a.escalao))
      .slice()
      .sort(
        (a, b) =>
          new Date(a.dataNascimento).getTime() -
          new Date(b.dataNascimento).getTime()
      );
    const map: Record<string, number> = {};
    elegiveis.forEach((a, i) => {
      map[a.id] = i;
    });
    return map;
  }

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

  // carregar documentos do supabase (contadores)
  useEffect(() => {
    async function fetchDocCounters() {
      if (!userId) {
        setSocioMissingCount(DOCS_SOCIO.length);
        setAthMissingCount(state.atletas.length * DOCS_ATLETA.length);
        return;
      }
      // -- Sócio
      const socioSel = await supabase
        .from("documentos")
        .select("doc_tipo")
        .eq("user_id", userId)
        .eq("doc_nivel", "socio")
        .is("atleta_id", null);

      const socioSet = new Set<string>((socioSel.data || []).map((r: any) => r.doc_tipo));
      const socioMiss = DOCS_SOCIO.filter((t) => !socioSet.has(t)).length;
      setSocioMissingCount(socioMiss);

      // -- Atletas
      const athSel = await supabase
        .from("documentos")
        .select("atleta_id, doc_tipo")
        .eq("user_id", userId)
        .eq("doc_nivel", "atleta");

      const byAth: Map<string, Set<string>> = new Map();
      for (const r of (athSel.data || []) as any[]) {
        if (!r.atleta_id) continue;
        const set = byAth.get(r.atleta_id) || new Set<string>();
        set.add(r.doc_tipo);
        byAth.set(r.atleta_id, set);
      }
      let totalMissing = 0;
      for (const a of state.atletas) {
        const have = byAth.get(a.id) || new Set<string>();
        for (const t of DOCS_ATLETA) if (!have.has(t)) totalMissing++;
      }
      setAthMissingCount(totalMissing);
    }

    fetchDocCounters().catch((e) => console.error("[fetchDocCounters]", e));
  }, [userId, state.atletas.map((a) => a.id).join(",")]);

  // INSCRIÇÕES (sócio + atletas) para o resumo
  useEffect(() => {
    async function fetchInscricoes() {
      if (!userId) {
        setAthInscr({});
        setSocioInscrResumo(null);
        return;
      }

      // Sócio — inscrição
      if (wantsSocio(state.perfil?.tipoSocio)) {
        try {
          await createInscricaoSocioIfMissing(userId);
          const socio = await listSocioInscricao(userId);
          const row = socio?.[0];
          const status: ResumoStatus = row
            ? row.validado
              ? "regularizado"
              : row.comprovativo_url
              ? "pendente"
              : row.devido_em && new Date() > new Date(row.devido_em + "T23:59:59")
              ? "em_atraso"
              : "em_dia"
            : "sem_lancamento";
          setSocioInscrResumo({
            status,
            due: row?.devido_em ?? sep30OfCurrentYear(),
            valor: socioInscricaoAmount(state.perfil?.tipoSocio),
          });
        } catch (e) {
          console.error("[Resumo] inscrição sócio", e);
          setSocioInscrResumo({
            status: "sem_lancamento",
            due: sep30OfCurrentYear(),
            valor: socioInscricaoAmount(state.perfil?.tipoSocio),
          });
        }
      } else {
        setSocioInscrResumo(null);
      }

      // Atletas — inscrição
      const out: Record<
        string,
        { status: ResumoStatus; due?: string | null; valor?: number }
      > = {};
      const numAgregado = Math.max(
        1,
        state.atletas.filter((x) => !isAnuidadeObrigatoria(x.escalao)).length
      );
      const rankMap = buildProRankMap(state.atletas);

      for (const a of state.atletas) {
        const { data, error } = await supabase
          .from("pagamentos")
          .select("id,descricao,tipo,comprovativo_url,validado,devido_em,created_at")
          .eq("atleta_id", a.id)
          .eq("tipo", "inscricao")
          .order("created_at", { ascending: false })
          .limit(1);

        const row = error ? null : (data || [])[0];
        const est = estimateCosts({
          escalao: a.escalao || "",
          tipoSocio: state.perfil?.tipoSocio,
          numAtletasAgregado: numAgregado,
          proRank: rankMap[a.id],
        });

        const status: ResumoStatus = row
          ? row.validado
            ? "regularizado"
            : row.comprovativo_url
            ? "pendente"
            : row.devido_em && new Date() > new Date(row.devido_em + "T23:59:59")
            ? "em_atraso"
            : "em_dia"
          : "sem_lancamento";

        out[a.id] = { status, due: row?.devido_em ?? sep30OfCurrentYear(), valor: est.taxaInscricao };
      }
      setAthInscr(out);
    }
    fetchInscricoes().catch((e) => console.error("[Resumo Tesouraria] inscrições:", e));
  }, [
    userId,
    state.atletas.map((a) => a.id).join(","),
    state.perfil?.tipoSocio,
  ]);

  // QUOTAS — próxima a vencer por atleta
  useEffect(() => {
    async function fetchQuotasNext() {
      if (!userId || state.atletas.length === 0) {
        setAthQuotaNext({});
        return;
      }
      const out: Record<
        string,
        { status: ResumoStatus; due?: string | null; valor?: number }
      > = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const numAgregado = Math.max(
        1,
        state.atletas.filter((a) => !isAnuidadeObrigatoria(a.escalao)).length
      );

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

      for (const a of state.atletas) {
        const rowsAll = await listPagamentosByAtleta(a.id);
        const rows = rowsAll.filter((r) => (r as any).tipo !== "inscricao" && r.devido_em);

        const future = rows
          .filter(
            (r) => r.devido_em && new Date(r.devido_em + "T00:00:00").getTime() >= today.getTime()
          )
          .sort(
            (x, y) => new Date(x.devido_em!).getTime() - new Date(y.devido_em!).getTime()
          );

        const candidate =
          future[0] ||
          rows.sort((x, y) => new Date(y.devido_em!).getTime() - new Date(x.devido_em!).getTime())[0] ||
          null;

        if (!candidate) {
          out[a.id] = { status: "sem_lancamento" };
          continue;
        }

        const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(a.escalao)
          ? "Anual"
          : a.planoPagamento;
        const est = estimateCosts({
          escalao: a.escalao || "",
          tipoSocio: state.perfil?.tipoSocio,
          numAtletasAgregado: numAgregado,
          proRank: rankMap[a.id],
        });

        const valor =
          planoEfetivo === "Mensal"
            ? est.mensal10
            : planoEfetivo === "Trimestral"
            ? est.trimestre3
            : est.anual1;

        const status: ResumoStatus = candidate.validado
          ? "regularizado"
          : candidate.comprovativo_url
          ? "pendente"
          : candidate.devido_em && new Date() > new Date(candidate.devido_em + "T23:59:59")
          ? "em_atraso"
          : "em_dia";

        out[a.id] = { status, due: candidate.devido_em ?? undefined, valor };
      }
      setAthQuotaNext(out);
    }
    fetchQuotasNext().catch((e) => console.error("[Resumo Tesouraria] quotas next:", e));
  }, [
    userId,
    state.atletas.map((a) => a.id).join(","),
    state.perfil?.tipoSocio,
  ]);

  function sep30OfCurrentYear(): string {
    const y = new Date().getFullYear();
    return `${y}-09-30`;
  }

  function isTipoSocio(tipo?: string | null) {
    return !!(tipo && !/não\s*pretendo/i.test(tipo));
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!form.nomeCompleto.trim()) errs.push("Nome obrigatório");
    const isValidISODate = (s: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
    if (!isValidISODate(form.dataNascimento)) errs.push("Data de nascimento inválida");
    if (!form.morada.trim()) errs.push("Morada obrigatória");
    if (!isValidPostalCode(form.codigoPostal)) errs.push("Código-postal inválido (####-###)");
    if (!form.numeroDocumento.trim()) errs.push("Número de documento obrigatório");
    if (!isValidNIF(form.nif)) errs.push("NIF inválido");
    if (!form.telefone.trim()) errs.push("Telefone obrigatório");
    if (!form.email.trim()) errs.push("Email obrigatório");
    if (form.tipoDocumento === "Cartão de cidadão") {
      if (!form.dataValidadeDocumento || !/^\d{4}-\d{2}-\d{2}$/.test(form.dataValidadeDocumento)) {
        errs.push("Validade do cartão de cidadão é obrigatória");
      } else if (!(function isFutureISODate(s: string): boolean {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const d = new Date(s + "T00:00:00");
        if (Number.isNaN(d.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return d.getTime() > today.getTime();
      })(form.dataValidadeDocumento)) {
        errs.push("A validade do cartão de cidadão deve ser futura");
      }
    }
    if (errs.length) {
      alert(errs.join("\n"));
      return;
    }

    try {
      const savedPerfil = await upsertMyProfile(form as PessoaDados);
      const next: State = {
        ...state,
        perfil: normalizePessoaDados(savedPerfil, state.conta?.email),
      };
      setState(next);
      localStorage.setItem("bb_app_payments_v1", JSON.stringify(next));

      // Limpeza de inscrição de sócio se o utilizador retirar a opção
      try {
        if (!isTipoSocio(form.tipoSocio) && userId) {
          await supabase
            .from("pagamentos")
            .delete()
            .eq("user_id", userId)
            .is("atleta_id", null)
            .eq("tipo", "inscricao");
        }
      } catch (e) {
        console.error("[clean socio inscricao]", e);
      }

      setEditMode(false);
      onAfterSave();
    } catch (e: any) {
      alert(e.message || "Não foi possível guardar o perfil no servidor");
    }
  }

  if (!editMode && basePerfil) {
    const socioMissing = socioMissingCount;
    const missingAthDocs = athMissingCount;
    const showSocioArea = wantsSocio(basePerfil.tipoSocio);

    return (
      <div className="space-y-4">
        {/* DADOS */}
        <div className="relative flex flex-col my-6 bg-white border 
   border-slate-200 rounded-lg">
          <div className="mb-0 border-b bg-amber-500 text-white p-2 px-1">
            <span className="p-4 text-xs xs:text-sm sm:text-base md:text-lg font-medium uppercase">
              Dados do sócio/encarregado de educação
            </span>
          </div>
          <div className="flex flex-col lg:flex-row">
            <div className="flex-1 flex-col space-y-4 p-4">
              <div data-slot="card-content">
                <div className="font-semibold">{basePerfil.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  {basePerfil.email} · {basePerfil.telefone} · {basePerfil.codigoPostal}
                  {isTipoSocio(basePerfil.tipoSocio) && (
                    <> · {basePerfil.tipoSocio}</>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  {showSocioArea &&
                    (socioMissing > 0 ? (
                      <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-400 text-black">
                        <FileUp className="h-3 w-3" />
                        Sócio (docs): {socioMissing} documento(s) em falta
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-green-700 text-white">
                        <FileUp className="h-3 w-3" />
                        Sócio (docs): {socioMissing} documento(s) em falta
                      </div>
                    ))}
                  {missingAthDocs > 0 ? (
                    <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-400 text-black">
                      <FileUp className="h-3 w-3" />
                      Atletas (docs): {missingAthDocs} documento(s) em falta
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-green-700 text-white">
                      <FileUp className="h-3 w-3" />
                      Atletas (docs): {missingAthDocs} documento(s) em falta
                    </div>
                  )}

                  {!showSocioArea && missingAthDocs === 0 && (
                    <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-green-50 text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Sem documentos em falta
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="lg:w-[20%] flex-col p-4">
              <div className="text-right">
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <PencilLine className="h-4 w-4 mr-1" />
                  Editar dados
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo de Situação de Tesouraria */}

        <div className="relative flex flex-col my-6 bg-white border border-slate-200 rounded-lg">
          <div className="mb-0 border-b bg-amber-500 text-white p-2 px-1">
            <span className="p-4 text-xs xs:text-sm sm:text-base md:text-lg font-medium uppercase">
              Resumo de Situação de Tesouraria
            </span>
          </div>

          {showSocioArea && (
            <>
              <div className="flex flex-row">
                <div className="flex-1 flex-col space-y-1 p-1">
                  <div data-slot="card-content">
                    <div className="text-sm font-medium">Sócio — Inscrição</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-row gap-1">
                <div className="flex-1 space-y-1 p-1">
                  <div data-slot="card-content">
                    <div className="text-xs">
                      <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-stone-800 inset-ring inset-ring-stone-600/20">
                        {socioInscrResumo?.valor != null && (
                          <span>{eur(socioInscrResumo.valor)}</span>
                        )}
                        {socioInscrResumo?.due && (
                          <span>· Limite: {socioInscrResumo.due}</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex-none space-y-1 p-1">
                  <div className="lg:text-right">
                    <StatusBadge s={socioInscrResumo?.status ?? "sem_lancamento"} />
                  </div>
                </div>
              </div>

              <div className="flex flex-row gap-1">
                <div className="flex-1 space-y-1 p-1">
                  <div className="lg:text-right">
                  <Button variant="stone" onClick={goTesouraria}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-euro-icon lucide-euro"><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/></svg> Consultar tesouraria
                  </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Atletas */}

          {state.atletas.length > 0 && (
            <div>
              {state.atletas.map((a) => {
                const stIns = athInscr[a.id]?.status ?? "sem_lancamento";
                const dueIns = athInscr[a.id]?.due ?? sep30OfCurrentYear();
                const valIns = athInscr[a.id]?.valor;

                const stQ = athQuotaNext[a.id]?.status ?? "sem_lancamento";
                const dueQ = athQuotaNext[a.id]?.due;
                const valQ = athQuotaNext[a.id]?.valor;

                return (
                  <div key={a.id}>
                    <div className="p-1 bg-white"></div>
                    <div className="bg-stone-200">
                      <div className="flex flex-row">
                        <div className="flex-1 flex-col space-y-1 p-1">
                          <div data-slot="card-content">
                            <div className="text-sm font-medium">Atleta — {a.nomeCompleto}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-row gap-1">
                        <div className="flex-1 space-y-1 p-1">
                          <div data-slot="card-content">
                            <div className="text-xs">
                              <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-stone-800 inset-ring inset-ring-stone-600/20">
                                <span className="text-gray-700">Inscrição</span>
                                {valIns != null && <span className="ml-2">{eur(valIns)}</span>}
                                {dueIns && <span className="ml-2 text-gray-600">· Limite: {dueIns}</span>}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-none space-y-1 p-1">
                          <div className="text-right">
                            <StatusBadge s={stIns} />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-row gap-1">
                        <div className="flex-1 space-y-1 p-1">
                          <div data-slot="card-content">
                            {!isAnuidadeObrigatoria(a.escalao) && (
                              <div className="text-xs">
                                <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-stone-800 inset-ring inset-ring-stone-600/20">
                                  <span className="text-gray-700">Quotas</span>
                                  {valQ != null && <span className="ml-2">{eur(valQ)}</span>}
                                  {dueQ && <span className="ml-2 text-gray-600">· Limite: {dueQ}</span>}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-none space-y-1 p-1">
                          <div className="text-right">
                          <StatusBadge s={stQ} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row gap-1">
                        <div className="flex-1 space-y-1 p-1">
                          <div className="lg:text-right">
                          <Button variant="stone" onClick={goTesouraria}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-euro-icon lucide-euro"><path d="M4 10h12"/><path d="M4 14h9"/><path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2"/></svg> Consultar tesouraria
                          </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-lg font-semibold mb-2"></div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Notícias da Secção de Basquetebol</CardTitle>
          </CardHeader>
          <CardContent>
            {state.noticias ? (
              <div className="prose prose-sm max-w-none">{state.noticias}</div>
            ) : (
              <p className="text-sm text-gray-500">Sem notícias no momento.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados Pessoais do Sócio/Encarregado de Educação</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-xl border bg-yellow-50 text-yellow-900 p-3 text-sm">
          <strong>Nota:</strong> Estes dados referem-se ao <em>sócio/encarregado de educação</em>. A inscrição do atleta é realizada no separador <span className="font-medium">Atletas</span>.
        </div>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <div className="space-y-1">
            <Label>Nome Completo *</Label>
            <Input
              value={form.nomeCompleto}
              onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="flex items-center gap-2">
              Tipo de sócio *
              <ImagesDialog
                title="Tabela de Preços — Sócios"
                images={[{ src: "/precos/socios-2025.png", alt: "Tabela de preços de sócios" }]}
                triggerText="Tabela de Preços"
              />
            </Label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={form.tipoSocio}
              onChange={(e) =>
                setForm({ ...form, tipoSocio: e.target.value as PessoaDados["tipoSocio"] })
              }
            >
              <option>Sócio Pro</option>
              <option>Sócio Família</option>
              <option>Sócio Geral Renovação</option>
              <option>Sócio Geral Novo</option>
              <option>Não pretendo ser sócio</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label>Data de Nascimento *</Label>
            <Input
              type="date"
              value={form.dataNascimento}
              onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Morada *</Label>
            <Input
              value={form.morada}
              onChange={(e) => setForm({ ...form, morada: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Código Postal *</Label>
            <Input
              value={form.codigoPostal}
              onChange={(e) => setForm({ ...form, codigoPostal: formatPostal(e.target.value) })}
              placeholder="0000-000"
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Tipo de documento *</Label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={form.tipoDocumento}
              onChange={(e) =>
                setForm({
                  ...form,
                  tipoDocumento: e.target.value as PessoaDados["tipoDocumento"],
                })
              }
            >
              <option>Cartão de cidadão</option>
              <option>Passaporte</option>
              <option>Título de Residência</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label>Nº documento *</Label>
            <Input
              value={form.numeroDocumento}
              onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>NIF *</Label>
            <Input
              value={form.nif}
              onChange={(e) => setForm({ ...form, nif: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Contacto telefónico *</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Endereço eletrónico *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          {form.tipoDocumento === "Cartão de cidadão" && (
            <div className="space-y-1">
              <Label>Validade do Cartão de Cidadão *</Label>
              <Input
                type="date"
                value={form.dataValidadeDocumento || ""}
                onChange={(e) => setForm({ ...form, dataValidadeDocumento: e.target.value })}
                required
              />
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <Label>Profissão (opcional)</Label>
            <Input
              value={form.profissao || ""}
              onChange={(e) => setForm({ ...form, profissao: e.target.value })}
            />
          </div>

          <div className="md:col-span-2 flex justify-end gap-2">
            <Button type="submit">
              <Shield className="h-4 w-4 mr-1" /> Guardar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}



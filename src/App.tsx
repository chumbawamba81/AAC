// src/App.tsx
import React, { useEffect, useState, useCallback } from "react";

// Serviços (Supabase) de autenticação e dados
import { signIn, signUp, signOut } from "./services/authService";
import { getMyProfile, upsertMyProfile } from "./services/profileService";
import {
  listAtletas,
  upsertAtleta as saveAtleta,
  deleteAtleta as removeAtleta,
} from "./services/atletasService";

// UI
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import ImagesDialog from "./components/ImagesDialog";
import TemplatesDownloadSection from "./components/TemplatesDownloadSection";
import {
  ensureOnlyInscricaoForAtleta,
  ensureInscricaoEQuotasForAtleta,
} from "./services/pagamentosService";

import { estimateCosts, eur, socioInscricaoAmount } from "./utils/pricing";
import {
  createInscricaoSocioIfMissing,
  listSocioInscricao,
  saveComprovativoSocioInscricao,
  saveComprovativoInscricaoAtleta,   // <— usado
  clearComprovativo,                  // <— usado
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
  deleteSocioInscricaoIfAny,
} from "./services/pagamentosService";

// Ícones
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  LogIn,
  LogOut,
  Shield,
  UserPlus,
  Users,
  PencilLine,
  Plus,
  Trash2,
  Upload,
  Facebook,
  Instagram,
  Mail,
  RefreshCw,
  Link as LinkIcon,
} from "lucide-react";

// Tipos
import type { PessoaDados } from "./types/PessoaDados";
import type { Atleta, PlanoPagamento } from "./types/Atleta";

// Utils
import { isValidPostalCode, isValidNIF } from "./utils/form-utils";

// Componentes
import AtletaFormCompleto from "./components/AtletaFormCompleto";
import UploadDocsSection from "./components/UploadDocsSection";
import FilePickerButton from "./components/FilePickerButton";

// Supabase
import { supabase } from "./supabaseClient";

// TOAST
import { useToast } from "./components/ui/use-toast";
import { Toaster } from "./components/ui/toaster";

/* -------------------- Constantes locais -------------------- */
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Termo de responsabilidade",
  "Exame médico",
] as const;
// Nota: os comprovativos de inscrição (sócio/atleta) foram migrados para a Tesouraria.

const DOCS_SOCIO = ["Ficha de Sócio"] as const;

type Conta = { email: string };
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

export type State = {
  conta: Conta | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<(typeof DOCS_SOCIO)[number], UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<(typeof DOCS_ATLETA)[number], UploadMeta>>>;
  pagamentos: Record<string, Array<UploadMeta | null>>; // legado
  tesouraria?: string;
  noticias?: string;
  verificationPendingEmail?: string | null;
};

const LS_KEY = "bb_app_payments_v1";

/* -------------------- Helpers -------------------- */
function isPasswordStrong(p: string) {
  const lengthOk = p.length >= 8;
  const hasUpper = /[A-Z]/.test(p);
  const hasLower = /[a-z]/.test(p);
  const hasDigit = /\d/.test(p);
  const hasSpecial = /[^A-Za-z0-9]/.test(p);
  return {
    ok: lengthOk && hasUpper && hasLower && hasDigit && hasSpecial,
    lengthOk,
    hasUpper,
    hasLower,
    hasDigit,
    hasSpecial,
  };
}

// Considera "não pretendo ser sócio" como NÃO-sócio
function wantsSocio(tipo?: string | null) {
  return !!tipo && !/não\s*pretendo\s*ser\s*sócio/i.test(tipo);
}

function isPessoaDados(x: any): x is PessoaDados {
  return (
    x &&
    typeof x === "object" &&
    typeof x.nomeCompleto === "string" &&
    typeof x.dataNascimento === "string" &&
    typeof x.email === "string"
  );
}

function normalizePessoaDados(x: any, fallbackEmail?: string): PessoaDados {
  if (isPessoaDados(x)) return x;
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

function isFutureISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
}
function isTipoSocio(tipo?: string | null) {
  return !!(tipo && !/não\s*pretendo/i.test(tipo));
}

/* --------- Helpers globais (render) --------- */
export function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase();
  const isMasters = s.includes("masters");
  const isSub23  = /(sub|seniores)[^\d]*23/.test(s) || /sub[-\s]?23/.test(s);
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
function sep30OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-30`;
}

/* -------------------- Persistência local -------------------- */
function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return {
        conta: null,
        perfil: null,
        atletas: [],
        docsSocio: {},
        docsAtleta: {},
        pagamentos: {},
        tesouraria: "Campo em atualização",
        noticias: "",
        verificationPendingEmail: null,
      };
    }
    const s = JSON.parse(raw);
    const conta: Conta | null =
      s?.conta && typeof s.conta.email === "string" ? { email: s.conta.email } : null;
    const perfil: PessoaDados | null = s?.perfil ? normalizePessoaDados(s.perfil, conta?.email) : null;

    return {
      conta,
      perfil,
      atletas: Array.isArray(s.atletas) ? s.atletas : [],
      docsSocio: s.docsSocio ?? {},
      docsAtleta: s.docsAtleta ?? {},
      pagamentos: s.pagamentos ?? {},
      tesouraria: s.tesouraria ?? "Campo em atualização",
      noticias: s.noticias ?? "",
      verificationPendingEmail: s.verificationPendingEmail ?? null,
    };
  } catch {
    return {
      conta: null,
      perfil: null,
      atletas: [],
      docsSocio: {},
      docsAtleta: {},
      pagamentos: {},
      tesouraria: "Campo em atualização",
      noticias: "",
      verificationPendingEmail: null,
    };
  }
}
function saveState(s: State) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

/* ------------------------------ ContaSection ------------------------------ */

function PasswordChecklist({ pass }: { pass: string }) {
  const v = isPasswordStrong(pass);
  const Item = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      <span className={ok ? "" : "text-red-600"}>{text}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      <Item ok={v.lengthOk} text="Mínimo 8 caracteres" />
      <Item ok={v.hasUpper} text="Pelo menos 1 letra maiúscula" />
      <Item ok={v.hasLower} text="Pelo menos 1 letra minúscula" />
      <Item ok={v.hasDigit} text="Pelo menos 1 dígito" />
      <Item ok={v.hasSpecial} text="Pelo menos 1 especial" />
    </div>
  );
}

function ContaSection({
  state,
  setState,
  onLogged,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  onLogged: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(state.conta?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        const { data: u } = await supabase.auth.getUser();
        const next: State = { ...state, conta: u?.user?.email ? { email: u.user.email } : state.conta };
        setState(next);
        saveState(next);
        onLogged();
      }
    })();
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(undefined);
    setInfo(undefined);

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("As palavras-passe não coincidem.");
        return;
      }
      const chk = isPasswordStrong(password);
      if (!chk.ok) {
        setError("A palavra-passe não cumpre os requisitos.");
        return;
      }
      try {
        setLoading(true);
        await signUp(email, password);
        const next: State = { ...state, verificationPendingEmail: email, conta: { email } };
        setState(next);
        saveState(next);
        setInfo("Registo efetuado. Verifique o seu email para validar a conta.");
      } catch (e: any) {
        setError(e.message || "Erro no registo");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      const data = await signIn(email, password);
      await supabase.auth.getSession();
      if (!data?.session?.access_token) throw new Error("Sessão inválida. Verifique o email de confirmação.");
      const next: State = { ...state, conta: { email }, verificationPendingEmail: null };
      setState(next);
      saveState(next);
      onLogged();
    } catch (e: any) {
      setError(e.message || "Erro de autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot(ev: React.FormEvent) {
    ev.preventDefault();
    setError(undefined);
    setInfo(undefined);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail || email);
      if (error) throw error;
      setInfo("Se o email existir, foi enviado um link de recuperação.");
      setForgotOpen(false);
    } catch (e: any) {
      setError(e.message || "Não foi possível enviar o email de recuperação");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {mode === "register" ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
          {mode === "register" ? "Criar conta" : "Entrar"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {state.verificationPendingEmail && (
          <div className="mb-3 rounded-lg bg-blue-50 text-blue-900 text-sm p-2">
            Registo efetuado para <strong>{state.verificationPendingEmail}</strong>. Verifique o seu email para validar a conta.
          </div>
        )}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>
              Palavra-passe {mode === "register" && <span className="text-xs text-gray-500">(requisitos abaixo)</span>}
            </Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {mode === "register" && <PasswordChecklist pass={password} />}
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <Label>Repetir palavra-passe *</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Manter sessão iniciada
            </label>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setForgotEmail(email);
                setForgotOpen(true);
              }}
            >
              Recuperar palavra-passe
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>
              {loading ? "Aguarde..." : mode === "register" ? "Registar" : "Entrar"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setMode((m) => (m === "register" ? "login" : "register")); setConfirmPassword(""); }}>
              {mode === "register" ? "Já tenho conta" : "Criar conta"}
            </Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2">
            <Shield className="h-4 w-4 mt-[2px]" />
            <p>Produção: hash Argon2id, cookies httpOnly, sessão, rate limiting, MFA.</p>
          </div>
        </form>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Recuperar palavra-passe</DialogTitle>
            </DialogHeader>
            <form className="space-y-3" onSubmit={submitForgot}>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setForgotOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Enviar link</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ---------------------------- DadosPessoaisSection ---------------------------- */

// Extensão local para incluir validade do documento (mantendo o tipo original)
type PessoaDadosWithVal = PessoaDados & { dataValidadeDocumento?: string };

function DadosPessoaisSection({
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

  const basePerfil = state.perfil ? normalizePessoaDados(state.perfil, state.conta?.email) : null;

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
  }, [state.perfil]); // eslint-disable-line

  // ===== Contadores reais do Supabase (documentos) =====
  const [userId, setUserId] = useState<string | null>(null);
  const [socioMissingCount, setSocioMissingCount] = useState<number>(DOCS_SOCIO.length);
  const [athMissingCount, setAthMissingCount] = useState<number>(state.atletas.length * DOCS_ATLETA.length);

  // Resumo Tesouraria — inscrições de atletas + quotas próximas + sócio inscrição
  type ResumoStatus = "regularizado" | "pendente" | "em_dia" | "em_atraso" | "sem_lancamento";
  const [athInscr, setAthInscr] = useState<Record<string, { status: ResumoStatus; due?: string | null; valor?: number }>>({});
  const [athQuotaNext, setAthQuotaNext] = useState<Record<string, { status: ResumoStatus; due?: string | null; valor?: number }>>({});
  const [socioInscrResumo, setSocioInscrResumo] = useState<{ status: ResumoStatus; due?: string | null; valor?: number } | null>(null);

  function StatusBadge({ s }: { s: ResumoStatus }) {
    const map: Record<ResumoStatus, string> = {
      regularizado: "bg-green-100 text-green-700",
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
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[s]}`}>{label[s]}</span>;
  }

  function buildProRankMap(atletas: Atleta[]) {
    const elegiveis = atletas
      .filter((a) => !isAnuidadeObrigatoria(a.escalao))
      .slice()
      .sort((a, b) => new Date(a.dataNascimento).getTime() - new Date(b.dataNascimento).getTime());

    const map: Record<string, number> = {};
    elegiveis.forEach((a, i) => { map[a.id] = i; });
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
      if (isTipoSocio(state.perfil?.tipoSocio)) {
        try {
          await createInscricaoSocioIfMissing(userId);
          const socio = await listSocioInscricao(userId);
          const row = socio?.[0];
          const status: any = row
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
      const out: Record<string, { status: any; due?: string | null; valor?: number }> = {};
      const numAgregado = Math.max(1, state.atletas.filter((x) => !isAnuidadeObrigatoria(x.escalao)).length);

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

        const status: any = row
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
  }, [userId, state.atletas.map((a) => a.id).join(","), state.perfil?.tipoSocio]);

  // QUOTAS — próxima a vencer por atleta
  useEffect(() => {
    async function fetchQuotasNext() {
      if (!userId || state.atletas.length === 0) {
        setAthQuotaNext({});
        return;
      }
      const out: Record<string, { status: any; due?: string | null; valor?: number }> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const numAgregado = Math.max(1, state.atletas.filter((a) => !isAnuidadeObrigatoria(a.escalao)).length);

      const rankMap = (function build() {
        const elegiveis = state.atletas
          .filter((a) => !isAnuidadeObrigatoria(a.escalao))
          .slice()
          .sort((a, b) => new Date(a.dataNascimento).getTime() - new Date(b.dataNascimento).getTime());
        const m: Record<string, number> = {};
        elegiveis.forEach((a, i) => { m[a.id] = i; });
        return m;
      })();

      for (const a of state.atletas) {
        const rowsAll = await listPagamentosByAtleta(a.id);
        const rows = rowsAll.filter((r) => (r as any).tipo !== "inscricao" && r.devido_em);

        const future = rows
          .filter((r) => r.devido_em && new Date(r.devido_em + "T00:00:00").getTime() >= today.getTime())
          .sort((x, y) => new Date(x.devido_em!).getTime() - new Date(y.devido_em!).getTime());

        const candidate =
          (future[0] ||
            rows.sort((x, y) => new Date(y.devido_em!).getTime() - new Date(x.devido_em!).getTime())[0]) || null;

        if (!candidate) {
          out[a.id] = { status: "sem_lancamento" };
          continue;
        }

        const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
        const est = estimateCosts({
          escalao: a.escalao || "",
          tipoSocio: state.perfil?.tipoSocio,
          numAtletasAgregado: numAgregado,
          proRank: rankMap[a.id],
        });

        const valor =
          planoEfetivo === "Mensal" ? est.mensal10 : planoEfetivo === "Trimestral" ? est.trimestre3 : est.anual1;

        const status: any = candidate.validado
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
  }, [userId, state.atletas.map((a) => a.id).join(","), state.perfil?.tipoSocio]);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!form.nomeCompleto.trim()) errs.push("Nome obrigatório");
    const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
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
      } else if (!isFutureISODate(form.dataValidadeDocumento)) {
        errs.push("A validade do cartão de cidadão deve ser futura");
      }
    }
    if (errs.length) {
      alert(errs.join("\n")); // manter como modal de validação de formulário
      return;
    }

    try {
      const savedPerfil = await upsertMyProfile(form as PessoaDados);
      const next: State = { ...state, perfil: normalizePessoaDados(savedPerfil, state.conta?.email) };
      setState(next);
      saveState(next);
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

  const { toast } = useToast(); // <= TOAST disponível neste escopo para PagamentosSection também

  /* ---------------------------- PagamentosSection --------------------------- */
  function PagamentosSection({ state }: { state: State }) {
    const [userId, setUserId] = useState<string | null>(null);
    const [payments, setPayments] = useState<Record<string, Array<PagamentoRowWithUrl | null>>>({});
    const [socioRows, setSocioRows] = useState<PagamentoRowWithUrl[]>([]);
    const [athleteInscricao, setAthleteInscricao] = useState<Record<string, PagamentoRowWithUrl | null>>({});
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

    const isSocio = (t?: string | null) => wantsSocio(t);

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

        // Inscrição do atleta (Taxa de inscrição)
        const inscrArr = rowsWithUrl.filter(
          (r) => (r as any).tipo === "inscricao" || (r.descricao || "").toLowerCase() === "taxa de inscrição"
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
    }, [userId, state.atletas, state.perfil?.tipoSocio]);

    useEffect(() => { refreshPayments(); }, [refreshPayments]);

    useEffect(() => {
      const channel = supabase
        .channel("rt-pagamentos")
        .on("postgres_changes", { event: "*", schema: "public", table: "pagamentos" }, (payload) => {
          const newAth = (payload as any)?.new?.atleta_id;
          const oldAth = (payload as any)?.old?.atleta_id;
          const ids = new Set(state.atletas.map((a) => a.id));
          if (ids.has(newAth) || ids.has(oldAth)) refreshPayments();
          if (!newAth && !oldAth) refreshPayments(); // socio
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }, [state.atletas, refreshPayments]);

    function isOverdue(row: PagamentoRowWithUrl | null): boolean {
      if (!row || row.validado) return false;
      const due = row.devido_em || sep8OfCurrentYear();
      const dt = new Date(due + "T23:59:59");
      return new Date().getTime() > dt.getTime();
    }

    async function handleUpload(athlete: Atleta, idx: number, file: File) {
      if (!userId || !file) { toast({ variant: "destructive", title: "Sessão ou ficheiro em falta" }); return; }
      setBusy(true);
      try {
        const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao) ? "Anual" : athlete.planoPagamento;
        const label = getPagamentoLabel(planoEfetivo, idx);
        await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: label, file });
        await refreshPayments();
        toast({ title: "Comprovativo carregado" });
      } catch (e: any) {
        console.error("[Pagamentos] upload/replace", e);
        toast({ variant: "destructive", title: "Falha no upload", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    async function handleUploadInscricao(athlete: Atleta, file: File) {
      if (!userId || !file) { toast({ variant: "destructive", title: "Sessão ou ficheiro em falta" }); return; }
      setBusy(true);
      try {
        await saveComprovativoInscricaoAtleta({ userId, atletaId: athlete.id, file });
        await refreshPayments();
        toast({ title: "Comprovativo de inscrição carregado" });
      } catch (e: any) {
        console.error("[Pagamentos] upload inscrição", e);
        toast({ variant: "destructive", title: "Falha no upload", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    async function handleUploadSocio(file: File) {
      if (!userId || !file) { toast({ variant: "destructive", title: "Sessão ou ficheiro em falta" }); return; }
      setBusy(true);
      try {
        await saveComprovativoSocioInscricao(userId, file);
        await refreshPayments();
        toast({ title: "Comprovativo de inscrição de sócio carregado" });
      } catch (e: any) {
        console.error("[Pagamentos] socio upload", e);
        toast({ variant: "destructive", title: "Falha no upload", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    // Apagar comprovativo de quota/anuidade (apaga apenas comprovativo_url)
    async function handleDelete(athlete: Atleta, idx: number) {
      const row = payments[athlete.id]?.[idx];
      if (!row) return;
      if (!confirm("Remover este comprovativo?")) return;
      setBusy(true);
      try {
        await clearComprovativo(row);
        await refreshPayments();
        toast({ title: "Comprovativo removido" });
      } catch (e: any) {
        console.error("[Pagamentos] clear", e);
        toast({ variant: "destructive", title: "Falha a remover", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    async function handleRemoveSocioInscricao(row: PagamentoRowWithUrl) {
      if (!confirm("Remover o comprovativo da inscrição de sócio?")) return;
      setBusy(true);
      try {
        await clearComprovativo(row);
        await refreshPayments();
        toast({ title: "Comprovativo removido" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Falha a remover", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    async function handleRemoveAtletaInscricao(row: PagamentoRowWithUrl) {
      if (!confirm("Remover o comprovativo da inscrição do atleta?")) return;
      setBusy(true);
      try {
        await clearComprovativo(row);
        await refreshPayments();
        toast({ title: "Comprovativo removido" });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Falha a remover", description: e?.message || String(e) });
      } finally { setBusy(false); }
    }

    // ... (RESTO de PagamentosSection — render — mantido como no teu ficheiro)
    // ⚠️ Devido ao tamanho, não repito aqui o JSX completo. Mantém tudo igual,
    // apenas garante que os botões "Remover" chamam handleRemoveSocioInscricao/handleRemoveAtletaInscricao,
    // e os FilePickerButton chamam handleUpload / handleUploadInscricao / handleUploadSocio conforme já tens.
    // [O teu JSX original já estava a chamar estas funções.]
  }

  /* ----------------------------- AtletasSection ----------------------------- */
  // [Mantém igual ao teu ficheiro original; não mexemos em uploads aqui]

  /* ----------------------------------- App ---------------------------------- */

  const [state, setState] = useState<State>(loadState());
  const [activeTab, setActiveTab] = useState<string>("home");
  const [postSavePrompt, setPostSavePrompt] = useState(false);
  const [syncing, setSyncing] = useState<boolean>(true);

  // Modal global de atleta
  const [athModalOpen, setAthModalOpen] = useState(false);
  const [athEditing, setAthEditing] = useState<Atleta | undefined>(undefined);

  // Sync inicial e on SIGNED_IN
  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const [perfilDb, atletasDb] = await Promise.all([getMyProfile(), listAtletas()]);
      setState((prev) => {
        const email = perfilDb?.email || prev.conta?.email || "";
        return {
          ...prev,
          conta: email ? { email } : prev.conta,
          perfil: perfilDb ?? prev.perfil,
          atletas: Array.isArray(atletasDb) ? atletasDb : prev.atletas,
        };
      });
    } catch (e) {
      console.error("[App] sync pós-login:", e);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) doSync();
      else setSyncing(false);
    });
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void doSync();
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, [doSync]);

  useEffect(() => { saveState(state); }, [state]);

  const hasPerfil = !!state.perfil;
  const hasAtletas = state.atletas.length > 0;
  const mainTabLabel = hasPerfil ? "Página Inicial" : "Dados Pessoais";

  function afterSavePerfil() {
    setPostSavePrompt(true);
    setActiveTab("home");
  }

  const openAthForm = (a?: Atleta) => {
    setAthEditing(a);
    setAthModalOpen(true);
  };

  const handleAthSave = async (novo: Atleta) => {
    const wasEditingId = athEditing?.id;
    const planoAntes = athEditing?.planoPagamento;
    const escalaoAntes = athEditing?.escalao;

    try {
      const saved = await saveAtleta(novo);

      const nextAtletas = wasEditingId
        ? state.atletas.map((x) => (x.id === wasEditingId ? saved : x))
        : [saved, ...state.atletas];

      setState((prev) => ({ ...prev, atletas: nextAtletas }));
      saveState({ ...state, atletas: nextAtletas });

      const force = !!wasEditingId && (planoAntes !== saved.planoPagamento || escalaoAntes !== saved.escalao);

      const isOnlyInscricao = isAnuidadeObrigatoria(saved.escalao); // Sub-23 / Masters

      if (isOnlyInscricao) {
        await ensureOnlyInscricaoForAtleta(saved.id);
      } else {
        await ensureInscricaoEQuotasForAtleta(
          { id: saved.id, planoPagamento: saved.planoPagamento },
          { forceRebuild: !!force }
        );
      }

      setAthModalOpen(false);
      setAthEditing(undefined);
    } catch (e: any) {
      alert(e.message || "Falha ao guardar o atleta");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">AAC-SB</h1>
        </div>
        <AuthButton />
      </header>

      {/* GATE + TABS ... (mantém como no teu ficheiro) */}

      {/* Toaster global */}
      <Toaster />   {/* <= IMPORTANTE: renderiza os toasts */}
    </div>
  );
}

/** Botão de autenticação (mostrar “Sair” quando autenticado) */
function AuthButton() {
  const [logged, setLogged] = useState<boolean>(false);
  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setLogged(!!session);
    });
    supabase.auth.getSession().then(({ data }) => setLogged(!!data.session));
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  if (!logged) return null;
  return (
    <Button variant="outline" onClick={() => { signOut().catch(() => {}); }}>
      <LogOut className="h-4 w-4 mr-1" /> Sair
    </Button>
  );
}

/** Gate que só renderiza quando há sessão */
function AuthGate({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [ready, setReady] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setReady(session ? "in" : "out");
    });
    supabase.auth.getSession().then(({ data }) => setReady(data.session ? "in" : "out"));
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);
  if (ready === "checking") return <div className="text-sm text-gray-500">A verificar sessão...</div>;
  if (ready === "out") return <>{fallback}</>;
  return <>{children}</>;
}

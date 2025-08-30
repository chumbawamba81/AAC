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
  saveComprovativoInscricaoAtleta,   // <— NOVO
  clearComprovativo,                  // <— NOVO
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
  // apanha "sub23", "sub-23", "sub 23", "seniores sub23", etc.
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
  // só contam os que NÃO são Sub-23/Masters
  const elegiveis = atletas
    .filter((a) => !isAnuidadeObrigatoria(a.escalao))
    .slice()
    .sort((a, b) => {
      // mais velho primeiro (data menor)
      const da = new Date(a.dataNascimento).getTime();
      const db = new Date(b.dataNascimento).getTime();
      return da - db;
    });

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
            due: row?.devido_em ?? sep30OfCurrentYear(), // 30/09 por defeito nas inscrições
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
      const out: Record<string, { status: ResumoStatus; due?: string | null; valor?: number }> = {};
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
  }, [userId, state.atletas.map((a) => a.id).join(","), state.perfil?.tipoSocio]);

  // QUOTAS — próxima a vencer por atleta
  useEffect(() => {
    async function fetchQuotasNext() {
      if (!userId || state.atletas.length === 0) {
        setAthQuotaNext({});
        return;
      }
      const out: Record<string, { status: ResumoStatus; due?: string | null; valor?: number }> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const numAgregado = Math.max(1, state.atletas.filter((a) => !isAnuidadeObrigatoria(a.escalao)).length);

	  const rankMap = buildProRankMap(state.atletas);

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
      alert(errs.join("\n"));
      return;
    }

    try {
      const savedPerfil = await upsertMyProfile(form as PessoaDados);
      const next: State = { ...state, perfil: normalizePessoaDados(savedPerfil, state.conta?.email) };
      setState(next);
      saveState(next);
	  // --- se o titular passou para "Não pretendo ser sócio", apaga a inscrição de sócio no BD
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
        <div className="mb-1 rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{basePerfil.nomeCompleto}</div>
              <div className="text-xs text-gray-500">
                {basePerfil.email} · {basePerfil.telefone} · {basePerfil.codigoPostal}
                {isTipoSocio(basePerfil.tipoSocio) && <> · {basePerfil.tipoSocio}</>}
              </div>
            </div>
            <div className="text-right">
              <Button variant="outline" onClick={() => setEditMode(true)}>
                <PencilLine className="h-4 w-4 mr-1" /> Editar dados
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
	  <div className="rounded-xl border bg-yellow-50 text-yellow-900 p-3 text-sm">
  <strong>Nota:</strong> Estes dados referem-se ao <em>sócio/encarregado de educação</em>.
  A inscrição de cada atleta deve ser feita no separador <span className="font-medium">Atletas</span>.
</div>
  {/* Só mostra o chip de sócio se realmente for sócio */}
  {showSocioArea && (
    <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-50 text-yellow-800">
      <FileUp className="h-3 w-3" /> Sócio (docs): {socioMissing} documento(s) em falta
    </div>
  )}

  {/* Chip dos atletas mantém-se como estava */}
  <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-50 text-yellow-800">
    <FileUp className="h-3 w-3" /> Atletas (docs): {missingAthDocs} documento(s) em falta
  </div>

  {/* Se NÃO for sócio e não houver docs de atletas em falta → mostrar “Sem documentos em falta.” */}
  {!showSocioArea && missingAthDocs === 0 && (
    <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-green-50 text-green-700">
      <CheckCircle2 className="h-3 w-3" /> Sem documentos em falta
    </div>
  )}
</div>

        </div>

        {/* Resumo de Situação de Tesouraria */}
        <div className="mt-4">
          <div className="text-lg font-semibold mb-2">Resumo de Situação de Tesouraria</div>

          {/* Sócio — Inscrição (2.ª linha com valor e limite) */}
          {showSocioArea && (
  <div className="border rounded-xl px-3 py-2 mb-2">
    {/* Linha 1: Título + Botão */}
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium">Sócio — Inscrição</div>
      <Button variant="outline" onClick={goTesouraria}>
        Ir para Situação de Tesouraria
      </Button>
    </div>

    {/* Linha 2: Valor + Limite  |  Estado à direita */}
    <div className="mt-1 flex items-center justify-between">
      <div className="text-sm text-gray-700">
        {socioInscrResumo?.valor != null && <span>{eur(socioInscrResumo.valor)}</span>}
        {socioInscrResumo?.due && <span className="ml-2">· Limite: {socioInscrResumo.due}</span>}
      </div>
      <StatusBadge s={socioInscrResumo?.status ?? "sem_lancamento"} />
    </div>
  </div>
)}



          {/* Atletas — duas linhas: Inscrição e Quotas */}
          {state.atletas.length > 0 && (
            <div className="space-y-2">
              {state.atletas.map((a) => {
                const stIns = athInscr[a.id]?.status ?? "sem_lancamento";
                const dueIns = athInscr[a.id]?.due ?? sep30OfCurrentYear(); // 30/09 por defeito
                const valIns = athInscr[a.id]?.valor;

                const stQ = athQuotaNext[a.id]?.status ?? "sem_lancamento";
                const dueQ = athQuotaNext[a.id]?.due;
                const valQ = athQuotaNext[a.id]?.valor;

                return (
                  <div key={a.id} className="border rounded-xl px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Atleta — {a.nomeCompleto}</div>
                      <Button variant="outline" onClick={goTesouraria}>
                        Ir para Situação de Tesouraria
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-gray-700">Inscrição</span>
                        {valIns != null && <span className="ml-2">{eur(valIns)}</span>}
                        {dueIns && <span className="ml-2 text-gray-600">· Limite: {dueIns}</span>}
                      </div>
                      <StatusBadge s={stIns} />
                    </div>

                    {!isAnuidadeObrigatoria(a.escalao) && (
  <div className="flex items-center justify-between">
    <div className="text-sm">
      <span className="text-gray-700">Quotas</span>
      {valQ != null && <span className="ml-2">{eur(valQ)}</span>}
      {dueQ && <span className="ml-2 text-gray-600">· Limite: {dueQ}</span>}
    </div>
    <StatusBadge s={stQ} />
  </div>
)}

                  </div>
                );
              })}
            </div>
          )}
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
  <strong>Nota:</strong> Estes dados referem-se ao <em>sócio/encarregado de educação</em>.
  A inscrição do atleta é realizada no separador <span className="font-medium">Atletas</span>.
</div>

        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <div className="space-y-1">
            <Label>Nome Completo *</Label>
            <Input value={form.nomeCompleto} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <Label className="flex items-center gap-2">
              Tipo de sócio *
              <ImagesDialog title="Tabela de Preços — Sócios" images={[{ src: "/precos/socios-2025.png", alt: "Tabela de preços de sócios" }]} triggerText="Tabela de Preços" />
            </Label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={form.tipoSocio}
              onChange={(e) => setForm({ ...form, tipoSocio: e.target.value as PessoaDados["tipoSocio"] })}
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
            <Input type="date" value={form.dataNascimento} onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })} required />
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>Morada *</Label>
            <Input value={form.morada} onChange={(e) => setForm({ ...form, morada: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <Label>Código Postal *</Label>
            <Input value={form.codigoPostal} onChange={(e) => setForm({ ...form, codigoPostal: formatPostal(e.target.value) })} placeholder="0000-000" required />
          </div>

          <div className="space-y-1">
            <Label>Tipo de documento *</Label>
            <select className="w-full rounded-xl border px-3 py-2 text-sm" value={form.tipoDocumento} onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as PessoaDados["tipoDocumento"] })}>
              <option>Cartão de cidadão</option>
              <option>Passaporte</option>
              <option>Título de Residência</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label>Nº documento *</Label>
            <Input value={form.numeroDocumento} onChange={(e) => setForm({ ...form, numeroDocumento: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <Label>NIF *</Label>
            <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <Label>Contacto telefónico *</Label>
            <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required />
          </div>

          <div className="space-y-1">
            <Label>Endereço eletrónico *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>

          {form.tipoDocumento === "Cartão de cidadão" && (
            <div className="space-y-1">
              <Label>Validade do Cartão de Cidadão *</Label>
              <Input type="date" value={form.dataValidadeDocumento || ""} onChange={(e) => setForm({ ...form, dataValidadeDocumento: e.target.value })} required />
            </div>
          )}

          <div className="space-y-1 md:col-span-2">
            <Label>Profissão (opcional)</Label>
            <Input value={form.profissao || ""} onChange={(e) => setForm({ ...form, profissao: e.target.value })} />
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
  // limpeza defensiva (caso tenha ficado algo antigo)
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
    if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
    setBusy(true);
    try {
      const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao) ? "Anual" : athlete.planoPagamento;
      const label = getPagamentoLabel(planoEfetivo, idx);
      await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: label, file });
      await refreshPayments();
    } catch (e: any) {
      console.error("[Pagamentos] upload/replace", e);
      alert(e?.message || "Falha no upload");
    } finally { setBusy(false); }
  }

async function handleUploadInscricao(athlete: Atleta, file: File) {
  if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
  setBusy(true);
  try {
    // usar o helper específico da inscrição do atleta
    await saveComprovativoInscricaoAtleta({ userId, atletaId: athlete.id, file });
    await refreshPayments();
  } catch (e: any) {
    console.error("[Pagamentos] upload inscrição", e);
    alert(e?.message || "Falha no upload");
  } finally { setBusy(false); }
}


// Apagar comprovativo de quota/anuidade (apaga a linha da tabela pagamentos)
async function handleDelete(athlete: Atleta, idx: number) {
  const row = payments[athlete.id]?.[idx];
  if (!row) return;
  if (!confirm("Remover este comprovativo?")) return;
  setBusy(true);
  try {
    await clearComprovativo(row);   // ⬅️ só limpa comprovativo_url e validado
    await refreshPayments();
  } catch (e: any) {
    console.error("[Pagamentos] clear", e);
    alert(e?.message || "Falha a remover");
  } finally { setBusy(false); }
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
    console.error("[Pagamentos] socio upload", e);
    alert(e?.message || "Falha no upload");
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
    } catch (e: any) {
      alert(e?.message || "Falha a remover");
    } finally { setBusy(false); }
  }

  async function handleRemoveAtletaInscricao(row: PagamentoRowWithUrl) {
    if (!confirm("Remover o comprovativo da inscrição do atleta?")) return;
    setBusy(true);
    try {
      await clearComprovativo(row);
      await refreshPayments();
    } catch (e: any) {
      alert(e?.message || "Falha a remover");
    } finally { setBusy(false); }
  }

  // helpers de valor
  const numAtletasAgregado = state.atletas.filter(a => !isAnuidadeObrigatoria(a.escalao)).length;
const rankMap = (function build() {
  const elegiveis = state.atletas
    .filter(a => !isAnuidadeObrigatoria(a.escalao))
    .slice()
    .sort((a, b) => new Date(a.dataNascimento).getTime() - new Date(b.dataNascimento).getTime());
  const m: Record<string, number> = {};
  elegiveis.forEach((a, i) => { m[a.id] = i; });
  return m;
})();

  if (state.atletas.length === 0 && !isSocio(state.perfil?.tipoSocio)) {
    return (
      <Card>
        <CardHeader><CardTitle>Situação de Tesouraria</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-gray-500">Crie primeiro um atleta ou ative a opção de sócio.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Situação de Tesouraria
          {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
	  {/* Aviso / Instruções de pagamento */}
<div className="rounded-xl border bg-slate-50 p-3 text-sm text-gray-800">
  Os pagamentos devem ser realizados até à data limite indicada, para o seguinte IBAN:
  <strong className="ml-1">PT50 0036 0414 99106005021 95</strong>
  <span className="ml-1">(Banco Montepio)</span>.
</div>
{/* ===== Sócio: Inscrição ===== */}
{isSocio(state.perfil?.tipoSocio) && (
  <div className="border rounded-xl p-3">
    {(() => {
      const row = socioRows[0] || null;
      const overdue = isOverdue(row);
      const val = socioInscricaoAmount(state.perfil?.tipoSocio);
      const due = row?.devido_em || sep8OfCurrentYear();
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
              onFiles={(files) => files?.[0] && handleUploadSocio(files[0])}
            >
              <Upload className="h-4 w-4 mr-1" />
              {row?.comprovativo_url ? "Substituir" : "Carregar"}
            </FilePickerButton>

            {row?.comprovativo_url && (
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!confirm("Remover este comprovativo?")) return;
                  setBusy(true);
                  try {
                    await clearComprovativo(row);
                    await refreshPayments();
                  } catch (e: any) {
                    alert(e?.message || "Falha a remover");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover
              </Button>
            )}
          </div>
        </div>
      );
    })()}
  </div>
)}


        {/* ===== Atletas ===== */}
        {state.atletas.map((a) => {
          const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;

          // custos para este atleta
          const est = estimateCosts({
  escalao: a.escalao || "",
  tipoSocio: state.perfil?.tipoSocio,
  numAtletasAgregado: Math.max(1, numAtletasAgregado),
  proRank: rankMap[a.id],
});


          // Masters/Sub-23 → só inscrição
          const onlyInscricao = isAnuidadeObrigatoria(a.escalao);
          const slots = getSlotsForPlano(planoEfetivo);
          const rows = payments[a.id] || Array.from({ length: slots }, () => null);
          const amountForIdx = (idx: number) => {
            if (planoEfetivo === "Mensal") return est.mensal10;
            if (planoEfetivo === "Trimestral") return est.trimestre3;
            return est.anual1;
          };

          const slotsHeader = onlyInscricao ? 0 : slots;

          return (
            <div key={a.id} className="border rounded-xl p-3">
              {/* Cabeçalho do cartão do atleta — alinhado e sem “0 comprovativo(s)” */}
<div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
  <div className="font-medium">Atleta — {a.nomeCompleto}</div>
  <div className="text-xs text-gray-500 sm:text-right">
    Plano: {onlyInscricao ? "Sem quotas (apenas inscrição)" : planoEfetivo}
    {isAnuidadeObrigatoria(a.escalao) ? " (obrigatório pelo escalão)" : ""}
    {!onlyInscricao && <> · {slots} comprovativo(s)</>}
  </div>
</div>


{/* Inscrição do atleta */}
{(() => {
  const row = athleteInscricao[a.id] || null;
  const overdue = row?.devido_em
    ? new Date() > new Date(row.devido_em + "T23:59:59")
    : false;
  return (
    <div className="border rounded-lg p-3 mb-3 flex items-center justify-between">
      <div>
        <div className="font-medium">Inscrição de Atleta — {eur(est.taxaInscricao)}</div>
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
      <div className="flex items-center gap-2">
        <FilePickerButton
          variant={row?.comprovativo_url ? "secondary" : "outline"}
          accept="image/*,application/pdf"
          onFiles={(files) => files?.[0] && handleUploadInscricao(a, files[0])}
        >
          <Upload className="h-4 w-4 mr-1" />
          {row?.comprovativo_url ? "Substituir" : "Carregar"}
        </FilePickerButton>

        {row?.comprovativo_url && (
          <Button
            variant="destructive"
            onClick={async () => {
              if (!confirm("Remover este comprovativo?")) return;
              setBusy(true);
              try {
                await clearComprovativo(row);
                await refreshPayments();
              } catch (e: any) {
                alert(e?.message || "Falha a remover");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remover
          </Button>
        )}
      </div>
    </div>
  );
})()}



              {/* Quotas / Mensal / Trimestral / Anual (ocultar para Masters/Sub-23) */}
{!isAnuidadeObrigatoria(a.escalao) && (
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
              {meta?.comprovativo_url ? (
                <span className="inline-flex items-center gap-2">
                  {meta.validado ? "Comprovativo validado" : (overdue ? "Comprovativo pendente (em atraso)" : "Comprovativo pendente")}
                  {meta.signedUrl && (
                    <a className="underline inline-flex items-center gap-1" href={meta.signedUrl} target="_blank" rel="noreferrer">
                      <LinkIcon className="h-3 w-3" /> Abrir
                    </a>
                  )}
                </span>
              ) : (
                overdue ? "Comprovativo em falta (em atraso)" : "Comprovativo em falta"
              )}
              {due && <span className="ml-2">· Limite: {due}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <FilePickerButton
              variant={meta?.comprovativo_url ? "secondary" : "outline"}
              accept="image/*,application/pdf"
              onFiles={(files) => files?.[0] && handleUpload(a, i, files[0])}
            >
              <Upload className="h-4 w-4 mr-1" />
              {meta?.comprovativo_url ? "Substituir" : "Carregar"}
            </FilePickerButton>

            {meta?.comprovativo_url && (
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
)}

            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}


/* ----------------------------- AtletasSection ----------------------------- */

function AtletasSection({
  state,
  setState,
  onOpenForm,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  onOpenForm: (a?: Atleta) => void;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [missingByAth, setMissingByAth] = useState<Record<string, number>>({});

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

  async function recomputeMissing(currentUserId: string) {
    const { data, error } = await supabase
      .from("documentos")
      .select("atleta_id, doc_tipo")
      .eq("user_id", currentUserId)
      .eq("doc_nivel", "atleta");

    if (error) {
      console.error("[AtletasSection] SELECT documentos:", error.message);
      return;
    }

    const byAth: Map<string, Set<string>> = new Map();
    for (const r of (data || []) as any[]) {
      if (!r.atleta_id) continue;
      const set = byAth.get(r.atleta_id) || new Set<string>();
      set.add(r.doc_tipo);
      byAth.set(r.atleta_id, set);
    }

    const out: Record<string, number> = {};
    for (const a of state.atletas) {
      const have = byAth.get(a.id) || new Set<string>();
      let miss = 0;
      for (const t of DOCS_ATLETA) if (!have.has(t)) miss++;
      out[a.id] = miss;
    }
    setMissingByAth(out);
  }

  useEffect(() => {
    if (!userId) return;
    recomputeMissing(userId);
  }, [userId, state.atletas.map((a) => a.id).join(",")]); // eslint-disable-line

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("docs-atletas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documentos", filter: `user_id=eq.${userId}` },
        () => { recomputeMissing(userId); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]); // eslint-disable-line

  async function remove(id: string) {
    if (!confirm("Remover o atleta?")) return;
    try {
      await removeAtleta(id);
      const next: State = { ...state, atletas: state.atletas.filter((x) => x.id !== id) };
      delete next.docsAtleta[id];
      delete next.pagamentos[id];
      setState(next);
      saveState(next);
    } catch (e: any) {
      alert(e.message || "Falha ao remover o atleta");
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Inscrição de Atletas
        </CardTitle>
        <Button onClick={() => onOpenForm(undefined)}>
          <Plus className="h-4 w-4 mr-1" /> Novo atleta
        </Button>
      </CardHeader>
      <CardContent>
        {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas. Clique em "Novo atleta".</p>}
        <div className="grid gap-3">
          {state.atletas.map((a) => {
            const missing = missingByAth[a.id] ?? DOCS_ATLETA.length;
            return (
              <div key={a.id} className="border rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}
                    {missing > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" /> {missing} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Documentação completa
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {a.genero} · Nasc.: {a.dataNascimento} · Escalão: {a.escalao} · Pagamento:{" "}
                    {isAnuidadeObrigatoria(a.escalao) ? "Sem quotas (apenas inscrição)" : a.planoPagamento}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenForm(a)}>
                    <PencilLine className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  <Button variant="destructive" onClick={() => remove(a.id)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Remover
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- App ---------------------------------- */

export default function App() {
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
  // NUNCA criar quotas — só garantir a inscrição e limpar eventuais quotas antigas
  await ensureOnlyInscricaoForAtleta(saved.id);
} else {
  // Restantes escalões — inscrição + quotas conforme plano
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

      <AuthGate fallback={<ContaSection state={state} setState={setState} onLogged={() => setActiveTab("home")} />}>
        {syncing ? (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <RefreshCw className="h-4 w-4 animate-spin" /> A carregar os dados da conta...
          </div>
        ) : (
          <>
            {/* Tabs controladas (usamos key para “forçar” defaultValue quando muda) */}
            <Tabs key={activeTab} defaultValue={activeTab}>
              <TabsList>
                <TabsTrigger value="home">{mainTabLabel}</TabsTrigger>

                {hasPerfil && <TabsTrigger value="atletas">Atletas</TabsTrigger>}

                {hasPerfil && <TabsTrigger value="docs">Documentos</TabsTrigger>}

                {hasPerfil && hasAtletas && <TabsTrigger value="tes">Situação de Tesouraria</TabsTrigger>}
              </TabsList>

              <TabsContent value="home">
                <DadosPessoaisSection
                  state={state}
                  setState={setState}
                  onAfterSave={afterSavePerfil}
                  goTesouraria={() => setActiveTab("tes")}
                />
              </TabsContent>

              {hasPerfil && (
                <TabsContent value="atletas">
                  <AtletasSection state={state} setState={setState} onOpenForm={openAthForm} />
                </TabsContent>
              )}

              {hasPerfil && (
  <TabsContent value="docs">
    <TemplatesDownloadSection />
    {/* Mantém a secção de documentos (atletas/declarações, etc.) como tens atualmente */}
    <UploadDocsSection
  state={state}
  setState={(s: State) => setState(s)}
  hideSocioDoc={!wantsSocio(state.perfil?.tipoSocio)}
/>

  </TabsContent>
)}


              {hasPerfil && hasAtletas && (
                <TabsContent value="tes">
                  <PagamentosSection state={state} />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </AuthGate>

      {/* Modal global do Atleta */}
      <Dialog open={athModalOpen} onOpenChange={setAthModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{athEditing ? "Editar atleta" : "Novo atleta"}</DialogTitle>
          </DialogHeader>
          <AtletaFormCompleto
            initial={athEditing}
            dadosPessoais={{
              morada: state.perfil?.morada,
              codigoPostal: state.perfil?.codigoPostal,
              telefone: state.perfil?.telefone,
              email: state.perfil?.email,
            }}
            tipoSocio={state.perfil?.tipoSocio ?? "Não pretendo ser sócio"}
			agregadoAtletas={state.atletas}   // <= NOVO
            onCancel={() => setAthModalOpen(false)}
            onSave={handleAthSave}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={postSavePrompt} onOpenChange={setPostSavePrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deseja inscrever um atleta agora?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPostSavePrompt(false)}>
              Agora não
            </Button>
            <Button onClick={() => { setPostSavePrompt(false); setActiveTab("atletas"); }}>
              Sim, inscrever
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-center gap-4 pt-6">
        <a href="https://www.facebook.com/basketacademica" target="_blank" rel="noreferrer" aria-label="Facebook AAC Basquetebol" className="opacity-80 hover:opacity-100">
          <Facebook className="h-6 w-6" />
        </a>
        <a href="https://www.instagram.com/academicabasket/" target="_blank" rel="noreferrer" aria-label="Instagram AAC Basquetebol" className="opacity-80 hover:opacity-100">
          <Instagram className="h-6 w-6" />
        </a>
        <a href="mailto:basquetebol@academica.pt" aria-label="Email AAC Basquetebol" className="opacity-80 hover:opacity-100">
          <Mail className="h-6 w-6" />
        </a>
      </div>
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

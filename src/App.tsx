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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
// ImagesDialog is now used inside HomeDadosPessoais
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
  saveComprovativoInscricaoAtleta,
  clearComprovativo,
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
  deleteSocioInscricaoIfAny,
} from "./services/pagamentosService";

// Ícones
import {
  AlertCircle,
  CheckCircle2,
  LogIn,
  LogOut,
  Shield,
  UserPlus,
  Users,
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
import AtletasTab from "./components/AtletasTab";
import HomeDadosPessoais from "./components/HomeDadosPessoais";
import HomePagamentos from "./components/HomePagamentos";

// Supabase
import { supabase } from "./supabaseClient";

// Mini-toast + filename helper
import {
  useMiniToast,
  inferFileName,
  MiniToastPortal,
  showToast,
} from "./components/MiniToast";

/* -------------------- Constantes locais -------------------- */
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Termo de responsabilidade",
  "Exame médico",
] as const;

const DOCS_SOCIO = ["Ficha de Sócio"] as const;

type Conta = { email: string };
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

export type State = {
  conta: Conta | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<(typeof DOCS_SOCIO)[number], UploadMeta>>;
  docsAtleta: Record<
    string,
    Partial<Record<(typeof DOCS_ATLETA)[number], UploadMeta>>
  >;
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
      s?.conta && typeof s.conta.email === "string"
        ? { email: s.conta.email }
        : null;
    const perfil: PessoaDados | null = s?.perfil
      ? normalizePessoaDados(s.perfil, conta?.email)
      : null;

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
      {ok ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
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
        const next: State = {
          ...state,
          conta: u?.user?.email ? { email: u.user.email } : state.conta,
        };
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
        const next: State = {
          ...state,
          verificationPendingEmail: email,
          conta: { email },
        };
        setState(next);
        saveState(next);
        setInfo(
          "Registo efetuado. Verifique o seu email para validar a conta."
        );
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
      if (!data?.session?.access_token)
        throw new Error("Sessão inválida. Verifique o email de confirmação.");
      const next: State = {
        ...state,
        conta: { email },
        verificationPendingEmail: null,
      };
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
      // usa um path “normal” (sem #) para o Supabase poder anexar ?code=...
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.resetPasswordForEmail(
        forgotEmail || email,
        { redirectTo }
      );
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
          {mode === "register" ? (
            <UserPlus className="h-5 w-5" />
          ) : (
            <LogIn className="h-5 w-5" />
          )}
          {mode === "register" ? "Criar conta" : "Entrar"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {state.verificationPendingEmail && (
          <div className="mb-3 rounded-lg bg-blue-50 text-blue-900 text-sm p-2">
            Registo efetuado para{" "}
            <strong>{state.verificationPendingEmail}</strong>. Verifique o seu
            email para validar a conta.
          </div>
        )}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>
              Palavra-passe{" "}
              {mode === "register" && (
                <span className="text-xs text-gray-500">
                  (requisitos abaixo)
                </span>
              )}
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {mode === "register" && <PasswordChecklist pass={password} />}
          </div>

          {mode === "register" && (
            <div className="space-y-1">
              <Label>Repetir palavra-passe *</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
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
              {loading
                ? "Aguarde..."
                : mode === "register"
                ? "Registar"
                : "Entrar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMode((m) => (m === "register" ? "login" : "register"));
                setConfirmPassword("");
              }}
            >
              {mode === "register" ? "Já tenho conta" : "Criar conta"}
            </Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2">
            <Shield className="h-4 w-4 mt-[2px]" />
            <p>
              Produção: hash Argon2id, cookies httpOnly, sessão, rate limiting,
              MFA.
            </p>
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
                <Input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setForgotOpen(false)}
                >
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

/* ---------------------------- PagamentosSection --------------------------- */

/* ----------------------------- AtletasTab ----------------------------- */

function ResetPasswordForm({ onDone }: { onDone: () => void }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();

  const v = isPasswordStrong(p1);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(undefined);
    if (p1 !== p2) return setErr("As palavras-passe não coincidem.");
    if (!v.ok) return setErr("A palavra-passe não cumpre os requisitos.");
    try {
      setBusy(true);
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      await supabase.auth.signOut(); // termina sessão de recuperação
      onDone();
      showToast?.("Palavra-passe atualizada. Faça login novamente.", "ok");
    } catch (e: any) {
      setErr(e?.message || "Falha ao atualizar a palavra-passe");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="space-y-1">
        <Label>Nova palavra-passe</Label>
        <Input
          type="password"
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          required
        />
        <PasswordChecklist pass={p1} />
      </div>
      <div className="space-y-1">
        <Label>Repetir nova palavra-passe</Label>
        <Input
          type="password"
          value={p2}
          onChange={(e) => setP2(e.target.value)}
          required
        />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "A atualizar..." : "Guardar nova palavra-passe"}
        </Button>
      </div>
    </form>
  );
}

/* ----------------------------------- App ---------------------------------- */

export default function App() {
  const [state, setState] = useState<State>(loadState());
  // Persist active tab across reloads or when returning from Android
  const LS_ACTIVE_TAB = "bb_active_tab_v1";
  const [resetOpen, setResetOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_ACTIVE_TAB) || "home";
    } catch {
      return "home";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_TAB, activeTab);
    } catch {}
  }, [activeTab]);

  const [postSavePrompt, setPostSavePrompt] = useState(false);
  const [syncing, setSyncing] = useState<boolean>(true);

  // Modal global de atleta
  const [athModalOpen, setAthModalOpen] = useState(false);
  const [athEditing, setAthEditing] = useState<Atleta | undefined>(undefined);

  // Sync inicial e on SIGNED_IN
  const doSync = useCallback(async () => {
    setSyncing(true);
    try {
      const [perfilDb, atletasDb] = await Promise.all([
        getMyProfile(),
        listAtletas(),
      ]);
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
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setResetOpen(true);
    });
    // fallback: se a URL já traz o hash de recuperação
    if (
      typeof window !== "undefined" &&
      /type=recovery/.test(window.location.hash)
    ) {
      setResetOpen(true);
    }
    return () => {
      sub.data.subscription.unsubscribe();
    };
  }, []);

  // Abre o diálogo de reset quando voltamos do email de recuperação
  useEffect(() => {
    // 1) Trocar ?code=... por sessão (passo obrigatório no v2)
    (async () => {
      const url = window.location.href;
      if (/\?code=/.test(url) && /type=recovery/.test(url)) {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) {
          console.error("[exchangeCodeForSession]", error);
        }
      }
    })();

    // 2) Quando a sessão de recovery ficar ativa, mostramos o diálogo
    const sub = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setResetOpen(true);
    });
    return () => {
      sub.data.subscription.unsubscribe();
    };
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

  useEffect(() => {
    saveState(state);
  }, [state]);

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

      const force =
        !!wasEditingId &&
        (planoAntes !== saved.planoPagamento || escalaoAntes !== saved.escalao);

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
    <div className="lg:max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <MiniToastPortal />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img className="h-24 object-contain" src="/imgs/AAC-white1.png" />
          <h1 className="text-2xl font-bold">AAC - Secção de Basquetebol</h1>
        </div>
        <AuthButton />
      </header>

      <AuthGate
        fallback={
          <ContaSection
            state={state}
            setState={setState}
            onLogged={() => setActiveTab("home")}
          />
        }
      >
        {syncing ? (
          <div className="">
            <RefreshCw className="h-4 w-4 animate-spin" /> A carregar os dados
            da conta...
          </div>
        ) : (
          <>
            <Tabs key={activeTab} defaultValue={activeTab}>
              <TabsList>
                <div
                  onClick={() => {
                    setActiveTab("home");
                    localStorage.setItem(LS_ACTIVE_TAB, "home");
                  }}
                  className="p-0 m-0"
                >
                  <TabsTrigger value="home"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-house-icon lucide-house"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg> Home</TabsTrigger>
                </div>
                {hasPerfil && (
                  <div
                    onClick={() => {
                      setActiveTab("atletas");
                      localStorage.setItem(LS_ACTIVE_TAB, "atletas");
                    }}
                  >
                    <TabsTrigger value="atletas">Atletas</TabsTrigger>
                  </div>
                )}
                {hasPerfil && (
                  <div
                    onClick={() => {
                      setActiveTab("docs");
                      localStorage.setItem(LS_ACTIVE_TAB, "docs");
                    }}
                  >
                    <TabsTrigger value="docs">Documentos</TabsTrigger>
                  </div>
                )}
                {hasPerfil && hasAtletas && (
                  <div
                    onClick={() => {
                      setActiveTab("tes");
                      localStorage.setItem(LS_ACTIVE_TAB, "tes");
                    }}
                  >
                    <TabsTrigger value="tes">
                      Tesouraria
                    </TabsTrigger>
                  </div>
                )}
              </TabsList>

              <TabsContent value="home">
                <HomeDadosPessoais
                  state={state}
                  setState={setState}
                  onAfterSave={afterSavePerfil}
                  goTesouraria={() => setActiveTab("tes")}
                />
              </TabsContent>

              {hasPerfil && (
                <TabsContent value="atletas">
                  <AtletasTab
                    state={state}
                    setState={setState}
                    onOpenForm={openAthForm}
                    dadosPessoais={{
                      morada: state.perfil?.morada,
                      codigoPostal: state.perfil?.codigoPostal,
                      telefone: state.perfil?.telefone,
                      email: state.perfil?.email,
                    }}
                    tipoSocio={state.perfil?.tipoSocio ?? "Não pretendo ser sócio"}
                  />
                </TabsContent>
              )}

              {hasPerfil && (
                <TabsContent value="docs">
                  <TemplatesDownloadSection />
                  <UploadDocsSection
                    state={state}
                    setState={(s: State) => setState(s)}
                    hideSocioDoc={!wantsSocio(state.perfil?.tipoSocio)}
                  />
                </TabsContent>
              )}

              {hasPerfil && hasAtletas && (
                <TabsContent value="tes">
                  <HomePagamentos state={state} />
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
            <DialogTitle>
              {athEditing ? "Editar atleta" : "Novo atleta"}
            </DialogTitle>
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
            agregadoAtletas={state.atletas}
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
            <Button
              variant="secondary"
              onClick={() => setPostSavePrompt(false)}
            >
              Agora não
            </Button>
            <Button
              onClick={() => {
                setPostSavePrompt(false);
                setActiveTab("atletas");
              }}
            >
              Sim, inscrever
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir nova palavra-passe</DialogTitle>
          </DialogHeader>
          <ResetPasswordForm onDone={() => setResetOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-center gap-4 pt-6">
        <a
          href="https://www.facebook.com/basketacademica"
          target="_blank"
          rel="noreferrer"
          aria-label="Facebook AAC Basquetebol"
          className="opacity-80 hover:opacity-100"
        >
          <Facebook className="h-6 w-6" />
        </a>
        <a
          href="https://www.instagram.com/academicabasket/"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram AAC Basquetebol"
          className="opacity-80 hover:opacity-100"
        >
          <Instagram className="h-6 w-6" />
        </a>
        <a
          href="mailto:basquetebol@academica.pt"
          aria-label="Email AAC Basquetebol"
          className="opacity-80 hover:opacity-100"
        >
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
    <Button
      variant="outline"
      onClick={() => {
        signOut().catch(() => {});
      }}
    >
      <LogOut className="h-4 w-4 mr-1" /> Sair
    </Button>
  );
}

/** Gate que só renderiza quando há sessão */
function AuthGate({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [ready, setReady] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setReady(session ? "in" : "out");
    });
    supabase.auth
      .getSession()
      .then(({ data }) => setReady(data.session ? "in" : "out"));
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);
  if (ready === "checking")
    return <div className="text-sm text-gray-500">A verificar sessão...</div>;
  if (ready === "out") return <>{fallback}</>;
  return <>{children}</>;
}

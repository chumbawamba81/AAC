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
import { ensureScheduleForAtleta } from "./services/pagamentosService";
import { estimateCosts, eur } from "./utils/pricing";

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

// Pagamentos (tabela/bucket dedicados)
import {
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
} from "./services/pagamentosService";

/* -------------------- Constantes locais -------------------- */
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
  "Comprovativo de pagamento de inscrição",
] as const;

const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;

type Conta = { email: string };
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

type State = {
  conta: Conta | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<(typeof DOCS_SOCIO)[number], UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<(typeof DOCS_ATLETA)[number], UploadMeta>>>;
  pagamentos: Record<string, Array<UploadMeta | null>>; // legado (mantido por compat)
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
  const [confirmPassword, setConfirmPassword] = useState(""); // confirmação
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
      await supabase.auth.getSession(); // pequena “espera” para a sessão ficar disponível
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
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  onAfterSave: () => void;
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

  // 👉 Quando o perfil chegar do Supabase depois do login, preenche o form e sai do modo edição
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

  // ===== Tesouraria (sócio + atletas) =====
  const [socioPaid, setSocioPaid] = useState<boolean>(false);
  const [athTreasury, setAthTreasury] = useState<Record<string, { status: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso"; amount: number }>>({});

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

  // -- Tesouraria: status do sócio + por atleta (usa tabela pagamentos.devido_em/comprovativo/validado)
  useEffect(() => {
    async function run() {
      if (!userId) { setSocioPaid(false); setAthTreasury({}); return; }

      try {
        // Sócio: presença do comprovativo de pagamento de sócio nos documentos
        const { data: socioDocs } = await supabase
          .from("documentos")
          .select("id")
          .eq("user_id", userId)
          .eq("doc_nivel", "socio")
          .eq("doc_tipo", "Comprovativo de pagamento de sócio")
          .limit(1);
        setSocioPaid(!!(socioDocs && socioDocs.length > 0));
      } catch {
        setSocioPaid(false);
      }

      // Atletas: construir mapa de pagamentos por atleta
      const athleteIds = state.atletas.map((a) => a.id);
      if (athleteIds.length === 0) { setAthTreasury({}); return; }

      // nº de atletas no agregado para desconto PRO (exclui masters/sub-23)
      const numElegiveis = state.atletas.filter((a) => !isAnuidadeObrigatoria(a.escalao)).length || 1;
      const tipoSocio = state.perfil?.tipoSocio;

      try {
        const { data } = await supabase
          .from("pagamentos")
          .select("id, atleta_id, descricao, devido_em, comprovativo_url, validado")
          .in("atleta_id", athleteIds);

        const byAth: Record<string, any[]> = {};
        for (const r of (data || [])) {
          const id = r.atleta_id;
          if (!id) continue;
          (byAth[id] ||= []).push(r);
        }

        const today = new Date(); today.setHours(0,0,0,0);

        const out: Record<string, { status: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso"; amount: number }> = {};
        for (const a of state.atletas) {
          const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
          const est = estimateCosts({ escalao: a.escalao || "", tipoSocio, numAtletasAgregado: numElegiveis });
          const slotValue = planoEfetivo === "Mensal" ? est.mensal10 : (planoEfetivo === "Trimestral" ? est.trimestre3 : est.anual1);

          const rows = (byAth[a.id] || []).slice().sort((x,y) => {
            const dx = x.devido_em ? new Date(x.devido_em).getTime() : Number.MAX_SAFE_INTEGER;
            const dy = y.devido_em ? new Date(y.devido_em).getTime() : Number.MAX_SAFE_INTEGER;
            return dx - dy;
          });

          // primeira parcela ainda não validada
          const firstOpen = rows.find((r) => !r.validado);

          if (!firstOpen) {
            out[a.id] = { status: "Regularizado", amount: 0 };
          } else if (firstOpen.comprovativo_url) {
            out[a.id] = { status: "Pendente de validação", amount: 0 };
          } else {
            const due = firstOpen.devido_em ? new Date(firstOpen.devido_em) : null;
            const late = !!(due && due.getTime() < today.getTime());
            out[a.id] = { status: late ? "Em atraso" : "Por regularizar", amount: slotValue || 0 };
          }
        }

        setAthTreasury(out);
      } catch (e) {
        console.error("[Tesouraria] Falha a obter pagamentos:", e);
        setAthTreasury({});
      }
    }

    run();
  }, [userId, state.atletas.map(a=>a.id).join(","), state.atletas.map(a=>a.planoPagamento).join(","), state.atletas.map(a=>a.escalao).join(","), state.perfil?.tipoSocio]);

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
      setEditMode(false);
      onAfterSave();
    } catch (e: any) {
      alert(e.message || "Não foi possível guardar o perfil no servidor");
    }
  }

  if (!editMode && basePerfil) {
    const socioMissing = socioMissingCount;
    const missingAthDocs = athMissingCount;

    return (
      <div className="space-y-4">
        <div className="mb-1 rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{basePerfil.nomeCompleto}</div>
              <div className="text-xs text-gray-500">
                {basePerfil.email} · {basePerfil.telefone} · {basePerfil.codigoPostal}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm">Situação de Tesouraria:</div>
              <div className="inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">
                {state.tesouraria || "Campo em atualização"}
              </div>
            </div>
          </div>
          <div className="mt-2 flex gap-3 text-sm">
            <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-50 text-yellow-800">
              <FileUp className="h-3 w-3" /> Sócio: {socioMissing} documento(s) em falta
            </div>
            <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 bg-yellow-50 text-yellow-800">
              <FileUp className="h-3 w-3" /> Atletas: {missingAthDocs} documento(s) em falta
            </div>
          </div>
          <div className="mt-3">
            <Button variant="outline" onClick={() => setEditMode(true)}>
              <PencilLine className="h-4 w-4 mr-1" /> Editar dados
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Situação de Tesouraria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Sócio (inscrição)</div>
              <StatusChip label={socioPaid ? "Regularizado" : "Por regularizar"} />
            </div>

            {state.atletas.length > 0 ? (
              <div className="space-y-2">
                {state.atletas.map((a) => {
                  const info = athTreasury[a.id];
                  const label: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso" = info?.status || "Por regularizar";
                  const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
                  return (
                    <div key={a.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.nomeCompleto}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {a.escalao || "—"} · {planoEfetivo === "Anual" ? "Anual (obrigatório)" : `Plano: ${planoEfetivo}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusChip label={label} />
                        {info && info.amount > 0 && (
                          <div className="text-sm">
                            Valor: <span className="font-semibold">{eur(info.amount)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Sem atletas registados.</p>
            )}
          </CardContent>
        </Card>

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
        <CardTitle>Dados Pessoais</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <div className="space-y-1">
            <Label>Nome Completo *</Label>
            <Input value={form.nomeCompleto} onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} required />
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
              onChange={(e) => setForm({ ...form, tipoDocumento: e.target.value as PessoaDados["tipoDocumento"] })}
            >
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

/* ---------------------------- Tesouraria helpers --------------------------- */

type StatusLabel = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

function StatusChip({ label }: { label: StatusLabel }) {
  const cls =
    label === "Regularizado"
      ? "bg-green-100 text-green-800"
      : label === "Pendente de validação"
      ? "bg-amber-100 text-amber-800"
      : label === "Em atraso"
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-800";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

/* ---------------------------- PagamentosSection --------------------------- */

function getSlotsForPlano(p: PlanoPagamento) {
  if (p === "Mensal") return 10;
  if (p === "Trimestral") return 3;
  return 1;
}
function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
function isAnuidadeObrigatoria(escalao: string | undefined) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return s.includes("masters") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores sub 23") || s.includes("seniores sub-23");
}

function PagamentosSection({ state }: { state: State }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Record<string, Array<PagamentoRowWithUrl | null>>>({});
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

  const refreshPayments = useCallback(async () => {
    if (!userId) return;
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

      next[a.id] = labels.map((lab) => {
        const arr = byDesc.get(lab) || [];
        if (arr.length === 0) return null;
        arr.sort((x, y) => new Date(y.created_at || 0).getTime() - new Date(x.created_at || 0).getTime());
        return arr[0];
      });
    }
    setPayments(next);
  }, [userId, state.atletas]);

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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.atletas, refreshPayments]);

  async function handleUpload(athlete: Atleta, idx: number, file: File) {
    if (!userId || !file) {
      alert("Sessão ou ficheiro em falta");
      return;
    }
    setBusy(true);
    try {
      const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao) ? "Anual" : athlete.planoPagamento;
      const label = getPagamentoLabel(planoEfetivo, idx);
      await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: label, file });
      await refreshPayments();
    } catch (e: any) {
      console.error("[Pagamentos] upload/replace", e);
      alert(e?.message || "Falha no upload");
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
      await deletePagamento(row);
      await refreshPayments();
    } catch (e: any) {
      console.error("[Pagamentos] delete", e);
      alert(e?.message || "Falha a remover");
    } finally {
      setBusy(false);
    }
  }

  if (state.atletas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pagamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Crie primeiro um atleta.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Pagamentos
          {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.atletas.map((a) => {
          const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
          const slots = getSlotsForPlano(planoEfetivo);
          const rows = payments[a.id] || Array.from({ length: slots }, () => null);
          return (
            <div key={a.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{a.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  Plano: {planoEfetivo}
                  {isAnuidadeObrigatoria(a.escalao) ? " (obrigatório pelo escalão)" : ""} · {slots} comprovativo(s)
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: slots }).map((_, i) => {
                  const meta = rows[i];
                  const hasFile = !!(meta && (meta.comprovativo_url || meta.signedUrl));
                  const label = getPagamentoLabel(planoEfetivo, i);
                  return (
                    <div key={i} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-gray-500">
                          {hasFile ? (
                            <span className="inline-flex items-center gap-2">
                              Comprovativo carregado
                              {meta?.signedUrl && (
                                <a
                                  className="underline inline-flex items-center gap-1"
                                  href={meta.signedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <LinkIcon className="h-3 w-3" />
                                  Abrir
                                </a>
                              )}
                            </span>
                          ) : (
                            "Comprovativo em falta"
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <FilePickerButton
                          variant={hasFile ? "secondary" : "outline"}
                          accept="image/*,application/pdf"
                          onFiles={(files) => handleUpload(a, i, files[0])}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {hasFile ? "Substituir" : "Carregar"}
                        </FilePickerButton>

                        {hasFile && (
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
  // missing por atleta calculado do Supabase + Realtime
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
        () => {
          recomputeMissing(userId);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line

  function isAnuidadeObrigatoria(escalao: string | undefined) {
    if (!escalao) return false;
    const s = escalao.toLowerCase();
    return s.includes("masters") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores sub 23") || s.includes("seniores sub-23");
  }

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
                    {isAnuidadeObrigatoria(a.escalao) ? "Anual (obrigatório)" : a.planoPagamento}
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

  // --- SYNC: no carregamento (se já houver sessão) e sempre que acontecer SIGNED_IN ---
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

  // persistência local
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

  // Abertura do modal a partir da lista
  const openAthForm = (a?: Atleta) => {
    setAthEditing(a);
    setAthModalOpen(true);
  };

  // Guardar do formulário (modal global)
  const handleAthSave = async (novo: Atleta) => {
    // valores anteriores (se estiveres a editar)
    const wasEditingId = athEditing?.id;
    const planoAntes = athEditing?.planoPagamento;
    const escalaoAntes = athEditing?.escalao;

    try {
      const saved = await saveAtleta(novo); // usa o devolvido (id UUID real)

      // Atualiza estado local
      const nextAtletas = wasEditingId
        ? state.atletas.map((x) => (x.id === wasEditingId ? saved : x))
        : [saved, ...state.atletas];

      setState((prev) => ({ ...prev, atletas: nextAtletas }));
      saveState({ ...state, atletas: nextAtletas });

      // Gerar/ajustar calendário desta época
      const force =
        !!wasEditingId && (planoAntes !== saved.planoPagamento || escalaoAntes !== saved.escalao);

      await ensureScheduleForAtleta(
        { id: saved.id, escalao: saved.escalao, planoPagamento: saved.planoPagamento },
        { forceRebuild: force }
      );

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
            {/* Tabs não-controladas (defaultValue) + key para re-selecionar ao mudar activeTab */}
            <Tabs key={activeTab} defaultValue={activeTab}>
              <TabsList>
                <TabsTrigger value="home">{mainTabLabel}</TabsTrigger>
                {hasPerfil && <TabsTrigger value="atletas">Atletas</TabsTrigger>}
                {hasPerfil && <TabsTrigger value="docs">Documentos</TabsTrigger>}
                {hasPerfil && hasAtletas && <TabsTrigger value="pag">Pagamentos</TabsTrigger>}
              </TabsList>

              <TabsContent value="home">
                <DadosPessoaisSection state={state} setState={setState} onAfterSave={afterSavePerfil} />
              </TabsContent>

              {hasPerfil && (
                <TabsContent value="atletas">
                  <AtletasSection state={state} setState={setState} onOpenForm={openAthForm} />
                </TabsContent>
              )}

              {hasPerfil && (
                <TabsContent value="docs">
                  <TemplatesDownloadSection />
                  <UploadDocsSection state={state} setState={(s: State) => setState(s)} />
                </TabsContent>
              )}

              {hasPerfil && hasAtletas && (
                <TabsContent value="pag">
                  <PagamentosSection state={state} />
                </TabsContent>
              )}
            </Tabs>
          </>
        )}
      </AuthGate>

      {/* Modal global do Atleta — fica fora das Tabs, não desmonta ao trocar separador */}
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

/** “Gate” que só renderiza children quando há sessão Supabase */
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

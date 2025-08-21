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
import { estimateCosts, eur, socioInscricaoAmount } from "./utils/pricing";
import {
  createInscricaoSocioIfMissing,
  listSocioInscricao,
  saveComprovativoSocioInscricao,
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

// Pagamentos (tabela/bucket dedicados)
import {
  listByAtleta as listPagamentosByAtleta,
  saveComprovativo as saveComprovativoPagamento,
  deletePagamento,
  withSignedUrls as withSignedUrlsPagamentos,
  type PagamentoRowWithUrl,
} from "./services/pagamentosService";

/* -------------------- Constantes & helpers -------------------- */
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
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
  docsAtleta: Record<string, Partial<Record<(typeof DOCS_ATLETA)[number], UploadMeta>>>;
  pagamentos: Record<string, Array<UploadMeta | null>>;
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
  return { ok: lengthOk && hasUpper && hasLower && hasDigit && hasSpecial, lengthOk, hasUpper, hasLower, hasDigit, hasSpecial };
}
function isPessoaDados(x: any): x is PessoaDados {
  return x && typeof x === "object" && typeof x.nomeCompleto === "string" && typeof x.dataNascimento === "string" && typeof x.email === "string";
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
  const d = new Date(s + "T00:00:00"); if (Number.isNaN(d.getTime())) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
}
function isTipoSocio(tipo?: string | null) {
  return !!(tipo && !/não\s*pretendo/i.test(tipo));
}

/* --------- Helpers globais de pagamentos --------- */
function isAnuidadeObrigatoria(escalao?: string | null | undefined) {
  const s = (escalao || "").toLowerCase();
  return s.includes("masters") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores sub 23") || s.includes("seniores sub-23");
}
function getSlotsForPlano(p: PlanoPagamento) { return p === "Mensal" ? 10 : p === "Trimestral" ? 3 : 1; }
function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}
function sep8OfCurrentYear(): string {
  const y = new Date().getFullYear();
  return `${y}-09-08`;
}

/* -------------------- Persistência local -------------------- */
function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {}, pagamentos: {}, tesouraria: "Campo em atualização", noticias: "", verificationPendingEmail: null };
    }
    const s = JSON.parse(raw);
    const conta: Conta | null = s?.conta && typeof s.conta.email === "string" ? { email: s.conta.email } : null;
    const perfil: PessoaDados | null = s?.perfil ? normalizePessoaDados(s.perfil, conta?.email) : null;
    return { conta, perfil, atletas: Array.isArray(s.atletas) ? s.atletas : [], docsSocio: s.docsSocio ?? {}, docsAtleta: s.docsAtleta ?? {}, pagamentos: s.pagamentos ?? {}, tesouraria: s.tesouraria ?? "Campo em atualização", noticias: s.noticias ?? "", verificationPendingEmail: s.verificationPendingEmail ?? null };
  } catch {
    return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {}, pagamentos: {}, tesouraria: "Campo em atualização", noticias: "", verificationPendingEmail: null };
  }
}
function saveState(s: State) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

/* ------------------------------ ContaSection ------------------------------ */
function PasswordChecklist({ pass }: { pass: string }) {
  const v = isPasswordStrong(pass);
  const Item = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-sm">{ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}<span className={ok ? "" : "text-red-600"}>{text}</span></div>
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

function ContaSection({ state, setState, onLogged }: { state: State; setState: React.Dispatch<React.SetStateAction<State>>; onLogged: () => void; }) {
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
        setState(next); saveState(next); onLogged();
      }
    })();
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); setError(undefined); setInfo(undefined);
    if (mode === "register") {
      if (password !== confirmPassword) { setError("As palavras-passe não coincidem."); return; }
      const chk = isPasswordStrong(password);
      if (!chk.ok) { setError("A palavra-passe não cumpre os requisitos."); return; }
      try { setLoading(true); await signUp(email, password); const next: State = { ...state, verificationPendingEmail: email, conta: { email } }; setState(next); saveState(next); setInfo("Registo efetuado. Verifique o seu email para validar a conta."); }
      catch (e: any) { setError(e.message || "Erro no registo"); }
      finally { setLoading(false); }
      return;
    }
    try { setLoading(true); const data = await signIn(email, password); await supabase.auth.getSession(); if (!data?.session?.access_token) throw new Error("Sessão inválida. Verifique o email de confirmação."); const next: State = { ...state, conta: { email }, verificationPendingEmail: null }; setState(next); saveState(next); onLogged(); }
    catch (e: any) { setError(e.message || "Erro de autenticação"); }
    finally { setLoading(false); }
  }

  async function submitForgot(ev: React.FormEvent) {
    ev.preventDefault(); setError(undefined); setInfo(undefined);
    try { const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail || email); if (error) throw error; setInfo("Se o email existir, foi enviado um link de recuperação."); setForgotOpen(false); }
    catch (e: any) { setError(e.message || "Não foi possível enviar o email de recuperação"); }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{mode === "register" ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}{mode === "register" ? "Criar conta" : "Entrar"}</CardTitle></CardHeader>
      <CardContent>
        {state.verificationPendingEmail && <div className="mb-3 rounded-lg bg-blue-50 text-blue-900 text-sm p-2">Registo efetuado para <strong>{state.verificationPendingEmail}</strong>. Verifique o seu email para validar a conta.</div>}
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="space-y-1">
            <Label>Palavra-passe {mode === "register" && <span className="text-xs text-gray-500">(requisitos abaixo)</span>}</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {mode === "register" && <PasswordChecklist pass={password} />}
          </div>
          {mode === "register" && (<div className="space-y-1"><Label>Repetir palavra-passe *</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>)}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Manter sessão iniciada</label>
            <button type="button" className="text-sm underline" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}>Recuperar palavra-passe</button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading ? "Aguarde..." : mode === "register" ? "Registar" : "Entrar"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setMode((m) => (m === "register" ? "login" : "register")); setConfirmPassword(""); }}>{mode === "register" ? "Já tenho conta" : "Criar conta"}</Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2"><Shield className="h-4 w-4 mt-[2px]" /><p>Produção: hash Argon2id, cookies httpOnly, sessão, rate limiting, MFA.</p></div>
        </form>

        <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Recuperar palavra-passe</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={submitForgot}>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required /></div>
              <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setForgotOpen(false)}>Cancelar</Button><Button type="submit">Enviar link</Button></div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ---------------------------- DadosPessoaisSection ---------------------------- */
type PessoaDadosWithVal = PessoaDados & { dataValidadeDocumento?: string };

function DadosPessoaisSection({
  state, setState, onAfterSave, goTesouraria,
}: { state: State; setState: React.Dispatch<React.SetStateAction<State>>; onAfterSave: () => void; goTesouraria: () => void; }) {
  const formatPostal = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 7); return d.length <= 4 ? d : d.slice(0, 4) + "-" + d.slice(4); };
  const basePerfil = state.perfil ? normalizePessoaDados(state.perfil, state.conta?.email) : null;

  const [editMode, setEditMode] = useState<boolean>(!basePerfil);
  const [form, setForm] = useState<PessoaDadosWithVal>(() =>
    (basePerfil as PessoaDadosWithVal) || {
      nomeCompleto: "", tipoSocio: "Não pretendo ser sócio", dataNascimento: "", morada: "", codigoPostal: "",
      tipoDocumento: "Cartão de cidadão", numeroDocumento: "", nif: "", telefone: "", email: state.conta?.email || "", profissao: "", dataValidadeDocumento: "",
    }
  );

  // sessão
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => { if (!mounted) return; setUserId(session?.user?.id ?? null); });
    supabase.auth.getUser().then(({ data }) => { if (!mounted) return; setUserId(data?.user?.id ?? null); });
    return () => { mounted = false; sub.data.subscription.unsubscribe(); };
  }, []);

  // contadores docs
  const [socioMissingCount, setSocioMissingCount] = useState<number>(DOCS_SOCIO.length);
  const [athMissingCount, setAthMissingCount] = useState<number>(state.atletas.length * DOCS_ATLETA.length);

  // Resumo Tesouraria
  type ResumoStatus = "regularizado" | "pendente" | "em_dia" | "em_atraso" | "sem_lancamento";
  const [athInscr, setAthInscr] = useState<Record<string, { status: ResumoStatus; due?: string | null; valor?: number }>>({});
  const [athQuotaNext, setAthQuotaNext] = useState<Record<string, { status: ResumoStatus; due?: string | null; valor?: number }>>({});
  const [socioInscrResumo, setSocioInscrResumo] = useState<{ status: ResumoStatus; due?: string | null; valor?: number } | null>(null);

  const StatusBadge = ({ s }: { s: ResumoStatus }) => {
    const map: Record<ResumoStatus, string> = {
      regularizado: "bg-green-100 text-green-700",
      pendente: "bg-blue-100 text-blue-700",
      em_dia: "bg-gray-100 text-gray-700",
      em_atraso: "bg-red-100 text-red-700",
      sem_lancamento: "bg-gray-100 text-gray-500",
    };
    const label: Record<ResumoStatus, string> = {
      regularizado: "Regularizado", pendente: "Pendente de validação", em_dia: "Dentro do prazo", em_atraso: "Em atraso", sem_lancamento: "Sem lançamento",
    };
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[s]}`}>{label[s]}</span>;
  };

  // docs contadores
  useEffect(() => {
    async function fetchDocCounters() {
      if (!userId) { setSocioMissingCount(DOCS_SOCIO.length); setAthMissingCount(state.atletas.length * DOCS_ATLETA.length); return; }
      const socioSel = await supabase.from("documentos").select("doc_tipo").eq("user_id", userId).eq("doc_nivel", "socio").is("atleta_id", null);
      const socioSet = new Set<string>((socioSel.data || []).map((r: any) => r.doc_tipo));
      setSocioMissingCount(DOCS_SOCIO.filter((t) => !socioSet.has(t)).length);

      const athSel = await supabase.from("documentos").select("atleta_id, doc_tipo").eq("user_id", userId).eq("doc_nivel", "atleta");
      const byAth: Map<string, Set<string>> = new Map();
      for (const r of (athSel.data || []) as any[]) { if (!r.atleta_id) continue; const set = byAth.get(r.atleta_id) || new Set<string>(); set.add(r.doc_tipo); byAth.set(r.atleta_id, set); }
      let totalMissing = 0;
      for (const a of state.atletas) { const have = byAth.get(a.id) || new Set<string>(); for (const t of DOCS_ATLETA) if (!have.has(t)) totalMissing++; }
      setAthMissingCount(totalMissing);
    }
    fetchDocCounters().catch((e) => console.error("[fetchDocCounters]", e));
  }, [userId, state.atletas.map((a) => a.id).join(",")]);

  // INSCRIÇÕES (sócio + atletas)
  useEffect(() => {
    async function fetchInscricoes() {
      if (!userId) { setAthInscr({}); setSocioInscrResumo(null); return; }

      // Sócio
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
            due: row?.devido_em ?? sep8OfCurrentYear(),
            valor: socioInscricaoAmount(state.perfil?.tipoSocio),
          });
        } catch (e) {
          console.error("[Resumo] inscrição sócio", e);
          setSocioInscrResumo({ status: "sem_lancamento", due: sep8OfCurrentYear(), valor: socioInscricaoAmount(state.perfil?.tipoSocio) });
        }
      } else {
        setSocioInscrResumo(null);
      }

      // Atletas
      const out: Record<string, { status: ResumoStatus; due?: string | null; valor?: number }> = {};
      const numAgregado = Math.max(1, state.atletas.filter(x => !isAnuidadeObrigatoria(x.escalao)).length);

      for (const a of state.atletas) {
        const { data, error } = await supabase
          .from("pagamentos")
          .select("id,descricao,tipo,comprovativo_url,validado,devido_em,created_at")
          .eq("atleta_id", a.id)
          .eq("tipo", "inscricao")
          .order("created_at", { ascending: false })
          .limit(1);
        const row = error ? null : (data || [])[0];
        const est = estimateCosts({ escalao: a.escalao || "", tipoSocio: state.perfil?.tipoSocio, numAtletasAgregado: numAgregado });
        const status: ResumoStatus = row
          ? row.validado
            ? "regularizado"
            : row.comprovativo_url
            ? "pendente"
            : row.devido_em && new Date() > new Date(row.devido_em + "T23:59:59")
            ? "em_atraso"
            : "em_dia"
          : "sem_lancamento";
        out[a.id] = { status, due: (row?.devido_em ?? sep8OfCurrentYear()), valor: est.taxaInscricao };
      }
      setAthInscr(out);
    }
    fetchInscricoes().catch((e) => console.error("[Resumo Tesouraria] inscrições:", e));
  }, [userId, state.atletas.map((a) => a.id).join(","), state.perfil?.tipoSocio]);

  // QUOTAS — próxima a vencer por atleta
  useEffect(() => {
    async function fetchQuotasNext() {
      if (!userId || state.atletas.length === 0) { setAthQuotaNext({}); return; }
      const out: Record<string, { status: ResumoStatus; due?: string | null; valor?: number }> = {};
      const today = new Date(); today.setHours(0, 0, 0, 0);

      const numAgregado = Math.max(1, state.atletas.filter(a => !isAnuidadeObrigatoria(a.escalao)).length);

      for (const a of state.atletas) {
        const rowsAll = await listPagamentosByAtleta(a.id);
        const rows = rowsAll.filter(r => (r as any).tipo !== "inscricao" && r.devido_em);

        const future = rows.filter(r => r.devido_em && new Date(r.devido_em + "T00:00:00").getTime() >= today.getTime())
                           .sort((x, y) => new Date(x.devido_em!).getTime() - new Date(y.devido_em!).getTime());
        const candidate = (future[0] || rows.sort((x, y) => new Date(y.devido_em!).getTime() - new Date(x.devido_em!).getTime())[0]) || null;

        if (!candidate) { out[a.id] = { status: "sem_lancamento" }; continue; }

        const planoEfetivo: PlanoPagamento = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
        const est = estimateCosts({ escalao: a.escalao || "", tipoSocio: state.perfil?.tipoSocio, numAtletasAgregado: numAgregado });
        const valor = planoEfetivo === "Mensal" ? est.mensal10 : planoEfetivo === "Trimestral" ? est.trimestre3 : est.anual1;

        const status: ResumoStatus =
          candidate.validado ? "regularizado"
          : candidate.comprovativo_url ? "pendente"
          : candidate.devido_em && new Date() > new Date(candidate.devido_em + "T23:59:59")

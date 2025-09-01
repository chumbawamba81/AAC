// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import {
  Upload,
  Trash2,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Plus,
  FileUp,
  RefreshCw,
} from "lucide-react";

import { supabase } from "../supabaseClient";
import type { State } from "../types/AppState";

import {
  listDocs,
  withSignedUrls,
  uploadDoc,
  replaceDoc,
  deleteDoc,
  type DocumentoRow,
} from "../services/documentosService";

// (se fores usar os toasts aqui — recomendado)
import { showToast } from "./MiniToast";


/* -------------------- Constantes -------------------- */
const DOCS_ATLETA = ["Ficha de sócio de atleta", "Ficha de jogador FPB", "Termo de responsabilidade", "Exame médico"] as const;
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
function wantsSocio(tipo?: string | null) {
  return !!tipo && !/não\s*pretendo\s*ser\s*sócio/i.test(tipo);
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
  const s = (escalao || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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
    const conta: Conta | null = s?.conta && typeof s.conta.email === "string" ? { email: s.conta.email } : null;
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
// (sem alterações relevantes – mantive igual ao teu)
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
// (mantido igual ao teu; omitido aqui para poupar espaço)
// …………………………………………………………………………………………………………………………………………………………………………

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

    if (isSocio(state.perfil?.tipoSocio)) {
      await createInscricaoSocioIfMissing(userId);
      const socio = await listSocioInscricao(userId);
      setSocioRows(await withSignedUrlsPagamentos(socio));
    } else {
      setSocioRows([]);
      try {
        await deleteSocioInscricaoIfAny(userId);
      } catch {}
    }

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

  useEffect(() => {
    refreshPayments();
  }, [refreshPayments]);

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.atletas, refreshPayments]);

  function isOverdue(row: PagamentoRowWithUrl | null): boolean {
    if (!row || row.validado) return false;
    const due = row.devido_em || sep8OfCurrentYear();
    const dt = new Date(due + "T23:59:59");
    return new Date().getTime() > dt.getTime();
  }

  async function handleUpload(athlete: Atleta, idx: number, file: File) {
    if (!userId || !file) {
      showToast("Sessão ou ficheiro em falta", "err");
      return;
    }
    setBusy(true);
    try {
      const planoEfetivo = isAnuidadeObrigatoria(athlete.escalao) ? "Anual" : athlete.planoPagamento;
      const label = getPagamentoLabel(planoEfetivo, idx);
      await saveComprovativoPagamento({ userId, atletaId: athlete.id, descricao: label, file });
      await refreshPayments();
      showToast("Comprovativo carregado com sucesso");
    } catch (e: any) {
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
  }

  // >>>> INSCRIÇÃO DE ATLETA — usa o MESMO picker (accept por defeito), + toast
  async function handleUploadInscricao(athlete: Atleta, file: File) {
    if (!userId || !file) {
      showToast("Sessão ou ficheiro em falta", "err");
      return;
    }
    setBusy(true);
    try {
      await saveComprovativoInscricaoAtleta({ userId, atletaId: athlete.id, file });
      await refreshPayments();
      showToast("Comprovativo de inscrição carregado com sucesso");
    } catch (e: any) {
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(athlete: Atleta, idx: number) {
    const row = payments[athlete.id]?.[idx];
    if (!row) return;
    setBusy(true);
    try {
      await clearComprovativo(row);
      await refreshPayments();
      showToast("Comprovativo removido", "err");
    } catch (e: any) {
      showToast(e?.message || "Falha a remover", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadSocio(file: File) {
    if (!userId || !file) {
      showToast("Sessão ou ficheiro em falta", "err");
      return;
    }
    setBusy(true);
    try {
      await saveComprovativoSocioInscricao(userId, file);
      await refreshPayments();
      showToast("Comprovativo de inscrição (sócio) carregado com sucesso");
    } catch (e: any) {
      showToast(e?.message || "Falha no upload", "err");
    } finally {
      setBusy(false);
    }
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
        <div className="rounded-xl border bg-slate-50 p-3 text-sm text-gray-800">
          Os pagamentos devem ser realizados até à data limite indicada, para o seguinte IBAN:
          <strong className="ml-1">PT50 0036 0414 99106005021 95</strong>
          <span className="ml-1">(Banco Montepio)</span>.
        </div>

        {/* Sócio — Inscrição */}
        {/* (mantido igual; só adicionámos toasts nos handlers) */}

        {/* Atletas */}
        {state.atletas.map((a) => {
          const planoEfetivo = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;
          const est = estimateCosts({
            escalao: a.escalao || "",
            tipoSocio: state.perfil?.tipoSocio,
            numAtletasAgregado: Math.max(1, state.atletas.filter((x) => !isAnuidadeObrigatoria(x.escalao)).length),
            proRank:
              state.atletas
                .filter((x) => !isAnuidadeObrigatoria(x.escalao))
                .sort((x, y) => new Date(x.dataNascimento).getTime() - new Date(y.dataNascimento).getTime())
                .findIndex((x) => x.id === a.id) ?? undefined,
          });

          const onlyInscricao = isAnuidadeObrigatoria(a.escalao);
          const slots = getSlotsForPlano(planoEfetivo);
          const rows = payments[a.id] || Array.from({ length: slots }, () => null);
          const amountForIdx = (idx: number) => (planoEfetivo === "Mensal" ? est.mensal10 : planoEfetivo === "Trimestral" ? est.trimestre3 : est.anual1);
          const rowInscr = athleteInscricao[a.id] || null;
          const overdueInscr = rowInscr?.devido_em ? new Date() > new Date(rowInscr.devido_em + "T23:59:59") : false;

          return (
            <div key={a.id} className="border rounded-xl p-3">
              <div className="mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="font-medium">Atleta — {a.nomeCompleto}</div>
                <div className="text-xs text-gray-500 sm:text-right">
                  Plano: {onlyInscricao ? "Sem quotas (apenas inscrição)" : planoEfetivo}
                  {isAnuidadeObrigatoria(a.escalao) ? " (obrigatório pelo escalão)" : ""}
                  {!onlyInscricao && <> · {slots} comprovativo(s)</>}
                </div>
              </div>

              {/* Inscrição de atleta — usa FilePickerButton SEM sobrescrever accept */}
              <div className="border rounded-lg p-3 mb-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">Inscrição de Atleta — {eur(est.taxaInscricao)}</div>
                  <div className="text-xs text-gray-500">
                    {rowInscr?.comprovativo_url
                      ? rowInscr.validado
                        ? "Comprovativo validado"
                        : overdueInscr
                        ? "Comprovativo pendente (em atraso)"
                        : "Comprovativo pendente"
                      : overdueInscr
                      ? "Comprovativo em falta (em atraso)"
                      : "Comprovativo em falta"}
                    {rowInscr?.devido_em && <span className="ml-2">· Limite: {rowInscr.devido_em}</span>}
                    {rowInscr?.signedUrl && (
                      <a className="underline inline-flex items-center gap-1 p-1 ml-2" href={rowInscr.signedUrl} target="_blank" rel="noreferrer">
                        <LinkIcon className="h-3 w-3" /> Abrir
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FilePickerButton
                    variant={rowInscr?.comprovativo_url ? "secondary" : "outline"}
                    onFiles={(files) => files?.[0] && handleUploadInscricao(a, files[0])}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {rowInscr?.comprovativo_url ? "Substituir" : "Carregar"}
                  </FilePickerButton>

                  {rowInscr?.comprovativo_url && (
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await clearComprovativo(rowInscr);
                          await refreshPayments();
                          showToast("Comprovativo removido", "err");
                        } catch (e: any) {
                          showToast(e?.message || "Falha a remover", "err");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>

              {!onlyInscricao && (
                <div className="grid md:grid-cols-2 gap-3">
                  {Array.from({ length: slots }).map((_, i) => {
                    const meta = rows[i];
                    const label = getPagamentoLabel(planoEfetivo, i);
                    const overdue = meta?.devido_em ? new Date() > new Date(meta.devido_em + "T23:59:59") : false;
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
                                {meta.validado ? "Comprovativo validado" : overdue ? "Comprovativo pendente (em atraso)" : "Comprovativo pendente"}
                                {meta.signedUrl && (
                                  <a className="underline inline-flex items-center gap-1" href={meta.signedUrl} target="_blank" rel="noreferrer">
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
                          <FilePickerButton variant={meta?.comprovativo_url ? "secondary" : "outline"} onFiles={(files) => files?.[0] && handleUpload(a, i, files[0])}>
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
// (mantido como tens)

/* ----------------------------------- App ---------------------------------- */

export default function App() {
  const [state, setState] = useState<State>(loadState());
  const [activeTab, setActiveTab] = useState<string>("home");
  const [postSavePrompt, setPostSavePrompt] = useState(false);
  const [syncing, setSyncing] = useState<boolean>(true);

  const [athModalOpen, setAthModalOpen] = useState(false);
  const [athEditing, setAthEditing] = useState<Atleta | undefined>(undefined);

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

      const nextAtletas = wasEditingId ? state.atletas.map((x) => (x.id === wasEditingId ? saved : x)) : [saved, ...state.atletas];

      setState((prev) => ({ ...prev, atletas: nextAtletas }));
      saveState({ ...state, atletas: nextAtletas });

      const force = !!wasEditingId && (planoAntes !== saved.planoPagamento || escalaoAntes !== saved.escalao);

      const isOnlyInscricao = isAnuidadeObrigatoria(saved.escalao);

      if (isOnlyInscricao) {
        await ensureOnlyInscricaoForAtleta(saved.id);
      } else {
        await ensureInscricaoEQuotasForAtleta({ id: saved.id, planoPagamento: saved.planoPagamento }, { forceRebuild: !!force });
      }

      setAthModalOpen(false);
      setAthEditing(undefined);
    } catch (e: any) {
      showToast(e?.message || "Falha ao guardar o atleta", "err");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      {/* Portal de toasts global */}
      <MiniToastPortal />

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
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="home">{mainTabLabel}</TabsTrigger>
                {hasPerfil && <TabsTrigger value="atletas">Atletas</TabsTrigger>}
                {hasPerfil && <TabsTrigger value="docs">Documentos</TabsTrigger>}
                {hasPerfil && hasAtletas && <TabsTrigger value="tes">Situação de Tesouraria</TabsTrigger>}
              </TabsList>

              <TabsContent value="home">
                {/* … DadosPessoaisSection (igual ao teu) */}
              </TabsContent>

              {hasPerfil && (
                <TabsContent value="atletas">
                  {/* … AtletasSection (igual ao teu) */}
                </TabsContent>
              )}

              {hasPerfil && (
                <TabsContent value="docs">
                  <TemplatesDownloadSection />
                  <UploadDocsSection state={state} setState={(s: State) => setState(s)} hideSocioDoc={!wantsSocio(state.perfil?.tipoSocio)} />
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

      {/* (modais e footer iguais ao teu) */}
    </div>
  );
}

/** Botão de autenticação */
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

/** Gate de sessão */
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

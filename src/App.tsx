import React, { useEffect, useState } from "react";
// Import Supabase auth and data services
import { signIn, signUp, signOut } from "./services/authService";
import { getMyProfile, upsertMyProfile } from "./services/profileService";
import {
  listAtletas,
  upsertAtleta as saveAtleta,
  deleteAtleta as removeAtleta,
} from "./services/atletasService";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

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
} from "lucide-react";

import type { PessoaDados } from "./types/PessoaDados";
import type { Atleta, PlanoPagamento } from "./types/Atleta";
import { isValidPostalCode, isValidNIF } from "./utils/form-utils";
import AtletaFormCompleto from "./components/AtletaFormCompleto";

const API_BASE = import.meta.env.VITE_API_URL || "";

const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
  "Comprovativo de pagamento de inscrição",
] as const;
type DocAtleta = (typeof DOCS_ATLETA)[number];

const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;
type DocSocio = (typeof DOCS_SOCIO)[number];

const LS_KEY = "bb_app_payments_v1";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

type Conta = { email: string };
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };

type State = {
  conta: Conta | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<DocAtleta, UploadMeta>>>;
  pagamentos: Record<string, Array<UploadMeta | null>>; // athleteId -> slots
  tesouraria?: string;
  noticias?: string;
  verificationPendingEmail?: string | null;
};

function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw)
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
    const s = JSON.parse(raw);
    return {
      conta: s.conta ?? null,
      perfil: s.perfil ?? null,
      atletas: s.atletas ?? [],
      docsSocio: s.docsSocio ?? {},
      docsAtleta: s.docsAtleta ?? {},
      pagamentos: s.pagamentos ?? {},
      tesouraria: s.tesouraria ?? "Campo em atualização",
      noticias: s.noticias ?? "",
      verificationPendingEmail: s.verificationPendingEmail ?? null,
    } as State;
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

// As funções de autenticação via Supabase são fornecidas por authService.ts
async function apiForgot(email: string): Promise<void> {
  if (!API_BASE) return;
  const r = await fetch(`${API_BASE}/auth/forgot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!r.ok) throw new Error("Não foi possível enviar o email de recuperação");
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
  setToken,
  onLogged,
}: {
  state: State;
  setState: (s: State) => void;
  setToken: (t: string | null) => void;
  onLogged: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(state.conta?.email || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    const savedToken = localStorage.getItem("authToken");
    const savedEmail = localStorage.getItem("authEmail");
    if (savedToken && savedEmail) {
      setToken(savedToken);
      const next = { ...state, conta: { email: savedEmail } } as State;
      setState(next);
      saveState(next);
      onLogged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(undefined);
    setInfo(undefined);
    if (mode === "register") {
      const chk = isPasswordStrong(password);
      if (!chk.ok) {
        setError("A palavra-passe não cumpre os requisitos.");
        return;
      }
      try {
        setLoading(true);
        // Registo via Supabase: envia email de verificação
        await signUp(email, password);
        const next = { ...state, verificationPendingEmail: email, conta: { email } } as State;
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
      // Usa o access token da sessão Supabase ou uma string de fallback
      const supaToken = data?.session?.access_token || `supabase-${uid()}`;
      setToken(supaToken);
      const next = { ...state, conta: { email }, verificationPendingEmail: null } as State;
      setState(next);
      saveState(next);
      if (remember) {
        localStorage.setItem("authToken", supaToken);
        localStorage.setItem("authEmail", email);
      }
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
      await apiForgot(forgotEmail || email);
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
              onClick={() => setMode((m) => (m === "register" ? "login" : "register"))}
            >
              {mode === "register" ? "Já tenho conta" : "Criar conta"}
            </Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5" />
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

function DadosPessoaisSection({
  state,
  setState,
  onAfterSave,
}: {
  state: State;
  setState: (s: State) => void;
  onAfterSave: () => void;
}) {
  function formatPostal(v: string) {
    const d = v.replace(/\D/g, "").slice(0, 7);
    if (d.length <= 4) return d;
    return d.slice(0, 4) + "-" + d.slice(4);
  }

  const [editMode, setEditMode] = useState<boolean>(!state.perfil);
  const [form, setForm] = useState<PessoaDados>(
    () =>
      state.perfil || {
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
      }
  );

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!form.nomeCompleto.trim()) errs.push("Nome obrigatório");

    // Validação robusta de data ISO
    const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
    if (!isValidISODate(form.dataNascimento)) errs.push("Data de nascimento inválida");

    if (!form.morada.trim()) errs.push("Morada obrigatória");
    if (!isValidPostalCode(form.codigoPostal)) errs.push("Código-postal inválido (####-###)");
    if (!form.numeroDocumento.trim()) errs.push("Número de documento obrigatório");
    if (!isValidNIF(form.nif)) errs.push("NIF inválido");
    if (!form.telefone.trim()) errs.push("Telefone obrigatório");
    if (!form.email.trim()) errs.push("Email obrigatório");

    if (errs.length) {
      alert(errs.join("\n"));
      return;
    }

    try {
      // Persiste o perfil no Supabase e atualiza o estado
      const savedPerfil = await upsertMyProfile(form);
      const next = { ...state, perfil: savedPerfil } as State;
      setState(next);
      saveState(next);
      setEditMode(false);
      onAfterSave();
    } catch (e: any) {
      alert(e.message || "Não foi possível guardar o perfil no servidor");
    }
  }

  if (!editMode && state.perfil) {
    const socioMissing = DOCS_SOCIO.filter((d) => !state.docsSocio[d]).length;
    const totalAthDocs = state.atletas.length * 5;
    const uploadedAthDocs = state.atletas.reduce(
      (acc, a) => acc + (state.docsAtleta[a.id] ? Object.keys(state.docsAtleta[a.id]!).length : 0),
      0
    );
    const missingAthDocs = Math.max(0, totalAthDocs - uploadedAthDocs);

    return (
      <div className="space-y-4">
        <div className="mb-1 rounded-xl border p-3 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">{state.perfil?.nomeCompleto}</div>
              <div className="text-xs text-gray-500">
                {state.perfil?.email} · {state.perfil?.telefone} · {state.perfil?.codigoPostal}
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
            <Input
              value={form.nomeCompleto}
              onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Tipo de sócio *</Label>
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
            <Input
              type="date"
              value={form.dataNascimento}
              onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
              required
            />
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
              onChange={(e) =>
                setForm({ ...form, tipoDocumento: e.target.value as PessoaDados["tipoDocumento"] })
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
            <Input value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} required />
          </div>
          <div className="space-y-1">
            <Label>Contacto telefónico *</Label>
            <Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required />
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

/* ---------------------------- PagamentosSection --------------------------- */

function getSlotsForPlano(p: PlanoPagamento) {
  if (p === "Mensal") return 10;
  if (p === "Trimestral") return 3;
  return 1;
}

function PagamentosSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
    if (plano === "Anual") return "Pagamento da anuidade";
    if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
    return `Pagamento - ${idx + 1}º Mês`;
  }

  useEffect(() => {
    const next = { ...state, pagamentos: { ...state.pagamentos } } as State;
    let changed = false;
    for (const a of state.atletas) {
      const need = getSlotsForPlano(a.planoPagamento);
      const arr = next.pagamentos[a.id] || [];
      if (arr.length !== need) {
        const resized = Array.from({ length: need }, (_, i) => arr[i] ?? null);
        next.pagamentos[a.id] = resized;
        changed = true;
      }
    }
    for (const id of Object.keys(next.pagamentos)) {
      if (!state.atletas.find((a) => a.id === id)) {
        delete next.pagamentos[id];
        changed = true;
      }
    }
    if (changed) {
      setState(next);
      saveState(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.atletas.map((a) => a.id + a.planoPagamento).join("|")]);

  async function handleUpload(athleteId: string, idx: number, file: File) {
    const dataUrl = await toDataUrl(file);
    const meta: UploadMeta = { name: file.name, dataUrl, uploadedAt: new Date().toISOString() };
    const next = { ...state, pagamentos: { ...state.pagamentos } } as State;
    const arr = next.pagamentos[athleteId] ? [...next.pagamentos[athleteId]] : [];
    arr[idx] = meta;
    next.pagamentos[athleteId] = arr;
    setState(next);
    saveState(next);
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
        <CardTitle>Pagamentos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {state.atletas.map((a) => {
          const arr = state.pagamentos[a.id] || [];
          const slots = getSlotsForPlano(a.planoPagamento);
          return (
            <div key={a.id} className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{a.nomeCompleto}</div>
                <div className="text-xs text-gray-500">
                  Plano: {a.planoPagamento} · {slots} comprovativo(s)
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {Array.from({ length: slots }).map((_, i) => {
                  const meta = arr[i];
                  return (
                    <div key={i} className="border rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{getPagamentoLabel(a.planoPagamento, i)}</div>
                        <div className="text-xs text-gray-500">
                          {"Comprovativo " + (meta ? "carregado no sistema" : "em falta")}
                        </div>
                      </div>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => e.target.files && handleUpload(a.id, i, e.target.files[0])}
                        />
                        <Button variant={meta ? "secondary" : "outline"}>
                          <Upload className="h-4 w-4 mr-1" />
                          {meta ? "Substituir" : "Carregar"}
                        </Button>
                      </label>
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

function AtletasSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Atleta | undefined>();

  async function remove(id: string) {
    if (!confirm("Remover o atleta?")) return;
    try {
      await removeAtleta(id);
      const next = { ...state, atletas: state.atletas.filter((x) => x.id !== id) } as State;
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
        <Button
          onClick={() => {
            setEditing(undefined);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Novo atleta
        </Button>
      </CardHeader>
      <CardContent>
        {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas. Clique em “Novo atleta”.</p>}
        <div className="grid gap-3">
          {state.atletas.map((a) => {
            const missing = DOCS_ATLETA.filter((d) => !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}
                    {missing.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" /> {missing.length} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Documentação completa
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {a.genero} · Nasc.: {a.dataNascimento} · Escalão: {a.escalao} · Pagamento: {a.planoPagamento}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(a);
                      setOpen(true);
                    }}
                  >
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar atleta" : "Novo atleta"}</DialogTitle>
            </DialogHeader>
            <AtletaFormCompleto
              initial={editing}
              dadosPessoais={{
                morada: state.perfil?.morada,
                codigoPostal: state.perfil?.codigoPostal,
                telefone: state.perfil?.telefone,
                email: state.perfil?.email,
              }}
              onCancel={() => setOpen(false)}
              onSave={async (novo) => {
                try {
                  await saveAtleta(novo);
                  const exists = state.atletas.some((x) => x.id === novo.id);
                  const next = {
                    ...state,
                    atletas: exists ? state.atletas.map((x) => (x.id === novo.id ? novo : x)) : [novo, ...state.atletas],
                  } as State;
                  setState(next);
                  saveState(next);
                  setOpen(false);
                } catch (e: any) {
                  alert(e.message || "Falha ao guardar o atleta");
                }
              }}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- App ---------------------------------- */

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>(loadState());
  const [activeTab, setActiveTab] = useState<string>("home");
  const [postSavePrompt, setPostSavePrompt] = useState(false);

  // Sincroniza dados do Supabase (perfil e atletas) quando o utilizador inicia sessão
  useEffect(() => {
    async function syncFromSupabase() {
      // Só tenta sincronizar se existir um token (utilizador autenticado)
      if (!token) return;
      try {
        const [perfilDb, atletasDb] = await Promise.all([getMyProfile(), listAtletas()]);
        const next: State = { ...state };
        // Se existir perfil no Supabase, usa-o
        if (perfilDb) {
          next.perfil = perfilDb;
        }
        // Se existirem atletas no Supabase, usa-os
        if (atletasDb) {
          next.atletas = atletasDb;
        }
        setState(next);
        saveState(next);
      } catch (e) {
        console.error("Falha a sincronizar do Supabase:", e);
      }
    }
    syncFromSupabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">AAC-SB</h1>
        </div>
        {token ? (
          <Button
            variant="outline"
            onClick={() => {
              // encerra sessão na tua camada de auth (se aplicável) e limpa tokens locais
              try {
                signOut();
              } catch {}
              setToken(null);
              localStorage.removeItem("authToken");
              localStorage.removeItem("authEmail");
            }}
          >
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        ) : null}
      </header>

      {!token ? (
        <ContaSection state={state} setState={setState} setToken={setToken} onLogged={() => setActiveTab("home")} />
      ) : (
        // Tabs não-controladas (o wrapper não expõe onValueChange)
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
              <AtletasSection state={state} setState={setState} />
            </TabsContent>
          )}
          {hasPerfil && (
            <TabsContent value="docs">
              <UploadDocsSection state={state} setState={setState} />
            </TabsContent>
          )}
          {hasPerfil && hasAtletas && (
            <TabsContent value="pag">
              <PagamentosSection state={state} setState={setState} />
            </TabsContent>
          )}
        </Tabs>
      )}

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
        <a
          href="https://aacbasquetebol.clubeo.com/"
          target="_blank"
          rel="noreferrer"
          aria-label="Site AAC Basquetebol"
          className="opacity-80 hover:opacity-100"
        >
          <i className="fa-solid fa-globe" style={{ fontSize: 24 }}></i>
        </a>
        <a href="mailto:basquetebol@academica.pt" aria-label="Email AAC Basquetebol" className="opacity-80 hover:opacity-100">
          <Mail className="h-6 w-6" />
        </a>
      </div>

      <footer className="text-xs text-gray-500 text-center">
        DEMO local — ficheiros em DataURL. Em produção, usa API + armazenamento seguro.
      </footer>
    </div>
  );
}

/* --------------------------- UploadDocsSection ---------------------------- */

function UploadDocsSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  async function toMeta(file: File) {
    const dataUrl = await toDataUrl(file);
    return { name: file.name, dataUrl, uploadedAt: new Date().toISOString() };
  }
  async function uploadSocio(doc: DocSocio, file: File) {
    const meta: UploadMeta = (await toMeta(file)) as any;
    const next = { ...state, docsSocio: { ...state.docsSocio, [doc]: meta } } as State;
    setState(next);
    saveState(next);
  }
  async function uploadAtleta(athleteId: string, doc: DocAtleta, file: File) {
    const meta: UploadMeta = (await toMeta(file)) as any;
    const current = state.docsAtleta[athleteId] || {};
    const next = {
      ...state,
      docsAtleta: { ...state.docsAtleta, [athleteId]: { ...current, [doc]: meta } },
    } as State;
    setState(next);
    saveState(next);
  }
  const socioMissing = DOCS_SOCIO.filter((d) => !state.docsSocio[d]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-5 w-5" /> Upload de Documentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="font-medium">
            Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})
          </div>
          <div className="text-xs text-gray-500 mb-2">
            {socioMissing.length > 0 ? (
              <span className="text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {socioMissing.length} documento(s) em falta
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Completo
              </span>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map((doc) => {
              const meta = state.docsSocio[doc];
              return (
                <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {doc}
                      {state.perfil?.tipoSocio && doc === "Ficha de Sócio" ? ` (${state.perfil.tipoSocio})` : ""}
                    </div>
                    <div className="text-xs text-gray-500">
                      {"Comprovativo " + (meta ? "carregado no sistema" : "em falta")}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => e.target.files && uploadSocio(doc, e.target.files[0])}
                    />
                    <Button variant={meta ? "secondary" : "outline"}>
                      <Upload className="h-4 w-4 mr-1" />
                      {meta ? "Substituir" : "Carregar"}
                    </Button>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas criados.</p>}
          {state.atletas.map((a) => {
            const missing = DOCS_ATLETA.filter((d) => !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}{" "}
                    {missing.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                        <AlertCircle className="h-3 w-3" /> {missing.length} doc(s) em falta
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> Completo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map((doc) => {
                    const meta = state.docsAtleta[a.id]?.[doc];
                    return (
                      <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{doc}</div>
                          <div className="text-xs text-gray-500">
                            {"Comprovativo " + (meta ? "carregado no sistema" : "em falta")}
                          </div>
                        </div>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => e.target.files && uploadAtleta(a.id, doc, e.target.files[0])}
                          />
                          <Button variant={meta ? "secondary" : "outline"}>
                            <Upload className="h-4 w-4 mr-1" />
                            {meta ? "Substituir" : "Carregar"}
                          </Button>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

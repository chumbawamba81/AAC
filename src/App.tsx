import React, { useEffect, useState } from "react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { AlertCircle, CheckCircle2, FileUp, LogIn, LogOut, Shield, UserPlus, Users, PencilLine, Plus, Trash2, Upload, X } from "lucide-react";

// 🔗 novos imports (tipos + componente)
import type { PessoaDados } from "./types/PessoaDados";
import type { Atleta, Escalao, Genero, TipoDocId } from "./types/Atleta";
import { isValidPostalCode, isValidNIF } from "./utils/form-utils";
import AtletaFormCompleto from "./components/AtletaFormCompleto";

/***************************************************
 * APP — INSCRIÇÕES BASQUETEBOL (com AtletaFormCompleto)
 ***************************************************/

// Domínio base (já tipado via src/vite-env.d.ts)
const API_BASE = import.meta.env.VITE_API_URL || "";

// Listas de documentos
const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Ficha inscrição AAC",
  "Exame médico",
  "Comprovativo de pagamento de inscrição",
] as const;
type DocAtleta = typeof DOCS_ATLETA[number];

const DOCS_SOCIO = ["Ficha de Sócio", "Comprovativo de pagamento de sócio"] as const;
type DocSocio = typeof DOCS_SOCIO[number];

// Utilitários locais
const LS_KEY = "bb_app_refactor_v2";
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
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
  const hasLetter = /[A-Za-z]/.test(p);
  const hasDigit = /\d/.test(p);
  const hasSpecial = /[^A-Za-z0-9]/.test(p);
  return { ok: lengthOk && hasLetter && hasDigit && hasSpecial, lengthOk, hasLetter, hasDigit, hasSpecial };
}

// Modelos
type Conta = { email: string };
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };
type State = {
  conta: Conta | null;
  perfil: PessoaDados | null;
  atletas: Atleta[];
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<DocAtleta, UploadMeta>>>;
};

function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {} };
    const s = JSON.parse(raw);
    return {
      conta: s.conta ?? null,
      perfil: s.perfil ?? null,
      atletas: s.atletas ?? [],
      docsSocio: s.docsSocio ?? {},
      docsAtleta: s.docsAtleta ?? {},
    } as State;
  } catch {
    return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {} };
  }
}
function saveState(s: State) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

// API (stubs/real)
async function apiRegister(email: string, password: string): Promise<{ token: string }> {
  if (!API_BASE) return { token: `demo-${uid()}` };
  const r = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("Falha no registo");
  return r.json();
}
async function apiLogin(email: string, password: string): Promise<{ token: string }> {
  if (!API_BASE) return { token: `demo-${uid()}` };
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("Credenciais inválidas");
  return r.json();
}

// UI auxiliares
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
      <Item ok={v.hasLetter} text="Pelo menos 1 letra" />
      <Item ok={v.hasDigit} text="Pelo menos 1 dígito" />
      <Item ok={v.hasSpecial} text="Pelo menos 1 especial" />
    </div>
  );
}

function ContaSection({ state, setState, setToken }: { state: State; setState: (s: State) => void; setToken: (t: string | null) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState(state.conta?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); setError(undefined);
    const chk = isPasswordStrong(password);
    if (mode === "register" && !chk.ok) { setError("A palavra-passe não cumpre os requisitos."); return; }
    try {
      setLoading(true);
      const r = mode === "register" ? await apiRegister(email, password) : await apiLogin(email, password);
      setToken(r.token);
      const next = { ...state, conta: { email } } as State;
      setState(next); saveState(next);
    } catch (e: any) {
      setError(e.message || "Erro de autenticação");
    } finally { setLoading(false); }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{mode === "register" ? <UserPlus className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}{mode === "register" ? "Criar conta" : "Entrar"}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="space-y-1">
            <Label>Palavra-passe {mode === "register" && <span className="text-xs text-gray-500">(requisitos abaixo)</span>}</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            {mode === "register" && <PasswordChecklist pass={password} />}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading ? "Aguarde..." : (mode === "register" ? "Registar" : "Entrar")}</Button>
            <Button type="button" variant="secondary" onClick={() => setMode(m => m === "register" ? "login" : "register")}>{mode === "register" ? "Já tenho conta" : "Criar conta"}</Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5" />
            <p>Produção: hash Argon2id, cookies httpOnly, sessão, rate limiting, MFA.</p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DadosPessoaisSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  const [form, setForm] = useState<PessoaDados>(() => state.perfil || {
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
  });

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!form.nomeCompleto.trim()) errs.push("Nome obrigatório");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dataNascimento)) errs.push("Data de nascimento inválida");
    if (!form.morada.trim()) errs.push("Morada obrigatória");
    if (!isValidPostalCode(form.codigoPostal)) errs.push("Código-postal inválido (####-###)");
    if (!form.numeroDocumento.trim()) errs.push("Número de documento obrigatório");
    if (!isValidNIF(form.nif)) errs.push("NIF inválido");
    if (!form.telefone.trim()) errs.push("Telefone obrigatório");
    if (!form.email.trim()) errs.push("Email obrigatório");
    if (errs.length) { alert(errs.join("\n")); return; }
    const next = { ...state, perfil: form } as State; setState(next); saveState(next);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Dados Pessoais</CardTitle></CardHeader>
      <CardContent>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <div className="space-y-1"><Label>Nome Completo *</Label><Input value={form.nomeCompleto} onChange={e => setForm({ ...form, nomeCompleto: e.target.value })} required /></div>
          <div className="space-y-1">
            <Label>Tipo de sócio *</Label>
            <Select value={form.tipoSocio} onValueChange={(v: PessoaDados["tipoSocio"]) => setForm({ ...form, tipoSocio: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Sócio Pro", "Sócio Família", "Sócio Geral Renovação", "Sócio Geral Novo", "Não pretendo ser sócio"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Data de Nascimento *</Label><Input type="date" value={form.dataNascimento} onChange={e => setForm({ ...form, dataNascimento: e.target.value })} required /></div>
          <div className="space-y-1 md:col-span-2"><Label>Morada *</Label><Input value={form.morada} onChange={e => setForm({ ...form, morada: e.target.value })} required /></div>
          <div className="space-y-1"><Label>Código Postal *</Label><Input value={form.codigoPostal} onChange={e => setForm({ ...form, codigoPostal: e.target.value })} placeholder="0000-000" required /></div>
          <div className="space-y-1">
            <Label>Tipo de documento *</Label>
            <Select value={form.tipoDocumento} onValueChange={(v: PessoaDados["tipoDocumento"]) => setForm({ ...form, tipoDocumento: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Cartão de cidadão", "Passaporte", "Título de Residência"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Nº documento *</Label><Input value={form.numeroDocumento} onChange={e => setForm({ ...form, numeroDocumento: e.target.value })} required /></div>
          <div className="space-y-1"><Label>NIF *</Label><Input value={form.nif} onChange={e => setForm({ ...form, nif: e.target.value })} required /></div>
          <div className="space-y-1"><Label>Contacto telefónico *</Label><Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} required /></div>
          <div className="space-y-1"><Label>Endereço eletrónico *</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
          <div className="space-y-1 md:col-span-2"><Label>Profissão (opcional)</Label><Input value={form.profissao || ""} onChange={e => setForm({ ...form, profissao: e.target.value })} /></div>
          <div className="md:col-span-2 flex justify-end gap-2"><Button type="submit"><Shield className="h-4 w-4 mr-1" /> Guardar</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function AtletasSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Atleta | undefined>();

  function remove(id: string) {
    if (!confirm("Remover o atleta?")) return;
    const next = { ...state, atletas: state.atletas.filter(x => x.id !== id) } as State;
    delete next.docsAtleta[id];
    setState(next); saveState(next);
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Inscrição de Atletas</CardTitle>
        <Button onClick={() => { setEditing(undefined); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Novo atleta</Button>
      </CardHeader>
      <CardContent>
        {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas. Clique em “Novo atleta”.</p>}
        <div className="grid gap-3">
          {state.atletas.map(a => {
            const missing = DOCS_ATLETA.filter(d => !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}
                    {missing.length > 0
                      ? <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> {missing.length} doc(s) em falta</Badge>
                      : <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Documentação completa</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">{a.genero} · Nasc.: {a.dataNascimento} · Escalão: {a.escalao}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setEditing(a); setOpen(true); }}><PencilLine className="h-4 w-4 mr-1" /> Editar</Button>
                  <Button variant="destructive" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 mr-1" /> Remover</Button>
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{editing ? "Editar atleta" : "Novo atleta"}</DialogTitle></DialogHeader>
            <AtletaFormCompleto
              initial={editing}
              onCancel={() => setOpen(false)}
              onSave={(novo) => {
                const exists = state.atletas.some(x => x.id === novo.id);
                const next = {
                  ...state,
                  atletas: exists ? state.atletas.map(x => x.id === novo.id ? novo : x) : [novo, ...state.atletas],
                } as State;
                setState(next); saveState(next); setOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function UploadDocsSection({ state, setState }: { state: State; setState: (s: State) => void }) {
  async function toMeta(file: File) {
    const dataUrl = await toDataUrl(file);
    return { name: file.name, dataUrl, uploadedAt: new Date().toISOString() };
  }
  async function uploadSocio(doc: DocSocio, file: File) {
    const meta: UploadMeta = await toMeta(file) as any;
    const next = { ...state, docsSocio: { ...state.docsSocio, [doc]: meta } } as State; setState(next); saveState(next);
  }
  async function uploadAtleta(athleteId: string, doc: DocAtleta, file: File) {
    const meta: UploadMeta = await toMeta(file) as any;
    const current = state.docsAtleta[athleteId] || {};
    const next = { ...state, docsAtleta: { ...state.docsAtleta, [athleteId]: { ...current, [doc]: meta } } } as State;
    setState(next); saveState(next);
  }

  const socioMissing = DOCS_SOCIO.filter(d => !state.docsSocio[d]);

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5" /> Upload de Documentos</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="font-medium">Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})</div>
          <div className="text-xs text-gray-500 mb-2">
            {socioMissing.length > 0
              ? (<span className="text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {socioMissing.length} documento(s) em falta</span>)
              : (<span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Completo</span>)}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map(doc => {
              const meta = state.docsSocio[doc];
              return (
                <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {doc}{state.perfil?.tipoSocio && doc === "Ficha de Sócio" ? ` (${state.perfil.tipoSocio})` : ""}
                    </div>
                    <div className="text-xs text-gray-500">{meta ? `Carregado: ${new Date(meta.uploadedAt).toLocaleString()}` : "Em falta"}</div>
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="file" className="hidden" onChange={e => e.target.files && uploadSocio(doc, e.target.files[0])} />
                    <Button variant={meta ? "secondary" : "outline"}><Upload className="h-4 w-4 mr-1" />{meta ? "Substituir" : "Carregar"}</Button>
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {state.atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas criados.</p>}
          {state.atletas.map(a => {
            const missing = DOCS_ATLETA.filter(d => !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {a.nomeCompleto}
                    {missing.length > 0
                      ? <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> {missing.length} doc(s) em falta</Badge>
                      : <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Completo</Badge>}
                  </div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map(doc => {
                    const meta = state.docsAtleta[a.id]?.[doc];
                    return (
                      <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{doc}</div>
                          <div className="text-xs text-gray-500">{meta ? `Carregado: ${new Date(meta.uploadedAt).toLocaleString()}` : "Em falta"}</div>
                        </div>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="file" className="hidden" onChange={e => e.target.files && uploadAtleta(a.id, doc, e.target.files[0])} />
                          <Button variant={meta ? "secondary" : "outline"}><Upload className="h-4 w-4 mr-1" />{meta ? "Substituir" : "Carregar"}</Button>
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

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>(loadState());

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => {
    try {
      // smoke tests (dev)
      const mode = (import.meta as any).env?.MODE;
      if (mode && mode !== "production") {
        console.assert(isPasswordStrong("Abc!1234").ok, "Password simples válida");
        console.assert(!isPasswordStrong("abc12345").ok, "Falta especial");
        console.assert(isValidNIF("123456789") === false, "NIF inválido");
        console.assert(isValidPostalCode("4000-123"), "CP válido");
        console.assert(!isValidPostalCode("4000-12"), "CP inválido");
      }
    } catch {}
  }, []);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Users className="h-6 w-6" /><h1 className="text-2xl font-bold">Inscrições — Basquetebol</h1></div>
        {token ? (<Button variant="outline" onClick={() => setToken(null)}><LogOut className="h-4 w-4 mr-1" /> Sair</Button>) : null}
      </header>

      {!token ? (
        <ContaSection state={state} setState={setState} setToken={setToken} />
      ) : (
        <Tabs defaultValue="pessoais">
          <TabsList>
            <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="atletas">Atletas</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="pessoais"><DadosPessoaisSection state={state} setState={setState} /></TabsContent>
          <TabsContent value="atletas"><AtletasSection state={state} setState={setState} /></TabsContent>
          <TabsContent value="docs"><UploadDocsSection state={state} setState={setState} /></TabsContent>
        </Tabs>
      )}

      <footer className="text-xs text-gray-500 text-center">
        DEMO local — ficheiros em DataURL. Em produção, usar API + armazenamento seguro (S3/minio) e controlo de acesso.
      </footer>
    </div>
  );
}

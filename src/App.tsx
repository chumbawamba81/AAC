
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

/***************************************************
 * APP — INSCRIÇÕES BASQUETEBOL (refactor total)
 ***************************************************/

type TipoSocio = "Sócio Pro" | "Sócio Família" | "Sócio Geral Renovação" | "Sócio Geral Novo" | "Não pretendo ser sócio";
type TipoDocId = "Cartão de cidadão" | "Passaporte" | "Título de Residência";

type Genero = "Feminino" | "Masculino";
type Nacionalidade = "Portuguesa" | "Outra";

type Escalao =
  | "Baby Basket (2020-2021)"
  | "Mini 8 (2018-2019)"
  | "Mini 10 (2016-2017)"
  | "Mini 12 (2014-2015)"
  | "Sub 14 feminino (2012-2013)"
  | "Sub 14 masculino (2012-2013)"
  | "Sub 16 feminino (2010-2011)"
  | "Sub 16 masculino (2010-2011)"
  | "Sub 18 femininos (2008-2009)"
  | "Sub 18 masculinos (2008-2009)"
  | "Seniores femininas (≤2007)"
  | "Seniores masculinos Sub23 (2002-2007)"
  | "Masters femininas (<1995)"
  | "Fora de escalões";

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

const LS_KEY = "bb_app_refactor_v1";
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
function isValidNIF(nif: string) {
  const m = nif.match(/^\d{9}$/); if (!m) return false;
  const n = nif.split("").map(Number);
  const c = n.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const v = 11 - (c % 11);
  const check = v >= 10 ? 0 : v;
  return check === n[8];
}
function isValidPostalCode(pt: string) { return /^\d{4}-\d{3}$/.test(pt.trim()); }
function yearsAtSeasonStart(dobIso: string) {
  const ref = new Date("2025-09-01T00:00:00");
  const dob = new Date(dobIso);
  let age = ref.getFullYear() - dob.getFullYear();
  const md = ref.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && ref.getDate() < dob.getDate())) age--;
  return age;
}
function computeEscalao(dobIso: string, genero: Genero): Escalao {
  if (!dobIso) return "Fora de escalões";
  const y = new Date(dobIso).getFullYear();
  if (y === 2020 || y === 2021) return "Baby Basket (2020-2021)";
  if (y === 2018 || y === 2019) return "Mini 8 (2018-2019)";
  if (y === 2016 || y === 2017) return "Mini 10 (2016-2017)";
  if (y === 2014 || y === 2015) return "Mini 12 (2014-2015)";
  if (y === 2012 || y === 2013) return genero === "Feminino" ? "Sub 14 feminino (2012-2013)" : "Sub 14 masculino (2012-2013)";
  if (y === 2010 || y === 2011) return genero === "Feminino" ? "Sub 16 feminino (2010-2011)" : "Sub 16 masculino (2010-2011)";
  if (y === 2008 || y === 2009) return genero === "Feminino" ? "Sub 18 femininos (2008-2009)" : "Sub 18 masculinos (2008-2009)";
  if (genero === "Feminino") {
    if (y <= 2007 && y >= 1995) return "Seniores femininas (≤2007)";
    if (y < 1995) return "Masters femininas (<1995)";
  } else {
    if (y >= 2002 && y <= 2007) return "Seniores masculinos Sub23 (2002-2007)";
  }
  return "Fora de escalões";
}

type Conta = { email: string };
type PessoaDados = {
  nomeCompleto: string;
  tipoSocio: TipoSocio;
  dataNascimento: string;
  morada: string;
  codigoPostal: string;
  tipoDoc: TipoDocId;
  numDoc: string;
  nif: string;
  telefone: string;
  email: string;
  profissao?: string;
};
type Atleta = {
  id: string; nomeCompleto: string; dataNascimento: string; genero: Genero;
  nacionalidade: "Portuguesa" | "Outra"; nacionalidadeOutra?: string;
  tipoDoc: TipoDocId; numDoc: string; validadeDoc: string; nif: string;
  nomePai: string; nomeMae: string;
  morada: string; codigoPostal: string; telefoneOpc?: string; emailOpc?: string;
  escola: string; anoEscolaridade: string; alergias: string;
  encarregadoEducacao?: "Pai" | "Mãe" | "Outro"; parentescoOutro?: string;
  contactosUrgencia: string; emailsPreferenciais: string; escalao: Escalao;
};
type UploadMeta = { name: string; dataUrl: string; uploadedAt: string };
type State = {
  conta: Conta | null; perfil: PessoaDados | null; atletas: Atleta[];
  docsSocio: Partial<Record<DocSocio, UploadMeta>>;
  docsAtleta: Record<string, Partial<Record<DocAtleta, UploadMeta>>>;
};
function loadState(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {} };
    const s = JSON.parse(raw);
    return { conta: s.conta ?? null, perfil: s.perfil ?? null, atletas: s.atletas ?? [], docsSocio: s.docsSocio ?? {}, docsAtleta: s.docsAtleta ?? {} } as State;
  } catch { return { conta: null, perfil: null, atletas: [], docsSocio: {}, docsAtleta: {} }; }
}
function saveState(s: State) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

const API_BASE = import.meta.env.VITE_API_URL || "";

async function apiRegister(email: string, password: string): Promise<{ token: string }> {
  if (API_BASE) {
    const r = await fetch(`${API_BASE}/auth/register`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ email, password }), credentials: "include" });
    if (!r.ok) throw new Error("Falha no registo");
    return r.json();
  }
  return { token: `demo-${uid()}` };
}
async function apiLogin(email: string, password: string): Promise<{ token: string }> {
  if (API_BASE) {
    const r = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ email, password }), credentials: "include" });
    if (!r.ok) throw new Error("Credenciais inválidas");
    return r.json();
  }
  return { token: `demo-${uid()}` };
}

function PasswordChecklist({ pass }: { pass: string }) {
  const v = isPasswordStrong(pass);
  const Item = ({ ok, text }: { ok: boolean; text: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4"/> : <AlertCircle className="h-4 w-4"/>}
      <span className={ok ? "" : "text-red-600"}>{text}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-2">
      <Item ok={v.lengthOk} text="Mínimo 8 caracteres"/>
      <Item ok={v.hasLetter} text="Pelo menos 1 letra"/>
      <Item ok={v.hasDigit} text="Pelo menos 1 dígito"/>
      <Item ok={v.hasSpecial} text="Pelo menos 1 especial"/>
    </div>
  );
}

function ContaSection({ state, setState, setToken }: { state: State; setState: (s: State) => void; setToken: (t: string|null) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState(state.conta?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|undefined>();
  async function submit(ev: React.FormEvent) {
    ev.preventDefault(); setError(undefined);
    const chk = isPasswordStrong(password);
    if (mode === "register" && !chk.ok) { setError("A palavra‑passe não cumpre os requisitos."); return; }
    try {
      setLoading(true);
      const r = mode === "register" ? await apiRegister(email, password) : await apiLogin(email, password);
      setToken(r.token);
      const next = { ...state, conta: { email } } as State;
      setState(next); saveState(next);
    } catch (e:any) {
      setError(e.message || "Erro de autenticação");
    } finally { setLoading(false); }
  }
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">{mode==="register"?<UserPlus className="h-5 w-5"/>:<LogIn className="h-5 w-5"/>}{mode==="register"?"Criar conta":"Entrar"}</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>
          <div className="space-y-1"><Label>Palavra‑passe {mode==="register" && <span className="text-xs text-gray-500">(requisitos abaixo)</span>}</Label><Input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/>{mode==="register"&&<PasswordChecklist pass={password}/>}</div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <Button type="submit" disabled={loading}>{loading?"Aguarde...":(mode==="register"?"Registar":"Entrar")}</Button>
            <Button type="button" variant="secondary" onClick={()=>setMode(m=>m==="register"?"login":"register")}>{mode==="register"?"Já tenho conta":"Criar conta"}</Button>
          </div>
          <div className="mt-2 text-xs text-gray-500 flex items-start gap-2"><Shield className="h-4 w-4 mt-0.5"/><p>Em produção: hash Argon2id, cookies httpOnly, controlo de sessão, rate limiting, MFA.</p></div>
        </form>
      </CardContent>
    </Card>
  );
}

type PessoaDados = any; // already defined above, TS duplicate workaround

function DadosPessoaisSection({ state, setState }: { state: State; setState: (s: State)=>void }) {
  const [form, setForm] = useState<PessoaDados>(()=> state.perfil || {
    nomeCompleto: "",
    tipoSocio: "Não pretendo ser sócio",
    dataNascimento: "",
    morada: "",
    codigoPostal: "",
    tipoDoc: "Cartão de cidadão",
    numDoc: "",
    nif: "",
    telefone: "",
    email: state.conta?.email || "",
    profissao: "",
  });
  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!form.nomeCompleto.trim()) errs.push("Nome obrigatório");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(form.dataNascimento)) errs.push("Data de nascimento inválida");
    if (!form.morada.trim()) errs.push("Morada obrigatória");
    if (!isValidPostalCode(form.codigoPostal)) errs.push("Código‑postal inválido (####-###)");
    if (!form.numDoc.trim()) errs.push("Número de documento obrigatório");
    if (!isValidNIF(form.nif)) errs.push("NIF inválido");
    if (!form.telefone.trim()) errs.push("Telefone obrigatório");
    if (!form.email.trim()) errs.push("Email obrigatório");
    if (errs.length) { alert(errs.join("\\n")); return; }
    const next = { ...state, perfil: form } as State; setState(next); saveState(next);
  }
  return (
    <Card>
      <CardHeader><CardTitle>Dados Pessoais</CardTitle></CardHeader>
      <CardContent>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <div className="space-y-1"><Label>Nome Completo *</Label><Input value={form.nomeCompleto} onChange={e=>setForm({...form,nomeCompleto:e.target.value})} required/></div>
          <div className="space-y-1"><Label>Tipo de sócio *</Label>
            <Select value={form.tipoSocio} onValueChange={(v:any)=>setForm({...form,tipoSocio:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Sócio Pro","Sócio Família","Sócio Geral Renovação","Sócio Geral Novo","Não pretendo ser sócio"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Data de Nascimento *</Label><Input type="date" value={form.dataNascimento} onChange={e=>setForm({...form,dataNascimento:e.target.value})} required/></div>
          <div className="space-y-1 md:col-span-2"><Label>Morada *</Label><Input value={form.morada} onChange={e=>setForm({...form,morada:e.target.value})} required/></div>
          <div className="space-y-1"><Label>Código Postal *</Label><Input value={form.codigoPostal} onChange={e=>setForm({...form,codigoPostal:e.target.value})} placeholder="0000-000" required/></div>
          <div className="space-y-1"><Label>Tipo de documento *</Label>
            <Select value={form.tipoDoc} onValueChange={(v:any)=>setForm({...form,tipoDoc:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Cartão de cidadão","Passaporte","Título de Residência"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1"><Label>Nº documento *</Label><Input value={form.numDoc} onChange={e=>setForm({...form,numDoc:e.target.value})} required/></div>
          <div className="space-y-1"><Label>NIF *</Label><Input value={form.nif} onChange={e=>setForm({...form,nif:e.target.value})} required/></div>
          <div className="space-y-1"><Label>Contacto telefónico *</Label><Input value={form.telefone} onChange={e=>setForm({...form,telefone:e.target.value})} required/></div>
          <div className="space-y-1"><Label>Endereço eletrónico *</Label><Input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></div>
          <div className="space-y-1 md:col-span-2"><Label>Profissão (opcional)</Label><Input value={form.profissao||""} onChange={e=>setForm({...form,profissao:e.target.value})}/></div>
          <div className="md:col-span-2 flex justify-end gap-2"><Button type="submit"><Shield className="h-4 w-4 mr-1"/> Guardar</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function AtletaForm({ initial, onSave, onCancel }:{ initial?: Partial<Atleta>, onSave:(a:Atleta)=>void, onCancel:()=>void }){
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || "",
    dataNascimento: initial?.dataNascimento || "",
    genero: (initial?.genero as Genero) || "Feminino",
    nacionalidade: (initial?.nacionalidade as any) || "Portuguesa",
    nacionalidadeOutra: initial?.nacionalidadeOutra || "",
    tipoDoc: (initial?.tipoDoc as any) || "Cartão de cidadão",
    numDoc: initial?.numDoc || "",
    validadeDoc: initial?.validadeDoc || "",
    nif: initial?.nif || "",
    nomePai: initial?.nomePai || "",
    nomeMae: initial?.nomeMae || "",
    morada: initial?.morada || "",
    codigoPostal: initial?.codigoPostal || "",
    telefoneOpc: initial?.telefoneOpc || "",
    emailOpc: initial?.emailOpc || "",
    escola: initial?.escola || "",
    anoEscolaridade: initial?.anoEscolaridade || "",
    alergias: initial?.alergias || "",
    encarregadoEducacao: initial?.encarregadoEducacao,
    parentescoOutro: initial?.parentescoOutro || "",
    contactosUrgencia: initial?.contactosUrgencia || "",
    emailsPreferenciais: initial?.emailsPreferenciais || "",
    escalao: initial?.escalao || "Fora de escalões",
  });
  useEffect(()=>{
    if (a.dataNascimento && a.genero) setA(prev=>({...prev, escalao: computeEscalao(a.dataNascimento, a.genero)}));
  }, [a.dataNascimento, a.genero]);
  function save(ev: React.FormEvent){
    ev.preventDefault();
    const errs:string[]=[];
    if (!a.nomeCompleto.trim()) errs.push("Nome do atleta é obrigatório");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(a.dataNascimento)) errs.push("Data de nascimento inválida");
    if (!isValidPostalCode(a.codigoPostal)) errs.push("Código‑postal inválido");
    if (!isValidNIF(a.nif)) errs.push("NIF do atleta inválido");
    if (!a.numDoc.trim()) errs.push("Número de documento obrigatório");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(a.validadeDoc)) errs.push("Validade de documento inválida");
    if (a.nacionalidade === "Outra" && !a.nacionalidadeOutra?.trim()) errs.push("Indicar a nacionalidade");
    const minor = yearsAtSeasonStart(a.dataNascimento) < 18;
    if (minor && !a.encarregadoEducacao) errs.push("Selecionar Encarregado de Educação");
    if (a.encarregadoEducacao === "Outro" && !a.parentescoOutro?.trim()) errs.push("Indicar parentesco (Outro)");
    if (!a.escola.trim()) errs.push("Escola é obrigatória");
    if (!a.anoEscolaridade.trim()) errs.push("Ano de escolaridade é obrigatório");
    if (!a.contactosUrgencia.trim()) errs.push("Contactos de urgência são obrigatórios");
    if (!a.emailsPreferenciais.trim()) errs.push("Email(s) preferencial(ais) é obrigatório");
    if (errs.length){ alert(errs.join("\\n")); return; }
    onSave(a);
  }
  const minor = a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false;
  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      <div className="space-y-1 md:col-span-2"><Label>Nome Completo *</Label><Input value={a.nomeCompleto} onChange={e=>setA({...a,nomeCompleto:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Data de Nascimento *</Label><Input type="date" value={a.dataNascimento} onChange={e=>setA({...a,dataNascimento:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Género *</Label>
        <Select value={a.genero} onValueChange={(v:any)=>setA({...a,genero:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Feminino","Masculino"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1"><Label>Nacionalidade *</Label>
        <Select value={a.nacionalidade} onValueChange={(v:any)=>setA({...a,nacionalidade:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Portuguesa","Outra"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      {a.nacionalidade === "Outra" && <div className="space-y-1 md:col-span-2"><Label>Indique a nacionalidade</Label><Input value={a.nacionalidadeOutra||""} onChange={e=>setA({...a,nacionalidadeOutra:e.target.value})}/></div>}
      <div className="space-y-1"><Label>Tipo de documento *</Label>
        <Select value={a.tipoDoc} onValueChange={(v:any)=>setA({...a,tipoDoc:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Cartão de cidadão","Passaporte","Título de Residência"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1"><Label>Nº documento *</Label><Input value={a.numDoc} onChange={e=>setA({...a,numDoc:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Validade do documento *</Label><Input type="date" value={a.validadeDoc} onChange={e=>setA({...a,validadeDoc:e.target.value})} required/></div>
      <div className="space-y-1"><Label>NIF *</Label><Input value={a.nif} onChange={e=>setA({...a,nif:e.target.value})} required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Morada *</Label><Input value={a.morada} onChange={e=>setA({...a,morada:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Código Postal *</Label><Input value={a.codigoPostal} onChange={e=>setA({...a,codigoPostal:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Telefone (opcional)</Label><Input value={a.telefoneOpc||""} onChange={e=>setA({...a,telefoneOpc:e.target.value})}/></div>
      <div className="space-y-1"><Label>Email (opcional)</Label><Input type="email" value={a.emailOpc||""} onChange={e=>setA({...a,emailOpc:e.target.value})}/></div>
      <div className="space-y-1 md:col-span-2"><Label>Escola (2025/26) *</Label><Input value={a.escola} onChange={e=>setA({...a,escola:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Ano de escolaridade (2025/26) *</Label><Input value={a.anoEscolaridade} onChange={e=>setA({...a,anoEscolaridade:e.target.value})} required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Alergias / problemas de saúde</Label><Textarea value={a.alergias} onChange={e=>setA({...a,alergias:e.target.value})}/></div>
      {minor && <>
        <div className="space-y-1"><Label>Encarregado de Educação *</Label>
          <Select value={a.encarregadoEducacao||""} onValueChange={(v:any)=>setA({...a,encarregadoEducacao:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["Pai","Mãe","Outro"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        </div>
        {a.encarregadoEducacao === "Outro" && <div className="space-y-1"><Label>Parentesco</Label><Input value={a.parentescoOutro||""} onChange={e=>setA({...a,parentescoOutro:e.target.value})}/></div>}
      </>}
      <div className="space-y-1 md:col-span-2"><Label>Contactos telefónicos de urgência *</Label><Input placeholder="912...; 913..." value={a.contactosUrgencia} onChange={e=>setA({...a,contactosUrgencia:e.target.value})} required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Email(s) preferenciais *</Label><Input placeholder="a@x.pt; b@y.pt" value={a.emailsPreferenciais} onChange={e=>setA({...a,emailsPreferenciais:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Escalão (sugestão automática)</Label><Input value={a.escalao} readOnly className="bg-gray-100"/></div>
      <div className="md:col-span-2 flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onCancel}><X className="h-4 w-4 mr-1"/> Cancelar</Button><Button type="submit"><CheckCircle2 className="h-4 w-4 mr-1"/> Guardar atleta</Button></div>
    </form>
  );
}

function AtletasSection({ state, setState }:{ state: State; setState: (s: State)=>void }){
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<Atleta|undefined>();
  function remove(id: string){
    if (!confirm("Remover o atleta?")) return;
    const next = { ...state, atletas: state.atletas.filter(x=>x.id!==id) } as State;
    delete next.docsAtleta[id];
    setState(next); saveState(next);
  }
  return (
    <Card>
      <CardHeader className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5"/> Inscrição de Atletas</CardTitle><Button onClick={()=>{setEditing(undefined); setOpen(true);}}><Plus className="h-4 w-4 mr-1"/> Novo atleta</Button></CardHeader>
      <CardContent>
        {state.atletas.length===0 && <p className="text-sm text-gray-500">Sem atletas. Clique em “Novo atleta”.</p>}
        <div className="grid gap-3">
          {state.atletas.map(a=>{
            const missing = DOCS_ATLETA.filter(d=> !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">{a.nomeCompleto}{missing.length>0? <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3"/> {missing.length} doc(s) em falta</Badge> : <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3"/> Documentação completa</Badge>}</div>
                  <div className="text-xs text-gray-500">{a.genero} · Nasc.: {a.dataNascimento} · Escalão: {a.escalao}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={()=>{setEditing(a); setOpen(true);}}><PencilLine className="h-4 w-4 mr-1"/> Editar</Button>
                  <Button variant="destructive" onClick={()=>remove(a.id)}><Trash2 className="h-4 w-4 mr-1"/> Remover</Button>
                </div>
              </div>
            );
          })}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing?"Editar atleta":"Novo atleta"}</DialogTitle></DialogHeader>
            <AtletaForm initial={editing} onCancel={()=>setOpen(false)} onSave={(novo)=>{
              const exists = state.atletas.some(x=>x.id===novo.id);
              const next = { ...state, atletas: exists? state.atletas.map(x=>x.id===novo.id?novo:x) : [novo, ...state.atletas] } as State;
              setState(next); saveState(next); setOpen(false);
            }}/>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function UploadDocsSection({ state, setState }:{ state: State; setState: (s: State)=>void }){
  async function toMeta(file: File){
    const dataUrl = await toDataUrl(file);
    return { name: file.name, dataUrl, uploadedAt: new Date().toISOString() };
  }
  async function uploadSocio(doc: DocSocio, file: File){
    const meta: UploadMeta = await toMeta(file) as any;
    const next = { ...state, docsSocio: { ...state.docsSocio, [doc]: meta } } as State; setState(next); saveState(next);
  }
  async function uploadAtleta(athleteId: string, doc: DocAtleta, file: File){
    const meta: UploadMeta = await toMeta(file) as any;
    const current = state.docsAtleta[athleteId] || {};
    const next = { ...state, docsAtleta: { ...state.docsAtleta, [athleteId]: { ...current, [doc]: meta } } } as State;
    setState(next); saveState(next);
  }
  const socioMissing = DOCS_SOCIO.filter(d=> !state.docsSocio[d]);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileUp className="h-5 w-5"/> Upload de Documentos</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="font-medium">Documentos do Sócio ({state.perfil?.nomeCompleto || state.conta?.email || "Conta"})</div>
          <div className="text-xs text-gray-500 mb-2">{socioMissing.length>0 ? (<span className="text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3"/> {socioMissing.length} documento(s) em falta</span>) : (<span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/> Completo</span>)}</div>
          <div className="grid md:grid-cols-2 gap-3">
            {DOCS_SOCIO.map(doc=>{
              const meta = state.docsSocio[doc];
              return (
                <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                  <div><div className="font-medium">{doc}{state.perfil?.tipoSocio && doc==="Ficha de Sócio" ? ` (${state.perfil.tipoSocio})` : ""}</div><div className="text-xs text-gray-500">{meta?`Carregado: ${new Date(meta.uploadedAt).toLocaleString()}`:"Em falta"}</div></div>
                  <label className="inline-flex items-center gap-2 cursor-pointer"><input type="file" className="hidden" onChange={e=> e.target.files && uploadSocio(doc, e.target.files[0])}/><Button variant={meta?"secondary":"outline"}><Upload className="h-4 w-4 mr-1"/>{meta?"Substituir":"Carregar"}</Button></label>
                </div>
              );
            })}
          </div>
        </div>
        <div className="space-y-3">
          <div className="font-medium">Documentos por Atleta</div>
          {state.atletas.length===0 && <p className="text-sm text-gray-500">Sem atletas criados.</p>}
          {state.atletas.map(a=>{
            const missing = DOCS_ATLETA.filter(d=> !state.docsAtleta[a.id] || !state.docsAtleta[a.id][d]);
            return (
              <div key={a.id} className="border rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">{a.nomeCompleto} {missing.length>0 ? <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3"/> {missing.length} doc(s) em falta</Badge> : <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3"/> Completo</Badge>}</div>
                  <div className="text-xs text-gray-500">Escalão: {a.escalao}</div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  {DOCS_ATLETA.map(doc=>{
                    const meta = state.docsAtleta[a.id]?.[doc];
                    return (
                      <div key={doc} className="border rounded-lg p-3 flex items-center justify-between">
                        <div><div className="font-medium">{doc}</div><div className="text-xs text-gray-500">{meta?`Carregado: ${new Date(meta.uploadedAt).toLocaleString()}`:"Em falta"}</div></div>
                        <label className="inline-flex items-center gap-2 cursor-pointer"><input type="file" className="hidden" onChange={e=> e.target.files && uploadAtleta(a.id, doc, e.target.files[0])}/><Button variant={meta?"secondary":"outline"}><Upload className="h-4 w-4 mr-1"/>{meta?"Substituir":"Carregar"}</Button></label>
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

export default function App(){
  const [token, setToken] = useState<string|null>(null);
  const [state, setState] = useState<State>(loadState());
  useEffect(()=>{ saveState(state); }, [state]);
  useEffect(()=>{
    try{ const mode = import.meta.env.MODE; if (mode && mode!=="production") runSelfTests(); }catch{}
  }, []);
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Users className="h-6 w-6"/><h1 className="text-2xl font-bold">Inscrições — Basquetebol</h1></div>
        {token ? (<Button variant="outline" onClick={()=>setToken(null)}><LogOut className="h-4 w-4 mr-1"/> Sair</Button>) : null}
      </header>
      {!token ? (<ContaSection state={state} setState={setState} setToken={setToken}/>) : (
        <Tabs defaultValue="pessoais">
          <TabsList>
            <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="atletas">Atletas</TabsTrigger>
            <TabsTrigger value="docs">Documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="pessoais"><DadosPessoaisSection state={state} setState={setState}/></TabsContent>
          <TabsContent value="atletas"><AtletasSection state={state} setState={setState}/></TabsContent>
          <TabsContent value="docs"><UploadDocsSection state={state} setState={setState}/></TabsContent>
        </Tabs>
      )}
      <footer className="text-xs text-gray-500 text-center">DEMO local — ficheiros em DataURL. Em produção, envia para API+armazenamento seguro.</footer>
    </div>
  );
}

function runSelfTests(){
  console.assert(isPasswordStrong("Abc!1234").ok, "Password simples válida");
  console.assert(!isPasswordStrong("abc12345").ok, "Falta especial");
  console.assert(isValidNIF("123456789") === false, "NIF inválido");
  console.assert(isValidPostalCode("4000-123"), "CP válido");
  console.assert(!isValidPostalCode("4000-12"), "CP inválido");
  console.assert(computeEscalao("2011-01-01","Feminino").startsWith("Sub 16"), "Map Sub16 F");
  console.assert(computeEscalao("2006-01-01","Masculino").startsWith("Seniores masculinos Sub23"), "Map Sub23 M");
  console.assert(computeEscalao("1990-01-01","Feminino")==="Masters femininas (<1995)", "Masters F");
  console.assert(computeEscalao("2030-01-01","Feminino")==="Fora de escalões", "Futuro fora");
}

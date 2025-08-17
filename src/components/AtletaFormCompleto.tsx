import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import type { Atleta, Genero, Nacionalidade, TipoDocId, PlanoPagamento } from '../types/Atleta';
import { computeEscalao, yearsAtSeasonStart, isValidPostalCode, isValidNIF, areEmailsValid } from '../utils/form-utils';

type Props = {
  initial?: Partial<Atleta>;
  dadosPessoais?: { morada?: string; codigoPostal?: string; telefone?: string; email?: string };
  onSave: (a: Atleta) => void;
  onCancel: () => void;
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function AtletaFormCompleto({ initial, dadosPessoais, onSave, onCancel }: Props) {
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || '',
    dataNascimento: initial?.dataNascimento || '',
    genero: (initial?.genero as Genero) || 'Feminino',
    escalao: initial?.escalao || 'Fora de escalões',
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || 'Mensal',
    // opcionais
    morada: initial?.morada ?? dadosPessoais?.morada ?? '',
    codigoPostal: initial?.codigoPostal ?? dadosPessoais?.codigoPostal ?? '',
    contactosUrgencia: initial?.contactosUrgencia ?? dadosPessoais?.telefone ?? '',
    emailsPreferenciais: initial?.emailsPreferenciais ?? (dadosPessoais?.email ?? ''),
    alergias: initial?.alergias ?? '',
  });

  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      setA(prev => ({ ...prev, escalao: computeEscalao(a.dataNascimento, a.genero) }));
    }
  }, [a.dataNascimento, a.genero]);

  const isValidISODate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push('Nome do atleta é obrigatório');
    if (!isValidISODate(a.dataNascimento)) errs.push('Data de nascimento inválida');
    if (!isValidPostalCode(a.codigoPostal || '')) errs.push('Código‑postal inválido');
    if (!areEmailsValid(a.emailsPreferenciais || '')) errs.push('Email(s) preferenciais inválido(s)');
    if (!a.contactosUrgencia?.trim()) errs.push('Contactos de urgência são obrigatórios');
    if (!a.alergias?.trim()) errs.push('Alergias/problemas de saúde é obrigatório');
    if (errs.length) { alert(errs.join('\n')); return; }
    onSave(a);
  }

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      <div className="space-y-1 md:col-span-2"><Label>Nome Completo *</Label><Input value={a.nomeCompleto} onChange={e=>setA({...a,nomeCompleto:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Data de Nascimento *</Label><Input type="date" value={a.dataNascimento} onChange={e=>setA({...a,dataNascimento:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Género *</Label>
        <Select value={a.genero} onValueChange={(v:any)=>setA({...a,genero:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['Feminino','Masculino'].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1"><Label>Plano de Pagamento *</Label>
        <Select value={a.planoPagamento} onValueChange={(v:any)=>setA({...a,planoPagamento:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['Mensal','Trimestral','Anual'].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="space-y-1 md:col-span-2"><Label>Morada *</Label><Input value={a.morada || ''} onChange={e=>setA({...a,morada:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Código Postal *</Label><Input value={a.codigoPostal || ''} onChange={e=>setA({...a,codigoPostal:e.target.value})} placeholder="0000-000" required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Alergias / problemas de saúde *</Label><Textarea value={a.alergias || ''} onChange={e=>setA({...a,alergias:e.target.value})} required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Contactos de urgência *</Label><Input value={a.contactosUrgencia || ''} onChange={e=>setA({...a,contactosUrgencia:e.target.value})} required/></div>
      <div className="space-y-1 md:col-span-2"><Label>Email(s) preferenciais *</Label><Input value={a.emailsPreferenciais || ''} onChange={e=>setA({...a,emailsPreferenciais:e.target.value})} required/></div>
      <div className="space-y-1"><Label>Escalão</Label><Input value={a.escalao} readOnly className="bg-gray-100"/></div>
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Guardar atleta</Button>
      </div>
    </form>
  );
}
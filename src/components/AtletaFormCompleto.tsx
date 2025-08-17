import React, { useEffect, useMemo, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import type { Atleta, Genero, PlanoPagamento } from '../types/Atleta';
import { computeEscalao, yearsAtSeasonStart, isValidPostalCode, areEmailsValid } from '../utils/form-utils';

type Props = {
  initial?: Partial<Atleta>;
  dadosPessoais?: { morada?: string; codigoPostal?: string; telefone?: string; email?: string };
  onSave: (a: Atleta) => void;
  onCancel: () => void;
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function formatPostal(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 7);
  if (d.length <= 4) return d;
  return d.slice(0, 4) + '-' + d.slice(4);
}

export default function AtletaFormCompleto({ initial, dadosPessoais, onSave, onCancel }: Props) {
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || '',
    dataNascimento: initial?.dataNascimento || '',
    genero: (initial?.genero as Genero) || 'Feminino',
    escalao: initial?.escalao || 'Fora de escalões',
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || 'Mensal',
    // opcionais (pre-preenchidos com dados pessoais se existirem)
    morada: initial?.morada ?? dadosPessoais?.morada ?? '',
    codigoPostal: initial?.codigoPostal ?? dadosPessoais?.codigoPostal ?? '',
    contactosUrgencia: initial?.contactosUrgencia ?? dadosPessoais?.telefone ?? '',
    emailsPreferenciais: initial?.emailsPreferenciais ?? (dadosPessoais?.email ?? ''),
    alergias: initial?.alergias ?? '',
  });

  // recomputar Escalão quando mudam data/género
  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      setA(prev => ({ ...prev, escalao: computeEscalao(a.dataNascimento, a.genero) }));
    }
  }, [a.dataNascimento, a.genero]);

  const isMinor = useMemo(
    () => (a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false),
    [a.dataNascimento]
  );

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push('Nome do atleta é obrigatório');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dataNascimento)) errs.push('Data de nascimento inválida');
    if (!a.morada?.trim()) errs.push('Morada é obrigatória');
    if (!isValidPostalCode(a.codigoPostal || '')) errs.push('Código-postal inválido (####-###)');
    if (!a.contactosUrgencia?.trim()) errs.push('Contactos de urgência são obrigatórios');
    if (!a.alergias?.trim()) errs.push('Alergias / problemas de saúde é obrigatório');
    if (!a.emailsPreferenciais?.trim() || !areEmailsValid(a.emailsPreferenciais)) errs.push('Email(s) preferenciais inválido(s)');
    if (errs.length) { alert(errs.join('\n')); return; }
    onSave(a);
  }

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      <div className="space-y-1 md:col-span-2">
        <Label>Nome Completo *</Label>
        <Input value={a.nomeCompleto} onChange={e=>setA({...a, nomeCompleto:e.target.value})} required/>
      </div>

      <div className="space-y-1">
        <Label>Data de Nascimento *</Label>
        <Input type="date" value={a.dataNascimento} onChange={e=>setA({...a, dataNascimento:e.target.value})} required/>
      </div>

      <div className="space-y-1">
        <Label>Género *</Label>
        <select className="w-full rounded-xl border px-3 py-2 text-sm"
                value={a.genero}
                onChange={e=>setA({...a, genero: e.target.value as Genero})}>
          <option>Feminino</option>
          <option>Masculino</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label>Plano de Pagamento *</Label>
        <select className="w-full rounded-xl border px-3 py-2 text-sm"
                value={a.planoPagamento}
                onChange={e=>setA({...a, planoPagamento: e.target.value as PlanoPagamento})}>
          <option>Mensal</option>
          <option>Trimestral</option>
          <option>Anual</option>
        </select>
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Morada *</Label>
        <Input value={a.morada || ''} onChange={e=>setA({...a, morada:e.target.value})} required/>
      </div>

      <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1">
          <Label>Código Postal *</Label>
          <Input value={a.codigoPostal || ''} onChange={e=>setA({...a, codigoPostal: formatPostal(e.target.value)})} placeholder="0000-000" required/>
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            className="h-10"
            onClick={() => {
              if (!dadosPessoais) return;
              setA(prev => ({
                ...prev,
                morada: dadosPessoais.morada || prev.morada,
                codigoPostal: dadosPessoais.codigoPostal || prev.codigoPostal,
                contactosUrgencia: dadosPessoais.telefone || prev.contactosUrgencia,
                emailsPreferenciais: dadosPessoais.email || prev.emailsPreferenciais,
              }));
            }}
          >
            Copiar dados pessoais
          </Button>
        </div>
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Alergias / problemas de saúde *</Label>
        <Textarea value={a.alergias || ''} onChange={e=>setA({...a, alergias:e.target.value})} required/>
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Contactos de urgência *</Label>
        <Input value={a.contactosUrgencia || ''} onChange={e=>setA({...a, contactosUrgencia:e.target.value})} required/>
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Email(s) preferenciais *</Label>
        <Input value={a.emailsPreferenciais || ''} onChange={e=>setA({...a, emailsPreferenciais:e.target.value})} required/>
        <small className="text-gray-500">Se mais do que um, separar por ponto e vírgula (;)</small>
      </div>

      <div className="space-y-1">
        <Label>Escalão</Label>
        <Input value={a.escalao} readOnly className="bg-gray-100"/>
      </div>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">Guardar atleta</Button>
      </div>
    </form>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import type {
  Atleta,
  Genero,
  Nacionalidade,
  TipoDocId,
  PlanoPagamento,
  Escalao
} from '../types/Atleta';
import {
  computeEscalao,
  isValidNIF,
  isValidPostalCode,
  yearsAtSeasonStart,
  areEmailsValid
} from '../utils/form-utils';

type Props = {
  initial?: Partial<Atleta>;
  onSave: (a: Atleta) => void;
  onCancel?: () => void;
  dadosPessoais?: {
    morada?: string;
    codigoPostal?: string;
    telefone?: string; // contactos de urgência
    email?: string;    // email preferencial
  };
};

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function formatPostal(v: string){
  const d = v.replace(/\D/g, '').slice(0,7);
  if (d.length <= 4) return d;
  return d.slice(0,4) + '-' + d.slice(4);
}
function isSeniorOrMasters(esc: Escalao){
  return esc.startsWith('Seniores') || esc.startsWith('Masters');
}
function isISO(s: string){ return /^\d{4}-\d{2}-\d{2}$/.test(s); }

export default function AtletaFormCompleto({ initial, onSave, onCancel, dadosPessoais }: Props) {
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || '',
    dataNascimento: initial?.dataNascimento || '',
    genero: (initial?.genero as Genero) || 'Feminino',

    nacionalidade: (initial?.nacionalidade as Nacionalidade) || 'Portuguesa',
    nacionalidadeOutra: initial?.nacionalidadeOutra || '',

    tipoDoc: (initial?.tipoDoc as TipoDocId) || 'Cartão de cidadão',
    numDoc: initial?.numDoc || '',
    validadeDoc: initial?.validadeDoc || '',
    nif: initial?.nif || '',

    nomePai: initial?.nomePai || '',
    nomeMae: initial?.nomeMae || '',

    morada: initial?.morada || '',
    codigoPostal: initial?.codigoPostal || '',

    telefoneOpc: initial?.telefoneOpc || '',
    emailOpc: initial?.emailOpc || '',

    escola: initial?.escola || '',
    anoEscolaridade: initial?.anoEscolaridade || '',

    alergias: initial?.alergias || '',

    encarregadoEducacao: initial?.encarregadoEducacao,
    parentescoOutro: initial?.parentescoOutro || '',

    contactosUrgencia: initial?.contactosUrgencia || '',
    emailsPreferenciais: initial?.emailsPreferenciais || '',

    escalao: (initial?.escalao as Escalao) || 'Fora de escalões',
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || 'Mensal',

    observacoes: initial?.observacoes || '',
  });

  // Recalcula Escalão ao mudar data/género
  useEffect(()=>{
    if (a.dataNascimento && a.genero) {
      const sug = computeEscalao(a.dataNascimento, a.genero) as Escalao;
      setA(prev => ({ ...prev, escalao: sug }));
    }
  }, [a.dataNascimento, a.genero]);

  const isMinor  = useMemo(()=> a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false, [a.dataNascimento]);
  const lockedAnnual = isSeniorOrMasters(a.escalao);

  // Sempre que o escalão for Séniores/Masters, força plano 'Anual' e bloqueia o select
  useEffect(()=>{
    if (lockedAnnual && a.planoPagamento !== 'Anual') {
      setA(prev => ({ ...prev, planoPagamento: 'Anual' }));
    }
  }, [lockedAnnual]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push('Nome do atleta é obrigatório');
    if (!isISO(a.dataNascimento)) errs.push('Data de nascimento inválida');

    if (!a.numDoc.trim()) errs.push('Número de documento obrigatório');
    if (!isISO(a.validadeDoc)) errs.push('Validade de documento inválida');
    // validade do documento > hoje
    if (isISO(a.validadeDoc)) {
      const today = new Date(); today.setHours(0,0,0,0);
      const dt = new Date(a.validadeDoc + 'T00:00:00');
      if (dt <= today) errs.push('A validade do documento deve ser superior à data atual');
    }

    if (!isValidNIF(a.nif)) errs.push('NIF inválido');

    if (!isValidPostalCode(a.codigoPostal)) errs.push('Código-postal inválido (####-###)');
    if (!a.morada.trim()) errs.push('Morada é obrigatória');

    // Pai/Mãe obrigatórios se menor
    if (isMinor && !a.nomePai.trim()) errs.push('Nome do pai é obrigatório (menor de idade)');
    if (isMinor && !a.nomeMae.trim()) errs.push('Nome da mãe é obrigatório (menor de idade)');

    // Escola obrigatória se não Masters (regra anterior)
    const isMasters = a.escalao === 'Masters (<1995)';
    const showEscola = !!a.dataNascimento && !isMasters;
    if (showEscola && !a.escola.trim()) errs.push('Escola é obrigatória');
    if (showEscola && !a.anoEscolaridade.trim()) errs.push('Ano de escolaridade é obrigatório');

    if (!a.alergias.trim()) errs.push('Alergias / problemas de saúde é obrigatório');
    if (!a.contactosUrgencia.trim()) errs.push('Contactos de urgência são obrigatórios');
    if (!a.emailsPreferenciais.trim() || !areEmailsValid(a.emailsPreferenciais)) errs.push('Email(s) preferenciais inválidos');

    if (a.nacionalidade === 'Outra' && !a.nacionalidadeOutra?.trim()) errs.push('Indicar a nacionalidade');
    if (isMinor && !a.encarregadoEducacao) errs.push('Selecionar Encarregado de Educação');
    if (a.encarregadoEducacao === 'Outro' && !a.parentescoOutro?.trim()) errs.push('Indicar parentesco (Outro)');

    if (errs.length) { alert(errs.join('\n')); return; }
    onSave(a);
  }

  // Calculado aqui para reuso no JSX
  const isMasters = a.escalao === 'Masters (<1995)';
  const showEscola = !!a.dataNascimento && !isMasters;

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      {/* Identificação */}
      <Field className="md:col-span-2" label="Nome Completo *">
        <input className="input" value={a.nomeCompleto} onChange={e=>setA({...a, nomeCompleto:e.target.value})} required/>
      </Field>
      <Field label="Data de Nascimento *">
        <input type="date" className="input" value={a.dataNascimento} onChange={e=>setA({...a, dataNascimento:e.target.value})} required/>
      </Field>

      {/* Género */}
      <Field label="Género *">
        <select className="input" value={a.genero} onChange={e=>setA({...a, genero: e.target.value as Genero})}>
          <option>Feminino</option>
          <option>Masculino</option>
        </select>
      </Field>

      {/* >>> Escalão + Plano imediatamente abaixo do Género <<< */}
      <Field label="Escalão (sugestão automática)">
        <input className="input bg-gray-100" value={a.escalao} readOnly/>
      </Field>
<Field
  label={
    <div className="flex items-center gap-2">
      Opção de Pagamentos *
      <ImagesDialog
        title="Tabela de Pagamentos — Atletas"
        images={[{ src: "/precos/pagamentos-2025.png", alt: "Opções de pagamento por escalão" }]}
        triggerText="Tabela de Preços"
      />
    </div>
  }
>
  <select
    className="input"
    value={a.planoPagamento}
    onChange={e=>setA({...a, planoPagamento: e.target.value as PlanoPagamento})}
  >
    <option>Mensal</option>
    <option>Trimestral</option>
    <option>Anual</option>
  </select>
</Field>


      {/* Nacionalidade / Documento */}
      <Field label="Nacionalidade *">
        <select className="input" value={a.nacionalidade} onChange={e=>setA({...a, nacionalidade: e.target.value as Nacionalidade})}>
          <option>Portuguesa</option>
          <option>Outra</option>
        </select>
      </Field>
      {a.nacionalidade === 'Outra' && (
        <Field label="Indique a nacionalidade">
          <input className="input" value={a.nacionalidadeOutra||''} onChange={e=>setA({...a, nacionalidadeOutra:e.target.value})}/>
        </Field>
      )}

      <Field label="Tipo de documento *">
        <select className="input" value={a.tipoDoc} onChange={e=>setA({...a, tipoDoc: e.target.value as TipoDocId})}>
          <option>Cartão de cidadão</option>
          <option>Passaporte</option>
          <option>Título de Residência</option>
        </select>
      </Field>
      <Field label="Nº documento *">
        <input className="input" value={a.numDoc} onChange={e=>setA({...a, numDoc:e.target.value})} required/>
      </Field>
      <Field label="Validade do documento *">
        <input type="date" className="input" value={a.validadeDoc} onChange={e=>setA({...a, validadeDoc:e.target.value})} required/>
      </Field>
      <Field label="NIF *">
        <input className="input" value={a.nif} onChange={e=>setA({...a, nif:e.target.value})} required/>
      </Field>

{/* força quebra de linha (próximo campo começa numa nova row) */}
<div className="md:col-span-2 h-0 p-0 m-0" aria-hidden="true" />

{/* Filiação — APENAS quando é menor */}
{isMinor && (
  <>
    <Field label="Nome do pai *">
      <input className="input" value={a.nomePai} onChange={e=>setA({...a, nomePai:e.target.value})} required/>
    </Field>
    <Field label="Nome da mãe *">
      <input className="input" value={a.nomeMae} onChange={e=>setA({...a, nomeMae:e.target.value})} required/>
    </Field>
  </>
)}


      {/* Morada / CP + atalho para copiar dos dados pessoais */}
      <Field className="md:col-span-2" label="Morada *">
        <input className="input" value={a.morada} onChange={e=>setA({...a, morada:e.target.value})} required/>
      </Field>
      <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
        <Field label="Código Postal *">
          <input className="input" value={a.codigoPostal} onChange={e=>setA({...a, codigoPostal:formatPostal(e.target.value)})} required/>
        </Field>
        <div className="flex items-end pb-1">
          <button
            type="button"
            className="btn secondary h-10"
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
          </button>
        </div>
      </div>

      {/* Contactos opcionais */}
      <Field label="Email (opcional)">
        <input type="email" className="input" value={a.emailOpc||''} onChange={e=>setA({...a, emailOpc:e.target.value})}/>
      </Field>
      <Field label="Telefone (opcional)">
        <input className="input" value={a.telefoneOpc||''} onChange={e=>setA({...a, telefoneOpc:e.target.value})}/>
      </Field>

      {/* Escola (se aplicável) */}
      {showEscola && (
        <>
          <Field className="md:col-span-2" label="Escola (2025/26) *">
            <input className="input" value={a.escola} onChange={e=>setA({...a, escola:e.target.value})} required/>
          </Field>
          <Field label="Ano de escolaridade (2025/26) *">
            <input className="input" value={a.anoEscolaridade} onChange={e=>setA({...a, anoEscolaridade:e.target.value})} required/>
          </Field>
        </>
      )}

      {/* Saúde */}
      <Field className="md:col-span-2" label="Alergias / problemas de saúde *">
        <textarea className="input min-h-[100px]" value={a.alergias} onChange={e=>setA({...a, alergias:e.target.value})} required/>
      </Field>

      {/* Responsável e parentesco (se menor) */}
      {isMinor && (
        <>
          <Field label="Encarregado de Educação *">
            <select className="input" value={a.encarregadoEducacao||''} onChange={e=>setA({...a, encarregadoEducacao: e.target.value as any})}>
              <option value="">—</option>
              <option>Pai</option>
              <option>Mãe</option>
              <option>Outro</option>
            </select>
          </Field>
          {a.encarregadoEducacao === 'Outro' && (
            <Field label="Parentesco">
              <input className="input" value={a.parentescoOutro||''} onChange={e=>setA({...a, parentescoOutro:e.target.value})}/>
            </Field>
          )}
        </>
      )}

      {/* Contactos essenciais */}
      <Field className="md:col-span-2" label="Contactos telefónicos de urgência *">
        <input className="input" placeholder="912...; 913..." value={a.contactosUrgencia} onChange={e=>setA({...a, contactosUrgencia:e.target.value})} required/>
      </Field>
      <Field className="md:col-span-2" label="Email(s) preferenciais *">
        <input className="input" placeholder="a@x.pt; b@y.pt" value={a.emailsPreferenciais} onChange={e=>setA({...a, emailsPreferenciais:e.target.value})} required/>
        <small className="text-gray-500">Se mais do que um, separar por ponto e vírgula (;)</small>
      </Field>

      {/* Observações */}
      <Field className="md:col-span-2" label="Observações">
        <textarea className="input min-h-[100px]" value={a.observacoes||''} onChange={e=>setA({...a, observacoes:e.target.value})}/>
      </Field>

      {/* Ações */}
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn primary">Guardar atleta</button>
      </div>

      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.5rem 0.75rem; font-size: 0.9rem; }
        .btn { border-radius: 0.75rem; padding: 0.5rem 0.9rem; font-weight: 600; }
        .btn.primary { background:#2563eb; color:#fff; }
        .btn.primary:hover { background:#1d4ed8; }
        .btn.secondary { background:#f3f4f6; }
      `}</style>
    </form>
  );
}

function Field({ label, children, className='' }:{ label:string; children:React.ReactNode; className?:string }){
  return (
    <div className={['space-y-1', className].join(' ')}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

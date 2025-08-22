import React, { useEffect, useMemo, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import type { Atleta, Genero, Nacionalidade, TipoDocId, PlanoPagamento } from '../types/Atleta';
import { computeEscalao, isValidNIF, isValidPostalCode, yearsAtSeasonStart, areEmailsValid } from '../utils/form-utils';
import { estimateCosts, type EstimateResult, eur } from '../utils/pricing';

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
  /** Tipo de sócio do agregado; usado na estimativa de preços */
  tipoSocio?: string | null;
  /** Lista de atletas do agregado (para distinguir PRO1 vs PRO2) */
  agregadoAtletas?: Atleta[];   // <= NOVO
};


function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// caminhos das imagens (em public/precos/)
const IMG_PRECOS_MENS = '/precos/pagamentos-2025.png';
const IMG_PRECOS_SOCIOS = '/precos/socios-2025.png';

export default function AtletaFormCompleto({ initial, onSave, onCancel, dadosPessoais, tipoSocio, agregadoAtletas }: Props) {
  function formatPostal(v: string){
    const d = v.replace(/\D/g, '').slice(0,7);
    if (d.length <= 4) return d;
    return d.slice(0,4) + '-' + d.slice(4);
  }

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
    escalao: initial?.escalao || ('Fora de escalões' as Atleta['escalao']),
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || 'Mensal',
    observacoes: (initial as any)?.observacoes || '',
  });

  // recomputar Escalão quando mudam data/género
  useEffect(()=>{
    if (a.dataNascimento && a.genero) {
      const e = computeEscalao(a.dataNascimento, a.genero);
      setA(prev => ({ ...prev, escalao: e as any as Atleta['escalao'] }));
    }
  }, [a.dataNascimento, a.genero]);

  const isMinor = useMemo(()=> a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false, [a.dataNascimento]);
  const isMastersOrSub23 = useMemo(() => {
  const s = (a.escalao || '').toLowerCase();
  return (
    s.includes('masters') ||
    s.includes('sub 23') || s.includes('sub-23') || s.includes('sub23') ||
    s.includes('seniores sub 23') || s.includes('seniores sub-23')
  );
}, [a.escalao]);


  // -------- Estimativa (recalcula quando muda escalão ou tipo de sócio) --------
  // -------- Estimativa (recalcula quando muda escalão / data / tipo de sócio / agregado) --------
const [est, setEst] = useState<EstimateResult | null>(null);
useEffect(() => {
  function isAnuidadeObrigatoria(esc?: string | null) {
    const s = (esc || '').toLowerCase();
    return (
      s.includes('masters') ||
      s.includes('sub 23') || s.includes('sub-23') || s.includes('sub23') ||
      s.includes('seniores sub 23') || s.includes('seniores sub-23')
    );
  }
  const parseISO = (s?: string | null) => (s ? new Date(s + 'T00:00:00') : null);
  const isSocioPro = (t?: string | null) => !!t && /pro/i.test(t || '');

  let efetivoNum = 1; // 1 => PRO1 (mais velho); 2 => PRO2 (restantes)

  if (isSocioPro(tipoSocio) && !isAnuidadeObrigatoria(a.escalao)) {
    // Atletas do agregado que contam para PRO (exclui Masters/Sub-23 e o próprio)
    const elegiveis = (agregadoAtletas || []).filter(
      (x) => x.id !== (initial?.id ?? '') && !isAnuidadeObrigatoria(x.escalao)
    );

    if (elegiveis.length >= 1) {
      const dobThis = parseISO(a.dataNascimento);
      const ds = elegiveis
        .map((x) => parseISO(x.dataNascimento))
        .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));

      if (dobThis && ds.length) {
        const oldest = new Date(Math.min(...ds.map((d) => d.getTime())));
        // se ESTE atleta é mais velho que todos os outros => PRO1, caso contrário PRO2
        efetivoNum = dobThis.getTime() < oldest.getTime() ? 1 : 2;
      } else {
        // enquanto não houver datas suficientes, assume PRO2
        efetivoNum = 2;
      }
    }
  }

  const result = estimateCosts({
    escalao: a.escalao,
    tipoSocio: tipoSocio || 'Não pretendo ser sócio',
    numAtletasAgregado: efetivoNum, // 1 => PRO1 ; 2 => PRO2
  });
  setEst(result);
}, [a.escalao, a.dataNascimento, tipoSocio, agregadoAtletas, initial?.id]);


  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push('Nome do atleta é obrigatório');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dataNascimento)) errs.push('Data de nascimento inválida');
    if (!a.numDoc.trim()) errs.push('Número de documento obrigatório');
    if (!/^\d{4}-\d{2}-\d2$/.test(a.validadeDoc) && !/^\d{4}-\d{2}-\d{2}$/.test(a.validadeDoc)) errs.push('Validade de documento inválida'); // tolerância
    if (!isValidNIF(a.nif)) errs.push('NIF inválido');
    if (!isValidPostalCode(a.codigoPostal)) errs.push('Código-postal inválido (####-###)');
    if (!a.morada.trim()) errs.push('Morada é obrigatória');
    if (!a.alergias.trim()) errs.push('Alergias / problemas de saúde é obrigatório');
    if (!a.contactosUrgencia.trim()) errs.push('Contactos de urgência são obrigatórios');
    if (!a.emailsPreferenciais.trim() || !areEmailsValid(a.emailsPreferenciais)) errs.push('Email(s) preferenciais inválidos');
    if (a.nacionalidade === 'Outra' && !a.nacionalidadeOutra?.trim()) errs.push('Indicar a nacionalidade');
    if (isMinor && !a.encarregadoEducacao) errs.push('Selecionar Encarregado de Educação');
    if (a.encarregadoEducacao === 'Outro' && !a.parentescoOutro?.trim()) errs.push('Indicar parentesco (Outro)');
    if (errs.length) { alert(errs.join('\n')); return; }
    onSave(a);
  }

  // ---- Lightbox simples para ver as tabelas ----
  const [lightbox, setLightbox] = useState<null | {src:string; alt:string}>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      <Field className="md:col-span-2" label="Nome Completo *"><input className="input" value={a.nomeCompleto} onChange={e=>setA({...a, nomeCompleto:e.target.value})} required/></Field>
      <Field label="Data de Nascimento *"><input type="date" className="input" value={a.dataNascimento} onChange={e=>setA({...a, dataNascimento:e.target.value})} required/></Field>

      <Field label="Género *">
        <select className="input" value={a.genero} onChange={e=>setA({...a, genero: e.target.value as Genero})}>
          <option>Feminino</option>
          <option>Masculino</option>
        </select>
      </Field>

      {/* Escalão calculado (só leitura) */}
      <Field label="Escalão (sugestão automática)"><input className="input bg-gray-100" value={a.escalao} readOnly/></Field>

      {/* Plano (continua visível, mas SENIORS/Sub23/Masters forçam Anual no backend) */}
      <Field label="Opção de Pagamentos *">
        <select
          className="input"
          value={a.planoPagamento}
          onChange={e=>setA({...a, planoPagamento: e.target.value as PlanoPagamento})}
          disabled={isMastersOrSub23}  // bloqueia para seniores/masters
          title={isMastersOrSub23 ? 'Para Sub-23/Masters aplica-se apenas a anuidade' : undefined}
        >
          <option>Mensal</option>
          <option>Trimestral</option>
          <option>Anual</option>
        </select>
      </Field>

      {/* --- Estimativa + botões para ver as tabelas --- */}
      <div className="md:col-span-2 rounded-xl border p-3 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Estimativa de custos</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={()=>setLightbox({src:IMG_PRECOS_MENS, alt:'Tabela de preços (mensalidades)'})}>
              Ver tabela: Mensalidades
            </Button>
            <Button type="button" variant="outline" onClick={()=>setLightbox({src:IMG_PRECOS_SOCIOS, alt:'Tabela de quotas de sócio'})}>
              Ver tabela: Sócios
            </Button>
          </div>
        </div>

        {est ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-lg bg-white border p-2">
                <div className="text-xs text-gray-500">Taxa de inscrição</div>
                <div className="font-semibold">{eur(est.taxaInscricao)}</div>
              </div>

              {est.onlyAnnual ? (
                <div className="rounded-lg bg-white border p-2">
                  <div className="text-xs text-gray-500">Anuidade (1x)</div>
                  <div className="font-semibold">{eur(est.anual1)}</div>
                </div>
              ) : (
                <>
                  <div className="rounded-lg bg-white border p-2">
                    <div className="text-xs text-gray-500">Mensal (10x)</div>
                    <div className="font-semibold">{eur(est.mensal10)}</div>
                  </div>
                  <div className="rounded-lg bg-white border p-2">
                    <div className="text-xs text-gray-500">Trimestral (3x)</div>
                    <div className="font-semibold">{eur(est.trimestre3)}</div>
                  </div>
                  <div className="rounded-lg bg-white border p-2">
                    <div className="text-xs text-gray-500">Anual (1x)</div>
                    <div className="font-semibold">{eur(est.anual1)}</div>
                  </div>
                </>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-2">
              {est.tarifa} {est.info}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">Sem dados para estimar.</div>
        )}
      </div>

      <Field label="Nacionalidade *">
        <select className="input" value={a.nacionalidade} onChange={e=>setA({...a, nacionalidade: e.target.value as Nacionalidade})}>
          <option>Portuguesa</option>
          <option>Outra</option>
        </select>
      </Field>
      {a.nacionalidade === 'Outra' && <Field className="md:col-span-2" label="Indique a nacionalidade"><input className="input" value={a.nacionalidadeOutra||''} onChange={e=>setA({...a, nacionalidadeOutra:e.target.value})}/></Field>}

      <Field label="Tipo de documento *">
        <select className="input" value={a.tipoDoc} onChange={e=>setA({...a, tipoDoc: e.target.value as TipoDocId})}>
          <option>Cartão de cidadão</option>
          <option>Passaporte</option>
          <option>Título de Residência</option>
        </select>
      </Field>
      <Field label="Nº documento *"><input className="input" value={a.numDoc} onChange={e=>setA({...a, numDoc:e.target.value})} required/></Field>
      <Field label="Validade do documento *"><input type="date" className="input" value={a.validadeDoc} onChange={e=>setA({...a, validadeDoc:e.target.value})} required/></Field>
      <Field label="NIF *"><input className="input" value={a.nif} onChange={e=>setA({...a, nif:e.target.value})} required/></Field>

      {/* Filiação — APENAS quando é menor (abaixo do NIF, como pediste) */}
      {isMinor && (
        <>
          <div className="md:col-span-2" />
          <Field label="Nome do pai *">
            <input className="input" value={a.nomePai} onChange={e=>setA({...a, nomePai:e.target.value})} required/>
          </Field>
          <Field label="Nome da mãe *">
            <input className="input" value={a.nomeMae} onChange={e=>setA({...a, nomeMae:e.target.value})} required/>
          </Field>
        </>
      )}

      <Field className="md:col-span-2" label="Morada *"><input className="input" value={a.morada} onChange={e=>setA({...a, morada:e.target.value})} required/></Field>
      <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
        <Field label="Código Postal *"><input className="input" value={a.codigoPostal} onChange={e=>setA({...a, codigoPostal:formatPostal(e.target.value)})} required/></Field>
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

      <Field label="Email (opcional)"><input type="email" className="input" value={a.emailOpc||''} onChange={e=>setA({...a, emailOpc:e.target.value})}/></Field>
      <Field label="Telefone (opcional)"><input className="input" value={a.telefoneOpc||''} onChange={e=>setA({...a, telefoneOpc:e.target.value})}/></Field>

      {/* Escola (apenas não-masters) */}
      {!isMastersOrSub23 && (
        <>
          <Field className="md:col-span-2" label="Escola (2025/26) *"><input className="input" value={a.escola} onChange={e=>setA({...a, escola:e.target.value})} required/></Field>
          <Field label="Ano de escolaridade (2025/26) *"><input className="input" value={a.anoEscolaridade} onChange={e=>setA({...a, anoEscolaridade:e.target.value})} required/></Field>
        </>
      )}

      <Field className="md:col-span-2" label="Alergias / problemas de saúde *"><textarea className="input min-h-[100px]" value={a.alergias} onChange={e=>setA({...a, alergias:e.target.value})} required/></Field>

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
          {a.encarregadoEducacao === 'Outro' && <Field label="Parentesco"><input className="input" value={a.parentescoOutro||''} onChange={e=>setA({...a, parentescoOutro:e.target.value})}/></Field>}
        </>
      )}

      <Field className="md:col-span-2" label="Contactos telefónicos de urgência *">
        <input className="input" placeholder="912...; 913..." value={a.contactosUrgencia} onChange={e=>setA({...a, contactosUrgencia:e.target.value})} required/>
      </Field>
      <Field className="md:col-span-2" label="Email(s) preferenciais *">
        <input className="input" placeholder="a@x.pt; b@y.pt" value={a.emailsPreferenciais} onChange={e=>setA({...a, emailsPreferenciais:e.target.value})} required/>
        <small className="text-gray-500">Se mais do que um, separar por ponto e vírgula (;)</small>
      </Field>

      <Field className="md:col-span-2" label="Observações">
        <Textarea className="input min-h-[80px]" value={(a as any).observacoes || ''} onChange={e=>setA({...a, ...( {observacoes: e.target.value } as any)})}/>
      </Field>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        {onCancel && <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn primary">Guardar atleta</button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          className="lightbox-backdrop"
          onClick={(e)=>{ if (e.target === e.currentTarget) setLightbox(null); }}
        >
          <div className="lightbox-card">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-sm">{lightbox.alt}</div>
              <button className="btn secondary" onClick={()=>setLightbox(null)}>Fechar</button>
            </div>
            <div className="lightbox-body">
              <img src={lightbox.src} alt={lightbox.alt} className="lightbox-img" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.5rem 0.75rem; font-size: 0.9rem; }
        .btn { border-radius: 0.75rem; padding: 0.5rem 0.9rem; font-weight: 600; }
        .btn.primary { background:#2563eb; color:#fff; }
        .btn.primary:hover { background:#1d4ed8; }
        .btn.secondary { background:#f3f4f6; }

        .lightbox-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          display:flex; align-items:center; justify-content:center; z-index:50; padding: 1rem;
        }
        .lightbox-card {
          background:#fff; border-radius: 0.75rem; padding: 0.75rem; width: min(100%, 980px);
          max-height: 90vh; display:flex; flex-direction:column;
        }
        .lightbox-body { overflow:auto; }
        .lightbox-img { width:100%; height:auto; display:block; border-radius:0.5rem; }
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

import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Atleta, Genero, Nacionalidade, TipoDocId, PlanoPagamento } from '../../types/Atleta';
import { computeEscalao, isValidNIF, isValidPostalCode, yearsAtSeasonStart, areEmailsValid } from '../../utils/form-utils';
import { ArrowLeft } from 'lucide-react';
import { updateAtletaAdmin } from '../services/adminAtletasService';
import { ensureOnlyInscricaoForAtleta, ensureInscricaoEQuotasForAtleta, isAnuidadeObrigatoria } from '../../services/pagamentosService';
import { showToast } from '@/components/MiniToast';
import type { AtletaRow } from '../services/adminAtletasService';

type Props = {
  atletaRow: AtletaRow;
  onSave: () => void;
  onCancel: () => void;
};

/** Convert AtletaRow to Atleta */
function rowToAtleta(r: AtletaRow): Atleta {
  return {
    id: r.id,
    nomeCompleto: r.nome ?? "",
    dataNascimento: r.data_nascimento ?? "",
    genero: (r.genero as Genero) ?? "Feminino",
    escalao: (r.escalao as any) ?? "Fora de escalões",
    planoPagamento: (r.opcao_pagamento as PlanoPagamento) ?? "Mensal",
    nacionalidade: (r.nacionalidade as Nacionalidade) ?? "Portuguesa",
    nacionalidadeOutra: r.nacionalidade_outra ?? undefined,
    tipoDoc: (r.tipo_doc as TipoDocId) ?? "Cartão de cidadão",
    numDoc: r.num_doc ?? "",
    validadeDoc: r.validade_doc ?? "",
    nif: r.nif ?? "",
    nomePai: r.nome_pai ?? "",
    nomeMae: r.nome_mae ?? "",
    morada: r.morada ?? "",
    codigoPostal: r.codigo_postal ?? "",
    telefoneOpc: r.telefone_opc ?? undefined,
    emailOpc: r.email_opc ?? undefined,
    escola: r.escola ?? "",
    anoEscolaridade: r.ano_escolaridade ?? "",
    alergias: r.alergias ?? "",
    encarregadoEducacao: r.encarregado_educacao as any,
    parentescoOutro: r.parentesco_outro ?? undefined,
    contactosUrgencia: r.contactos_urgencia ?? "",
    emailsPreferenciais: r.emails_preferenciais ?? "",
    observacoes: r.observacoes ?? undefined,
    epoca: r.epoca ?? undefined,
    social: r.social ?? false,
    desistiu: r.desistiu ?? false,
  };
}

export default function AdminAtletaEdit({ atletaRow, onSave, onCancel }: Props) {
  const [a, setA] = useState<Atleta>(rowToAtleta(atletaRow));

  // Recompute escalão when date/gender changes
  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      const e = computeEscalao(a.dataNascimento, a.genero);
      setA(prev => ({ ...prev, escalao: e as any as Atleta['escalao'] }));
    }
  }, [a.dataNascimento, a.genero]);

  const isMinor = useMemo(() => a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false, [a.dataNascimento]);
  
  const isMastersOrSub23 = useMemo(() => {
    const s = (a.escalao || "").toLowerCase();
    const isSub23 = s.includes("sub23") || s.includes("sub 23") || s.includes("sub-23");
    const isMasters = s.includes("masters");
    return isSub23 || isMasters;
  }, [a.escalao]);

  const eligibilityError = useMemo(() => {
    if (!a.dataNascimento) return null;

    const esc = (a.escalao || "").toLowerCase();

    if (/fora de escal(õ|o)es/.test(esc)) {
      return "A inscrição está fora dos intervalos de anos desta época (regra por ano civil). Verifique o ano de nascimento.";
    }

    const isSub23 = /sub[-\s]?23/.test(esc) || esc.includes("sub23");
    const isSeniorGeneric =
      (esc.includes("senior") || esc.includes("sénior") || esc.includes("seniores")) && !isSub23;

    if (isSeniorGeneric) {
      return "As inscrições de Seniores (masculino/feminino) não são feitas nesta aplicação. Regularize diretamente com os treinadores/direção.";
    }

    if (isSub23 && a.genero === "Feminino") {
      return "Não existe escalão Sub-23 feminino. Contacte os treinadores/direção.";
    }

    return null;
  }, [a.escalao, a.genero, a.dataNascimento]);

  function formatPostal(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 7);
    if (d.length <= 4) return d;
    return d.slice(0, 4) + '-' + d.slice(4);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push('Nome do atleta é obrigatório');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dataNascimento)) errs.push('Data de nascimento inválida');
    if (!a.numDoc.trim()) errs.push('Número de documento obrigatório');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.validadeDoc)) errs.push('Validade de documento inválida');
    if (!isValidNIF(a.nif)) errs.push('NIF inválido');
    if (!isValidPostalCode(a.codigoPostal)) errs.push('Código-postal inválido (####-###)');
    if (!a.morada.trim()) errs.push('Morada é obrigatória');
    if (!a.alergias.trim()) errs.push('Alergias / problemas de saúde é obrigatório');
    if (!a.contactosUrgencia.trim()) errs.push('Contactos de urgência são obrigatórios');
    if (!a.emailsPreferenciais.trim() || !areEmailsValid(a.emailsPreferenciais)) errs.push('Email(s) preferenciais inválidos');
    if (a.nacionalidade === 'Outra' && !a.nacionalidadeOutra?.trim()) errs.push('Indicar a nacionalidade');
    if (isMinor && !a.encarregadoEducacao) errs.push('Selecionar Encarregado de Educação');
    if (a.encarregadoEducacao === 'Outro' && !a.parentescoOutro?.trim()) errs.push('Indicar parentesco (Outro)');
    if (eligibilityError) errs.push(eligibilityError);
    if (errs.length) {
      showToast(errs.join('; '), 'err');
      return;
    }

    const planoAntes = atletaRow.opcao_pagamento;
    const escalaoAntes = atletaRow.escalao;

    try {
      await updateAtletaAdmin(a);

      const force =
        planoAntes !== a.planoPagamento || escalaoAntes !== a.escalao;

      const isOnlyInscricao = isAnuidadeObrigatoria(a.escalao); // Sub-23 / Masters

      if (isOnlyInscricao) {
        await ensureOnlyInscricaoForAtleta(a.id);
      } else {
        await ensureInscricaoEQuotasForAtleta(
          { id: a.id, planoPagamento: a.planoPagamento },
          { forceRebuild: !!force }
        );
      }

      showToast('Atleta guardado com sucesso', 'ok');
      onSave();
    } catch (e: any) {
      showToast(e.message || 'Falha ao guardar o atleta', 'err');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="grey" onClick={onCancel} className="ml-2 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <CardTitle>Editar Atleta (Admin)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className='p-2 sm:p-4'>
        <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
          <Field className="md:col-span-2" label="Nome Completo *">
            <input className="input w-full" value={a.nomeCompleto} onChange={e => setA({ ...a, nomeCompleto: e.target.value })} required />
          </Field>
          
          <Field label="Data de Nascimento *">
            <input type="date" className="input w-full" value={a.dataNascimento} onChange={e => setA({ ...a, dataNascimento: e.target.value })} required />
          </Field>

          <Field label="Género *">
            <select className="input w-full" value={a.genero} onChange={e => setA({ ...a, genero: e.target.value as Genero })}>
              <option>Feminino</option>
              <option>Masculino</option>
            </select>
          </Field>

          <Field label="Escalão (sugestão automática)">
            <input className="input w-full bg-gray-100" value={a.escalao} readOnly />
            {eligibilityError && (
              <div className="mt-1 text-sm text-red-600">{eligibilityError}</div>
            )}
          </Field>

          <Field label="Opção de Pagamentos *">
            <select
              className="input w-full"
              value={a.planoPagamento}
              onChange={e => setA({ ...a, planoPagamento: e.target.value as PlanoPagamento })}
              disabled={isMastersOrSub23}
              title={isMastersOrSub23 ? 'Para Sub-23/Masters aplica-se apenas a anuidade' : undefined}
            >
              <option>Mensal</option>
              <option>Trimestral</option>
              <option>Anual</option>
            </select>
          </Field>

          <Field className="md:col-span-2" label="Nacionalidade *">
            <select className="input w-full" value={a.nacionalidade} onChange={e => setA({ ...a, nacionalidade: e.target.value as Nacionalidade })}>
              <option>Portuguesa</option>
              <option>Outra</option>
            </select>
          </Field>
          {a.nacionalidade === 'Outra' && (
            <Field className="md:col-span-2" label="Indique a nacionalidade">
              <input className="input w-full" value={a.nacionalidadeOutra || ''} onChange={e => setA({ ...a, nacionalidadeOutra: e.target.value })} />
            </Field>
          )}

          <Field label="Tipo de documento *">
            <select className="input w-full" value={a.tipoDoc} onChange={e => setA({ ...a, tipoDoc: e.target.value as TipoDocId })}>
              <option>Cartão de cidadão</option>
              <option>Passaporte</option>
              <option>Título de Residência</option>
            </select>
          </Field>
          <Field label="Nº documento *">
            <input className="input w-full" value={a.numDoc} onChange={e => setA({ ...a, numDoc: e.target.value })} required />
          </Field>
          <Field label="Validade do documento *">
            <input type="date" className="input w-full" value={a.validadeDoc} onChange={e => setA({ ...a, validadeDoc: e.target.value })} required />
          </Field>
          <Field label="NIF *">
            <input className="input w-full" value={a.nif} onChange={e => setA({ ...a, nif: e.target.value })} required />
          </Field>

          {isMinor && (
            <>
              <div className="md:col-span-2" />
              <Field label="Nome do pai *">
                <input className="input w-full" value={a.nomePai} onChange={e => setA({ ...a, nomePai: e.target.value })} required />
              </Field>
              <Field label="Nome da mãe *">
                <input className="input w-full" value={a.nomeMae} onChange={e => setA({ ...a, nomeMae: e.target.value })} required />
              </Field>
            </>
          )}

          <Field className="md:col-span-2" label="Morada *">
            <input className="input w-full" value={a.morada} onChange={e => setA({ ...a, morada: e.target.value })} required />
          </Field>
          <Field label="Código Postal *">
            <input className="input w-full" value={a.codigoPostal} onChange={e => setA({ ...a, codigoPostal: formatPostal(e.target.value) })} required />
          </Field>

          <Field label="Email (opcional)">
            <input type="email" className="input w-full" value={a.emailOpc || ''} onChange={e => setA({ ...a, emailOpc: e.target.value })} />
          </Field>
          <Field label="Telefone (opcional)">
            <input className="input w-full" value={a.telefoneOpc || ''} onChange={e => setA({ ...a, telefoneOpc: e.target.value })} />
          </Field>

          {!isMastersOrSub23 && (
            <>
              <Field className="md:col-span-2" label="Escola (2025/26) *">
                <input className="input w-full" value={a.escola} onChange={e => setA({ ...a, escola: e.target.value })} required />
              </Field>
              <Field label="Ano de escolaridade (2025/26) *">
                <input className="input w-full" value={a.anoEscolaridade} onChange={e => setA({ ...a, anoEscolaridade: e.target.value })} required />
              </Field>
            </>
          )}

          <Field className="md:col-span-2" label="Alergias / problemas de saúde *">
            <textarea className="input min-h-[100px] w-full" value={a.alergias} onChange={e => setA({ ...a, alergias: e.target.value })} required />
          </Field>

          {isMinor && (
            <>
              <Field label="Encarregado de Educação *">
                <select className="input w-full" value={a.encarregadoEducacao || ''} onChange={e => setA({ ...a, encarregadoEducacao: e.target.value as any })}>
                  <option value="">—</option>
                  <option>Pai</option>
                  <option>Mãe</option>
                  <option>Outro</option>
                </select>
              </Field>
              {a.encarregadoEducacao === 'Outro' && (
                <Field label="Parentesco">
                  <input className="input w-full" value={a.parentescoOutro || ''} onChange={e => setA({ ...a, parentescoOutro: e.target.value })} />
                </Field>
              )}
            </>
          )}

          <Field className="md:col-span-2" label="Contactos telefónicos de urgência *">
            <input className="input w-full" placeholder="912...; 913..." value={a.contactosUrgencia} onChange={e => setA({ ...a, contactosUrgencia: e.target.value })} required />
          </Field>
          <Field className="md:col-span-2" label="Email(s) preferenciais *">
            <input className="input w-full" placeholder="a@x.pt; b@y.pt" value={a.emailsPreferenciais} onChange={e => setA({ ...a, emailsPreferenciais: e.target.value })} required />
            <small className="text-gray-500">Se mais do que um, separar por ponto e vírgula (;)</small>
          </Field>

          {/* Admin-specific fields */}
          <Field className="md:col-span-2" label="Status administrativo">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={a.social ?? false}
                  onChange={e => setA({ ...a, social: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Sócio social</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={a.desistiu ?? false}
                  onChange={e => setA({ ...a, desistiu: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm">Desistiu</span>
              </label>
            </div>
          </Field>

          <Field className="md:col-span-2" label="Observações">
            <Textarea className="input min-h-[80px] w-full" value={(a as any).observacoes || ''} onChange={e => setA({ ...a, ...({ observacoes: e.target.value } as any) })} />
          </Field>

          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button variant="grey" onClick={onCancel} className="ml-2 flex items-center gap-2 w-full sm:w-auto">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button
              variant="warning"
              id='save-atleta-button'
              type="submit"
              disabled={!!eligibilityError}
              title={eligibilityError || undefined}
            >
              Guardar alterações
            </Button>
          </div>

          <style>{`
            .input { width: 100%; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0.5rem 0.75rem; font-size: 0.9rem; }
          `}</style>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={['space-y-1', className].join(' ')}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}


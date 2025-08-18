import React, { useEffect, useMemo, useState } from "react";
import type {
  Atleta,
  Genero,
  Nacionalidade,
  TipoDocId,
  PlanoPagamento,
} from "../types/Atleta";
import {
  computeEscalao,
  isValidNIF,
  isValidPostalCode,
  yearsAtSeasonStart,
  areEmailsValid,
} from "../utils/form-utils";
import { estimarCusto, formatEUR } from "../utils/pricing";

type Props = {
  initial?: Partial<Atleta>;
  onSave: (a: Atleta) => void;
  onCancel?: () => void;
  dadosPessoais?: {
    morada?: string;
    codigoPostal?: string;
    telefone?: string; // contactos de urgência
    email?: string; // email preferencial
  };
  /** Tipo de sócio do agregado (usa o valor guardado em Dados Pessoais). */
  tipoSocio?: string | null;
  /** Nº total de atletas inscritos no agregado (para a regra “2 ou + atletas”). */
  totalAtletasAgregado?: number;
};

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

function formatPostal(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 7);
  if (d.length <= 4) return d;
  return d.slice(0, 4) + "-" + d.slice(4);
}

function isAnuidadeObrigatoria(escalao?: string) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores sub 23") ||
    s.includes("seniores sub-23")
  );
}

export default function AtletaFormCompleto({
  initial,
  onSave,
  onCancel,
  dadosPessoais,
  tipoSocio,
  totalAtletasAgregado = 1,
}: Props) {
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || "",
    dataNascimento: initial?.dataNascimento || "",
    genero: (initial?.genero as Genero) || "Feminino",
    nacionalidade: (initial?.nacionalidade as Nacionalidade) || "Portuguesa",
    nacionalidadeOutra: initial?.nacionalidadeOutra || "",
    tipoDoc: (initial?.tipoDoc as TipoDocId) || "Cartão de cidadão",
    numDoc: initial?.numDoc || "",
    validadeDoc: initial?.validadeDoc || "",
    nif: initial?.nif || "",
    nomePai: initial?.nomePai || "",
    nomeMae: initial?.nomeMae || "",
    morada: initial?.morada ?? dadosPessoais?.morada ?? "",
    codigoPostal: initial?.codigoPostal ?? dadosPessoais?.codigoPostal ?? "",
    telefoneOpc: initial?.telefoneOpc || "",
    emailOpc: initial?.emailOpc || "",
    escola: initial?.escola || "",
    anoEscolaridade: initial?.anoEscolaridade || "",
    alergias: initial?.alergias || "",
    encarregadoEducacao: initial?.encarregadoEducacao,
    parentescoOutro: initial?.parentescoOutro || "",
    contactosUrgencia: initial?.contactosUrgencia ?? dadosPessoais?.telefone ?? "",
    emailsPreferenciais:
      initial?.emailsPreferenciais ?? (dadosPessoais?.email ?? ""),
    escalao: initial?.escalao || "Fora de escalões",
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || "Mensal",
    observacoes: initial?.observacoes || "",
  });

  // Recomputa Escalão quando mudam data/género
  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      setA((prev) => ({
        ...prev,
        escalao: computeEscalao(a.dataNascimento, a.genero),
      }));
    }
  }, [a.dataNascimento, a.genero]);

  // Se o escalão implicar anuidade obrigatória, força o plano "Anual"
  useEffect(() => {
    if (isAnuidadeObrigatoria(a.escalao) && a.planoPagamento !== "Anual") {
      setA((prev) => ({ ...prev, planoPagamento: "Anual" }));
    }
  }, [a.escalao, a.planoPagamento]);

  const isMinor = useMemo(
    () => (a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false),
    [a.dataNascimento]
  );

  // Estimativa de custos (usa tipo de sócio e nº de atletas do agregado)
  const estimativa = useMemo(
    () =>
      estimarCusto({
        escalao: a.escalao,
        tipoSocio: tipoSocio ?? "Não pretendo ser sócio",
        totalAtletasNoAgregado: totalAtletasAgregado,
      }),
    [a.escalao, tipoSocio, totalAtletasAgregado]
  );

  function save(ev: React.FormEvent) {
    ev.preventDefault();
    const errs: string[] = [];
    if (!a.nomeCompleto.trim()) errs.push("Nome do atleta é obrigatório");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.dataNascimento))
      errs.push("Data de nascimento inválida");
    if (!a.numDoc.trim()) errs.push("Número de documento obrigatório");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.validadeDoc))
      errs.push("Validade de documento inválida");
    if (!isValidNIF(a.nif)) errs.push("NIF inválido");
    if (!isValidPostalCode(a.codigoPostal))
      errs.push("Código-postal inválido (####-###)");
    if (!a.morada.trim()) errs.push("Morada é obrigatória");

    const isMasters = a.escalao === "Masters (<1995)";
    const showEscola = !!a.dataNascimento && !isMasters;

    if (showEscola && !a.escola.trim()) errs.push("Escola é obrigatória");
    if (showEscola && !a.anoEscolaridade.trim())
      errs.push("Ano de escolaridade é obrigatório");

    if (!a.alergias.trim())
      errs.push("Alergias / problemas de saúde é obrigatório");
    if (!a.contactosUrgencia.trim())
      errs.push("Contactos de urgência são obrigatórios");
    if (
      !a.emailsPreferenciais.trim() ||
      !areEmailsValid(a.emailsPreferenciais)
    )
      errs.push("Email(s) preferenciais inválidos");

    if (a.nacionalidade === "Outra" && !a.nacionalidadeOutra?.trim())
      errs.push("Indicar a nacionalidade");

    if (isMinor && !a.encarregadoEducacao)
      errs.push("Selecionar Encarregado de Educação");

    if (a.encarregadoEducacao === "Outro" && !a.parentescoOutro?.trim())
      errs.push("Indicar parentesco (Outro)");

    if (errs.length) {
      alert(errs.join("\n"));
      return;
    }
    onSave(a);
  }

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={save}>
      <Field className="md:col-span-2" label="Nome Completo *">
        <input
          className="input"
          value={a.nomeCompleto}
          onChange={(e) => setA({ ...a, nomeCompleto: e.target.value })}
          required
        />
      </Field>

      <Field label="Data de Nascimento *">
        <input
          type="date"
          className="input"
          value={a.dataNascimento}
          onChange={(e) => setA({ ...a, dataNascimento: e.target.value })}
          required
        />
      </Field>

      <Field label="Género *">
        <select
          className="input"
          value={a.genero}
          onChange={(e) => setA({ ...a, genero: e.target.value as Genero })}
        >
          <option>Feminino</option>
          <option>Masculino</option>
        </select>
      </Field>

      {/* Escalão e Plano: o plano surge logo abaixo do género; quando Sub23/Masters fica bloqueado em Anual */}
      <Field label="Escalão (sugestão automática)">
        <input className="input bg-gray-100" value={a.escalao} readOnly />
      </Field>

      <div className="md:col-span-1">
        <Field label="Opção de Pagamentos *">
          <select
            className="input"
            value={a.planoPagamento}
            onChange={(e) =>
              setA({ ...a, planoPagamento: e.target.value as PlanoPagamento })
            }
            disabled={isAnuidadeObrigatoria(a.escalao)}
            title={
              isAnuidadeObrigatoria(a.escalao)
                ? "Para Sub-23/Masters, a anuidade é obrigatória."
                : undefined
            }
          >
            <option>Mensal</option>
            <option>Trimestral</option>
            <option>Anual</option>
          </select>
        </Field>
        {isAnuidadeObrigatoria(a.escalao) && (
          <div className="text-xs text-gray-600 -mt-2 mb-2">
            Para Sub-23/Masters, o plano é fixo: <b>Anual</b>.
          </div>
        )}
      </div>

      {/* Estimativa de custos (lado direito do Plano) */}
      <div className="rounded-xl border p-3 bg-white">
        <div className="font-medium mb-1">Estimativa de custos</div>
        <div className="text-sm space-y-1">
          <div>
            Taxa de inscrição: <strong>{formatEUR(estimativa.inscricao)}</strong>
          </div>
          <div>
            Mensal (10x): <strong>{formatEUR(estimativa.mensal10)}</strong>
          </div>
          <div>
            Trimestral (3x): <strong>{formatEUR(estimativa.trimestre3)}</strong>
          </div>
          <div>
            Anual (1x): <strong>{formatEUR(estimativa.anual1)}</strong>
          </div>
          {estimativa.observacoes?.length ? (
            <ul className="mt-2 text-xs text-gray-600 list-disc pl-5">
              {estimativa.observacoes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : null}
          <div className="text-[11px] text-gray-500 mt-2">
            Baseado no tipo de sócio <b>{tipoSocio || "—"}</b> e em{" "}
            <b>{totalAtletasAgregado}</b> atleta(s) no agregado.
          </div>
        </div>
      </div>

      <Field label="Nacionalidade *">
        <select
          className="input"
          value={a.nacionalidade}
          onChange={(e) =>
          setA({ ...a, nacionalidade: e.target.value as Nacionalidade })
          }
        >
          <option>Portuguesa</option>
          <option>Outra</option>
        </select>
      </Field>
      {a.nacionalidade === "Outra" && (
        <Field className="md:col-span-1" label="Indique a nacionalidade">
          <input
            className="input"
            value={a.nacionalidadeOutra || ""}
            onChange={(e) =>
              setA({ ...a, nacionalidadeOutra: e.target.value })
            }
          />
        </Field>
      )}

      <Field label="Tipo de documento *">
        <select
          className="input"
          value={a.tipoDoc}
          onChange={(e) => setA({ ...a, tipoDoc: e.target.value as TipoDocId })}
        >
          <option>Cartão de cidadão</option>
          <option>Passaporte</option>
          <option>Título de Residência</option>
        </select>
      </Field>
      <Field label="Nº documento *">
        <input
          className="input"
          value={a.numDoc}
          onChange={(e) => setA({ ...a, numDoc: e.target.value })}
          required
        />
      </Field>
      <Field label="Validade do documento *">
        <input
          type="date"
          className="input"
          value={a.validadeDoc}
          onChange={(e) => setA({ ...a, validadeDoc: e.target.value })}
          required
        />
      </Field>
      <Field label="NIF *">
        <input
          className="input"
          value={a.nif}
          onChange={(e) => setA({ ...a, nif: e.target.value })}
          required
        />
      </Field>

      {/* Filiação — APENAS quando é menor (e colocada abaixo do NIF) */}
      {isMinor && (
        <>
          <Field label="Nome do pai *">
            <input
              className="input"
              value={a.nomePai}
              onChange={(e) => setA({ ...a, nomePai: e.target.value })}
              required
            />
          </Field>
          <Field label="Nome da mãe *">
            <input
              className="input"
              value={a.nomeMae}
              onChange={(e) => setA({ ...a, nomeMae: e.target.value })}
              required
            />
          </Field>
        </>
      )}

      <Field className="md:col-span-2" label="Morada *">
        <input
          className="input"
          value={a.morada}
          onChange={(e) => setA({ ...a, morada: e.target.value })}
          required
        />
      </Field>

      <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
        <Field label="Código Postal *">
          <input
            className="input"
            value={a.codigoPostal}
            onChange={(e) =>
              setA({ ...a, codigoPostal: formatPostal(e.target.value) })
            }
            required
          />
        </Field>
        <div className="flex items-end pb-1">
          <button
            type="button"
            className="btn secondary h-10"
            onClick={() => {
              if (!dadosPessoais) return;
              setA((prev) => ({
                ...prev,
                morada: dadosPessoais.morada || prev.morada,
                codigoPostal: dadosPessoais.codigoPostal || prev.codigoPostal,
                contactosUrgencia:
                  dadosPessoais.telefone || prev.contactosUrgencia,
                emailsPreferenciais:
                  dadosPessoais.email || prev.emailsPreferenciais,
              }));
            }}
          >
            Copiar dados pessoais
          </button>
        </div>
      </div>

      <Field label="Email (opcional)">
        <input
          type="email"
          className="input"
          value={a.emailOpc || ""}
          onChange={(e) => setA({ ...a, emailOpc: e.target.value })}
        />
      </Field>
      <Field label="Telefone (opcional)">
        <input
          className="input"
          value={a.telefoneOpc || ""}
          onChange={(e) => setA({ ...a, telefoneOpc: e.target.value })}
        />
      </Field>

      {/* Escola/Ano só quando não Masters */}
      {a.escalao !== "Masters (<1995)" && (
        <>
          <Field className="md:col-span-2" label="Escola (2025/26) *">
            <input
              className="input"
              value={a.escola}
              onChange={(e) => setA({ ...a, escola: e.target.value })}
              required
            />
          </Field>
          <Field label="Ano de escolaridade (2025/26) *">
            <input
              className="input"
              value={a.anoEscolaridade}
              onChange={(e) =>
                setA({ ...a, anoEscolaridade: e.target.value })
              }
              required
            />
          </Field>
        </>
      )}

      <Field className="md:col-span-2" label="Alergias / problemas de saúde *">
        <textarea
          className="input min-h-[100px]"
          value={a.alergias}
          onChange={(e) => setA({ ...a, alergias: e.target.value })}
          required
        />
      </Field>

      {isMinor && (
        <>
          <Field label="Encarregado de Educação *">
            <select
              className="input"
              value={a.encarregadoEducacao || ""}
              onChange={(e) =>
                setA({
                  ...a,
                  encarregadoEducacao: e.target
                    .value as NonNullable<Atleta["encarregadoEducacao"]>,
                })
              }
              required
            >
              <option value="">—</option>
              <option>Pai</option>
              <option>Mãe</option>
              <option>Outro</option>
            </select>
          </Field>
          {a.encarregadoEducacao === "Outro" && (
            <Field label="Parentesco">
              <input
                className="input"
                value={a.parentescoOutro || ""}
                onChange={(e) =>
                  setA({ ...a, parentescoOutro: e.target.value })
                }
              />
            </Field>
          )}
        </>
      )}

      <Field className="md:col-span-2" label="Contactos telefónicos de urgência *">
        <input
          className="input"
          placeholder="912...; 913..."
          value={a.contactosUrgencia}
          onChange={(e) => setA({ ...a, contactosUrgencia: e.target.value })}
          required
        />
      </Field>

      <Field className="md:col-span-2" label="Email(s) preferenciais *">
        <input
          className="input"
          placeholder="a@x.pt; b@y.pt"
          value={a.emailsPreferenciais}
          onChange={(e) =>
            setA({ ...a, emailsPreferenciais: e.target.value })
          }
          required
        />
        <small className="text-gray-500">
          Se mais do que um, separar por ponto e vírgula (;)
        </small>
      </Field>

      <Field className="md:col-span-2" label="Observações">
        <textarea
          className="input min-h-[80px]"
          value={a.observacoes || ""}
          onChange={(e) => setA({ ...a, observacoes: e.target.value })}
        />
      </Field>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn primary">
          Guardar atleta
        </button>
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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={["space-y-1", className].join(" ")}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// src/components/AtletaFormCompleto.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

import type {
  Atleta,
  Genero,
  Nacionalidade,
  TipoDocId,
  PlanoPagamento,
  Escalao,
} from "../types/Atleta";

import {
  computeEscalao,
  yearsAtSeasonStart,
  isValidPostalCode,
  isValidNIF,
  areEmailsValid,
} from "../utils/form-utils";
import { estimateCosts } from "../utils/pricing";

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
  /** Tipo de sócio do agregado (influencia estimativa de custos) */
  tipoSocio?:
    | "Sócio Pro"
    | "Sócio Família"
    | "Sócio Geral Renovação"
    | "Sócio Geral Novo"
    | "Não pretendo ser sócio";
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
}: Props) {
  const [a, setA] = useState<Atleta>({
    id: initial?.id || uid(),
    nomeCompleto: initial?.nomeCompleto || "",
    dataNascimento: initial?.dataNascimento || "",
    genero: (initial?.genero as Genero) || "Feminino",

    // colocamos já um valor coerente; será recalculado no useEffect
    escalao:
      (initial?.escalao as Escalao) ||
      ("Fora de escalões" as unknown as Escalao),

    // plano default (será forçado a Anual quando aplicável)
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || "Mensal",

    // “longos”
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
    contactosUrgencia:
      initial?.contactosUrgencia ?? dadosPessoais?.telefone ?? "",
    emailsPreferenciais:
      initial?.emailsPreferenciais ?? dadosPessoais?.email ?? "",
    observacoes: (initial as any)?.observacoes || "",
  });

  // Recalcular escalão quando muda data/género
  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      const novo = computeEscalao(a.dataNascimento, a.genero) as unknown as Escalao;
      setA((prev) => ({ ...prev, escalao: novo }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.dataNascimento, a.genero]);

  // Forçar plano Anual para Seniores Sub-23 & Masters
  useEffect(() => {
    if (isAnuidadeObrigatoria(a.escalao) && a.planoPagamento !== "Anual") {
      setA((prev) => ({ ...prev, planoPagamento: "Anual" }));
    }
  }, [a.escalao, a.planoPagamento]);

  const isMinor = useMemo(
    () => (a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false),
    [a.dataNascimento]
  );

  const isMasters = a.escalao?.toLowerCase().includes("masters");

  // Estimativa de custos (reage a escalao/plano/tipoSocio)
  const tipoSocioAtual =
    tipoSocio ?? ("Não pretendo ser sócio" as const);
  const estimativa = useMemo(() => {
    try {
      return estimateCosts({
        escalao: a.escalao,
        plano: a.planoPagamento,
        tipoSocio: tipoSocioAtual,
      });
    } catch {
      return null;
    }
  }, [a.escalao, a.planoPagamento, tipoSocioAtual]);

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

    if (!a.morada?.trim()) errs.push("Morada é obrigatória");
    if (!isValidPostalCode(a.codigoPostal || ""))
      errs.push("Código-postal inválido (####-###)");

    // Filiação (só menores)
    if (isMinor && !a.nomePai?.trim()) errs.push("Nome do pai é obrigatório");
    if (isMinor && !a.nomeMae?.trim()) errs.push("Nome da mãe é obrigatório");

    // Escola para não-masters (coerente com versão antiga)
    if (!isMasters) {
      if (!a.escola?.trim()) errs.push("Escola é obrigatória");
      if (!a.anoEscolaridade?.trim())
        errs.push("Ano de escolaridade é obrigatório");
    }

    if (!a.alergias?.trim())
      errs.push("Alergias / problemas de saúde é obrigatório");

    if (!a.contactosUrgencia?.trim())
      errs.push("Contactos de urgência são obrigatórios");

    if (
      !a.emailsPreferenciais?.trim() ||
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
      {/* Identificação base */}
      <div className="space-y-1 md:col-span-2">
        <Label>Nome Completo *</Label>
        <Input
          value={a.nomeCompleto}
          onChange={(e) => setA({ ...a, nomeCompleto: e.target.value })}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>Data de Nascimento *</Label>
        <Input
          type="date"
          value={a.dataNascimento}
          onChange={(e) => setA({ ...a, dataNascimento: e.target.value })}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>Género *</Label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.genero}
          onChange={(e) => setA({ ...a, genero: e.target.value as Genero })}
        >
          <option>Feminino</option>
          <option>Masculino</option>
        </select>
      </div>

      {/* Escalão e Plano — imediatamente abaixo do Género */}
      <div className="space-y-1">
        <Label>Escalão (sugestão automática)</Label>
        <Input value={a.escalao} readOnly className="bg-gray-100" />
      </div>

      <div className="space-y-1">
        <Label>Opção de Pagamentos *</Label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.planoPagamento}
          onChange={(e) =>
            setA({
              ...a,
              planoPagamento: e.target.value as PlanoPagamento,
            })
          }
          disabled={isAnuidadeObrigatoria(a.escalao)}
          title={
            isAnuidadeObrigatoria(a.escalao)
              ? "Para Seniores Sub-23 e Masters a anuidade é obrigatória."
              : undefined
          }
        >
          <option>Mensal</option>
          <option>Trimestral</option>
          <option>Anual</option>
        </select>
        {isAnuidadeObrigatoria(a.escalao) && (
          <small className="text-xs text-gray-500">
            Para Seniores Sub-23 e Masters, a anuidade é obrigatória.
          </small>
        )}
      </div>

      {/* Nacionalidade / Documento */}
      <div className="space-y-1">
        <Label>Nacionalidade *</Label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.nacionalidade}
          onChange={(e) =>
            setA({
              ...a,
              nacionalidade: e.target.value as Nacionalidade,
            })
          }
        >
          <option>Portuguesa</option>
          <option>Outra</option>
        </select>
      </div>

      {a.nacionalidade === "Outra" && (
        <div className="space-y-1">
          <Label>Indique a nacionalidade</Label>
          <Input
            value={a.nacionalidadeOutra || ""}
            onChange={(e) =>
              setA({ ...a, nacionalidadeOutra: e.target.value })
            }
          />
        </div>
      )}

      <div className="space-y-1">
        <Label>Tipo de documento *</Label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.tipoDoc}
          onChange={(e) => setA({ ...a, tipoDoc: e.target.value as TipoDocId })}
        >
          <option>Cartão de cidadão</option>
          <option>Passaporte</option>
          <option>Título de Residência</option>
        </select>
      </div>

      <div className="space-y-1">
        <Label>Nº documento *</Label>
        <Input
          value={a.numDoc}
          onChange={(e) => setA({ ...a, numDoc: e.target.value })}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>Validade do documento *</Label>
        <Input
          type="date"
          value={a.validadeDoc}
          onChange={(e) => setA({ ...a, validadeDoc: e.target.value })}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>NIF *</Label>
        <Input
          value={a.nif}
          onChange={(e) => setA({ ...a, nif: e.target.value })}
          required
        />
      </div>

      {/* Filiação — APENAS quando é menor (abaixo do NIF) */}
      {isMinor && (
        <>
          <div className="space-y-1">
            <Label>Nome do pai *</Label>
            <Input
              value={a.nomePai}
              onChange={(e) => setA({ ...a, nomePai: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Nome da mãe *</Label>
            <Input
              value={a.nomeMae}
              onChange={(e) => setA({ ...a, nomeMae: e.target.value })}
              required
            />
          </div>
        </>
      )}

      {/* Morada / CP + copiar */}
      <div className="space-y-1 md:col-span-2">
        <Label>Morada *</Label>
        <Input
          value={a.morada}
          onChange={(e) => setA({ ...a, morada: e.target.value })}
          required
        />
      </div>

      <div className="md:col-span-2 grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1">
          <Label>Código Postal *</Label>
          <Input
            value={a.codigoPostal}
            onChange={(e) =>
              setA({ ...a, codigoPostal: formatPostal(e.target.value) })
            }
            placeholder="0000-000"
            required
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="secondary"
            className="h-10"
            onClick={() => {
              if (!dadosPessoais) return;
              setA((prev) => ({
                ...prev,
                morada: dadosPessoais.morada || prev.morada,
                codigoPostal:
                  dadosPessoais.codigoPostal || prev.codigoPostal,
                contactosUrgencia:
                  dadosPessoais.telefone || prev.contactosUrgencia,
                emailsPreferenciais:
                  dadosPessoais.email || prev.emailsPreferenciais,
              }));
            }}
          >
            Copiar dados pessoais
          </Button>
        </div>
      </div>

      {/* Contactos opcionais */}
      <div className="space-y-1">
        <Label>Email (opcional)</Label>
        <Input
          type="email"
          value={a.emailOpc || ""}
          onChange={(e) => setA({ ...a, emailOpc: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Telefone (opcional)</Label>
        <Input
          value={a.telefoneOpc || ""}
          onChange={(e) => setA({ ...a, telefoneOpc: e.target.value })}
        />
      </div>

      {/* Escola (não masters) */}
      {!isMasters && (
        <>
          <div className="space-y-1 md:col-span-2">
            <Label>Escola (2025/26) *</Label>
            <Input
              value={a.escola}
              onChange={(e) => setA({ ...a, escola: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Ano de escolaridade (2025/26) *</Label>
            <Input
              value={a.anoEscolaridade}
              onChange={(e) =>
                setA({ ...a, anoEscolaridade: e.target.value })
              }
              required
            />
          </div>
        </>
      )}

      {/* Saúde */}
      <div className="space-y-1 md:col-span-2">
        <Label>Alergias / problemas de saúde *</Label>
        <Textarea
          value={a.alergias}
          onChange={(e) => setA({ ...a, alergias: e.target.value })}
          required
        />
      </div>

      {/* EE — só menores */}
      {isMinor && (
        <>
          <div className="space-y-1">
            <Label>Encarregado de Educação *</Label>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={a.encarregadoEducacao || ""}
              onChange={(e) =>
                setA({
                  ...a,
                  encarregadoEducacao: e.target.value as any,
                })
              }
            >
              <option value="">—</option>
              <option>Pai</option>
              <option>Mãe</option>
              <option>Outro</option>
            </select>
          </div>
          {a.encarregadoEducacao === "Outro" && (
            <div className="space-y-1">
              <Label>Parentesco</Label>
              <Input
                value={a.parentescoOutro || ""}
                onChange={(e) =>
                  setA({ ...a, parentescoOutro: e.target.value })
                }
              />
            </div>
          )}
        </>
      )}

      {/* Contactos obrigatórios */}
      <div className="space-y-1 md:col-span-2">
        <Label>Contactos telefónicos de urgência *</Label>
        <Input
          placeholder="912...; 913..."
          value={a.contactosUrgencia}
          onChange={(e) =>
            setA({ ...a, contactosUrgencia: e.target.value })
          }
          required
        />
      </div>

      <div className="space-y-1 md:col-span-2">
        <Label>Email(s) preferenciais *</Label>
        <Input
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
      </div>

      {/* Observações */}
      <div className="space-y-1 md:col-span-2">
        <Label>Observações</Label>
        <Textarea
          value={(a as any).observacoes || ""}
          onChange={(e) =>
            setA({ ...(a as any), observacoes: e.target.value } as Atleta)
          }
        />
      </div>

      {/* Estimativa de custos */}
      <div className="md:col-span-2 border rounded-xl p-3 bg-gray-50">
        <div className="font-medium mb-1">Estimativa de custos</div>
        {estimativa ? (
          <div className="text-sm space-y-0.5">
            <div>Taxa de inscrição: {estimativa.taxaInscricao} €</div>
            <div>Mensal (10x): {estimativa.mensal?.toString?.() ?? estimativa.mensal} €</div>
            <div>Trimestral (3x): {estimativa.trimestral?.toString?.() ?? estimativa.trimestral} €</div>
            <div>Anual (1x): {estimativa.anual?.toString?.() ?? estimativa.anual} €</div>
            <div className="text-xs text-gray-600">
              Tarifa {tipoSocioAtual}. Baseado no tipo de sócio.
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Indisponível para o escalão/plano atuais.
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit">Guardar atleta</Button>
      </div>
    </form>
  );
}

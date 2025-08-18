// src/components/AtletaFormCompleto.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import ImagesDialog from "./ImagesDialog";

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

import { estimateCosts, eur } from "../utils/pricing";

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
  /** Vem do perfil (influencia preços) */
  tipoSocio?: string;
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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
    s.includes("seniores sub-23") ||
    s.startsWith("seniores ")
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

    // identidade/documentos
    nacionalidade: (initial?.nacionalidade as Nacionalidade) || "Portuguesa",
    nacionalidadeOutra: initial?.nacionalidadeOutra || "",
    tipoDoc: (initial?.tipoDoc as TipoDocId) || "Cartão de cidadão",
    numDoc: initial?.numDoc || "",
    validadeDoc: initial?.validadeDoc || "",
    nif: initial?.nif || "",

    nomePai: initial?.nomePai || "",
    nomeMae: initial?.nomeMae || "",

    // contactos/morada
    morada: initial?.morada ?? dadosPessoais?.morada ?? "",
    codigoPostal: initial?.codigoPostal ?? dadosPessoais?.codigoPostal ?? "",
    telefoneOpc: initial?.telefoneOpc || "",
    emailOpc: initial?.emailOpc || "",

    // escola/saúde
    escola: initial?.escola || "",
    anoEscolaridade: initial?.anoEscolaridade || "",
    alergias: initial?.alergias || "",

    // EE / urgências
    encarregadoEducacao: initial?.encarregadoEducacao,
    parentescoOutro: initial?.parentescoOutro || "",
    contactosUrgencia: initial?.contactosUrgencia ?? dadosPessoais?.telefone ?? "",
    emailsPreferenciais:
      initial?.emailsPreferenciais ?? (dadosPessoais?.email ?? ""),

    // escalão/plano
    escalao: (initial?.escalao as Escalao) || ("Fora de escalões" as Escalao),
    planoPagamento: (initial?.planoPagamento as PlanoPagamento) || "Mensal",

    // observações
    observacoes: initial?.observacoes || "",
  });

  // Recalcular escalão quando muda data/género
  useEffect(() => {
    if (a.dataNascimento && a.genero) {
      const esc = computeEscalao(a.dataNascimento, a.genero);
      setA((prev) => ({ ...prev, escalao: esc as Escalao }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.dataNascimento, a.genero]);

  // É menor?
  const isMinor = useMemo(
    () => (a.dataNascimento ? yearsAtSeasonStart(a.dataNascimento) < 18 : false),
    [a.dataNascimento]
  );

  // Mostrar campos de escola excepto Masters
  const isMasters = a.escalao === "Masters (<1995)";
  const showEscola = !!a.dataNascimento && !isMasters;

  // Anuidade obrigatória para seniores/sub-23/masters
  const anuidadeObrigatoria = isAnuidadeObrigatoria(a.escalao);

  // Força plano "Anual" quando obrigatório
  useEffect(() => {
    if (anuidadeObrigatoria && a.planoPagamento !== "Anual") {
      setA((prev) => ({ ...prev, planoPagamento: "Anual" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anuidadeObrigatoria]);

  // Estimativa de custos (recalcula quando muda escalão OU tipo de sócio)
  const estimate = useMemo(
    () =>
      estimateCosts({
        escalao: a.escalao,
        tipoSocio: tipoSocio,
        numAtletasAgregado: 1,
      }),
    [a.escalao, tipoSocio]
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

    if (!a.morada.trim()) errs.push("Morada é obrigatória");
    if (!isValidPostalCode(a.codigoPostal))
      errs.push("Código-postal inválido (####-###)");

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
      {/* Identificação básica */}
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

      {/* Escalão & Plano + Tabela de Preços */}
      <div className="space-y-1">
        <Label>Escalão</Label>
        <Input value={a.escalao} readOnly className="bg-gray-100" />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label>Opção de Pagamentos *</Label>
          <ImagesDialog
            buttonLabel="Tabela de Preços"
            images={[
              { src: "/precos/pagamentos-2025.png", alt: "Tabela de Pagamentos 2025/26" },
            ]}
          />
        </div>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.planoPagamento}
          onChange={(e) =>
            setA({ ...a, planoPagamento: e.target.value as PlanoPagamento })
          }
          disabled={anuidadeObrigatoria}
          title={
            anuidadeObrigatoria
              ? "Bloqueado a Anual pelo escalão"
              : "Escolha o plano"
          }
        >
          <option>Mensal</option>
          <option>Trimestral</option>
          <option>Anual</option>
        </select>
        {anuidadeObrigatoria && (
          <small className="text-xs text-gray-500">
            Anuidade obrigatória para este escalão.
          </small>
        )}
      </div>

      {/* Nacionalidade / Documento / Fiscal */}
      <div className="space-y-1">
        <Label>Nacionalidade *</Label>
        <select
          className="w-full rounded-xl border px-3 py-2 text-sm"
          value={a.nacionalidade}
          onChange={(e) =>
            setA({ ...a, nacionalidade: e.target.value as Nacionalidade })
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

      {/* Morada/Postal + copiar dados pessoais */}
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
                codigoPostal: dadosPessoais.codigoPostal || prev.codigoPostal,
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

      {/* Escola (não Masters) */}
      {showEscola && (
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

      {/* Encarregado de Educação (apenas menor) */}
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
                  encarregadoEducacao: e.target.value as
                    | "Pai"
                    | "Mãe"
                    | "Outro"
                    | undefined,
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

          {/* Filiação: Pai/Mãe (abaixo do NIF, em linha própria) */}
          <div className="space-y-1 md:col-span-2">
            <Label>Nome do pai *</Label>
            <Input
              value={a.nomePai}
              onChange={(e) => setA({ ...a, nomePai: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Nome da mãe *</Label>
            <Input
              value={a.nomeMae}
              onChange={(e) => setA({ ...a, nomeMae: e.target.value })}
              required
            />
          </div>
        </>
      )}

      {/* Urgência + emails preferenciais */}
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
          value={a.observacoes || ""}
          onChange={(e) => setA({ ...a, observacoes: e.target.value })}
          placeholder="Notas internas relevantes (opcional)"
        />
      </div>

      {/* Estimativa de custos */}
      <div className="md:col-span-2 rounded-xl border p-3 bg-gray-50">
        <div className="font-medium mb-1">Estimativa de custos</div>
        <div className="grid gap-1 text-sm">
          <div>Taxa de inscrição: <strong>{eur(estimate.taxaInscricao)}</strong></div>
          <div>Mensal (10x): <strong>{eur(estimate.mensal10)}</strong></div>
          <div>Trimestral (3x): <strong>{eur(estimate.trimestre3)}</strong></div>
          <div>Anual (1x): <strong>{eur(estimate.anual1)}</strong></div>
          <div className="text-xs text-gray-600 mt-1">
            {estimate.tarifa}. {estimate.info}
          </div>
        </div>
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

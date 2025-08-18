// src/utils/pricing.ts

// API pública
export type EstimateInput = {
  escalao: string;                 // texto do escalão (ex.: "Mini 12 (2014-2015)")
  tipoSocio?: string | null;       // ex.: "Sócio Pro", "Sócio Família", "Sócio Geral Novo", "Não pretendo ser sócio"
  numAtletasAgregado?: number;     // reservado para futura lógica de agregado
};

export type EstimateResult = {
  taxaInscricao: number;  // € único
  mensal10: number;       // € por mês (10x)
  trimestre3: number;     // € por trimestre (3x)
  anual1: number;         // € pagamento único anual
  tarifa: string;         // legenda da tarifa
  info: string;           // nota auxiliar
};

// Utilitário de formatação
export function eur(n: number): string {
  return n.toLocaleString("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: (n % 1 ? 2 : 0) });
}

/**
 * Classificação do escalão para tabela de preços.
 * - MINI_LOW: Baby, Mini 8, Mini 10
 * - MINI12:   Mini 12  (mensal/trimestral/anual = SUBS, mas taxa inscrição = 35€)
 * - SUBS:     Sub 14/16/18
 * - SENIORS:  Seniores (inclui Sub23) e Masters
 */
function classifyEscalao(txt: string): "MINI_LOW" | "MINI12" | "SUBS" | "SENIORS" | "MASTERS" {
  const s = (txt || "").toLowerCase();

  // séniores/masters primeiro
  if (
    s.includes("seniores") ||
    s.includes("sub23") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("masters")
  ) return "SENIORS";

  if (s.includes("masters")) return "MASTERS";
  // Mini 12 explícito
  if (s.includes("mini 12")) return "MINI12";

  // Minis “baixos”
  if (s.includes("baby") || s.includes("mini 8") || s.includes("mini 10")) return "MINI_LOW";

  // Subs
  if (s.includes("sub 14") || s.includes("sub 16") || s.includes("sub 18")) return "SUBS";

  // fallback razoável
  return "SUBS";
}

/** Tabelas base (sem descontos) */
const BASE = {
  MINI_LOW:    { mensal10: 25,  trimestre3: 80,  anual1: 230, taxaInscricao: 35 },
  MINI12:      { mensal10: 35,  trimestre3: 113, anual1: 330, taxaInscricao: 45 },
  SUBS:        { mensal10: 35,  trimestre3: 113, anual1: 330, taxaInscricao: 45 },
  SENIORS:     { mensal10: 0,  trimestre3: 0, anual1: 0, taxaInscricao: 160 },
  MASTERS:     { mensal10: 0,  trimestre3: 0, anual1: 0, taxaInscricao: 100 },
} as const;

/** Desconto por tipo de sócio */
function desconto(tipoSocio?: string | null): { factor: number; label: string } {
  const t = (tipoSocio || "").toLowerCase();
  if (t.includes("sócio pro") || t.includes("sócio família")) {
    return { factor: 0.9, label: "Tarifa Sócio (-10%)." };
  }
  if (t.includes("sócio geral")) {
    return { factor: 1.0, label: "Tarifa Sócio Geral." };
  }
  return { factor: 1.0, label: "Tarifa Não Sócio." };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Estimativa principal */
export function estimateCosts(input: EstimateInput): EstimateResult {
  const group = classifyEscalao(input.escalao);
  const base = BASE[group];
  const { factor, label } = desconto(input.tipoSocio);

  // aplica desconto apenas às mensalidades; taxa de inscrição mantém-se como está
  const mensal10    = round2(base.mensal10    * factor);
  const trimestre3  = round2(base.trimestre3  * factor);
  const anual1      = round2(base.anual1      * factor);

  const info = `Baseado no tipo de sócio — e em ${Math.max(1, input.numAtletasAgregado ?? 1)} atleta(s) no agregado.`;

  return {
    taxaInscricao: base.taxaInscricao,
    mensal10,
    trimestre3,
    anual1,
    tarifa: label,
    info,
  };
}

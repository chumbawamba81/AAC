// src/utils/pricing.ts
export type EstimateInput = {
  /** Escalão textual (ex.: "Sub 14 Feminino", "Mini 12", "Sub-23", "Masters", …) */
  escalao: string;
  /** Tipo de sócio do agregado (ex.: "Sócio Pro", "Não pretendo ser sócio", …) */
  tipoSocio?: string | null;
  /** Nº total de atletas elegíveis no agregado (serve para o fallback PRO2) */
  numAtletasAgregado?: number;

  /** Opcional — posição do atleta dentro dos elegíveis PRO:
   *  0 = mais velho (PRO1), 1 = seguinte (PRO2), 2 = outro (PRO2), …
   *  Se definires isto, tem prioridade sobre o fallback.
   */
  proRank?: number;

  /** Opcional — define diretamente o “tier” PRO:
   *  1 = PRO1 (mais velho), 2 = PRO2 (restantes).
   *  Tem prioridade sobre proRank.
   */
  proTier?: 1 | 2;
};

export type EstimateResult = {
  taxaInscricao: number;
  mensal10: number;
  trimestre3: number;
  anual1: number;
  tarifa: string;
  info: string;
  /** se true, apenas faz sentido mostrar “Anual (1x)” */
  onlyAnnual?: boolean;
};

export function eur(n: number): string {
  return n.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
  });
}

/* -------------------- Classificação de escalões -------------------- */

type BandKey = "MINI_LOW" | "MINI12" | "SUBS" | "SUB23" | "MASTERS";

function classifyEscalao(esc: string): BandKey {
  const s = (esc || "").toLowerCase();
  if (s.includes("masters")) return "MASTERS";
  if (s.includes("sub23") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores"))
    return "SUB23";
  if (s.includes("mini 12")) return "MINI12";
  if (
    s.includes("baby") ||
    s.includes("mini 8") || s.includes("mini8") ||
    s.includes("mini 10") || s.includes("mini10")
  ) return "MINI_LOW";
  if (s.includes("sub 14") || s.includes("sub 16") || s.includes("sub 18")) return "SUBS";
  return "SUBS";
}

/* -------------------- Tabelas de preços -------------------- */

type Prices = { mensal10: number; trimestre3: number; anual1: number; taxaInscricao: number };

// Baby / Mini8 / Mini10
const NS_MINI_LOW: Prices   = { mensal10: 35,  trimestre3: 115, anual1: 330, taxaInscricao: 35 };
const PRO1_MINI_LOW: Prices = { mensal10: 25,  trimestre3: 80,  anual1: 230, taxaInscricao: 35 };
const PRO2_MINI_LOW: Prices = { mensal10: 22.5,trimestre3: 72,  anual1: 205, taxaInscricao: 35 };

// Mini 12 (mensalidades iguais aos SUBS)
const NS_MINI12: Prices   = { mensal10: 45,  trimestre3: 145, anual1: 430, taxaInscricao: 45 };
const PRO1_MINI12: Prices = { mensal10: 35,  trimestre3: 113, anual1: 330, taxaInscricao: 45 };
const PRO2_MINI12: Prices = { mensal10: 31.5,trimestre3: 102, anual1: 295, taxaInscricao: 45 };

// Sub14/Sub16/Sub18
const NS_SUBS: Prices   = { mensal10: 45,  trimestre3: 145, anual1: 430, taxaInscricao: 45 };
const PRO1_SUBS: Prices = { mensal10: 35,  trimestre3: 113, anual1: 330, taxaInscricao: 45 };
const PRO2_SUBS: Prices = { mensal10: 31.5,trimestre3: 102, anual1: 295, taxaInscricao: 45 };

// Sub-23 e Masters — só anuidade/inscrição
const SUB23_ANUIDADE = 160;
const MASTERS_ANUIDADE = 100;

/* -------------------- Helpers -------------------- */

function isSocioPro(tipo?: string | null): boolean {
  return (tipo || "").toLowerCase().includes("pro");
}

/** Deriva o “tier” PRO (1=PRO1, 2=PRO2) com prioridade:
 *  proTier → proRank → (numAtletasAgregado ≥ 2 ? 2 : 1)
 */
function deriveProTier(input: EstimateInput): 1 | 2 {
  if (!isSocioPro(input.tipoSocio)) return 1;
  if (input.proTier === 1 || input.proTier === 2) return input.proTier;
  if (typeof input.proRank === "number") return input.proRank > 0 ? 2 : 1;
  const twoPlus = (input.numAtletasAgregado ?? 1) >= 2;
  return twoPlus ? 2 : 1; // fallback “simpático” para resolver o 2º atleta
}

function choosePrices(band: BandKey, input: EstimateInput): Prices {
  // Sub23 e Masters: só “anuidade”/inscrição (mensal/trimestral = 0)
  if (band === "SUB23")
    return { mensal10: 0, trimestre3: 0, anual1: 0, taxaInscricao: SUB23_ANUIDADE };
  if (band === "MASTERS")
    return { mensal10: 0, trimestre3: 0, anual1: 0, taxaInscricao: MASTERS_ANUIDADE };

  const pro = isSocioPro(input.tipoSocio);
  const tier = deriveProTier(input); // 1 (PRO1) ou 2 (PRO2)

  // Se não for PRO → tabela normal
  if (!pro) {
    switch (band) {
      case "MINI_LOW": return NS_MINI_LOW;
      case "MINI12":   return NS_MINI12;
      case "SUBS":     return NS_SUBS;
      default:         return NS_SUBS;
    }
  }

  // PRO → escolhe PRO1 ou PRO2 consoante tier
  switch (band) {
    case "MINI_LOW": return tier === 2 ? PRO2_MINI_LOW : PRO1_MINI_LOW;
    case "MINI12":   return tier === 2 ? PRO2_MINI12   : PRO1_MINI12;
    case "SUBS":     return tier === 2 ? PRO2_SUBS     : PRO1_SUBS;
    default:         return tier === 2 ? PRO2_SUBS     : PRO1_SUBS;
  }
}

/* -------------------- API principal -------------------- */

export function estimateCosts(input: EstimateInput): EstimateResult {
  const band = classifyEscalao(input.escalao);
  const prices = choosePrices(band, input);

  const onlyAnnual = band === "SUB23" || band === "MASTERS";
  const socioLabel = isSocioPro(input.tipoSocio)
    ? "Sócio PRO"
    : (input.tipoSocio && !/não\s*pretendo/i.test(input.tipoSocio) ? input.tipoSocio! : "Não Sócio");

  return {
    taxaInscricao: prices.taxaInscricao,
    mensal10: prices.mensal10,
    trimestre3: prices.trimestre3,
    anual1: prices.anual1,
    tarifa: `Tarifa ${socioLabel}.`,
    info: `Baseado no tipo de sócio e no agregado (${Math.max(1, input.numAtletasAgregado ?? 1)} atleta(s)).`,
    onlyAnnual,
  };
}

/* -------------------- Valor da inscrição de SÓCIO -------------------- */

const SOCIO_INSCRICAO_MAP: Record<string, number> = {
  "Sócio Pro": 60,
  "Sócio Família": 30,
  "Sócio Geral Renovação": 75,
  "Sócio Geral Novo": 100,
};

export function socioInscricaoAmount(tipo?: string | null): number {
  if (!tipo) return 0;
  return SOCIO_INSCRICAO_MAP[tipo] ?? 0;
}

// src/utils/pricing.ts
export type EstimateInput = {
  escalao: string;
  tipoSocio?: string | null;
  numAtletasAgregado?: number;
  /** posição do atleta dentro dos elegíveis PRO (0 = mais velho, 1 = seguinte, …). */
  proRank?: number;
};


export type EstimateResult = {
  taxaInscricao: number;
  mensal10: number;
  trimestre3: number;
  anual1: number;
  tarifa: string;
  info: string;
  onlyAnnual?: boolean;
};

export function eur(n: number): string {
  return n.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
  });
}

type BandKey = "MINI_LOW" | "MINI12" | "SUBS" | "SUB23" | "MASTERS";

function classifyEscalao(esc: string): BandKey {
  const s = (esc || "").toLowerCase();
  if (s.includes("masters")) return "MASTERS";
  if (s.includes("sub23") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores")) return "SUB23";
  if (s.includes("mini 12")) return "MINI12";
  if (s.includes("baby") || s.includes("mini 8") || s.includes("mini8") || s.includes("mini 10") || s.includes("mini10"))
    return "MINI_LOW";
  if (s.includes("sub 14") || s.includes("sub 16") || s.includes("sub 18")) return "SUBS";
  return "SUBS";
}

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

function isSocioPro(tipo?: string | null): boolean {
  return (tipo || "").toLowerCase().includes("pro");
}

function choosePrices(
  band: BandKey,
  tipoSocio?: string | null,
  numAtletasAgregado: number = 1,
  proRank?: number
): Prices {
  const pro = isSocioPro(tipoSocio);
  const twoPlus = numAtletasAgregado >= 2;

  // Sub23 e Masters: só “anuidade”/inscrição (já definido abaixo)
  if (band === "SUB23") return { mensal10: 0, trimestre3: 0, anual1: 0, taxaInscricao: SUB23_ANUIDADE };
  if (band === "MASTERS") return { mensal10: 0, trimestre3: 0, anual1: 0, taxaInscricao: MASTERS_ANUIDADE };

  // Grupos com mensal/trimestral/anual
  const pick = (p1: Prices, p2: Prices, ns: Prices) => {
    if (!pro) return ns;
    // PRO: se ≥2 atletas elegíveis e proRank definido:
    if (twoPlus && proRank !== undefined && proRank > 0) return p2; // 2º, 3º, …
    return p1; // único PRO ou o 1º (mais velho)
  };

  switch (band) {
    case "MINI_LOW":  return pick(PRO1_MINI_LOW, PRO2_MINI_LOW, NS_MINI_LOW);
    case "MINI12":    return pick(PRO1_MINI12,   PRO2_MINI12,   NS_MINI12);
    case "SUBS":      return pick(PRO1_SUBS,     PRO2_SUBS,     NS_SUBS);
  }
}


export function estimateCosts(input: EstimateInput): EstimateResult {
  const band = classifyEscalao(input.escalao);
  const prices = choosePrices(
    band,
    input.tipoSocio,
    input.numAtletasAgregado ?? 1,
    input.proRank
  );

  const onlyAnnual = band === "SUB23" || band === "MASTERS";
  const socioLabel = isSocioPro(input.tipoSocio)
    ? "Sócio PRO"
    : ((input.tipoSocio && !/não\s*pretendo/i.test(input.tipoSocio)) ? input.tipoSocio! : "Não Sócio");

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


/** ===== NOVO: valor da inscrição de SÓCIO =====
 *  Preenche estes valores conforme a tua tabela de preços de sócios.
 *  Deixei 0 como placeholder para compilar sem “inventar” valores.
 */
const SOCIO_INSCRICAO_MAP: Record<string, number> = {
  "Sócio Pro": 60,               // TODO preencher
  "Sócio Família": 30,           // TODO preencher
  "Sócio Geral Renovação": 75,   // TODO preencher
  "Sócio Geral Novo": 100,        // TODO preencher
};

export function socioInscricaoAmount(tipo?: string | null): number {
  if (!tipo) return 0;
  return SOCIO_INSCRICAO_MAP[tipo] ?? 0;
}

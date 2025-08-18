// src/utils/pricing.ts

export type EstimateInput = {
  escalao: string;                // p.e., "Mini 12 (2014-2015)"
  tipoSocio?: string | null;      // "Sócio Pro" | "Sócio Família" | "Sócio Geral ..." | "Não pretendo ser sócio"
  numAtletasAgregado?: number;    // nº de atletas no agregado (relevante só para Sócio Pro)
};

export type EstimateResult = {
  taxaInscricao: number;   // €
  mensal10: number;        // €
  trimestre3: number;      // €
  anual1: number;          // €
  tarifa: string;          // etiqueta/nota
  info: string;            // detalhe
  onlyAnnual?: boolean;    // Sub-23 / Masters -> só anuidade/inscrição
};

// -------- util --------
export function eur(n: number): string {
  return n.toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n % 1 ? 2 : 0,
  });
}

// -------- bandas por escalão --------
type BandKey = "MINI_LOW" | "MINI12" | "SUBS" | "SUB23" | "MASTERS";

function classifyEscalao(esc: string): BandKey {
  const s = (esc || "").toLowerCase();

  // Masters
  if (s.includes("masters")) return "MASTERS";

  // Sub-23 / Seniores
  if (s.includes("sub23") || s.includes("sub 23") || s.includes("sub-23") || s.includes("seniores"))
    return "SUB23";

  // Mini 12 isolado
  if (s.includes("mini 12")) return "MINI12";

  // Baby/Mini8/Mini10
  if (s.includes("baby") || s.includes("mini 8") || s.includes("mini8") || s.includes("mini 10") || s.includes("mini10"))
    return "MINI_LOW";

  // Sub14/16/18
  if (s.includes("sub 14") || s.includes("sub 16") || s.includes("sub 18"))
    return "SUBS";

  // fallback mais prudente
  return "SUBS";
}

// -------- tabelas declarativas (valores EXACTOS da imagem) --------
// Nota: só “Sócio PRO” altera mensalidades; restantes tratam como “Não Sócio”.

type Prices = { mensal10: number; trimestre3: number; anual1: number; taxaInscricao: number };

// Baby / Mini8 / Mini10 (inscrição 35€)
const NS_MINI_LOW: Prices = { mensal10: 35, trimestre3: 115, anual1: 330, taxaInscricao: 35 };  // Não Sócio
const PRO1_MINI_LOW: Prices = { mensal10: 25, trimestre3: 80,  anual1: 230, taxaInscricao: 35 }; // Sócio PRO, 1 atleta
const PRO2_MINI_LOW: Prices = { mensal10: 22.5, trimestre3: 72, anual1: 205, taxaInscricao: 35 }; // Sócio PRO, >=2

// Mini 12 (inscrição 45€) — atenção: NÃO igual a “restantes mini”; é igual aos SUBS nas mensalidades
const NS_MINI12: Prices   = { mensal10: 45, trimestre3: 145, anual1: 430, taxaInscricao: 45 };
const PRO1_MINI12: Prices = { mensal10: 35, trimestre3: 113, anual1: 330, taxaInscricao: 45 };
const PRO2_MINI12: Prices = { mensal10: 31.5, trimestre3: 102, anual1: 295, taxaInscricao: 45 };

// Sub14/Sub16/Sub18 (inscrição 45€)
const NS_SUBS: Prices   = { mensal10: 45, trimestre3: 145, anual1: 430, taxaInscricao: 45 };
const PRO1_SUBS: Prices = { mensal10: 35, trimestre3: 113, anual1: 330, taxaInscricao: 45 };
const PRO2_SUBS: Prices = { mensal10: 31.5, trimestre3: 102, anual1: 295, taxaInscricao: 45 };

// Sub-23 e Masters — só “anuidade/inscrição”
const SUB23_ANUIDADE = 160;
const MASTERS_ANUIDADE = 100;

// -------- selecção por tipo de sócio --------
function isSocioPro(tipo?: string | null): boolean {
  return (tipo || "").toLowerCase().includes("pro");
}

function choosePrices(band: BandKey, tipoSocio?: string | null, numAtletasAgregado = 1): Prices {
  const pro = isSocioPro(tipoSocio);
  const twoPlus = numAtletasAgregado >= 2;

  switch (band) {
    case "MINI_LOW":
      if (pro) return twoPlus ? PRO2_MINI_LOW : PRO1_MINI_LOW;
      return NS_MINI_LOW;

    case "MINI12":
      if (pro) return twoPlus ? PRO2_MINI12 : PRO1_MINI12;
      return NS_MINI12;

    case "SUBS":
      if (pro) return twoPlus ? PRO2_SUBS : PRO1_SUBS;
      return NS_SUBS;

    case "SUB23":
      // devolvemos campos “preenchidos” para uniformizar a UI, mas só interessa a anual/inscrição
      return { mensal10: 0, trimestre3: 0, anual1: SUB23_ANUIDADE, taxaInscricao: SUB23_ANUIDADE };

    case "MASTERS":
      return { mensal10: 0, trimestre3: 0, anual1: MASTERS_ANUIDADE, taxaInscricao: MASTERS_ANUIDADE };
  }
}

// -------- estimador principal --------
export function estimateCosts(input: EstimateInput): EstimateResult {
  const band = classifyEscalao(input.escalao);
  const prices = choosePrices(band, input.tipoSocio, input.numAtletasAgregado ?? 1);

  const onlyAnnual = band === "SUB23" || band === "MASTERS";
  const socioLabel = isSocioPro(input.tipoSocio) ? "Sócio PRO" :
    ((input.tipoSocio && !/não\s*pretendo/i.test(input.tipoSocio)) ? input.tipoSocio! : "Não Sócio");

  return {
    taxaInscricao: prices.taxaInscricao,
    mensal10: prices.mensal10,
    trimestre3: prices.trimestre3,
    anual1: prices.anual1,
    tarifa: `Tarifa ${socioLabel}.`,
    info: `Baseado no tipo de sócio e no agregado ( ${Math.max(1, input.numAtletasAgregado ?? 1)} atleta(s) ).`,
    onlyAnnual,
  };
}

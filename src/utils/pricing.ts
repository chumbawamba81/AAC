// src/utils/pricing.ts

export type EstimateInput = {
  /** Escalão textual (ex.: "Mini 10 (2016-2017)", "Sub 14 feminino (2012-2013)", "Masters (<1995)", etc.) */
  escalao: string;
  /** Tipo de sócio como vem do perfil (ex.: "Sócio Pro", "Sócio Família", "Sócio Geral Renovação", "Sócio Geral Novo", "Não pretendo ser sócio") */
  tipoSocio?: string | null;
  /** Nº de atletas no agregado (se quiseres usar mais tarde descontos por agregado) */
  numAtletasAgregado?: number;
};

export type EstimateResult = {
  taxaInscricao: number;
  mensal10: number;   // 10 prestações
  trimestre3: number; // 3 prestações
  anual1: number;     // 1 prestação
  tarifa: string;     // "Tarifa Sócio", "Tarifa Sócio Família", "Tarifa Não Sócio"
  info: string;       // ex.: "Baseado no tipo de sócio — e em 1 atleta(s) no agregado."
};

function isMiniBand(escalao: string): boolean {
  const s = (escalao || "").toLowerCase();
  return s.includes("baby") || s.includes("mini 10") || s.includes("mini 12");
}

function socioCategoria(tipo?: string | null): "NAO_SOCIO" | "SOCIO" | "SOCIO_FAMILIA" {
  const t = (tipo || "").toLowerCase();
  if (!t || t.includes("não pretendo")) return "NAO_SOCIO";
  if (t.includes("família") || t.includes("familia")) return "SOCIO_FAMILIA";
  // Pro, Geral Novo, Geral Renovação, etc. tratam como "Sócio"
  return "SOCIO";
}

export function eur(n: number): string {
  return `${n.toFixed(Number.isInteger(n) ? 0 : 2)} €`.replace(".", ",");
}

/**
 * Regras de preço (ver descrição no pedido).
 * Podes ajustar os números aqui sem tocar no resto da app.
 */
export function estimateCosts(input: EstimateInput): EstimateResult {
  const mini = isMiniBand(input.escalao);
  const cat = socioCategoria(input.tipoSocio);
  const n = Math.max(1, Math.floor(input.numAtletasAgregado || 1));

  // Tabela base por banda e categoria
  const base = (() => {
    if (mini) {
      switch (cat) {
        case "SOCIO":
          return { mensal10: 25, trimestre3: 80, anual1: 230, taxa: 35, tarifa: "Tarifa Sócio" as const };
        case "SOCIO_FAMILIA":
          return { mensal10: 22.5, trimestre3: 72, anual1: 205, taxa: 35, tarifa: "Tarifa Sócio Família" as const };
        default:
          return { mensal10: 35, trimestre3: 113, anual1: 330, taxa: 35, tarifa: "Tarifa Não Sócio" as const };
      }
    } else {
      switch (cat) {
        case "SOCIO":
          return { mensal10: 35, trimestre3: 115, anual1: 330, taxa: 45, tarifa: "Tarifa Sócio" as const };
        case "SOCIO_FAMILIA":
          return { mensal10: 31.5, trimestre3: 102, anual1: 295, taxa: 45, tarifa: "Tarifa Sócio Família" as const };
        default:
          return { mensal10: 45, trimestre3: 145, anual1: 430, taxa: 45, tarifa: "Tarifa Não Sócio" as const };
      }
    }
  })();

  return {
    taxaInscricao: Number(base.taxa),
    mensal10: Number(base.mensal10),
    trimestre3: Number(base.trimestre3),
    anual1: Number(base.anual1),
    tarifa: base.tarifa,
    info: `Baseado no tipo de sócio — e em ${n} atleta(s) no agregado.`,
  };
}

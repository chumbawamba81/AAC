// src/utils/pricing.ts

export type SocioTipo =
  | "Sócio Pro"
  | "Sócio Família"
  | "Sócio Geral Renovação"
  | "Sócio Geral Novo"
  | "Não pretendo ser sócio";

export type Plano = "Mensal" | "Trimestral" | "Anual";

export type EstimateArgs = {
  escalao?: string | null;
  tipoSocio?: string | null;            // usa o que vier do perfil
  plano?: string | null;                // plano escolhido no atleta
  numAtletasAgregado?: number | null;   // opcional, para mensagem informativa
};

export type EstimateResult = {
  taxaInscricao: number;   // € (por atleta)
  mensal10: number;        // € por mês (10x)
  trimestre3: number;      // € por trimestre (3x)
  anual1: number;          // € pagamento único
  tarifa: string;          // "Tarifa Sócio" ou "Tarifa Não Sócio"
  info: string;            // mensagem contextual
};

/** Decide se o tipoSocio configura "Tarifa Sócio" */
function isSocio(tipo?: string | null): boolean {
  if (!tipo) return false;
  return tipo !== "Não pretendo ser sócio";
}

/** Escalões que têm taxa de inscrição 35 € */
function taxaInscricaoPorEscalao(escalao?: string | null): number {
  const s = (escalao || "").toLowerCase();
  if (s.includes("baby")) return 35;
  if (s.includes("mini 10") || s.includes("mini-10")) return 35;
  if (s.includes("mini 12") || s.includes("mini-12")) return 35;
  // (se quiseres incluir Mini 8 aqui, muda para 35)
  return 45;
}

/**
 * Tabelas base (placeholder) — ajusta se necessário:
 *  - Sócio: 35 / 115 / 330
 *  - Não Sócio: 45 / 145 / 430
 * Mantemos iguais para todos os escalões, apenas a taxa de inscrição varia (35 ou 45).
 */
const SOCIO_BASE = { mensal10: 35, trimestre3: 115, anual1: 330 } as const;
const NAO_SOCIO_BASE = { mensal10: 45, trimestre3: 145, anual1: 430 } as const;

/**
 * estimateCosts
 * Calcula uma estimativa a partir do tipo de sócio e do escalão.
 * Devolve sempre os três valores (mensal10, trimestre3, anual1) para que a UI mostre
 * conforme o plano selecionado; não usamos literais “const” no return para evitar erros TS.
 */
export function estimateCosts(args: EstimateArgs): EstimateResult {
  const { escalao, tipoSocio, numAtletasAgregado } = args || {};
  const socio = isSocio(tipoSocio);

  const base = socio ? SOCIO_BASE : NAO_SOCIO_BASE;
  const taxa = taxaInscricaoPorEscalao(escalao);

  const res: EstimateResult = {
    taxaInscricao: Number(taxa),
    mensal10: Number(base.mensal10),
    trimestre3: Number(base.trimestre3),
    anual1: Number(base.anual1),
    tarifa: socio ? "Tarifa Sócio" : "Tarifa Não Sócio",
    info:
      `Baseado no tipo de sócio — e em ${Number(numAtletasAgregado || 1)} atleta(s) no agregado.`,
  };

  return res;
}

/** (Opcional) helper para formatar em euros */
export function eur(v: number): string {
  return `${v.toFixed(0)} €`;
}

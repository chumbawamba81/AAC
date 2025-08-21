// src/utils/pricing.ts

// Normaliza designação de escalão (minúsculas + remove separadores)
export const normalizaEscalao = (s?: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Escalões que NÃO têm quotas (apenas taxa de inscrição)
const ESCALOES_SEM_QUOTAS = new Set(["masters", "master", "sub23"]);

// Regra principal: tem (true) / não tem (false) quotas
export const hasQuotas = (escalao?: string | null): boolean =>
  !ESCALOES_SEM_QUOTAS.has(normalizaEscalao(escalao));

// Slots de quotas por plano quando existem quotas
export type PlanoPagamento = "Mensal" | "Trimestral" | "Anual";

export const quotasSlotsForPlano = (
  plano: PlanoPagamento,
  escalao?: string | null
): number => {
  if (!hasQuotas(escalao)) return 0;
  if (plano === "Mensal") return 10;
  if (plano === "Trimestral") return 3;
  return 1; // Anual
};

// Etiquetas por slot de quota (quando existem quotas)
export const quotaLabel = (plano: PlanoPagamento, idx: number): string => {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
};

// Preço de cada quota (em cêntimos). Para Masters/Sub-23 → 0.
export const quotaAmountCents = (escalao?: string | null): number =>
  hasQuotas(escalao) ? 1500 /* 15,00 € por quota (exemplo) */ : 0;

// Cálculo simples de custos previstos (só para resumo/estimativa na UI)
export const estimateCosts = (args: {
  escalao?: string | null;
  tipoSocio?: string | null;
  numAtletasAgregado?: number;
}) => {
  const { escalao } = args;
  const quotas = hasQuotas(escalao);
  const quotaUnitCents = quotaAmountCents(escalao);
  return {
    quotas,
    quotaUnitCents,
    // podes estender aqui se precisares (e.g., descontos de agregado, etc.)
  };
};

// Formatação € a partir de cêntimos
export const eur = (cents?: number | null): string => {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
};

// Valor da inscrição de sócio, dependente do tipo de sócio (exemplo)
export const socioInscricaoAmount = (tipoSocio?: string | null): number => {
  if (!tipoSocio || /não\s*pretendo/i.test(tipoSocio)) return 0;
  // exemplo de tabela simples
  return 1500; // 15,00 €
};

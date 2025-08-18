// src/utils/pricing.ts
// Estimador de custos: inscrição + mensalidades/trimestre/anual
// Cruza escalão, tipo de sócio e nº de atletas no agregado.

// Tipos leves (evitam dependências cruzadas)
export type TipoSocio =
  | "Sócio Pro"
  | "Sócio Família"
  | "Sócio Geral Renovação"
  | "Sócio Geral Novo"
  | "Não pretendo ser sócio";

export type FormaPagamento = "Mensal" | "Trimestral" | "Anual";

export type Estimativa = {
  inscricao: number;                    // taxa de inscrição (€)
  mensal10: number | null;              // 10 prestações (se aplicável)
  trimestre3: number | null;            // 3 prestações (se aplicável)
  anual1: number | null;                // 1 prestação (se aplicável)
  observacoes?: string[];               // notas (ex.: Sub23/Masters sem tabela)
  detalhes: {
    grupo: "A" | "B" | "Especial";     // mapeamento tarifário
    proComDesconto: boolean;           // se “Sócio Pro”
    multiAtleta: boolean;              // se “2 ou + atletas” (quando Pro)
  };
};

// ---------- Helpers ----------

export const isSocioPro = (t?: string | null): boolean =>
  (t || "").toLowerCase().trim() === "sócio pro";

// Normaliza a string do escalão para agrupar
function toKey(escalao?: string | null): string {
  return (escalao || "").toLowerCase();
}

// Grupo A (tabela “faixa baixa”):
// Baby Basket, Mini 8, Mini 10
function isGrupoA(escalao?: string | null): boolean {
  const s = toKey(escalao);
  return s.includes("baby") || s.includes("mini 8") || s.includes("mini 10");
}

// Grupo B (tabela “faixa média”):
// Mini 12, Sub 14, Sub 16, Sub 18
function isGrupoB(escalao?: string | null): boolean {
  const s = toKey(escalao);
  return (
    s.includes("mini 12") ||
    s.includes("sub 14") ||
    s.includes("sub 16") ||
    s.includes("sub 18")
  );
}

// Escalões especiais (sem grelha de mensalidades na imagem)
function isSub23(escalao?: string | null): boolean {
  return toKey(escalao).includes("sub 23");
}
function isMasters(escalao?: string | null): boolean {
  return toKey(escalao).includes("masters");
}

// Taxa de inscrição por escalão (conforme pedido)
export function inscricaoPorEscalao(escalao?: string | null): number {
  if (isSub23(escalao)) return 160;
  if (isMasters(escalao)) return 100;
  if (isGrupoA(escalao)) return 35;                // Baby, Mini 8, Mini 10
  if (isGrupoB(escalao)) return  escaloEh("mini 12", escalao) ? 35 : 45;
  // fallback: se “Fora de escalões”, 0
  return 0;
}
function escaloEh(fragmento: string, escalao?: string | null) {
  return toKey(escalao).includes(fragmento);
}

// ---------- Tabelas de preços (mensal/trimestral/anual) ----------
// Valores retirados das imagens:
// - “Atleta + EE Sócio PRO” (1 atleta vs 2+ atletas)
// - “Atleta + EE Não Sócio”
const GRUPO_A = {
  pro_1:      { mensal10: 25.0,  trimestre3: 80.0,  anual1: 230.0 },
  pro_2mais:  { mensal10: 22.5,  trimestre3: 72.0,  anual1: 205.0 },
  naoSocio:   { mensal10: 35.0,  trimestre3: 115.0, anual1: 330.0 },
} as const;

const GRUPO_B = {
  pro_1:      { mensal10: 35.0,  trimestre3: 113.0, anual1: 330.0 },
  pro_2mais:  { mensal10: 31.5,  trimestre3: 102.0, anual1: 295.0 },
  naoSocio:   { mensal10: 45.0,  trimestre3: 145.0, anual1: 430.0 },
} as const;

// ---------- API principal ----------

export function estimarCusto({
  escalao,
  tipoSocio,
  totalAtletasNoAgregado = 1,
}: {
  escalao?: string | null;
  tipoSocio?: string | null;
  totalAtletasNoAgregado?: number;
}): Estimativa {
  const pro = isSocioPro(tipoSocio);
  const multi = pro && totalAtletasNoAgregado >= 2;

  // Inscrição
  const inscricao = inscricaoPorEscalao(escalao);

  // Sub23/Masters → sem grelha de mensalidades na imagem (apenas inscrição)
  if (isSub23(escalao) || isMasters(escalao)) {
    const obs: string[] = [];
    obs.push(
      "Para Sub 23 / Masters a imagem só apresenta a Taxa de Inscrição; o valor de mensalidades/anual não está definido na grelha."
    );
    return {
      inscricao,
      mensal10: null,
      trimestre3: null,
      anual1: null,
      observacoes: obs,
      detalhes: { grupo: "Especial", proComDesconto: pro, multiAtleta: multi },
    };
  }

  // Grupo tarifário
  let tabela: typeof GRUPO_A[keyof typeof GRUPO_A];
  let grupo: "A" | "B";
  if (isGrupoA(escalao)) {
    grupo = "A";
    if (pro) tabela = multi ? GRUPO_A.pro_2mais : GRUPO_A.pro_1;
    else tabela = GRUPO_A.naoSocio;
  } else if (isGrupoB(escalao) || escaloEh("mini 12", escalao)) {
    // Nota: Mini 12 usa preços do Grupo B, mas inscrição 35 €
    grupo = "B";
    if (pro) tabela = multi ? GRUPO_B.pro_2mais : GRUPO_B.pro_1;
    else tabela = GRUPO_B.naoSocio;
  } else {
    // Desconhecido → zeros
    return {
      inscricao,
      mensal10: null,
      trimestre3: null,
      anual1: null,
      detalhes: { grupo: "A", proComDesconto: pro, multiAtleta: multi },
      observacoes: ["Escalão desconhecido para tabela de mensalidades."],
    };
  }

  return {
    inscricao,
    mensal10: tabela.mensal10,
    trimestre3: tabela.trimestre3,
    anual1: tabela.anual1,
    detalhes: { grupo, proComDesconto: pro, multiAtleta: multi },
  };
}

// Pequeno formatter útil no UI
export function formatEUR(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(v);
}

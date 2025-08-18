/**
 * Estimativas de custos de acordo com a tabela 2025-26.
 * Regras usadas:
 *  - Grupo A (Baby Basket, Mini 8, Mini 10) – inscrições 35€; PRO: 25/80/230; 2+ atletas: 22.5/72/205; Não sócio: 35/115/330
 *  - Grupo B (Mini 12, Sub 14, Sub 16, Sub 18) – inscrições 35€ (override pedido); PRO: 35/113/330; 2+ atletas: 31.5/102/295; Não sócio: 45/145/430
 *  - Sub 23 e Masters: inscrição 160€ e 100€ respetivamente; valores de mensalidades não estão definidos na grelha → 0 e nota.
 */

export type Estimativa = {
  inscricao: number;
  mensal10: number;
  trimestre3: number;
  anual1: number;
  observacoes?: string[];
};

export function formatEUR(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function isPro(tipoSocio?: string | null): boolean {
  if (!tipoSocio) return false;
  const s = tipoSocio.toLowerCase();
  return s.includes("pro"); // “Sócio Pro”
}

function grupo(escalao: string): "A" | "B" | "SUB23" | "MASTERS" | "OUTRO" {
  const e = escalao.toLowerCase();
  if (e.includes("baby") || e.includes("mini 8") || e.includes("mini 10"))
    return "A";
  if (
    e.includes("mini 12") ||
    e.includes("sub 14") ||
    e.includes("sub 16") ||
    e.includes("sub 18")
  )
    return "B";
  if (e.includes("sub 23")) return "SUB23";
  if (e.includes("masters")) return "MASTERS";
  return "OUTRO";
}

export function estimarCusto(args: {
  escalao: string;
  tipoSocio: string;
  totalAtletasNoAgregado: number;
}): Estimativa {
  const g = grupo(args.escalao);
  const pro = isPro(args.tipoSocio);
  const multi = args.totalAtletasNoAgregado >= 2;

  const out: Estimativa = {
    inscricao: 0,
    mensal10: 0,
    trimestre3: 0,
    anual1: 0,
    observacoes: [],
  };

  if (g === "A") {
    out.inscricao = 35;
    if (pro) {
      if (multi) {
        out.mensal10 = 22.5;
        out.trimestre3 = 72;
        out.anual1 = 205;
        out.observacoes!.push("Desconto PRO (2 ou + atletas).");
      } else {
        out.mensal10 = 25;
        out.trimestre3 = 80;
        out.anual1 = 230;
        out.observacoes!.push("Tarifa PRO (1 atleta).");
      }
    } else {
      out.mensal10 = 35;
      out.trimestre3 = 115;
      out.anual1 = 330;
      out.observacoes!.push("Tarifa Não Sócio.");
    }
  } else if (g === "B") {
    // override pedido: Mini 12 com 35€
    out.inscricao =
      args.escalao.toLowerCase().includes("mini 12") ? 35 : 45;

    if (pro) {
      if (multi) {
        out.mensal10 = 31.5;
        out.trimestre3 = 102;
        out.anual1 = 295;
        out.observacoes!.push("Desconto PRO (2 ou + atletas).");
      } else {
        out.mensal10 = 35;
        out.trimestre3 = 113; // << 113 (não 115) conforme grelha
        out.anual1 = 330;
        out.observacoes!.push("Tarifa PRO (1 atleta).");
      }
    } else {
      out.mensal10 = 45;
      out.trimestre3 = 145;
      out.anual1 = 430;
      out.observacoes!.push("Tarifa Não Sócio.");
    }
  } else if (g === "SUB23") {
    out.inscricao = 160;
    out.observacoes!.push(
      "Para Sub-23 a anuidade é obrigatória; valores de mensalidades na grelha não especificados."
    );
  } else if (g === "MASTERS") {
    out.inscricao = 100;
    out.observacoes!.push(
      "Para Masters a anuidade é obrigatória; valores de mensalidades na grelha não especificados."
    );
  } else {
    out.observacoes!.push("Escalão fora de tabela. Valores não definidos.");
  }

  // limpeza de observações vazias
  if (!out.observacoes!.length) delete out.observacoes;

  return out;
}

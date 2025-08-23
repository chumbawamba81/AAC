import React, { useMemo, useState } from "react";
import type { AdminPagamento } from "./services/adminPagamentosService";
import { marcarPagamentoValidado } from "./services/adminPagamentosService";

type Tab = "inscricao" | "mensalidades";

type Props = {
  rows: AdminPagamento[];
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onOpen: (row: AdminPagamento) => void; // compat
  onChanged?: () => void;
  // NOVO: contagens para mostrar nas tabs (aplicam pesquisa + filtro de estado)
  inscricoesCount?: number;
  mensalidadesCount?: number;
};

function StatusBadge({ status }: { status: AdminPagamento["status"] }) {
  const map: Record<AdminPagamento["status"], string> = {
    "Regularizado": "bg-green-100 text-green-800",
    "Pendente de validação": "bg-yellow-100 text-yellow-800",
    "Por regularizar": "bg-gray-100 text-gray-800",
    "Em atraso": "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(d: string | null | undefined, withTime = true) {
  if (!d) return "—";
  const date = new Date(d);
  try {
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  } catch {
    return withTime ? date.toISOString() : date.toISOString().slice(0, 10);
  }
}

/** Heurística local para separar inscrição vs mensalidades (para fallback de contagens, se necessário) */
function isInscricao(row: AdminPagamento): boolean {
  if (row.nivel === "socio") return true;
  const t = (row.tipo ?? "").toLowerCase();
  if (t.includes("inscri")) return true;
  return (row.descricao ?? "").toLowerCase().includes("inscri");
}

/** Plano inativo para sócio ou sénior sub-23 / masters */
function isPlanoInativo(nivel: AdminPagamento["nivel"], escalao?: string | null) {
  if (nivel === "socio") return true;
  const e = (escalao || "").toLowerCase();
  return (
    e.includes("master") ||
    e.includes("masters") ||
    e.includes("sub 23") ||
    e.includes("sub-23") ||
    e.includes("seniores sub 23") ||
    e.includes("seniores sub-23")
  );
}

function TableView({
  rows,
  onChanged,
}: {
  rows: AdminPagamento[];
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(row: AdminPagamento, next: boolean) {
    try {
      setBusyId(row.id);
      await marcarPagamentoValidado(row.id, next);
      onChanged?.();
    } catch (e: any) {
      alert(e?.message || "Não foi possível alterar a validação.");
    } finally {
      setBusyId(null);
    }
  }

  if (!rows || rows.length === 0) {
    return <div className="text-sm text-gray-500">Sem pagamentos nesta categoria.</div>;
  }

  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="text-left px-3 py-2">Submissão</th>
            <th className="text-left px-3 py-2">Titular/EE</th>
            <th className="text-left px-3 py-2">Atleta</th>
            <th className="text-left px-3 py-2">Escalão</th>
            <th className="text-left px-3 py-2">Plano de Pagamento</th>
            <th className="text-left px-3 py-2">Descrição</th>
            <th className="text-left px-3 py-2">Estado</th>
            <th className="text-right px-3 py-2">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const planoInativo = isPlanoInativo(r.nivel, r.atletaEscalao);
            const planoLabel = r.atletaPlano || "—";
            return (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">{r.titularName || "—"}</td>
                <td className="px-3 py-2">{r.atletaNome ?? "—"}</td>
                <td className="px-3 py-2">{r.atletaEscalao || "—"}</td>
                <td className={`px-3 py-2 ${planoInativo ? "text-gray-400 italic" : ""}`}>
                  {planoInativo ? "—" : planoLabel}
                </td>
                <td className="px-3 py-2">{r.descricao}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    {r.signedUrl ? (
                      <a
                        className="px-2 py-1 rounded-lg border hover:bg-gray-100"
                        href={r.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir comprovativo
                      </a>
                    ) : null}

                    <button
                      disabled={busyId === r.id}
                      className={`px-2 py-1 rounded-lg text-xs ${
                        r.validado
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      onClick={() => toggle(r, !r.validado)}
                    >
                      {r.validado ? "Anular" : "Validar"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentsTable({
  rows,
  tab,
  onTabChange,
  onOpen: _onOpen,
  onChanged,
  inscricoesCount,
  mensalidadesCount,
}: Props) {
  // fallback para contagens se não vierem do parent (divide localmente o subset)
  const { inscricoes, mensalidades } = useMemo(() => {
    const insc: AdminPagamento[] = [];
    const mens: AdminPagamento[] = [];
    for (const r of rows ?? []) {
      (isInscricao(r) ? insc : mens).push(r);
    }
    return { inscricoes: insc, mensalidades: mens };
  }, [rows]);

  const countInsc = typeof inscricoesCount === "number" ? inscricoesCount : inscricoes.length;
  const countMens = typeof mensalidadesCount === "number" ? mensalidadesCount : mensalidades.length;

  return (
    <div className="space-y-3">
      {/* Tabs controladas pelo parent com contagens globais (pós-filtro/pesquisa) */}
      <div className="inline-flex rounded-xl border overflow-hidden">
        <button
          onClick={() => onTabChange("inscricao")}
          className={`px-4 py-2 text-sm ${tab === "inscricao" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Inscrições ({countInsc})
        </button>
        <button
          onClick={() => onTabChange("mensalidades")}
          className={`px-4 py-2 text-sm ${tab === "mensalidades" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Mensalidades ({countMens})
        </button>
      </div>

      <TableView rows={rows} onChanged={onChanged} />
    </div>
  );
}

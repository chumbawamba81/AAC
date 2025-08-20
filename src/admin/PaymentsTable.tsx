// src/admin/PaymentsTable.tsx
import React, { useMemo, useState } from "react";
import type { AdminPagamento } from "./services/adminPagamentosService";
import { marcarPagamentoValidado } from "./services/adminPagamentosService";

type Tab = "inscricao" | "mensalidades";

type Props = {
  rows: AdminPagamento[];
  tab: Tab;                      // controlada pelo parent
  onTabChange: (t: Tab) => void; // setter vindo do parent
  onOpen: (row: AdminPagamento) => void; // (já não usado, mas mantido para compat)
  onChanged?: () => void;
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

/** Heurística local para separar inscrição vs mensalidades */
function isInscricao(row: AdminPagamento): boolean {
  if (row.nivel === "socio") return true;
  const t = (row.tipo ?? "").toLowerCase();
  if (t.includes("inscri")) return true;
  return (row.descricao ?? "").toLowerCase().includes("inscri");
}

/** Escalão+Género: "Sub-14 Masculino" */
function fmtEscalaoGenero(escalao?: string | null, genero?: string | null) {
  if (!escalao && !genero) return "—";
  if (escalao && genero) return `${escalao} ${genero}`;
  return (escalao ?? genero) || "—";
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
            <th className="text-left px-3 py-2">Escalão e Género</th>
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
                <td className="px-3 py-2">{fmtEscalaoGenero(r.atletaEscalao, r.atletaGenero)}</td>
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

export default function PaymentsTable({ rows, tab, onTabChange, onOpen: _onOpen, onChanged }: Props) {
  const { inscricoes, mensalidades } = useMemo(() => {
    const insc: AdminPagamento[] = [];
    const mens: AdminPagamento[] = [];
    for (const r of rows ?? []) {
      (isInscricao(r) ? insc : mens).push(r);
    }
    return { inscricoes: insc, mensalidades: mens };
  }, [rows]);

  const current = tab === "inscricao" ? inscricoes : mensalidades;

  return (
    <div className="space-y-3">
      {/* Separador (tabs controladas pelo parent) */}
      <div className="inline-flex rounded-xl border overflow-hidden">
        <button
          onClick={() => onTabChange("inscricao")}
          className={`px-4 py-2 text-sm ${tab === "inscricao" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Inscrições ({inscricoes.length})
        </button>
        <button
          onClick={() => onTabChange("mensalidades")}
          className={`px-4 py-2 text-sm ${tab === "mensalidades" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Mensalidades ({mensalidades.length})
        </button>
      </div>

      <TableView rows={current} onChanged={onChanged} />
    </div>
  );
}

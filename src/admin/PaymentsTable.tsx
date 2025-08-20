// src/admin/PaymentsTable.tsx
import React, { useMemo, useState } from "react";
import type { AdminPagamento } from "./services/adminPagamentosService";
import { marcarPagamentoValidado } from "./services/adminPagamentosService";

type Props = {
  rows: AdminPagamento[];
  onOpen: (row: AdminPagamento) => void;
  onChanged?: () => void;
};

function StatusBadge({ status }: { status: AdminPagamento["status"] }) {
  const map: Record<AdminPagamento["status"], string> = {
    validado: "bg-green-100 text-green-800",
    pendente: "bg-yellow-100 text-yellow-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status === "validado" ? "Validado" : "Pendente"}
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
  // Se tiver "nivel" socio, geralmente é inscrição/quotas
  if (row.nivel === "socio") return true;

  // Se tiver `tipo` (quando presente no serviço), aproveita
  const t = (row.tipo ?? "").toLowerCase();
  if (t.includes("inscri")) return true;

  // Caso contrário, usa descrição
  const d = (row.descricao ?? "").toLowerCase();
  return d.includes("inscri");
}

function TableView({
  rows,
  onOpen,
  onChanged,
}: {
  rows: AdminPagamento[];
  onOpen: (row: AdminPagamento) => void;
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
            <th className="text-left px-3 py-2">Vencimento</th>
            <th className="text-left px-3 py-2">Titular/EE</th>
            <th className="text-left px-3 py-2">Atleta</th>
            <th className="text-left px-3 py-2">Descrição</th>
            <th className="text-left px-3 py-2">Estado</th>
            <th className="text-right px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.devidoEm ?? null, false)}</td>
              <td className="px-3 py-2">{r.titularName || "—"}</td>
              <td className="px-3 py-2">{r.atletaNome ?? "—"}</td>
              <td className="px-3 py-2">{r.descricao}</td>
              <td className="px-3 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2 justify-end">
                  {r.signedUrl && (
                    <a
                      className="px-2 py-1 rounded-lg border hover:bg-gray-100"
                      href={r.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir comprovativo
                    </a>
                  )}

                  <button
                    className="px-2 py-1 rounded-lg border hover:bg-gray-100"
                    onClick={() => onOpen(r)}
                  >
                    Detalhes
                  </button>

                  <div className="inline-flex rounded-lg overflow-hidden border">
                    <button
                      disabled={busyId === r.id}
                      className={`px-2 py-1 text-xs ${r.validado ? "bg-white" : "bg-green-600 text-white hover:bg-green-700"}`}
                      onClick={() => toggle(r, true)}
                    >
                      Validar
                    </button>
                    <button
                      disabled={busyId === r.id}
                      className={`px-2 py-1 text-xs ${!r.validado ? "bg-white" : "bg-red-600 text-white hover:bg-red-700"}`}
                      onClick={() => toggle(r, false)}
                    >
                      Anular
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentsTable({ rows, onOpen, onChanged }: Props) {
  const [tab, setTab] = useState<"inscricao" | "mensalidades">("inscricao");

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
      {/* Separador (tabs simples) */}
      <div className="inline-flex rounded-xl border overflow-hidden">
        <button
          onClick={() => setTab("inscricao")}
          className={`px-4 py-2 text-sm ${tab === "inscricao" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Inscrições ({inscricoes.length})
        </button>
        <button
          onClick={() => setTab("mensalidades")}
          className={`px-4 py-2 text-sm ${tab === "mensalidades" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
        >
          Mensalidades ({mensalidades.length})
        </button>
      </div>

      <TableView rows={current} onOpen={onOpen} onChanged={onChanged} />
    </div>
  );
}

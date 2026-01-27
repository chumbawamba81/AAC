import React, { useEffect, useState } from "react";
import {
  listPagamentosAdmin,
  marcarPagamentoValidado,
  type AdminPagamento,
} from "../services/adminPagamentosService";

function StatusBadge({ status }: { status: AdminPagamento["status"] }) {
  const map: Record<AdminPagamento["status"], string> = {
    "Regularizado": "bg-green-50 text-green-700 inset-ring-green-600/20",
    "Pendente de validação": "bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20",
    "Por regularizar": "bg-gray-50 text-gray-600 inset-ring-gray-500/10",
    "Em atraso": "bg-red-50 text-red-700 inset-ring-red-600/10",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring ${map[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${h}:${min}`;
  } catch {
    return "—";
  }
}

type SortColumn = "data" | "atleta" | "descricao" | "estado";
type SortDir = "asc" | "desc";

export default function ListPayments() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir(col === "data" ? "desc" : "asc");
    }
  }

  function sortRows(list: AdminPagamento[]) {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "data") {
        const ta = a.createdAt ?? "";
        const tb = b.createdAt ?? "";
        cmp = ta.localeCompare(tb);
      } else if (sortColumn === "atleta") {
        const na = (a.atletaNome ?? "").trim().toLowerCase();
        const nb = (b.atletaNome ?? "").trim().toLowerCase();
        cmp = na.localeCompare(nb);
      } else if (sortColumn === "descricao") {
        const da = (a.descricao ?? "").trim().toLowerCase();
        const db = (b.descricao ?? "").trim().toLowerCase();
        cmp = da.localeCompare(db);
      } else {
        cmp = (a.status ?? "").localeCompare(b.status ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await listPagamentosAdmin("todos" as any);
      setRows(data);
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? (e as Error).message : "Falha a carregar pagamentos";
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(row: AdminPagamento, next: boolean) {
    try {
      setBusyId(row.id);
      const updated = await marcarPagamentoValidado(row.id, next);
      if (updated) {
        setRows((prevRows) =>
          prevRows.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  validado: updated.validado,
                  status: updated.status,
                  validadoEm: updated.validadoEm,
                  validadoPor: updated.validadoPor,
                }
              : r
          )
        );
      }
    } catch (e: any) {
      alert(e?.message || "Não foi possível alterar a validação.");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Lista de Pagamentos</h1>
        <div className="text-sm text-gray-500">A carregar…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lista de Pagamentos</h1>
        <button
          type="button"
          className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
          onClick={refresh}
        >
          Atualizar
        </button>
      </div>

      <div className="overflow-x-auto border">
      <table className="min-w-[1120px] w-full text-sm">
          <thead>
            <tr className="bg-neutral-700 text-white uppercase">
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("data")}
                  className="flex items-center gap-1 hover:text-gray-300 focus:outline-none focus:underline"
                >
                  Data
                  {sortColumn === "data" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("atleta")}
                  className="flex items-center gap-1 hover:text-gray-300 focus:outline-none focus:underline"
                >
                  Atleta/sócio
                  {sortColumn === "atleta" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">Escalão</th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("descricao")}
                  className="flex items-center gap-1 hover:text-gray-300 focus:outline-none focus:underline"
                >
                  Descrição
                  {sortColumn === "descricao" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("estado")}
                  className="flex items-center gap-1 hover:text-gray-300 focus:outline-none focus:underline"
                >
                  Estado
                  {sortColumn === "estado" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-3 py-2 font-medium">Ficheiro</th>
              <th className="text-left px-3 py-2 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(() => {
              const filtered = rows.filter((r) => r.status !== "Por regularizar");
              const sorted = sortRows(filtered);
              return sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-gray-500">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              ) : (
                sorted.map((r, index) => (
                <tr key={r.id} className={`border-t ${
                  index % 2 === 0 ? "bg-neutral-100" : "bg-neutral-300"
                } hover:bg-amber-400`}>
                  <td className="px-3 py-2 whitespace-nowrap text-[0.7rem]">
                    {fmtDate(r.createdAt).split(" ").map((part, i) => (
                      <div key={i}>{part}</div>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    {r.descricao === "Inscrição de Sócio" ? (r.titularName || "—") : (r.atletaNome || "—")}
                  </td>
                  <td className="px-3 py-2 text-[0.7rem]">{r.atletaEscalao || "—"}</td>
                  <td className="px-3 py-2 text-[0.7rem]">{r.descricao || "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    {r.signedUrl ? (
                      <a
                        href={r.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Abrir ficheiro
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        disabled={busyId === r.id}
                        className={`inline-flex items-center justify-center gap-1.5 transition active:scale-[.98] cursor-pointer text-sm h-8 px-3 rounded-md ${
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
              )));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

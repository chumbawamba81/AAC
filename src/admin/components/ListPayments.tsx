import React, { useEffect, useState } from "react";
import {
  listPagamentosAdmin,
  type AdminPagamento,
} from "../services/adminPagamentosService";

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

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 font-medium text-gray-700">
                <button
                  type="button"
                  onClick={() => handleSort("data")}
                  className="flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:underline"
                >
                  Data
                  {sortColumn === "data" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-gray-700">
                <button
                  type="button"
                  onClick={() => handleSort("atleta")}
                  className="flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:underline"
                >
                  Atleta
                  {sortColumn === "atleta" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-gray-700">
                <button
                  type="button"
                  onClick={() => handleSort("descricao")}
                  className="flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:underline"
                >
                  Descrição
                  {sortColumn === "descricao" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-gray-700">
                <button
                  type="button"
                  onClick={() => handleSort("estado")}
                  className="flex items-center gap-1 hover:text-gray-900 focus:outline-none focus:underline"
                >
                  Estado
                  {sortColumn === "estado" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 font-medium text-gray-700">Ficheiro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(() => {
              const filtered = rows.filter((r) => r.status !== "Por regularizar");
              const sorted = sortRows(filtered);
              return sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-gray-500">
                    Nenhum pagamento encontrado.
                  </td>
                </tr>
              ) : (
                sorted.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    {r.descricao === "Inscrição de Sócio" ? (r.titularName || "—") : (r.atletaNome || "—")}
                  </td>
                  <td className="px-3 py-2">{r.descricao || "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        r.status === "Regularizado"
                          ? "text-green-700"
                          : r.status === "Em atraso"
                            ? "text-red-700"
                            : "text-gray-700"
                      }
                    >
                      {r.status}
                    </span>
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
                </tr>
              )));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

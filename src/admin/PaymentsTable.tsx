// src/admin/PaymentsTable.tsx
import React from "react";
import type { AdminPagamento } from "./services/adminPagamentosService";

type Props = {
  rows: AdminPagamento[];
  onOpen: (row: AdminPagamento) => void;
};

export default function PaymentsTable({ rows, onOpen }: Props) {
  if (!rows.length) {
    return <p className="text-sm text-gray-500">Sem pagamentos registados.</p>;
  }

  return (
    <div className="overflow-x-auto border rounded-lg bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="text-left px-3 py-2">Data</th>
            <th className="text-left px-3 py-2">Nível</th>
            <th className="text-left px-3 py-2">Atleta</th>
            <th className="text-left px-3 py-2">Descrição</th>
            <th className="text-left px-3 py-2">Comprovativo</th>
            <th className="text-left px-3 py-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
              <td className="px-3 py-2 capitalize">{r.nivel}</td>
              <td className="px-3 py-2">{r.nivel === "atleta" ? (r.atletaNome || r.atletaId || "—") : "Sócio/EE"}</td>
              <td className="px-3 py-2">{r.descricao}</td>
              <td className="px-3 py-2">
                {r.signedUrl ? (
                  <a className="underline" href={r.signedUrl} target="_blank" rel="noreferrer">
                    Abrir
                  </a>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </td>
              <td className="px-3 py-2">
                <button
                  className="px-2 py-1 rounded border hover:bg-gray-50"
                  onClick={() => onOpen(r)}
                  disabled={!r.signedUrl}
                  title={r.signedUrl ? "Ver comprovativo" : "Sem comprovativo"}
                >
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

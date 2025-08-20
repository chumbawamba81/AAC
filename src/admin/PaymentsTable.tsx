// src/admin/PaymentsTable.tsx
import React from "react";
import { Button } from "../components/ui/button";
import type { AdminPagamento } from "./services/adminPagamentosService";

type Props = {
  rows: AdminPagamento[];
  onValidate?: (row: AdminPagamento, valid: boolean) => void | Promise<void>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(); // PT locale no browser
}

function Badge({
  children,
  color = "gray",
}: {
  children: React.ReactNode;
  color?: "gray" | "green" | "yellow" | "red" | "blue";
}) {
  const map: Record<string, string> = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[color]}`}>
      {children}
    </span>
  );
}

export default function PaymentsTable({ rows, onValidate }: Props) {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left">Data</th>
            <th className="px-3 py-2 text-left">Descrição</th>
            <th className="px-3 py-2 text-left">Comprovativo</th>
            <th className="px-3 py-2 text-left">Validação</th>
            <th className="px-3 py-2 text-left">Estado (até hoje)</th>
            <th className="px-3 py-2 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-gray-500" colSpan={6}>
                Sem registos.
              </td>
            </tr>
          )}
          {sorted.map((r) => {
            const isValidado = !!r.validado;
            // Estado agregado (se a tua service já calcular, podes trocar por r.estadoLabel/r.estadoCode)
            const estadoBadge =
              r.status === "regularizado" ? (
                <Badge color="green">Regularizado</Badge>
              ) : r.status === "em_atraso" ? (
                <Badge color="red">Em atraso</Badge>
              ) : r.status === "pendente_validacao" ? (
                <Badge color="yellow">Pendente de validação</Badge>
              ) : (
                <Badge>Pendente</Badge>
              );

            return (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">{r.descricao || "—"}</td>
                <td className="px-3 py-2">
                  {r.signedUrl ? (
                    <a
                      className="underline text-blue-700"
                      href={r.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir
                    </a>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isValidado ? (
                    <Badge color="green">Validado</Badge>
                  ) : (
                    <Badge>Pendente</Badge>
                  )}
                </td>
                <td className="px-3 py-2">{estadoBadge}</td>
                <td className="px-3 py-2">
                  {onValidate && (
                    <div className="flex gap-2">
                      {isValidado ? (
                        <Button
                          variant="secondary"
                          onClick={() => onValidate(r, false)}
                        >
                          Invalidar
                        </Button>
                      ) : (
                        <Button onClick={() => onValidate(r, true)}>
                          Validar
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

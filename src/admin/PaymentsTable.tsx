// src/admin/PaymentsTable.tsx
import React from "react";
import { Button } from "../components/ui/button";

// Tipo mínimo usado pela tabela (evita problemas de import)
export type AdminPagamento = {
  id: string;
  descricao: string | null;
  signedUrl?: string | null;
  validado?: boolean | null;
  createdAt?: string | null;
  // Se a service fornecer estes, usamos; senão calculamos fallback
  estadoCode?: "regularizado" | "pendente_validacao" | "em_atraso" | string;
  estadoLabel?: string;
};

type Props = {
  rows: AdminPagamento[];
  onValidate?: (row: AdminPagamento, valid: boolean) => void | Promise<void>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
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

// Deriva o estado visual (ou usa o que vier da service)
function getEstado(r: AdminPagamento): { label: string; color: "green" | "yellow" | "red" | "gray" } {
  if (r.estadoCode && r.estadoLabel) {
    if (r.estadoCode === "regularizado") return { label: r.estadoLabel, color: "green" };
    if (r.estadoCode === "pendente_validacao") return { label: r.estadoLabel, color: "yellow" };
    if (r.estadoCode === "em_atraso") return { label: r.estadoLabel, color: "red" };
    return { label: r.estadoLabel, color: "gray" };
  }
  if (r.validado) return { label: "Regularizado", color: "green" };
  if (r.signedUrl) return { label: "Pendente de validação", color: "yellow" };
  return { label: "Pendente", color: "gray" };
}

export default function PaymentsTable({ rows, onValidate }: Props) {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
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
            const estado = getEstado(r);

            return (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                <td className="px-3 py-2">{r.descricao || "—"}</td>
                <td className="px-3 py-2">
                  {r.signedUrl ? (
                    <a className="underline text-blue-700" href={r.signedUrl} target="_blank" rel="noreferrer">
                      Abrir
                    </a>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isValidado ? <Badge color="green">Validado</Badge> : <Badge>Pendente</Badge>}
                </td>
                <td className="px-3 py-2">
                  <Badge color={estado.color}>{estado.label}</Badge>
                </td>
                <td className="px-3 py-2">
                  {onValidate && (
                    <div className="flex gap-2">
                      {isValidado ? (
                        <Button variant="secondary" onClick={() => onValidate(r, false)}>
                          Invalidar
                        </Button>
                      ) : (
                        <Button onClick={() => onValidate(r, true)}>Validar</Button>
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

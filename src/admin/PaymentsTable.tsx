// src/admin/PaymentsTable.tsx
import React from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import type { AdminPagamento } from "./services/adminPagamentosService";

export default function PaymentsTable({
  rows,
  onValidate,
}: {
  rows: AdminPagamento[];
  onValidate: (row: AdminPagamento, next: boolean) => void;
}) {
  if (!rows.length) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500">Sem registos para os filtros aplicados.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-left">
            <th className="px-3 py-2">Titular/EE</th>
            <th className="px-3 py-2">Atleta</th>
            <th className="px-3 py-2">Descrição</th>
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Comprovativo</th>
            <th className="px-3 py-2">Validado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.titularNome || "—"}</td>
              <td className="px-3 py-2">{r.atletaNome || "—"}</td>
              <td className="px-3 py-2">{r.descricao}</td>
              <td className="px-3 py-2 capitalize">{r.tipo}</td>
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
                {r.validado ? (
                  <span className="inline-flex items-center gap-1 text-green-700">✔ Validado</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-700">• Pendente</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <Button variant={r.validado ? "secondary" : "outline"} onClick={() => onValidate(r, !r.validado)}>
                    {r.validado ? "Desvalidar" : "Validar"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

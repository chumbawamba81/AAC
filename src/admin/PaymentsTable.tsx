// src/admin/PaymentsTable.tsx
import React from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { CheckCircle2, XCircle, Link as LinkIcon } from "lucide-react";

export type AdminPagamento = {
  id: string;
  // identificação
  titularUserId: string | null;
  titularNome: string | null;     // <- nome do Sócio/EE
  titularEmail: string | null;
  atletaId: string | null;
  atletaNome: string | null;

  // pagamento
  descricao: string;
  tipo: "mensalidade" | "inscricao" | null;

  // ficheiros & estado
  comprovativoUrl: string | null;
  signedUrl?: string | null;
  validado: boolean | null;

  // NOVO: data de submissão (created_at)
  createdAt: string | null;
};

type Props = {
  rows: AdminPagamento[];
  onOpen: (row: AdminPagamento) => void;                 // abrir detalhes
  onValidate: (row: AdminPagamento, ok: boolean) => void; // validar / rejeitar
  busyIds?: Set<string>;
  title?: string;
};

function fmtDate(dt: string | null) {
  if (!dt) return "—";
  try {
    const d = new Date(dt);
    return `${d.toLocaleDateString("pt-PT")} ${d.toLocaleTimeString("pt-PT", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return dt;
  }
}

export default function PaymentsTable({
  rows,
  onOpen,
  onValidate,
  busyIds,
  title = "Tesouraria",
}: Props) {
  const b = busyIds || new Set<string>();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-600">
                <th className="px-4 py-2">Submetido em</th>   {/* <- NOVO (substitui “Tipo”) */}
                <th className="px-4 py-2">Titular/EE</th>
                <th className="px-4 py-2">Atleta</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2">Comprovativo</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    Sem registos.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const pending = !!r.comprovativoUrl && r.validado === null;
                  const regular = r.validado === true;
                  const rejected = r.validado === false;

                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {fmtDate(r.createdAt)}
                      </td>

                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium">{r.titularNome || "—"}</span>
                          <span className="text-xs text-gray-500">{r.titularEmail || "—"}</span>
                        </div>
                      </td>

                      <td className="px-4 py-2">{r.atletaNome || "—"}</td>
                      <td className="px-4 py-2">{r.descricao}</td>

                      <td className="px-4 py-2">
                        {r.signedUrl ? (
                          <a
                            href={r.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline inline-flex items-center gap-1"
                          >
                            <LinkIcon className="h-4 w-4" />
                            Abrir
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-2">
                        {regular && (
                          <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                            <CheckCircle2 className="h-4 w-4" /> Validado
                          </span>
                        )}
                        {rejected && (
                          <span className="inline-flex items-center gap-1 text-red-700 bg-red-50 rounded-full px-2 py-0.5">
                            <XCircle className="h-4 w-4" /> Rejeitado
                          </span>
                        )}
                        {pending && (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                            Pendente
                          </span>
                        )}
                        {!regular && !rejected && !pending && <span className="text-gray-400">—</span>}
                      </td>

                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" onClick={() => onOpen(r)}>
                            Detalhes
                          </Button>
                          <Button
                            onClick={() => onValidate(r, true)}
                            disabled={b.has(r.id)}
                          >
                            Validar
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => onValidate(r, false)}
                            disabled={b.has(r.id)}
                          >
                            Rejeitar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

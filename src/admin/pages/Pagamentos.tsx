// src/admin/pages/Pagamentos.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { RefreshCw, CheckCircle2, XCircle, Link as LinkIcon, Filter } from "lucide-react";
import {
  listPagamentosAdmin,
  marcarPagamentoValidado,
  type AdminPagamento,
} from "../services/adminPagamentosService";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function PagamentosAdminPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // filtros simples
  const [q, setQ] = useState("");
  const [onlyWithComprovativo, setOnlyWithComprovativo] = useState(false);
  const [onlyPending, setOnlyPending] = useState<null | boolean>(null); // null = todos; true = só validados; false = só pendentes

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listPagamentosAdmin();
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Falha a carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyWithComprovativo && !r.signedUrl) return false;
      if (onlyPending !== null) {
        const isValidated = !!r.validado;
        if (onlyPending === true && !isValidated) return false; // só validados
        if (onlyPending === false && isValidated) return false; // só pendentes
      }
      if (!term) return true;
      const hay =
        (r.descricao || "") +
        " " +
        (r.titularEmail || "") +
        " " +
        (r.atletaNome || "") +
        " " +
        (r.createdAt || "");
      return hay.toLowerCase().includes(term);
    });
  }, [rows, q, onlyWithComprovativo, onlyPending]);

  async function toggleValid(r: AdminPagamento, to: boolean) {
    try {
      await marcarPagamentoValidado(r.id, to);
      // atualiza localmente sem refetch completo
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, validado: to } : x)));
    } catch (e: any) {
      alert(e?.message || "Não foi possível atualizar o estado");
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          Tesouraria · Pagamentos
          {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4" />
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={onlyWithComprovativo}
                onChange={(e) => setOnlyWithComprovativo(e.target.checked)}
              />
              Só com comprovativo
            </label>
            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={onlyPending === null ? "all" : onlyPending ? "valid" : "pending"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") setOnlyPending(null);
                else if (v === "valid") setOnlyPending(true);
                else setOnlyPending(false);
              }}
            >
              <option value="all">Todos</option>
              <option value="valid">Só validados</option>
              <option value="pending">Só pendentes</option>
            </select>
          </div>
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Recarregar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <input
            className="w-full md:w-80 rounded-lg border px-3 py-2 text-sm"
            placeholder="Procurar por email / atleta / descrição…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {err && (
          <div className="rounded-md bg-red-50 text-red-800 text-sm p-2 mb-3">
            {err}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3">Descrição</th>
                <th className="py-2 pr-3">Titular (email)</th>
                <th className="py-2 pr-3">Atleta</th>
                <th className="py-2 pr-3">Comprovativo</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    {loading ? "A carregar…" : "Sem registos"}
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                  <td className="py-2 pr-3">{r.descricao || "—"}</td>
                  <td className="py-2 pr-3">{r.titularEmail || "—"}</td>
                  <td className="py-2 pr-3">{r.atletaNome || "—"}</td>
                  <td className="py-2 pr-3">
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
                  <td className="py-2 pr-3">
                    {r.validado ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Validado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <XCircle className="h-4 w-4" />
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex justify-end gap-2">
                      {!r.validado && (
                        <Button
                          onClick={() => toggleValid(r, true)}
                          title="Marcar como validado"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Validar
                        </Button>
                      )}
                      {r.validado && (
                        <Button
                          variant="secondary"
                          onClick={() => toggleValid(r, false)}
                          title="Marcar como pendente"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Desfazer
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

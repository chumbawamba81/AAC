// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";

// UI (reutilizamos os componentes da app pública)
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { RefreshCw, CheckCircle2, XCircle, Link as LinkIcon } from "lucide-react";

// Serviços específicos de admin
import {
  listPagamentosAdmin,
  markPagamentoValidado,
  recomputeTesourariaSocio,
  recomputeTesourariaAtleta,
  type AdminPagamento,
  type NivelPagamento,
} from "../services/adminPagamentosService";

export default function PagamentosAdminPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // filtros
  const [nivel, setNivel] = useState<"all" | NivelPagamento>("all");
  const [q, setQ] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await listPagamentosAdmin();
      setRows(data);
    } catch (e) {
      console.error("[Admin/Pagamentos] listPagamentosAdmin", e);
      alert("Falha a carregar pagamentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows
      .filter((r) => (nivel === "all" ? true : r.nivel === nivel))
      .filter((r) => {
        if (!text) return true;
        const hay = [
          r.titular_email || "",
          r.descricao || "",
          r.atleta_nome || "",
          r.comprovativo_url || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(text);
      })
      // mais recentes primeiro
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
  }, [rows, nivel, q]);

  async function toggleValidacao(row: AdminPagamento, value: boolean) {
    setBusyId(row.id);
    try {
      await markPagamentoValidado(row.id, value);

      // Recalcular situação de tesouraria conforme o nível
      if (row.nivel === "socio" && row.titular_user_id) {
        await recomputeTesourariaSocio(row.titular_user_id);
      } else if (row.nivel === "atleta" && row.atleta_id) {
        await recomputeTesourariaAtleta(row.atleta_id);
      }

      await refresh();
    } catch (e: any) {
      console.error("[Admin/Pagamentos] toggleValidacao", e);
      alert(e?.message || "Falha a atualizar validação.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Tesouraria — Pagamentos
            {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <div className="flex gap-2">
              <select
                className="border rounded-lg px-3 py-2 text-sm"
                value={nivel}
                onChange={(e) => setNivel(e.target.value as any)}
              >
                <option value="all">Todos</option>
                <option value="socio">Sócio</option>
                <option value="atleta">Atleta</option>
              </select>
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
            </div>
            <div className="w-full md:w-80">
              <Input
                placeholder="Pesquisar (email, atleta, descrição)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-auto border rounded-xl">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Nível</th>
                  <th className="px-3 py-2">Titular (email)</th>
                  <th className="px-3 py-2">Atleta</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Comprovativo</th>
                  <th className="px-3 py-2">Validado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                      Sem registos.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString("pt-PT")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 capitalize">{r.nivel}</td>
                      <td className="px-3 py-2">{r.titular_email || "—"}</td>
                      <td className="px-3 py-2">{r.atleta_nome || "—"}</td>
                      <td className="px-3 py-2">{r.descricao || "—"}</td>
                      <td className="px-3 py-2">
                        {r.signed_url ? (
                          <a
                            href={r.signed_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline"
                          >
                            <LinkIcon className="h-4 w-4" />
                            Abrir
                          </a>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Button
                            variant={r.validado ? "secondary" : "outline"}
                            disabled={busyId === r.id}
                            onClick={() => toggleValidacao(r, !r.validado)}
                          >
                            {r.validado ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Validado
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4 mr-1" /> Pendente
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500">
            {filtered.length} registo(s) mostrado(s).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

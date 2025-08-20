// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import PaymentsTable, { type AdminPagamento } from "../PaymentsTable";
import { RefreshCw } from "lucide-react";

// ⚠️ Ajusta o caminho se a tua service estiver noutro sítio.
// A service deve exportar: listPagamentosAdmin() e marcarPagamentoValidado(id, valid)
import {
  listPagamentosAdmin,
  marcarPagamentoValidado,
} from "../services/adminPagamentosService";

function ErrorBox({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-800 px-3 py-2 text-sm">
      <div className="font-medium">Erro ao carregar:</div>
      <div className="whitespace-pre-wrap">{msg}</div>
    </div>
  );
}

export default function PagamentosAdminPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPagamentosAdmin();
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // Mostra a mensagem real no ecrã para diagnosticar RLS/policies
      const msg =
        e?.message ||
        e?.error_description ||
        e?.error ||
        "Falha desconhecida a carregar pagamentos.";
      setError(msg);
      setRows([]); // evita ficar preso no loading
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carregamento inicial
    void load();
  }, [load]);

  async function onValidate(row: AdminPagamento, valid: boolean) {
    try {
      setLoading(true);
      setError("");
      await marcarPagamentoValidado(row.id, valid);
      await load();
    } catch (e: any) {
      const msg =
        e?.message ||
        e?.error_description ||
        e?.error ||
        "Não foi possível atualizar a validação.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Tesouraria · Pagamentos (Admin)</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Recarregar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ErrorBox msg={error} />
        {loading ? (
          <div className="text-sm text-gray-600 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            A carregar pagamentos...
          </div>
        ) : (
          <PaymentsTable rows={rows} onValidate={onValidate} />
        )}
      </CardContent>
    </Card>
  );
}

// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  type AdminPagamento,
} from "../services/adminPagamentosService";

type Tab = "inscricao" | "mensalidades";

// estados (labels oficiais na app)
type Estado = "" | "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
type OrderDir = "asc" | "desc";

// ranking do estado: 1) Pendente de validação 2) Em atraso 3) Por regularizar 4) Regularizado
const estadoRank = (s?: string | null) => {
  const v = (s || "").toLowerCase();
  if (v.startsWith("pendente de")) return 0;
  if (v.includes("atras")) return 1;
  if (v.includes("regularizar")) return 2; // "Por regularizar"
  if (v.startsWith("regular")) return 3;
  return 99;
};

const norm = (s?: string | null) => (s || "").toString().trim().toLowerCase();

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("inscricao");

  // filtro por estado (aplica-se ao separador ativo)
  const [estado, setEstado] = useState<Estado>("");

  // direção de ordenação (para o bloco inteiro); por omissão DESC em campos textuais fica sem efeito
  const [orderDir, setOrderDir] = useState<OrderDir>("asc");

  async function refresh() {
    setLoading(true);
    try {
      // vai sempre buscar todos; filtro/ordenação é no cliente para respeitar o separador ativo
      const data = await listPagamentosAdmin("todos" as any);
      setRows(data);
    } catch (e: any) {
      alert(e?.message || "Falha a carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const inActiveTab = (r: AdminPagamento) => {
    const tipo = norm((r as any).tipo) || norm(r.descricao);
    if (tab === "inscricao") return tipo.includes("inscri");
    // mensalidades / quotas
    return tipo.includes("mensal") || tipo.includes("quota") || tipo.includes("quotas");
  };

  const q = norm(search);

  // 1) filtrar por separador + pesquisa + estado
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (!inActiveTab(r)) return false;
      if (estado && (r.status || "") !== estado) return false;
      if (!q) return true;
      const hay =
        norm(r.titularName) + " " + norm(r.atletaNome) + " " + norm(r.descricao);
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tab, estado, q]);

  // 2) ordenar por: Estado → Escalão → (Atleta no separador mensalidades) OU (Titular, depois Atleta no separador inscrições)
  const sorted = useMemo(() => {
    const dir = orderDir === "asc" ? 1 : -1;

    const getEscalao = (r: AdminPagamento) =>
      ((r as any).escalao ??
        (r as any).atletaEscalao ??
        (r as any).escalao_atleta ??
        "") as string;

    // para ter ordenação consistente, usamos localeCompare insensitive
    function cmpStr(a: string, b: string) {
      return a.localeCompare(b, "pt", { sensitivity: "base" });
    }

    const arr = [...filtered];
    arr.sort((a, b) => {
      // 1) Estado
      const er = estadoRank(a.status) - estadoRank(b.status);
      if (er !== 0) return er * dir;

      // 2) Escalão
      const esc = cmpStr(getEscalao(a), getEscalao(b));
      if (esc !== 0) return esc * dir;

      // 3) terciário depende do separador
      if (tab === "mensalidades") {
        const at = cmpStr(a.atletaNome || "", b.atletaNome || "");
        if (at !== 0) return at * dir;
        // 4) fallback: titular
        const tt = cmpStr(a.titularName || "", b.titularName || "");
        if (tt !== 0) return tt * dir;
      } else {
        // inscrições
        const tt = cmpStr(a.titularName || "", b.titularName || "");
        if (tt !== 0) return tt * dir;
        // 4) fallback: atleta
        const at = cmpStr(a.atletaNome || "", b.atletaNome || "");
        if (at !== 0) return at * dir;
      }

      // fallback final: data limite (se existir) e criado
      const da = (a as any).devidoEm ? new Date((a as any).devidoEm).getTime() : 0;
      const db = (b as any).devidoEm ? new Date((b as any).devidoEm).getTime() : 0;
      if (da !== db) return (da - db) * dir;

      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (ca - cb) * dir;
    });
    return arr;
  }, [filtered, orderDir, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pagamentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por estado (aplica-se ao separador ativo) */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            title="Estado (aplica-se ao separador ativo)"
          >
            <option value="">Estado — (todos)</option>
            <option value="Pendente de validação">Pendente de validação</option>
            <option value="Em atraso">Em atraso</option>
            <option value="Por regularizar">Por regularizar</option>
            <option value="Regularizado">Regularizado</option>
          </select>

          {/* Pesquisa */}
          <input
            className="rounded-lg border px-3 py-1 text-sm"
            placeholder="Pesquisar titular, atleta ou descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Direção (aplica-se ao conjunto dos critérios) */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={orderDir}
            onChange={(e) => setOrderDir(e.target.value as OrderDir)}
            title="Direção da ordenação"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>

          <button
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-100"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "A carregar…" : "Atualizar"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">A carregar pagamentos…</div>
      ) : (
        <PaymentsTable
          rows={sorted}
          tab={tab}
          onTabChange={setTab}
          onOpen={(row) => {
            alert(
              [
                `Titular/EE: ${row.titularName}`,
                row.atletaNome ? `Atleta: ${row.atletaNome}` : "",
                `Descrição: ${row.descricao}`,
                `Estado: ${row.status}`,
                row.createdAt ? `Submetido em: ${new Date(row.createdAt).toLocaleString()}` : "",
              ]
                .filter(Boolean)
                .join("\n")
            );
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

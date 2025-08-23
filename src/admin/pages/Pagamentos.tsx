// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  type AdminPagamento,
} from "../services/adminPagamentosService";

type Tab = "inscricao" | "mensalidades";
type Estado = "" | "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

type SortKey =
  | "prioridade"
  | "estado_asc" | "estado_desc"
  | "escalao_asc" | "escalao_desc"
  | "atleta_asc" | "atleta_desc"
  | "titular_asc" | "titular_desc"
  | "created_desc" | "created_asc";

const norm = (s?: string | null) => (s || "").toString().trim().toLowerCase();

// ranking do estado: 1) Pendente de validação 2) Em atraso 3) Por regularizar 4) Regularizado
function estadoRank(s?: string | null) {
  const v = norm(s);
  if (v.startsWith("pendente de")) return 0;
  if (v.includes("atras")) return 1;
  if (v.includes("regularizar")) return 2;
  if (v.startsWith("regular")) return 3;
  return 99;
}

// extrai “Sub 14”, “Sub-23”, etc.; “Master” no fim
function escalaoKey(raw?: string | null) {
  const v = norm(raw);
  if (!v) return { kind: 2, sub: 999, raw: "" }; // desconhecido → ao fim
  const mSub = v.match(/sub\s*-?\s*(\d{1,2})/i);
  if (mSub) return { kind: 0, sub: parseInt(mSub[1], 10), raw: v };
  if (v.includes("master")) return { kind: 2, sub: 999, raw: v };
  return { kind: 1, sub: 500, raw: v }; // outros escalões
}

const cmpStr = (a: string, b: string) =>
  a.localeCompare(b, "pt", { sensitivity: "base", numeric: true });

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("inscricao");
  const [estado, setEstado] = useState<Estado>("");

  // NOVO: seletor único de ordenação
  const [sortKey, setSortKey] = useState<SortKey>("prioridade");

  async function refresh() {
    setLoading(true);
    try {
      // vai sempre buscar TODOS; filtros e ordenação aplicam-se no cliente
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

  // heurística separador
  const isInscricao = (r: AdminPagamento) => {
    if (r.nivel === "socio") return true;
    const tipo = norm((r as any).tipo) || norm(r.descricao);
    return tipo.includes("inscri");
  };

  const q = norm(search);

  // 1) pesquisa + filtro de estado (antes de separar por separador)
  const baseFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (estado && (r.status || "") !== estado) return false;
      if (!q) return true;
      const hay = [r.titularName, r.atletaNome, r.descricao].map(norm).join(" ");
      return hay.includes(q);
    });
  }, [rows, estado, q]);

  // 2) dividir para contagens corretas nas tabs (após filtro/pesquisa)
  const inscricoes = useMemo(
    () => baseFiltered.filter((r) => isInscricao(r)),
    [baseFiltered]
  );
  const mensalidades = useMemo(
    () => baseFiltered.filter((r) => !isInscricao(r)),
    [baseFiltered]
  );

  // 3) conjunto visível
  const current = tab === "inscricao" ? inscricoes : mensalidades;

  // 4) ordenação
  const sorted = useMemo(() => {
    const getEsc = (r: AdminPagamento) =>
      ((r as any).escalao ??
        (r as any).atletaEscalao ??
        (r as any).escalao_atleta ??
        "") as string;

    const arr = [...current];

    function byPrioridade(a: AdminPagamento, b: AdminPagamento) {
      // Estado → Escalão → terciário dependente do separador → fallback
      const e = estadoRank(a.status) - estadoRank(b.status);
      if (e !== 0) return e;

      const ka = escalaoKey(getEsc(a));
      const kb = escalaoKey(getEsc(b));
      if (ka.kind !== kb.kind) return ka.kind - kb.kind;
      if (ka.sub !== kb.sub) return ka.sub - kb.sub;
      const eraw = cmpStr(ka.raw, kb.raw);
      if (eraw !== 0) return eraw;

      if (tab === "mensalidades") {
        const at = cmpStr((a.atletaNome || "").toLowerCase(), (b.atletaNome || "").toLowerCase());
        if (at !== 0) return at;
        const tt = cmpStr((a.titularName || "").toLowerCase(), (b.titularName || "").toLowerCase());
        if (tt !== 0) return tt;
      } else {
        const tt = cmpStr((a.titularName || "").toLowerCase(), (b.titularName || "").toLowerCase());
        if (tt !== 0) return tt;
        const at = cmpStr((a.atletaNome || "").toLowerCase(), (b.atletaNome || "").toLowerCase());
        if (at !== 0) return at;
      }

      // fallback: devidoEm e createdAt
      const da = (a as any).devidoEm ? new Date((a as any).devidoEm).getTime() : 0;
      const db = (b as any).devidoEm ? new Date((b as any).devidoEm).getTime() : 0;
      if (da !== db) return da - db;

      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ca - cb;
    }

    arr.sort((a, b) => {
      switch (sortKey) {
        case "prioridade": return byPrioridade(a, b);
        case "estado_asc": return estadoRank(a.status) - estadoRank(b.status);
        case "estado_desc": return estadoRank(b.status) - estadoRank(a.status);
        case "escalao_asc": {
          const ka = escalaoKey(getEsc(a)), kb = escalaoKey(getEsc(b));
          if (ka.kind !== kb.kind) return ka.kind - kb.kind;
          if (ka.sub !== kb.sub) return ka.sub - kb.sub;
          return cmpStr(ka.raw, kb.raw);
        }
        case "escalao_desc": {
          const ka = escalaoKey(getEsc(a)), kb = escalaoKey(getEsc(b));
          if (ka.kind !== kb.kind) return kb.kind - ka.kind;
          if (ka.sub !== kb.sub) return kb.sub - ka.sub;
          return cmpStr(kb.raw, ka.raw);
        }
        case "atleta_asc": return cmpStr((a.atletaNome || ""), (b.atletaNome || ""));
        case "atleta_desc": return cmpStr((b.atletaNome || ""), (a.atletaNome || ""));
        case "titular_asc": return cmpStr((a.titularName || ""), (b.titularName || ""));
        case "titular_desc": return cmpStr((b.titularName || ""), (a.titularName || ""));
        case "created_desc": {
          const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return cb - ca;
        }
        case "created_asc": {
          const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return ca - cb;
        }
        default: return 0;
      }
    });

    return arr;
  }, [current, sortKey, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pagamentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Estado (aplica-se ao separador ativo; contagens respeitam-no) */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            title="Estado"
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

          {/* Ordenação (partilhada entre separadores) */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            title="Ordenar por"
          >
            <option value="prioridade">Ordenar: Prioridade (Estado → Escalão → Nome)</option>
            <option value="estado_asc">Ordenar: Estado ↑</option>
            <option value="estado_desc">Ordenar: Estado ↓</option>
            <option value="escalao_asc">Ordenar: Escalão ↑</option>
            <option value="escalao_desc">Ordenar: Escalão ↓</option>
            <option value="atleta_asc">Ordenar: Atleta ↑</option>
            <option value="atleta_desc">Ordenar: Atleta ↓</option>
            <option value="titular_asc">Ordenar: Titular/EE ↑</option>
            <option value="titular_desc">Ordenar: Titular/EE ↓</option>
            <option value="created_desc">Ordenar: Recentes</option>
            <option value="created_asc">Ordenar: Antigos</option>
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
          onOpen={() => {}}
          onChanged={refresh}
          // contagens pós-filtro/pesquisa (mostradas nas tabs)
          inscricoesCount={inscricoes.length}
          mensalidadesCount={mensalidades.length}
        />
      )}
    </div>
  );
}

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

// extrai “Sub 14”, “Sub-23”, etc.; “Master” vai para o fim
function escalaoKey(raw?: string | null) {
  const v = norm(raw);
  if (!v) return { kind: 2, sub: 999, raw: "" }; // desconhecido ao fim
  const mSub = v.match(/sub\s*-?\s*(\d{1,2})/i);
  if (mSub) return { kind: 0, sub: parseInt(mSub[1], 10), raw: v };
  if (v.includes("master")) return { kind: 2, sub: 999, raw: v };
  return { kind: 1, sub: 500, raw: v }; // outros escalões “médios”
}

function cmpStr(a: string, b: string) {
  return a.localeCompare(b, "pt", { sensitivity: "base", numeric: true });
}

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("inscricao");

  // filtro por estado (aplica-se ao separador ativo)
  const [estado, setEstado] = useState<Estado>("");

  // direção global da ordenação
  const [orderDir, setOrderDir] = useState<OrderDir>("asc");

  async function refresh() {
    setLoading(true);
    try {
      // obtemos sempre todos; aplicamos pesquisa/filtros/ordenação no cliente
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

  // heurística para separador
  const isInscricao = (r: AdminPagamento) => {
    if (r.nivel === "socio") return true;
    const tipo = norm((r as any).tipo) || norm(r.descricao);
    return tipo.includes("inscri");
  };

  const q = norm(search);

  // 1) aplica pesquisa e filtro de estado (sem dividir por separador ainda)
  const baseFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (estado && (r.status || "") !== estado) return false;
      if (!q) return true;
      const hay = [r.titularName, r.atletaNome, r.descricao].map(norm).join(" ");
      return hay.includes(q);
    });
  }, [rows, estado, q]);

  // 2) divide por separador para contagens corretas nas tabs
  const inscricoes = useMemo(
    () => baseFiltered.filter((r) => isInscricao(r)),
    [baseFiltered]
  );
  const mensalidades = useMemo(
    () => baseFiltered.filter((r) => !isInscricao(r)),
    [baseFiltered]
  );

  // 3) escolhe o conjunto visível
  const current = tab === "inscricao" ? inscricoes : mensalidades;

  // 4) ordenação prioritária: Estado → Escalão → (Atleta|Titular) → (fallback)
  const sorted = useMemo(() => {
    const dir = orderDir === "asc" ? 1 : -1;
    const getEsc = (r: AdminPagamento) =>
      ((r as any).escalao ??
        (r as any).atletaEscalao ??
        (r as any).escalao_atleta ??
        "") as string;

    const arr = [...current];
    arr.sort((a, b) => {
      // 1) Estado
      const e = (estadoRank(a.status) - estadoRank(b.status)) * dir;
      if (e !== 0) return e;

      // 2) Escalão
      const ka = escalaoKey(getEsc(a));
      const kb = escalaoKey(getEsc(b));
      if (ka.kind !== kb.kind) return (ka.kind - kb.kind) * dir;
      if (ka.sub !== kb.sub) return (ka.sub - kb.sub) * dir;
      const eraw = cmpStr(ka.raw, kb.raw) * dir;
      if (eraw !== 0) return eraw;

      // 3) terciário: depende do separador
      if (tab === "mensalidades") {
        const at = cmpStr((a.atletaNome || "").toLowerCase(), (b.atletaNome || "").toLowerCase()) * dir;
        if (at !== 0) return at;
        const tt = cmpStr((a.titularName || "").toLowerCase(), (b.titularName || "").toLowerCase()) * dir;
        if (tt !== 0) return tt;
      } else {
        const tt = cmpStr((a.titularName || "").toLowerCase(), (b.titularName || "").toLowerCase()) * dir;
        if (tt !== 0) return tt;
        const at = cmpStr((a.atletaNome || "").toLowerCase(), (b.atletaNome || "").toLowerCase()) * dir;
        if (at !== 0) return at;
      }

      // 4) fallback: data limite e criado
      const da = (a as any).devidoEm ? new Date((a as any).devidoEm).getTime() : 0;
      const db = (b as any).devidoEm ? new Date((b as any).devidoEm).getTime() : 0;
      if (da !== db) return (da - db) * dir;

      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return (ca - cb) * dir;
    });
    return arr;
  }, [current, orderDir, tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pagamentos</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Estado (aplica-se ao separador ativo na listagem; contagens já respeitam também) */}
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

          {/* Direção */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={orderDir}
            onChange={(e) => setOrderDir(e.target.value as OrderDir)}
            title="Direção"
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
          onOpen={() => {}}
          onChanged={refresh}
          // novas contagens: pós-pesquisa & filtro de estado
          inscricoesCount={inscricoes.length}
          mensalidadesCount={mensalidades.length}
        />
      )}
    </div>
  );
}

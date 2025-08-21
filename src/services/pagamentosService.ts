// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";

export type PlanoPagamento = "Mensal" | "Trimestral" | "Anual";

export type PagamentoRow = {
  id: string;
  user_id?: string | null;
  atleta_id: string | null;
  descricao: string;
  tipo?: "inscricao" | "prestacao" | "socio_inscricao";
  comprovativo_url: string | null;
  validado?: boolean | null;
  devido_em?: string | null; // YYYY-MM-DD
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string };

// --------------------------------------------------------
// Helpers de datas / nomes
// --------------------------------------------------------

const DUE_DAY = 10; // dia limite

/** Setembro do ANO CORRENTE (época arranca sempre agora em Setembro). */
function getSeasonBaseYear(today = new Date()): number {
  // usamos sempre o ano corrente como âncora da época que arranca em Setembro
  return today.getFullYear();
}

function iso(y: number, m0: number, d = DUE_DAY): string {
  // m0: mês 0-based
  const dt = new Date(Date.UTC(y, m0, d));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "").toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub23") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores")
  );
}

function getSlotsForPlano(p: PlanoPagamento) {
  if (p === "Mensal") return 10; // Set-Jun
  if (p === "Trimestral") return 3; // Set, Jan, Abr
  return 1; // Anual
}

function getPagamentoLabel(plano: PlanoPagamento, idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}

function monthForPlanoIndex(plano: PlanoPagamento, idx: number, baseYear: number): { y: number; m0: number } {
  // devolve (ano, mês-0based) para o vencimento
  if (plano === "Anual") {
    return { y: baseYear, m0: 8 }; // Setembro do ano base
  }
  if (plano === "Trimestral") {
    // Set(8) do ano base, Jan(0)+1, Abr(3)+1
    const map: Array<{ y: number; m0: number }> = [
      { y: baseYear, m0: 8 },
      { y: baseYear + 1, m0: 0 },
      { y: baseYear + 1, m0: 3 },
    ];
    return map[idx] || map[map.length - 1];
  }
  // Mensal: Set..Jun (10 meses)
  const seq: Array<{ y: number; m0: number }> = [
    { y: baseYear, m0: 8 }, // Set
    { y: baseYear, m0: 9 }, // Out
    { y: baseYear, m0: 10 }, // Nov
    { y: baseYear, m0: 11 }, // Dez
    { y: baseYear + 1, m0: 0 }, // Jan
    { y: baseYear + 1, m0: 1 }, // Fev
    { y: baseYear + 1, m0: 2 }, // Mar
    { y: baseYear + 1, m0: 3 }, // Abr
    { y: baseYear + 1, m0: 4 }, // Mai
    { y: baseYear + 1, m0: 5 }, // Jun
  ];
  return seq[idx] || seq[seq.length - 1];
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// --------------------------------------------------------
// Signed URLs
// --------------------------------------------------------

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: undefined });
      continue;
    }
    const { data, error } = await supabase.storage
      .from("pagamentos")
      .createSignedUrl(r.comprovativo_url, 3600);
    out.push({ ...r, signedUrl: error ? undefined : data?.signedUrl });
  }
  return out;
}

// --------------------------------------------------------
// Listagens / CRUD simples
// --------------------------------------------------------

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,validado,devido_em,created_at")
    .eq("atleta_id", atletaId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as PagamentoRow[];
}

export async function deletePagamento(row: PagamentoRow) {
  // apaga storage (se tiver) e depois a linha
  if (row.comprovativo_url) {
    await supabase.storage.from("pagamentos").remove([row.comprovativo_url]).catch(() => {});
  }
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw error;
}

type SaveCompArgs = {
  userId: string;
  atletaId?: string; // undefined = sócio
  descricao: string;
  file: File;
};

/** cria/substitui comprovativo de pagamento (prestação/inscrição atleta) */
export async function saveComprovativo(args: SaveCompArgs) {
  const { userId, atletaId, descricao, file } = args;

  // procura linha existente (atletaId + descricao), ou cria
  let linhaId: string | null = null;
  let currentPath: string | null = null;

  const sel = await supabase
    .from("pagamentos")
    .select("id,comprovativo_url")
    .eq("descricao", descricao)
    .eq("atleta_id", atletaId ?? null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (sel.error) throw sel.error;
  if ((sel.data || []).length) {
    linhaId = sel.data![0].id as string;
    currentPath = (sel.data![0] as any).comprovativo_url || null;
  } else {
    const { data, error } = await supabase
      .from("pagamentos")
      .insert({
        user_id: userId,
        atleta_id: atletaId ?? null,
        descricao,
        tipo: atletaId ? "prestacao" : "socio_inscricao",
        // devido_em: manter o que já existir nos “ensure*”; aqui não mexemos.
      })
      .select("id")
      .single();
    if (error) throw error;
    linhaId = (data as any).id;
  }

  // upload para Storage
  const base = atletaId ? `${userId}/${atletaId}/${slug(descricao)}` : `${userId}/socio-inscricao`;
  const path = `${base}/${Date.now()}_${slug(file.name || "comprovativo")}`;
  const up = await supabase.storage.from("pagamentos").upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  // apaga anterior (se houver)
  if (currentPath) {
    await supabase.storage.from("pagamentos").remove([currentPath]).catch(() => {});
  }

  // atualiza linha
  const upd = await supabase
    .from("pagamentos")
    .update({ comprovativo_url: path })
    .eq("id", linhaId!);
  if (upd.error) throw upd.error;
}

/** guarda comprovativo de inscrição do SÓCIO */
export async function saveComprovativoSocioInscricao(userId: string, file: File) {
  // garante a linha e faz upload
  await createInscricaoSocioIfMissing(userId);
  return saveComprovativo({
    userId,
    atletaId: undefined,
    descricao: "Inscrição de Sócio",
    file,
  });
}

export async function listSocioInscricao(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,comprovativo_url,validado,devido_em,created_at")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "socio_inscricao")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as PagamentoRow[];
}

export async function createInscricaoSocioIfMissing(userId: string) {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "socio_inscricao")
    .limit(1);

  if (error) throw error;
  if (data && data.length > 0) return;

  const baseYear = getSeasonBaseYear();
  const devido_em = iso(baseYear, 8, DUE_DAY); // 10-Set-ano corrente

  const ins = await supabase.from("pagamentos").insert({
    user_id: userId,
    atleta_id: null,
    tipo: "socio_inscricao",
    descricao: "Inscrição de Sócio",
    comprovativo_url: null,
    validado: null,
    devido_em,
  });
  if (ins.error) throw ins.error;
}

// --------------------------------------------------------
// Geração/Ajuste do calendário por atleta
// --------------------------------------------------------

type EnsureArgs = {
  id: string;
  escalao?: string | null;
  planoPagamento: PlanoPagamento;
};

type EnsureOpts = { forceRebuild?: boolean };

export async function ensureScheduleForAtleta(a: EnsureArgs, opts?: EnsureOpts) {
  const baseYear = getSeasonBaseYear();

  // plano efetivo (alguns escalões obrigam a "Anual")
  const plano: PlanoPagamento = isAnuidadeObrigatoria(a.escalao) ? "Anual" : a.planoPagamento;

  // 1) Garantir a linha de INSCRIÇÃO do atleta (tipo=inscricao)
  await ensureInscricaoAtleta(a.id, baseYear);

  // 2) Garantir prestações do plano
  if (opts?.forceRebuild) {
    // apaga prestações antigas (não mexe na inscrição)
    const del = await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", a.id)
      .eq("tipo", "prestacao");
    if (del.error) throw del.error;
  }

  // consulta atuais para evitar duplicados por descrição
  const exist = await supabase
    .from("pagamentos")
    .select("id,descricao")
    .eq("atleta_id", a.id)
    .eq("tipo", "prestacao");
  if (exist.error) throw exist.error;

  const have = new Set<string>((exist.data || []).map((r: any) => r.descricao));

  const slots = getSlotsForPlano(plano);
  const rowsToInsert: any[] = [];
  for (let i = 0; i < slots; i++) {
    const desc = getPagamentoLabel(plano, i);
    if (have.has(desc)) continue;

    const { y, m0 } = monthForPlanoIndex(plano, i, baseYear);
    const devido_em = iso(y, m0, DUE_DAY);

    rowsToInsert.push({
      atleta_id: a.id,
      tipo: "prestacao",
      descricao: desc,
      comprovativo_url: null,
      validado: null,
      devido_em,
    });
  }

  if (rowsToInsert.length) {
    const ins = await supabase.from("pagamentos").insert(rowsToInsert);
    if (ins.error) throw ins.error;
  }
}

async function ensureInscricaoAtleta(atletaId: string, baseYear: number) {
  const sel = await supabase
    .from("pagamentos")
    .select("id")
    .eq("atleta_id", atletaId)
    .eq("tipo", "inscricao")
    .limit(1);
  if (sel.error) throw sel.error;
  if (sel.data && sel.data.length > 0) return;

  const devido_em = iso(baseYear, 8, DUE_DAY); // 10 de Setembro do ano corrente

  const ins = await supabase.from("pagamentos").insert({
    atleta_id: atletaId,
    tipo: "inscricao",
    descricao: "Inscrição",
    comprovativo_url: null,
    validado: null,
    devido_em,
  });
  if (ins.error) throw ins.error;
}

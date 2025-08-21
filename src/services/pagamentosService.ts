// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";
import type { Atleta } from "../types/Atleta";

/** ----------------------- Tipos ----------------------- */
export type PagamentoRow = {
  id: string;
  user_id: string;
  atleta_id: string | null;
  descricao: string;
  tipo: string | null;         // "mensal", "trimestre", "anual", "inscricao_atleta", "inscricao_socio", etc.
  devido_em: string | null;    // date (YYYY-MM-DD)
  comprovativo_url: string | null;
  validado: boolean | null;
  created_at: string | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

/** ----------------------- Helpers ----------------------- */

const BUCKET = "pagamentos";

function sanitizeFileName(name: string) {
  return (name || "ficheiro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

function getSeasonStartYear(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0=Jan ... 11=Dec
  // Época começa em Setembro; se estamos até Agosto (<=7), a época começou em Setembro do ano anterior
  return m <= 7 ? y - 1 : y;
}

export function isAnuidadeObrigatoria(escalao?: string | null) {
  if (!escalao) return false;
  const s = escalao.toLowerCase();
  return (
    s.includes("masters") ||
    s.includes("sub23") ||
    s.includes("sub 23") ||
    s.includes("sub-23") ||
    s.includes("seniores")
  );
}

export function getSlotsForPlano(plano: Atleta["planoPagamento"] | "Anual") {
  if (plano === "Mensal") return 10;
  if (plano === "Trimestral") return 3;
  return 1; // Anual
}

export function getPagamentoLabel(plano: Atleta["planoPagamento"] | "Anual", idx: number) {
  if (plano === "Anual") return "Pagamento da anuidade";
  if (plano === "Trimestral") return `Pagamento - ${idx + 1}º Trimestre`;
  return `Pagamento - ${idx + 1}º Mês`;
}

/** ----------------------- Listagens ----------------------- */

export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,descricao,tipo,devido_em,comprovativo_url,validado,created_at")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null });
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.comprovativo_url, 3600);
    out.push({ ...r, signedUrl: error ? null : data?.signedUrl ?? null });
  }
  return out;
}

/** ----------------------- CRUD do comprovativo ----------------------- */

export async function saveComprovativo(opts: {
  userId: string;
  atletaId: string;
  descricao: string;
  file: File;
}) {
  const { userId, atletaId, descricao, file } = opts;

  // 1) gerar path e fazer upload
  const fileName = `${Date.now()}_${sanitizeFileName(file.name)}`;
  const path = `${userId}/atletas/${atletaId}/${fileName}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (up.error) throw up.error;

  // 2) tentar obter linha existente para a mesma descrição
  const { data: existing, error: selErr } = await supabase
    .from("pagamentos")
    .select("id,comprovativo_url")
    .eq("atleta_id", atletaId)
    .eq("descricao", descricao)
    .maybeSingle();

  if (selErr) throw selErr;

  // 3) se havia comprovativo anterior, remove-o do storage
  if (existing?.comprovativo_url) {
    // melhor-effort; se falhar, não bloqueia
    await supabase.storage.from(BUCKET).remove([existing.comprovativo_url]);
  }

  // 4) upsert
  if (existing?.id) {
    const { error: updErr } = await supabase
      .from("pagamentos")
      .update({
        comprovativo_url: path,
        // quando o utilizador substitui, volta a estado “pendente de validação”
        validado: false,
      })
      .eq("id", existing.id);
    if (updErr) throw updErr;
    return;
  }

  const { error: insErr } = await supabase.from("pagamentos").insert({
    user_id: userId,
    atleta_id: atletaId,
    descricao,
    tipo: "mensalidade",
    comprovativo_url: path,
    validado: false,
  });
  if (insErr) throw insErr;
}

export async function deletePagamento(row: PagamentoRow) {
  // remover do storage primeiro (best-effort)
  if (row.comprovativo_url) {
    await supabase.storage.from(BUCKET).remove([row.comprovativo_url]);
  }
  const { error } = await supabase.from("pagamentos").delete().eq("id", row.id);
  if (error) throw error;
}

/** ----------------------- Geração de calendário (época) ----------------------- */

export async function ensureScheduleForAtleta(
  atleta: Pick<Atleta, "id" | "escalao" | "planoPagamento">,
  opts?: { forceRebuild?: boolean }
) {
  const atletaId = atleta.id;
  const anualObrig = isAnuidadeObrigatoria(atleta.escalao);
  const planoEfetivo: Atleta["planoPagamento"] | "Anual" = anualObrig ? "Anual" : atleta.planoPagamento;
  const slots = getSlotsForPlano(planoEfetivo);

  // reconstruir se pedido
  if (opts?.forceRebuild) {
    const { error: delErr } = await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atletaId)
      .in("tipo", ["mensal", "trimestre", "anual"])
      .is("comprovativo_url", null); // só remove esqueletos não carregados
    if (delErr) throw delErr;
  }

  // Gerar descrições e datas limite (dia 8)
  const startYear = getSeasonStartYear();
  const items: Array<{ descricao: string; tipo: string; devido_em: string }> = [];

  if (planoEfetivo === "Anual") {
    items.push({
      descricao: getPagamentoLabel("Anual", 0),
      tipo: "anual",
      devido_em: `${startYear}-09-08`,
    });
  } else if (planoEfetivo === "Trimestral") {
    const trimes = [9, 12, 3]; // set/dez/mar
    for (let i = 0; i < slots; i++) {
      const m = trimes[i];
      const y = m >= 9 ? startYear : startYear + 1;
      items.push({
        descricao: getPagamentoLabel("Trimestral", i),
        tipo: "trimestre",
        devido_em: `${y}-${String(m).padStart(2, "0")}-08`,
      });
    }
  } else {
    // Mensal: Setembro..Junho
    const months = [9,10,11,12,1,2,3,4,5,6];
    for (let i = 0; i < slots; i++) {
      const m = months[i];
      const y = m >= 9 ? startYear : startYear + 1;
      items.push({
        descricao: getPagamentoLabel("Mensal", i),
        tipo: "mensal",
        devido_em: `${y}-${String(m).padStart(2, "0")}-08`,
      });
    }
  }

  // Inserir esqueletos que ainda não existam (sem comprovativo)
  for (const it of items) {
    const { data: exist, error: selErr } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("atleta_id", atletaId)
      .eq("descricao", it.descricao)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!exist) {
      const { error: insErr } = await supabase.from("pagamentos").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
        atleta_id: atletaId,
        descricao: it.descricao,
        tipo: it.tipo,
        devido_em: it.devido_em,
        validado: false,
        comprovativo_url: null,
      });
      if (insErr) throw insErr;
    }
  }
}

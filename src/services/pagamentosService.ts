// src/services/pagamentosService.ts
import { supabase } from "../supabaseClient";
import { socioInscricaoAmount } from "../utils/pricing";

export type PagamentoRow = {
  id: string;
  user_id: string | null;
  atleta_id: string | null;
  tipo: string | null;          // p.ex.: "atleta:mensal", "atleta:trimestre", "atleta:anual", "socio:inscricao"
  descricao: string;
  comprovativo_url: string | null;
  created_at: string | null;
  devido_em: string | null;     // YYYY-MM-DD
  validado: boolean | null;
};

export type PagamentoRowWithUrl = PagamentoRow & { signedUrl?: string | null };

const BUCKET = "pagamentos";
const DUE_DAY = 10; // dia limite

export async function withSignedUrls(rows: PagamentoRow[]): Promise<PagamentoRowWithUrl[]> {
  const out: PagamentoRowWithUrl[] = [];
  for (const r of rows || []) {
    if (!r.comprovativo_url) {
      out.push({ ...r, signedUrl: null });
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(r.comprovativo_url, 3600);
    out.push({ ...r, signedUrl: error ? null : data?.signedUrl ?? null });
  }
  return out;
}

/** Lista pagamentos do atleta (com todos os campos que a UI precisa) */
export async function listByAtleta(atletaId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,tipo,descricao,comprovativo_url,created_at,devido_em,validado")
    .eq("atleta_id", atletaId)
    .order("devido_em", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true, nullsFirst: true });

  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

/** Lista a inscrição de sócio (se existir) para um user */
export async function listSocioInscricao(userId: string): Promise<PagamentoRow[]> {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id,user_id,atleta_id,tipo,descricao,comprovativo_url,created_at,devido_em,validado")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "socio:inscricao")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PagamentoRow[];
}

/** Gravar/substituir comprovativo genérico */
export async function saveComprovativo({
  userId,
  atletaId,
  descricao,
  file,
}: {
  userId: string;
  atletaId: string;
  descricao: string;
  file: File;
}) {
  // caminho consistente por atleta + descricao
  const safeDesc = descricao.replace(/[^\p{L}\p{N}\s\-_]/gu, "").replace(/\s+/g, "_");
  const path = `${userId}/atleta/${atletaId}/${Date.now()}_${safeDesc}`;

  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  // encontra a linha pelo atleta+descricao e atualiza comprovativo_url
  const { data: rows, error: selErr } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("atleta_id", atletaId)
    .eq("descricao", descricao)
    .limit(1);

  if (selErr) throw selErr;

  if (rows && rows.length > 0) {
    const { error: upErr } = await supabase
      .from("pagamentos")
      .update({ comprovativo_url: path, validado: false })
      .eq("id", rows[0].id);
    if (upErr) throw upErr;
  } else {
    // fallback: criar
    const { error: insErr } = await supabase
      .from("pagamentos")
      .insert({
        user_id: userId,
        atleta_id: atletaId,
        tipo: "atleta:manual",
        descricao,
        comprovativo_url: path,
        devido_em: null,
        validado: false,
      });
    if (insErr) throw insErr;
  }
}

/** Apagar uma linha + ficheiro (se existir) */
export async function deletePagamento(row: PagamentoRowWithUrl) {
  if (row.comprovativo_url) {
    await supabase.storage.from(BUCKET).remove([row.comprovativo_url]).catch(() => {});
  }
  await supabase.from("pagamentos").delete().eq("id", row.id);
}

/** ===== Agenda de pagamentos do ATLETA (época) ===== */
function thisSeasonStartY(): number {
  const now = new Date();
  const sept1 = new Date(now.getFullYear(), 8, 1); // 1 Sep (mês 8)
  return now >= sept1 ? now.getFullYear() : now.getFullYear() - 1;
}
function makeDate(y: number, m: number, d: number): string {
  // m = 0..11
  const dt = new Date(y, m, d);
  const yyyy = dt.getFullYear();
  const mm = (dt.getMonth() + 1).toString().padStart(2, "0");
  const dd = dt.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function ensureScheduleForAtleta(
  atleta: { id: string; escalao?: string | null; planoPagamento: "Mensal" | "Trimestral" | "Anual" },
  opts?: { forceRebuild?: boolean }
) {
  const seasonY = thisSeasonStartY();
  const months = [8,9,10,11,0,1,2,3,4,5]; // Set(8) .. Jun(5)
  const trimes = [[8,9,10],[11,0,1],[2,3,4]];
  const anualMes = 8; // Setembro

  const baseFilter = supabase.from("pagamentos").select("id").eq("atleta_id", atleta.id);

  if (opts?.forceRebuild) {
    // remove todas as linhas do atleta desta época (apenas as que reconhecemos, por segurança)
    await supabase
      .from("pagamentos")
      .delete()
      .eq("atleta_id", atleta.id);
  }

  if (atleta.planoPagamento === "Mensal") {
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const desc = `Pagamento - ${i + 1}º Mês`;
      const due = makeDate(seasonY + (m <= 5 ? 1 : 0), m, DUE_DAY);
      await upsertOne(atleta.id, "atleta:mensal", desc, due);
    }
  } else if (atleta.planoPagamento === "Trimestral") {
    for (let i = 0; i < trimes.length; i++) {
      const set = trimes[i];
      const lastM = set[set.length - 1];
      const desc = `Pagamento - ${i + 1}º Trimestre`;
      const due = makeDate(seasonY + (lastM <= 5 ? 1 : 0), lastM, DUE_DAY);
      await upsertOne(atleta.id, "atleta:trimestre", desc, due);
    }
  } else {
    const desc = "Pagamento da anuidade";
    const due = makeDate(seasonY, anualMes, DUE_DAY);
    await upsertOne(atleta.id, "atleta:anual", desc, due);
  }
}

async function upsertOne(atletaId: string, tipo: string, descricao: string, devido_em: string) {
  // tenta encontrar por atleta+descricao
  const { data: rows, error: selErr } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("atleta_id", atletaId)
    .eq("descricao", descricao)
    .limit(1);
  if (selErr) throw selErr;

  if (rows && rows.length) {
    await supabase.from("pagamentos").update({ tipo, devido_em }).eq("id", rows[0].id);
  } else {
    await supabase.from("pagamentos").insert({
      user_id: null, // será resolvido pelo RLS via atleta -> user
      atleta_id: atletaId,
      tipo,
      descricao,
      comprovativo_url: null,
      devido_em,
      validado: false,
    });
  }
}

/** ===== Inscrição de SÓCIO (uma linha) ===== */
export async function createInscricaoSocioIfMissing(userId: string) {
  const { data, error } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "socio:inscricao")
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (data) return; // já existe

  const seasonY = thisSeasonStartY();
  const due = makeDate(seasonY, 8, DUE_DAY); // 10 Setembro
  await supabase.from("pagamentos").insert({
    user_id: userId,
    atleta_id: null,
    tipo: "socio:inscricao",
    descricao: "Inscrição de Sócio",
    comprovativo_url: null,
    devido_em: due,
    validado: false,
  });
}

/** guardar comprovativo da inscrição de sócio */
export async function saveComprovativoSocioInscricao(userId: string, file: File) {
  const path = `${userId}/socio/inscricao/${Date.now()}_inscricao_socio`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (up.error) throw up.error;

  // upsert (tem de existir a linha; se não existir criamos)
  const { data: row } = await supabase
    .from("pagamentos")
    .select("id")
    .eq("user_id", userId)
    .is("atleta_id", null)
    .eq("tipo", "socio:inscricao")
    .maybeSingle();

  if (row) {
    const { error: upErr } = await supabase
      .from("pagamentos")
      .update({ comprovativo_url: path, validado: false })
      .eq("id", row.id);
    if (upErr) throw upErr;
  } else {
    const seasonY = thisSeasonStartY();
    const due = makeDate(seasonY, 8, DUE_DAY);
    const { error: insErr } = await supabase.from("pagamentos").insert({
      user_id: userId,
      atleta_id: null,
      tipo: "socio:inscricao",
      descricao: "Inscrição de Sócio",
      comprovativo_url: path,
      devido_em: due,
      validado: false,
    });
    if (insErr) throw insErr;
  }
}

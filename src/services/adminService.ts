import { supabase } from "../supabaseClient";

// verifica se user_id está na tabela app_admins
export async function isAdmin(): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  const id = u?.user?.id;
  if (!id) return false;
  const { data } = await supabase.from("app_admins")
    .select("user_id").eq("user_id", id).maybeSingle();
  return !!data;
}

export async function listSociosEE() {/*…*/}
export async function listAtletasAdmin() {/*…*/}
export async function listPagamentosAdmin() {/*…*/}

export async function signedUrlForStorage(bucket: "documentos"|"pagamentos", path: string) {
  const { data } = await supabase.storage.from(bucket)
    .createSignedUrl(path, 60 * 60); // 1h
  return data?.signedUrl ?? null;
}

export async function marcarPagamentoValidado(id: string, validado: boolean) {
  await supabase.from("pagamentos").update({ validado }).eq("id", id);
}
export async function atualizarSituacaoTesouraria(titularUserId: string, estado: string) {
  await supabase.from("dados_pessoais")
    .update({ situacao_tesouraria: estado }).eq("user_id", titularUserId);
}

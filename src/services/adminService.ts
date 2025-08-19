// src/services/adminService.ts
import { supabase } from "../supabaseClient";

export type AdminState =
  | { ok: false; reason: "no-session" }
  | { ok: false; reason: "not-admin" }
  | { ok: true; userId: string };

export async function checkIsAdmin(): Promise<AdminState> {
  const { data: u, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = u?.user?.id;
  if (!userId) return { ok: false, reason: "no-session" };

  const { data, error: selErr } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;
  if (!data) return { ok: false, reason: "not-admin" };
  return { ok: true, userId };
}

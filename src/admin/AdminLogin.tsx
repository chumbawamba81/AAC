// src/admin/AdminLogin.tsx
import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function AdminLogin({ onLogged }: { onLogged: () => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      onLogged();
    } catch (e: any) {
      setErr(e.message || "Falha ao iniciar sessão");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm border rounded-xl p-4 bg-white space-y-3">
        <h1 className="text-lg font-semibold text-center">Admin · AAC-SB</h1>
        <p className="text-sm text-gray-600 text-center">
          Precisas de iniciar sessão para aceder à área de administração.
        </p>

        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Palavra-passe</Label>
          <Input type="password" value={pass} onChange={(e)=>setPass(e.target.value)} required />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "A entrar..." : "Entrar"}
        </Button>

        <div className="text-center">
          <a href="/" className="text-sm underline">Ir para a página pública</a>
        </div>
      </form>
    </div>
  );
}

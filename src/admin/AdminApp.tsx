import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Skeleton mínimo da área de administração.
 * - Usa a mesma sessão do Supabase
 * - Mostra o e-mail autenticado
 * - Deixa um espaço para navegação/páginas (ex.: Pagamentos, Sócios, Atletas)
 *
 * NOTA: A segurança real é garantida pelas RLS/policies no Supabase.
 * Mesmo que alguém "chegue" a esta UI, só verá/alterará dados se as policies deixarem.
 */

export default function AdminApp() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Sessão inicial
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setEmail(data?.user?.email ?? null);
      setChecking(false);
    });

    // Atualizações de sessão
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
        A verificar sessão…
      </div>
    );
  }

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-xl border p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Admin · AAC-SB</h1>
          <p className="text-sm text-gray-600">
            Precisas de iniciar sessão para aceder à área de administração.
          </p>
          <a
            className="inline-block mt-4 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
            href="/"
          >
            Ir para a página pública
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-bold">AAC-SB · Admin</div>
          <div className="text-xs text-gray-600">Sessão: {email}</div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="text-lg font-semibold mb-2">Dashboard</h2>
          <p className="text-sm text-gray-600">
            Bem-vindo à área de administração. Aqui poderás:
          </p>
          <ul className="text-sm list-disc pl-5 mt-2 space-y-1 text-gray-700">
            <li>Visualizar e filtrar Sócios/EE e Atletas.</li>
            <li>Ver/validar comprovativos e gerir Tesouraria.</li>
            <li>Atualizar “Situação de Tesouraria” do titular.</li>
          </ul>
        </section>

        {/* Quando adicionares a tabela de pagamentos, importa e coloca aqui.
           Exemplo (depois de criares src/components/admin/PaymentsTable.tsx):
           
           <section className="rounded-xl border bg-white p-4">
             <h2 className="text-lg font-semibold mb-3">Pagamentos</h2>
             <PaymentsTable />
           </section>
        */}
      </main>
    </div>
  );
}

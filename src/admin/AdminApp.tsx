// src/admin/AdminApp.tsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import AdminGate from "./AdminGate";
import SociosPage from "./pages/Socios";
import AtletasPage from "./pages/Atletas";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold">AAC-SB · Admin</span>
            <nav className="text-sm flex items-center gap-3">
              <Link to="/admin">Dashboard</Link>
              <Link to="/admin/socios">Sócios/EE</Link>
              <Link to="/admin/atletas">Atletas</Link>
              <Link to="/admin/pagamentos">Tesouraria</Link>
            </nav>
          </div>
          <a className="text-sm underline" href="/">
            Página pública
          </a>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function Dashboard() {
  return <div className="text-sm text-gray-700">Bem-vindo à área de administração.</div>;
}

function Atletas() {
  return <div className="text-sm text-gray-700">Tabela de atletas com filtros e ordenação (em breve).</div>;
}

function Pagamentos() {
  return (
    <div className="text-sm text-gray-700">
      Gestão de tesouraria — validação de comprovativos e atualização da situação de tesouraria (em breve).
    </div>
  );
}

export default function AdminApp() {
  return (
    <AdminGate>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/socios" element={<SociosPage />} />
            <Route path="/admin/atletas" element={<Atletas />} />
            <Route path="/admin/pagamentos" element={<Pagamentos />} />
            {/* fallback */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AdminGate>
  );
}

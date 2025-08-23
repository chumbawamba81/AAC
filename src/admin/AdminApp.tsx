import React from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { LogOut, ExternalLink } from "lucide-react";
import AdminGate from "./AdminGate";
import { supabase } from "../supabaseClient";

import Dashboard from "./pages/Dashboard";
import SociosPage from "./pages/Socios";
import AtletasPage from "./pages/Atletas";
import PagamentosPage from "./pages/Pagamentos";

function Layout({ children }: { children: React.ReactNode }) {
  const baseItem = "px-2 py-1 text-sm transition-colors";
  const inactive = "text-gray-700 hover:text-black";
  const active = "text-black font-semibold border-b-2 border-black";

  const navClasses = ({ isActive }: { isActive: boolean }) =>
    [baseItem, isActive ? active : inactive].join(" ");

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      window.location.href = "/"; // como na app principal
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold">AAC-SB · Admin</span>

            <nav className="flex items-center gap-3">
              <NavLink to="/admin" className={navClasses} end>
                Dashboard
              </NavLink>

              <NavLink to="/admin/socios" className={navClasses}>
                Sócios/EE
              </NavLink>

              <NavLink to="/admin/atletas" className={navClasses}>
                Atletas
              </NavLink>

              <NavLink to="/admin/pagamentos" className={navClasses}>
                Tesouraria
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-sm underline inline-flex items-center gap-1"
              title="Página pública"
            >
              <ExternalLink className="h-4 w-4" />
              Página pública
            </a>
            <button
              onClick={handleLogout}
              className="text-sm rounded-lg border px-3 py-1 hover:bg-gray-100 inline-flex items-center gap-1"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
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
            <Route path="/admin/atletas" element={<AtletasPage />} />
            <Route path="/admin/pagamentos" element={<PagamentosPage />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AdminGate>
  );
}

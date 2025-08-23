import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LogOut, ExternalLink } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { Button } from "../../components/ui/button";

export default function AdminHeader() {
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignora silently; queremos sempre sair
    } finally {
      window.location.href = "/"; // igual à app principal
    }
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 rounded-lg text-sm ${
      isActive ? "font-semibold text-black" : "text-gray-600 hover:text-black"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
      <div className="mx-auto max-w-6xl px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/admin" className="text-lg font-bold">
            AAC-SB · Admin
          </Link>

          <nav className="hidden md:flex items-center gap-2">
            <NavLink to="/admin" className={linkCls} end>
              Dashboard
            </NavLink>
            <NavLink to="/admin/socios" className={linkCls}>
              Sócios/EE
            </NavLink>
            <NavLink to="/admin/atletas" className={linkCls}>
              Atletas
            </NavLink>
            <NavLink to="/admin/pagamentos" className={linkCls}>
              Tesouraria
            </NavLink>
            <a
              href="/"
              className="px-2 py-1 rounded-lg text-sm inline-flex items-center gap-1 text-gray-600 hover:text-black"
              target="_blank"
              rel="noreferrer"
              title="Abrir página pública"
            >
              <ExternalLink className="h-4 w-4" />
              Página pública
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleLogout} aria-label="Sair">
            <LogOut className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}

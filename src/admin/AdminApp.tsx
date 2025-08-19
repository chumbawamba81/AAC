// src/admin/AdminApp.tsx
import React from "react";
import { createBrowserRouter, RouterProvider, Link } from "react-router-dom";
import AdminGate from "./AdminGate";
import PagamentosPage from "../pages/Pagamentos"; // já existente
// Podes criar mais páginas: SociosPage, AtletasPage, DashboardPage, etc.

function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">Admin · AAC-SB</div>
          <nav className="flex gap-4 text-sm">
            <Link to="/admin">Dashboard</Link>
            <Link to="/admin/pagamentos">Pagamentos</Link>
            {/* Acrescenta: <Link to="/admin/socios">Sócios</Link> etc. */}
            <a href="/" className="underline">Público</a>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

function Dashboard() {
  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold mb-2">Dashboard</h1>
      <p className="text-sm text-gray-600">Bem-vindo à área de administração.</p>
    </AdminLayout>
  );
}

function Pagamentos() {
  return (
    <AdminLayout>
      <PagamentosPage />
    </AdminLayout>
  );
}

const router = createBrowserRouter([
  {
    path: "/admin",
    element: (
      <AdminGate>
        <Dashboard />
      </AdminGate>
    ),
  },
  {
    path: "/admin/pagamentos",
    element: (
      <AdminGate>
        <Pagamentos />
      </AdminGate>
    ),
  },
]);

export default function AdminApp() {
  return <RouterProvider router={router} />;
}

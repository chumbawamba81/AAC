import React from "react";
import QuickDiagnostics from "../components/QuickDiagnostics";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          Bem-vindo à Área de Administração da AAC-SB
        </h1>
        <p className="mt-2 text-sm text-gray-600 max-w-3xl">
          Nesta área é possível gerir <strong>Sócios/EE</strong>, consultar <strong>Atletas</strong>,
          validar <strong>tesouraria</strong> (inscrições e quotas) e verificar <strong>documentos</strong>.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Diagnóstico rápido</h2>
        <p className="text-xs text-gray-500 mb-2">
          Serve para confirmar se a app está a comunicar com a base de dados.
        </p>
        <QuickDiagnostics />
      </div>
    </div>
  );
}


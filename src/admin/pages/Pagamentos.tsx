// src/pages/Pagamentos.tsx
import React from "react";

/**
 * Página pública de Pagamentos (não utilizada).
 * A gestão de tesouraria e pagamentos existe na área /admin.
 * Mantemos este stub para não partir o build caso alguém aceda /pagamentos diretamente.
 */
export default function PagamentosPage() {
  return (
    <div className="p-4 text-sm text-gray-600">
      A gestão de pagamentos foi movida para a área de administração.
      Por favor, utilize o separador <strong>Pagamentos</strong> dentro da sua conta
      ou aceda à área <strong>/admin</strong> (apenas administradores).
    </div>
  );
}

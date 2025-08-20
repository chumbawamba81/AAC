import React from "react";

export default function PagamentosPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Tesouraria</h2>
      <p className="text-sm text-gray-600">
        Gestão de tesouraria — validação de comprovativos e atualização da situação de tesouraria.
      </p>

      {/* TODO: substituir por tabela real de pagamentos */}
      <div className="rounded-xl border bg-white p-4">
        <p className="text-sm text-gray-500">
          Em breve: listagem de comprovativos com filtros, ordenação e ações de validação.
        </p>
      </div>
    </div>
  );
}

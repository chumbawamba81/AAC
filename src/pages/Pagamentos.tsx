import React from "react";
import PaymentsTable from "../admin/PaymentsTable";

export default function PagamentosPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <h1 className="text-xl font-semibold mb-4">Pagamentos (Admin)</h1>
      <PaymentsTable />
    </div>
  );
}

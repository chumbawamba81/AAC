// src/admin/pages/Atletas.tsx
import React from "react";
import AthletesTable from "../components/AthletesTable";

export default function AtletasPage() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <AthletesTable />
    </div>
  );
}

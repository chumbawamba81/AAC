// src/admin/Utils/StatusBadge.tsx
import React from "react";

export type StatusBadgeStatus =
  | "Regularizado"
  | "Pendente de validação"
  | "Por regularizar"
  | "Em atraso";

interface StatusBadgeProps {
  status: StatusBadgeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<StatusBadgeStatus, string> = {
    Regularizado: "bg-green-50 text-green-700 inset-ring-green-600/20",
    "Pendente de validação": "bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20",
    "Por regularizar": "bg-gray-50 text-gray-600 inset-ring-gray-500/10",
    "Em atraso": "bg-red-50 text-red-700 inset-ring-red-600/10",
  };

  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring ${map[status]}`}>
      {status}
    </span>
  );
}









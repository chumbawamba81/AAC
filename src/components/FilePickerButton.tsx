// src/components/FilePickerButton.tsx
import React from "react";

type Props = {
  onPick: (file: File) => Promise<void> | void;
  accept?: string;
  capture?: "environment" | "user";
  className?: string;
  children?: React.ReactNode;
};

export default function FilePickerButton({
  onPick,
  accept = "image/*,application/pdf",
  capture,
  className = "",
  children,
}: Props) {
  const [busy, setBusy] = React.useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // limpa o value para permitir escolher o mesmo ficheiro novamente
    e.currentTarget.value = "";
    if (!f) return;
    try {
      setBusy(true);
      await onPick(f);
    } finally {
      setBusy(false);
    }
  }

  return (
    // NÃO é <button>; é <label> com input por cima (opacity 0)
    <label
      className={
        "relative inline-flex items-center gap-2 rounded-2xl border px-4 py-2 font-semibold bg-white hover:bg-gray-50 cursor-pointer " +
        (busy ? "opacity-60 pointer-events-none " : "") +
        className
      }
    >
      {children ?? "Carregar"}
      <input
        type="file"
        accept={accept}
        capture={capture}
        onChange={handleChange}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Selecionar ficheiro"
      />
    </label>
  );
}

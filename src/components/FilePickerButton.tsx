// src/components/FilePickerButton.tsx
import React, { useRef } from "react";
import { Button } from "./ui/button";

type Props = {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "outline" | "secondary" | "destructive" | "default";
  children: React.ReactNode;
  /** Se passares onPick, chamo com o primeiro ficheiro; senão uso onFiles(FileList). */
  onPick?: (file: File) => void | Promise<void>;
  onFiles?: (files: FileList) => void | Promise<void>;
};

export default function FilePickerButton({
  accept = "image/*,application/pdf",
  multiple = false,
  disabled,
  className,
  variant = "outline",
  children,
  onPick,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const stopAll = (e: any) => {
    // Evita “saltar de separador”, mas não interfere com o input em si
    e.preventDefault?.();
    e.stopPropagation?.();
  };

  async function openNativePicker() {
    // Reset antes de abrir para permitir escolher o mesmo ficheiro de novo
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }

  async function handleClick(e: any) {
    stopAll(e);

    const anyWin = window as any;
    // 1) Tenta File System Access API (Chrome/Android) — geralmente mais fiável com o “Ficheiros”
    if (typeof anyWin.showOpenFilePicker === "function") {
      try {
        const handles = await anyWin.showOpenFilePicker({
          multiple,
          excludeAcceptAllOption: true,
          types: [
            {
              description: "Imagens ou PDF",
              accept: {
                "image/*": [".png", ".jpg", ".jpeg", ".webp"],
                "application/pdf": [".pdf"],
              },
            },
          ],
        });
        const files = await Promise.all(handles.map((h: any) => h.getFile()));
        // Alguns gestores de ficheiros podem devolver ficheiros vazios — filtra
        const valid = files.filter((f: File) => f && f.size > 0);
        if (valid.length === 0) throw new Error("empty-files");
        if (onPick) await onPick(valid[0]);
        else if (onFiles) {
          const dt = new DataTransfer();
          valid.forEach((f) => dt.items.add(f));
          await onFiles(dt.files);
        }
        return;
      } catch (err) {
        // cancelado ou falhou → cai para o input tradicional
      }
    }

    // 2) Fallback universal
    await openNativePicker();
  }

  const onChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const fl = e.currentTarget.files;
    if (!fl || fl.length === 0) return;
    try {
      if (onPick) await onPick(fl[0]);
      else if (onFiles) await onFiles(fl);
    } finally {
      // limpar para permitir o mesmo ficheiro
      e.currentTarget.value = "";
    }
  };

  return (
    <span
      // Bloqueia propagação em CAPTURE para não ativar tabs/links parent
      onClickCapture={stopAll}
      onMouseDownCapture={stopAll}
      onPointerDownCapture={stopAll}
      onTouchStartCapture={stopAll}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        // Mantemos invisível mas funcional
        style={{ position: "fixed", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
        onChange={onChange}
      />
      <Button
        type="button"
        variant={variant as any}
        className={className}
        disabled={disabled}
        onClick={handleClick}
        // Em Android/EMUI, alguns toques só disparam touch — cobrir também:
        onTouchEnd={handleClick}
      >
        {children}
      </Button>
    </span>
  );
}

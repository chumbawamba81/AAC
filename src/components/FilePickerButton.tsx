// src/components/FilePickerButton.tsx
import React, { useRef } from "react";
import { Button } from "./ui/button";

type Variant = "outline" | "secondary" | "destructive" | "default" | "ghost";

type PropsBase = {
  accept?: string;
  multiple?: boolean;
  /** Podes usar "environment" para abrir a câmara traseira em mobile */
  capture?: "environment" | "user" | boolean | string;
  className?: string;
  children: React.ReactNode;
  variant?: Variant;
};

type Props = PropsBase & {
  /** Usa UM deles: onPick (um ficheiro) OU onFiles (FileList) */
  onPick?: (file: File) => void;
  onFiles?: (files: FileList) => void;
};

export default function FilePickerButton({
  onPick,
  onFiles,
  accept = "image/*,application/pdf",
  multiple = false,
  capture,
  children,
  variant = "outline",
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function emit(files: FileList) {
    if (onFiles) onFiles(files);
    if (onPick && files.length > 0) onPick(files[0]);
  }

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Evita que um pai (tabs/link) apanhe o clique:
    e.preventDefault();
    e.stopPropagation();

    const anyWin = window as any;
    const supportsNativePicker = typeof anyWin.showOpenFilePicker === "function";

    if (supportsNativePicker && !capture) {
      try {
        const handles = await anyWin.showOpenFilePicker({
          multiple,
          types: [
            {
              description: "Ficheiros",
              accept: {
                "image/*": [".png", ".jpg", ".jpeg", ".webp"],
                "application/pdf": [".pdf"],
              },
            },
          ],
        });
        const files = await Promise.all(handles.map((h: any) => h.getFile()));
        const dt = new DataTransfer();
        files.forEach((f: File) => dt.items.add(f));
        emit(dt.files);
        return;
      } catch {
        // cancelado → fallback para input
      }
    }

    inputRef.current?.click();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        // @ts-expect-error atributo suportado em mobile
        capture={capture}
        style={{ position: "fixed", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
        onClick={(e) => {
          // iOS/Android às vezes disparam click no input → travar borbulhação
          e.stopPropagation();
        }}
        onChange={(e) => {
          e.stopPropagation();
          const f = e.currentTarget.files;
          if (f && f.length > 0) emit(f);
          // limpa para poder voltar a escolher o mesmo ficheiro
          e.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant={variant as any}
        className={className}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onTouchStart={(e) => { e.stopPropagation(); }}
        onClick={handleClick}
      >
        {children}
      </Button>
    </>
  );
}

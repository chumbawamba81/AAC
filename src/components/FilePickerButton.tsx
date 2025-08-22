// src/components/FilePickerButton.tsx
import React, { useRef } from "react";
import { Button } from "./ui/button";

type Variant = "outline" | "secondary" | "destructive" | "default" | "ghost";

type PropsBase = {
  /** Aceites por <input type="file"> */
  accept?: string;
  multiple?: boolean;
  /** Útil em mobile para abrir câmara: "environment" | "user" */
  capture?: "environment" | "user" | boolean | string;
  className?: string;
  children: React.ReactNode;
  /** Passa para o shadcn Button */
  variant?: Variant;
};

/** 
 * Podes usar EITHER onPick (um ficheiro) OU onFiles (FileList).
 * Mantemos ambos para retrocompatibilidade com o código existente.
 */
type Props = PropsBase & {
  onPick?: (file: File) => void;
  onFiles?: (files: FileList) => void;
};

/**
 * Botão robusto para abrir o seletor de ficheiros.
 * - Em browsers com showOpenFilePicker usa-o (desktop moderno)
 * - Em iOS/Android usa input.click() (mais fiável) — suporta `capture`
 */
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

  async function handleClick() {
    // iOS Safari não suporta showOpenFilePicker -> fallback imediato
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
        // cancelado → usa fallback
      }
    }

    // Fallback (ou forçar câmara via `capture`)
    inputRef.current?.click();
  }

  function emit(files: FileList) {
    if (onFiles) onFiles(files);
    if (onPick && files.length > 0) onPick(files[0]);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        // @ts-expect-error - atributo nativo suportado por mobile browsers
        capture={capture}
        style={{ position: "fixed", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
        onChange={(e) => {
          const f = e.currentTarget.files;
          if (f && f.length > 0) emit(f);
          // limpar para permitir escolher o mesmo ficheiro novamente
          e.currentTarget.value = "";
        }}
      />
      <Button type="button" variant={variant as any} className={className} onClick={handleClick}>
        {children}
      </Button>
    </>
  );
}

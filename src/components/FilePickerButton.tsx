import React, { useRef } from "react";
import { Button } from "./ui/button";

/**
 * Botão robusto para abrir o seletor de ficheiros.
 * Usa showOpenFilePicker quando disponível e faz fallback para input.click().
 */
export default function FilePickerButton({
  onFiles,
  accept = "image/*,application/pdf",
  multiple = false,
  children,
  variant = "outline",
}: {
  onFiles: (files: FileList) => void;
  accept?: string;
  multiple?: boolean;
  children: React.ReactNode;
  variant?: "outline" | "secondary" | "destructive" | "default";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleClick() {
    const anyWin = window as any;
    if (typeof anyWin.showOpenFilePicker === "function") {
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
        files.forEach((f) => dt.items.add(f));
        onFiles(dt.files);
        return;
      } catch {
        /* cancelado → usa fallback */
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
        style={{ position: "fixed", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
        onChange={(e) => {
          if (e.currentTarget.files && e.currentTarget.files.length > 0) {
            onFiles(e.currentTarget.files);
          }
          e.currentTarget.value = ""; // permite selecionar o mesmo ficheiro novamente
        }}
      />
      <Button type="button" variant={variant as any} onClick={handleClick}>
        {children}
      </Button>
    </>
  );
}

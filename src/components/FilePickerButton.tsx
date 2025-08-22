import React, { useRef } from "react";
import { Button } from "./ui/button";

type Props = {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "outline" | "secondary" | "destructive" | "default";
  children: React.ReactNode;
  /** Usa um dos dois handlers: */
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

  const openPicker = (e: React.MouseEvent | React.TouchEvent) => {
    // Evita navegar/trocar de tab em Android (bubbling para <a>/<Link> ou tabs)
    e.preventDefault();
    e.stopPropagation();
    inputRef.current?.click();
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;

    try {
      if (onPick) await onPick(files[0]);
      else if (onFiles) await onFiles(files);
    } finally {
      // permite escolher novamente o mesmo ficheiro
      e.currentTarget.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        // invisível mas presente no DOM
        style={{ position: "fixed", opacity: 0, pointerEvents: "none", width: 1, height: 1, top: 0, left: 0 }}
        onChange={handleChange}
        // Em alguns Androids, o onClick do input ajuda a “resetar” a seleção anterior
        onClick={(e) => {
          (e.currentTarget as HTMLInputElement).value = "";
        }}
      />
      <Button
        type="button"
        variant={variant as any}
        className={className}
        disabled={disabled}
        onClick={openPicker}
        onTouchEnd={openPicker}
      >
        {children}
      </Button>
    </>
  );
}

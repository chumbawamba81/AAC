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
    e.preventDefault();
    e.stopPropagation();
  };

  const openPicker = (e: React.MouseEvent | React.TouchEvent) => {
    stopAll(e);
    inputRef.current?.click();
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.currentTarget.files;
    if (!files || files.length === 0) return;
    try {
      if (onPick) await onPick(files[0]);
      else if (onFiles) await onFiles(files);
    } finally {
      e.currentTarget.value = ""; // permitir o mesmo ficheiro de novo
    }
  };

  return (
    <span
      // Bloqueia qualquer handler de tabs/links em CAPTURE
      onClickCapture={stopAll}
      onMouseDownCapture={stopAll}
      onPointerDownCapture={stopAll}
      onTouchStartCapture={stopAll}
      onTouchEndCapture={stopAll}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ position: "fixed", opacity: 0, pointerEvents: "none", width: 1, height: 1, top: 0, left: 0 }}
        onChange={handleChange}
        onClick={(e) => {
          // reset antes de abrir o picker (alguns Androids precisam disto)
          (e.currentTarget as HTMLInputElement).value = "";
        }}
      />
      <Button
        type="button"
        variant={variant as any}
        className={className}
        disabled={disabled}
        // Também bloqueia em CAPTURE no próprio botão
        onMouseDownCapture={stopAll}
        onPointerDownCapture={stopAll}
        onTouchStartCapture={stopAll}
        onTouchEnd={openPicker}
        onClick={openPicker}
      >
        {children}
      </Button>
    </span>
  );
}

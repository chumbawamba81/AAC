import React, { useRef } from "react";
import { Button } from "./ui/button";

type Props = {
  children: React.ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  onFiles?: (files: FileList | null) => void;
};

const IS_ANDROID = /Android/i.test(navigator.userAgent);
// No Android, alguns pickers são mais “esquisitos” com accept — usar mais permissivo ajuda
const ANDROID_ACCEPT = "*/*";

export default function FilePickerButton({
  children,
  accept = "image/*,application/pdf",
  multiple,
  disabled,
  variant = "outline",
  className,
  onFiles,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={IS_ANDROID ? ANDROID_ACCEPT : accept}
        multiple={multiple}
        // MUITO IMPORTANTE: limpar para garantir novo onChange mesmo com o mesmo ficheiro
        onClick={(e) => {
          (e.currentTarget as HTMLInputElement).value = "";
        }}
        onChange={(e) => {
          const el = e.currentTarget;
          const files = el.files;
          // limpar ANTES de começar o processamento (Android)
          el.value = "";
          onFiles?.(files);
        }}
      />
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        className={className}
        onClick={() => inputRef.current?.click()}
      >
        {children}
      </Button>
    </>
  );
}

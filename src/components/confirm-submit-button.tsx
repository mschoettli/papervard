"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function ConfirmSubmitButton({
  message,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message: string }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-transform active:scale-[0.96]",
        className
      )}
    >
      {children}
    </button>
  );
}

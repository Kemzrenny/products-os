"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet btn-sm"
      onClick={async () => {
        const full = text.startsWith("/") ? `${window.location.origin}${text}` : text;
        await navigator.clipboard.writeText(full).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />} {done ? "Copied" : label}
    </button>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function SiteMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" className="btn-quiet size-10 px-0" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((v) => !v)}>
        {open ? <X size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
      </button>
      {open && (
        <div className="card absolute inset-x-4 top-full mt-2 flex flex-col p-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-bg-2">
              {l.label}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold hover:bg-bg-2">Sign in</Link>
        </div>
      )}
    </div>
  );
}

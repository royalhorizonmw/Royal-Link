"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";

type Item = { href: string; label: string; icon: string };

export function Sidebar({ items, user }: { items: Item[]; user: { name: string; role: string } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <>
      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
        <Brand />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          <Icon name="menu" />
        </button>
      </div>

      <aside
        className={`${open ? "block" : "hidden"} border-b border-line bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-[256px] lg:shrink-0 lg:border-r lg:border-b-0`}
      >
        <nav aria-label="Main" className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4 lg:py-6">
          <div className="hidden px-2 pb-5 lg:block"><Brand /></div>
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`flex min-h-[40px] items-center gap-3 rounded-[10px] px-3 text-[14px] transition ${
                isActive(it.href) ? "bg-brand-600 font-bold text-white" : "font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              <Icon name={it.icon} /> {it.label}
            </Link>
          ))}
          <div className="mt-auto border-t border-line px-2 pt-4 text-[12px] text-muted">
            Signed in as
            <div className="text-[14px] font-semibold text-ink">{user.name}</div>
            <div>{user.role.charAt(0) + user.role.slice(1).toLowerCase()} · <Link href="/settings/account" className="font-semibold text-brand-700" onClick={() => setOpen(false)}>My account</Link></div>
            <form action="/logout" method="post" className="mt-3">
              <button className="btn btn-ghost btn-sm w-full" type="submit"><Icon name="logout" size={16} /> Sign out</button>
            </form>
          </div>
        </nav>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-600 text-[14px] font-extrabold text-white">RL</span>
      <span>
        <span className="block text-[15px] font-bold leading-tight text-ink">Royal Link</span>
        <span className="block text-[12px] text-muted">Transports &amp; Travels</span>
      </span>
    </Link>
  );
}

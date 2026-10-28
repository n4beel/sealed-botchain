"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { app } from "@/lib/app-config";

export interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "The Wall" },
  { href: "/new", label: "Inscribe Lot" },
  { href: "/me", label: "My Folio" },
];

export default function PlaqueHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-3 py-3 pointer-events-none">
      <div className="max-w-[960px] mx-auto flex items-center justify-between gap-3 pointer-events-auto">
        {/* Brass museum plaque */}
        <div
          className="flex items-center gap-4 px-4 py-2"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--accent)",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.5)",
            borderRadius: "2px",
          }}
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 no-underline group"
          >
            <span
              className="w-2 h-2 rotate-45 flex-shrink-0 transition-transform group-hover:rotate-90 duration-300"
              style={{ background: "var(--accent)" }}
              aria-hidden="true"
            />
            <span className="font-serif text-[17px] font-semibold tracking-[0.18em] uppercase text-[#F2EFE6]">
              {app.name}
            </span>
          </Link>

          <span className="h-4 w-[1px] bg-[#2F5546]" aria-hidden="true" />

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="px-2.5 py-1 text-[11px] font-mono tracking-wider uppercase no-underline transition-colors duration-150"
                  style={{
                    color: active ? "var(--accent)" : "var(--text-secondary)",
                    borderBottom: active ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          <NetworkBadge />
          <div className="w-[150px] sm:w-[175px]">
            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}

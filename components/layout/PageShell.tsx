"use client";

import PlaqueHeader from "@/components/gallery/PlaqueHeader";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

interface PageShellProps {
  children: React.ReactNode;
}

/**
 * Gallery PageShell for Archetype U · Gallery (Sealed).
 * Museum wall background #0F2A22 with floating brass plaque header.
 */
export default function PageShell({ children }: PageShellProps) {
  const links = footerLinks();

  return (
    <div
      className="flex flex-col min-h-[100dvh] overflow-x-hidden"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Slim brass plaque top-center */}
      <PlaqueHeader />

      {/* Main gallery space */}
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-4 sm:px-6 md:px-8 pt-24 pb-16">
        {children}
      </main>

      {/* Museum imprint footer */}
      <footer
        className="w-full border-t border-[#214236] py-8 px-4 sm:px-6 md:px-8 bg-[#0C221B]"
      >
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
            <span className="font-serif text-[15px] font-semibold tracking-wider text-[#C8A24A] uppercase">
              {app.name}
            </span>
            <span className="hidden sm:inline text-[#2F5546]">•</span>
            <span className="text-[12px] font-sans text-[#B9C7BD]">
              {app.tagline}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-[12px] font-mono">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rotate-45"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <BuiltOnBotChain className="text-[11px] uppercase tracking-wider text-[#B9C7BD]" />
            </span>

            <a
              href={links.site}
              target="_blank"
              rel="noreferrer"
              className="text-[#B9C7BD] hover:text-[#C8A24A] transition-colors underline underline-offset-4 decoration-[#2F5546]"
            >
              botchain.ai
            </a>

            <a
              href={links.explorer}
              target="_blank"
              rel="noreferrer"
              className="text-[#B9C7BD] hover:text-[#C8A24A] transition-colors underline underline-offset-4 decoration-[#2F5546]"
            >
              BOT Chain Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

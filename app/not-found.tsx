import Link from "next/link";
import PageShell from "@/components/layout/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="py-20 text-center flex flex-col items-center justify-center gap-6 max-w-md mx-auto">
        {/* Empty picture frame wire */}
        <div className="w-24 h-32 border border-dashed border-[#C8A24A]/50 bg-[#143528]/40 flex flex-col items-center justify-center p-3 relative">
          <span className="font-mono text-[24px] text-[#C8A24A]/60">?</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#7D9688] mt-2">
            EMPTY FRAME
          </span>
        </div>

        <div>
          <span className="font-mono text-[11px] text-[#C8A24A] uppercase tracking-wider">
            Exhibition Error 404
          </span>
          <h1 className="mt-1 font-serif text-[32px] text-[#F2EFE6]">
            Lot Not Found
          </h1>
          <p className="mt-2 font-sans text-[13px] text-[#B9C7BD] leading-relaxed">
            This catalog lot does not hang upon the gallery wall or has been permanently removed.
          </p>
        </div>

        <Link
          href="/"
          className="px-5 py-2.5 border border-[#C8A24A] text-[#C8A24A] font-mono text-[12px] uppercase tracking-wider hover:bg-[#C8A24A] hover:text-[#1B1405] transition-colors no-underline rounded-[1px]"
        >
          Return to The Wall
        </Link>
      </div>
    </PageShell>
  );
}

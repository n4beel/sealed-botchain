import React from "react";

/**
 * LimitationBlock for Sealed (Archetype U · Gallery)
 * Exactly reproduces the 3 limitation statements from spec §1 and §3.4.
 */
export default function LimitationBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "p-6 md:p-7 border border-[#2F5546] bg-[#143528]/80 text-[#F2EFE6] relative overflow-hidden",
        className,
      ].join(" ")}
      style={{
        boxShadow: "0 6px 24px rgba(0, 0, 0, 0.35)",
        borderRadius: "2px",
      }}
    >
      {/* Decorative brass corner tick */}
      <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none">
        <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-[#C8A24A]" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-1.5 h-1.5 rotate-45 flex-shrink-0"
          style={{ background: "var(--accent)" }}
          aria-hidden="true"
        />
        <h3 className="font-serif text-[18px] tracking-wide text-[#C8A24A] font-medium uppercase">
          What a sealed bid can't do
        </h3>
      </div>

      <ul className="space-y-2.5 font-sans text-[13px] leading-relaxed text-[#B9C7BD]">
        <li className="flex items-start gap-2.5">
          <span className="font-mono text-[#C8A24A] select-none text-[12px] mt-0.5">•</span>
          <span>The contract sells a claim, not the lot.</span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="font-mono text-[#C8A24A] select-none text-[12px] mt-0.5">•</span>
          <span>Miss the reveal and you lose 10% of your deposit.</span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="font-mono text-[#C8A24A] select-none text-[12px] mt-0.5">•</span>
          <span>You can hide your bid by depositing more than it.</span>
        </li>
      </ul>
    </div>
  );
}

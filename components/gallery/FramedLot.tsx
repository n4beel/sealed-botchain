"use client";

import React from "react";

interface FramedLotProps {
  id: bigint | number;
  title: string;
  phase: number; // 0 commit, 1 reveal, 2 ended, 3 settled
  isEnlarged?: boolean;
  className?: string;
}

export default function FramedLot({
  id,
  title,
  phase,
  isEnlarged = false,
  className = "",
}: FramedLotProps) {
  // Deterministic aesthetic seed based on id and title length
  const numId = Number(id);
  const patternSeed = (numId * 17 + title.length * 7) % 5;

  return (
    <div
      className={[
        "relative select-none",
        isEnlarged ? "w-full max-w-[460px]" : "w-full",
        "lot-frame-transition group",
        className,
      ].join(" ")}
      style={{
        aspectRatio: "4/5",
        border: "1px solid var(--accent)",
        background: "var(--mat-bg)",
        boxShadow: "0 12px 36px var(--frame-shadow), inset 0 0 0 1px rgba(200, 162, 74, 0.4)",
        borderRadius: "1px",
      }}
    >
      {/* Brass corner brackets */}
      <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-[#C8A24A]" />
      <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t border-r border-[#C8A24A]" />
      <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b border-l border-[#C8A24A]" />
      <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-[#C8A24A]" />

      {/* Ivory Mat Window */}
      <div className="absolute inset-4 sm:inset-5 border border-[#DCD7C9] bg-[#FAF8F2] flex flex-col justify-between p-4 sm:p-5 overflow-hidden">
        {/* Top Lot Header */}
        <div className="flex items-center justify-between border-b border-[#E6E0D2] pb-2 text-[#4A4F4A]">
          <span className="font-serif text-[13px] tracking-[0.2em] uppercase text-[#1C2420] font-semibold">
            LOT NO. {String(numId).padStart(3, "0")}
          </span>
          <span className="font-mono text-[10px] tracking-wider uppercase text-[#6B7870]">
            BOHR • 968
          </span>
        </div>

        {/* Center Artwork Engraving Canvas */}
        <div className="flex-1 flex flex-col items-center justify-center py-4 relative">
          {/* Subtle concentric compass / astrological engraving circle */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full text-[#8C988F] opacity-75"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
            >
              <circle cx="100" cy="100" r="95" strokeDasharray="3 3" />
              <circle cx="100" cy="100" r="85" />
              <circle cx="100" cy="100" r="70" strokeWidth="0.5" />
              <circle cx="100" cy="100" r="50" />
              <circle cx="100" cy="100" r="30" strokeDasharray="2 2" />

              {/* Crosshairs & compass rays */}
              <line x1="100" y1="5" x2="100" y2="195" strokeWidth="0.5" />
              <line x1="5" y1="100" x2="195" y2="100" strokeWidth="0.5" />
              <line x1="33" y1="33" x2="167" y2="167" strokeWidth="0.3" />
              <line x1="33" y1="167" x2="167" y2="33" strokeWidth="0.3" />

              {/* Variable glyph based on seed */}
              {patternSeed === 0 && (
                <polygon
                  points="100,60 135,120 65,120"
                  stroke="#C8A24A"
                  strokeWidth="1"
                  fill="none"
                />
              )}
              {patternSeed === 1 && (
                <rect
                  x="75"
                  y="75"
                  width="50"
                  height="50"
                  transform="rotate(45 100 100)"
                  stroke="#C8A24A"
                  strokeWidth="1"
                  fill="none"
                />
              )}
              {patternSeed === 2 && (
                <circle cx="100" cy="100" r="20" stroke="#C8A24A" strokeWidth="1.2" fill="none" />
              )}
              {patternSeed === 3 && (
                <path
                  d="M100 70 L120 100 L100 130 L80 100 Z"
                  stroke="#C8A24A"
                  strokeWidth="1"
                  fill="none"
                />
              )}
              {patternSeed === 4 && (
                <polygon
                  points="100,65 110,85 135,88 116,106 121,130 100,118 79,130 84,106 65,88 90,85"
                  stroke="#C8A24A"
                  strokeWidth="0.8"
                  fill="none"
                />
              )}
            </svg>

            {/* Embossed Wax Seal Badge */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              {phase === 0 && (
                <div className="w-16 h-16 rounded-full border border-[#C8A24A] bg-[#143528]/10 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="font-mono text-[9px] text-[#A67C1E] tracking-widest uppercase font-semibold">
                    SEALED
                  </span>
                </div>
              )}
              {phase === 1 && (
                <div className="w-16 h-16 rounded-full border border-[#F0C987] bg-[#F0C987]/15 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="font-mono text-[9px] text-[#C48820] tracking-widest uppercase font-semibold">
                    REVEAL
                  </span>
                </div>
              )}
              {phase === 3 && (
                <div className="w-16 h-16 rounded-full border border-[#8BD3A8] bg-[#8BD3A8]/15 flex items-center justify-center backdrop-blur-[1px]">
                  <span className="font-mono text-[9px] text-[#2C6B46] tracking-widest uppercase font-semibold">
                    SETTLED
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="mt-3 text-center font-serif text-[15px] italic text-[#4F5952] max-w-[200px] line-clamp-1">
            "{title}"
          </p>
        </div>

        {/* Bottom Catalog Fine Text */}
        <div className="border-t border-[#E6E0D2] pt-2 flex items-center justify-between text-[#6B7870]">
          <span className="font-mono text-[9px] uppercase tracking-wider">
            VICKREY ESCROW
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider">
            PROVENANCE ON-CHAIN
          </span>
        </div>
      </div>
    </div>
  );
}

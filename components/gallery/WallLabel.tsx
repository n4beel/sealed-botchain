"use client";

import Link from "next/link";
import { formatEther } from "viem";
import { formatRemaining } from "@/lib/sealed";

interface WallLabelProps {
  id: bigint | number;
  title: string;
  reserve: bigint;
  phase: number;
  commitEnd: bigint;
  revealEnd: bigint;
  bidders: number;
  revealed: number;
  settled: boolean;
  top?: bigint;
  second?: bigint;
  winner?: string;
  currentTime?: bigint;
}

export default function WallLabel({
  id,
  title,
  reserve,
  phase,
  commitEnd,
  revealEnd,
  bidders,
  revealed,
  settled,
  top = 0n,
  second = 0n,
  winner,
  currentTime,
}: WallLabelProps) {
  const now = currentTime ?? BigInt(Math.floor(Date.now() / 1000));

  let phaseLabel = "Bidding Open";
  let phaseColor = "text-[#C8A24A] border-[#C8A24A]/40";
  let timeText = "";

  if (settled) {
    phaseLabel = winner && winner !== "0x0000000000000000000000000000000000000000" ? "Settled" : "Ended / Cancelled";
    phaseColor = "text-[#8BD3A8] border-[#8BD3A8]/40";
  } else if (now < commitEnd) {
    phaseLabel = "Bidding Open";
    phaseColor = "text-[#C8A24A] border-[#C8A24A]/40";
    timeText = `Closes in ${formatRemaining(commitEnd - now)}`;
  } else if (now < revealEnd) {
    phaseLabel = "Reveals Open";
    phaseColor = "text-[#F0C987] border-[#F0C987]/40";
    timeText = `Reveals close in ${formatRemaining(revealEnd - now)}`;
  } else {
    phaseLabel = "Awaiting Settlement";
    phaseColor = "text-[#B9C7BD] border-[#B9C7BD]/40";
    timeText = "Ready to settle";
  }

  return (
    <div className="mt-4 flex flex-col gap-2 px-1">
      {/* Title in Cormorant 28px */}
      <Link href={`/lot/${id}`} className="no-underline group">
        <h2 className="font-serif text-[26px] sm:text-[28px] font-normal leading-tight text-[#F2EFE6] group-hover:text-[#C8A24A] transition-colors duration-150 line-clamp-2">
          {title}
        </h2>
      </Link>

      {/* Reserve and Phase in DM Mono 12px */}
      <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3 pt-1 border-t border-[#214236]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-[#B9C7BD]">
            Reserve:
          </span>
          <span className="font-mono text-[12px] font-medium text-[#C8A24A]">
            {formatEther(reserve)} BOT
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[11px] uppercase tracking-wider px-2 py-0.5 border ${phaseColor}`}
          >
            {phaseLabel}
          </span>
        </div>
      </div>

      {/* Sub-label: Bidders & Timing */}
      <div className="flex items-center justify-between text-[11px] font-mono text-[#7D9688]">
        <span>
          {bidders === 0 ? "No sealed bids yet" : `${bidders} sealed bid${bidders === 1 ? "" : "s"}`}
          {phase >= 1 && bidders > 0 ? ` (${revealed} revealed)` : ""}
        </span>
        {timeText && <span>{timeText}</span>}
      </div>

      {/* Settled second price info if available */}
      {settled && top > 0n && (
        <div className="mt-1 p-2 bg-[#143528] border border-[#2F5546] text-[11px] font-mono flex items-center justify-between text-[#F2EFE6]">
          <span className="text-[#B9C7BD]">Second Price:</span>
          <span className="text-[#8BD3A8] font-medium">
            {formatEther(second >= reserve ? second : reserve)} BOT
          </span>
        </div>
      )}
    </div>
  );
}

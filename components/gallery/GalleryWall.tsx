"use client";

import { useState } from "react";
import Link from "next/link";
import FramedLot from "./FramedLot";
import WallLabel from "./WallLabel";

export interface GalleryLot {
  id: bigint;
  seller: string;
  commitEnd: bigint;
  revealEnd: bigint;
  reserve: bigint;
  top: bigint;
  second: bigint;
  winner: string;
  bidders: number;
  revealed: number;
  settled: boolean;
  title: string;
  phase: number;
}

interface GalleryWallProps {
  lots: GalleryLot[];
  currentTime?: bigint;
}

type Filter = "all" | "bidding" | "revealing" | "ended";

export default function GalleryWall({ lots, currentTime }: GalleryWallProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const filteredLots = lots.filter((lot) => {
    if (filter === "all") return true;
    if (filter === "bidding") return lot.phase === 0;
    if (filter === "revealing") return lot.phase === 1;
    if (filter === "ended") return lot.phase >= 2;
    return true;
  });

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Wall Header & Filter Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#214236] pb-4">
        <div>
          <h1 className="font-serif text-[32px] sm:text-[36px] font-normal leading-tight text-[#F2EFE6]">
            The Gallery Wall
          </h1>
          <p className="mt-1 font-sans text-[13px] text-[#B9C7BD]">
            Single-lot Vickrey second-price auctions recorded in secret on-chain.
          </p>
        </div>

        {/* Filter chips: Bidding · Revealing · Ended */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#143528] border border-[#214236] rounded-[2px] self-start sm:self-auto">
          {(
            [
              { id: "all", label: "All Lots" },
              { id: "bidding", label: "Bidding" },
              { id: "revealing", label: "Revealing" },
              { id: "ended", label: "Ended" },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="px-3 py-1 text-[11px] font-mono tracking-wider uppercase transition-all duration-150 cursor-pointer"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  borderRadius: "1px",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Wall Display */}
      {filteredLots.length === 0 ? (
        <div className="w-full py-20 px-6 border border-dashed border-[#2F5546] bg-[#143528]/30 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-full border border-[#C8A24A]/40 flex items-center justify-center">
            <span className="w-3 h-3 rotate-45 bg-[#C8A24A]/50" />
          </div>
          <p className="font-serif text-[22px] italic text-[#F2EFE6]">
            No lots are hanging.
          </p>
          <p className="font-sans text-[13px] text-[#B9C7BD] max-w-sm">
            Be the first seller to inscribe an off-chain lot on the wall.
          </p>
          <Link
            href="/new"
            className="mt-2 inline-flex items-center px-4 py-2 border border-[#C8A24A] text-[#C8A24A] font-mono text-[11px] uppercase tracking-wider hover:bg-[#C8A24A] hover:text-[#1B1405] transition-colors duration-150 no-underline"
          >
            Inscribe a New Lot
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-12 lg:gap-14">
          {filteredLots.map((lot) => (
            <div key={String(lot.id)} className="flex flex-col">
              <Link href={`/lot/${lot.id}`} className="no-underline">
                <FramedLot id={lot.id} title={lot.title} phase={lot.phase} />
              </Link>
              <WallLabel
                id={lot.id}
                title={lot.title}
                reserve={lot.reserve}
                phase={lot.phase}
                commitEnd={lot.commitEnd}
                revealEnd={lot.revealEnd}
                bidders={lot.bidders}
                revealed={lot.revealed}
                settled={lot.settled}
                top={lot.top}
                second={lot.second}
                winner={lot.winner}
                currentTime={currentTime}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

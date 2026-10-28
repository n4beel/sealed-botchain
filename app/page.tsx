"use client";

import { useReadContract, useBlock } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import GalleryWall, { type GalleryLot } from "@/components/gallery/GalleryWall";
import LimitationBlock from "@/components/gallery/LimitationBlock";
import { sealedAbi } from "@/lib/botchain/abi";
import { getContractAddress } from "@/lib/botchain/deployment";
import { phaseAt } from "@/lib/sealed";

export default function Home() {
  const contractAddress = getContractAddress();
  const { data: block } = useBlock({ watch: true });
  const currentTime = block ? block.timestamp : BigInt(Math.floor(Date.now() / 1000));

  // Query newest 24 lots
  const { data: latestLots, isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: sealedAbi,
    functionName: "latest",
    args: [0n, 24n],
    query: {
      refetchInterval: 5000,
    },
  });

  const { data: lotCount } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: sealedAbi,
    functionName: "auctionCount",
    query: {
      refetchInterval: 5000,
    },
  });

  // Map raw on-chain lots to GalleryLot with calculated phases
  const lots: GalleryLot[] = (latestLots || []).map((l, index) => {
    // contract latest returns newest first, so id = lotCount - index
    const total = lotCount ? Number(lotCount) : (latestLots?.length || 0);
    const id = BigInt(total - index);

    const phase = phaseAt(
      {
        commitEnd: l.commitEnd,
        revealEnd: l.revealEnd,
        settled: l.settled,
      },
      currentTime
    );

    return {
      id,
      seller: l.seller,
      commitEnd: l.commitEnd,
      revealEnd: l.revealEnd,
      reserve: l.reserve,
      top: l.top,
      second: l.second,
      winner: l.winner,
      bidders: l.bidders,
      revealed: l.revealed,
      settled: l.settled,
      title: l.title,
      phase,
    };
  });

  return (
    <PageShell>
      <div className="flex flex-col gap-12">
        {isLoading ? (
          <div className="py-24 text-center font-serif text-[22px] italic text-[#B9C7BD]">
            Viewing the gallery wall...
          </div>
        ) : (
          <GalleryWall lots={lots} currentTime={currentTime} />
        )}

        {/* What a sealed bid can't do */}
        <div className="pt-6 border-t border-[#214236]">
          <LimitationBlock />
        </div>
      </div>
    </PageShell>
  );
}

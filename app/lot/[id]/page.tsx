"use client";

import { use, useEffect, useState } from "react";
import { useAccount, useReadContract, usePublicClient, useBlock } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import PageShell from "@/components/layout/PageShell";
import FramedLot from "@/components/gallery/FramedLot";
import LimitationBlock from "@/components/gallery/LimitationBlock";
import Button from "@/components/ui/Button";
import { sealedAbi } from "@/lib/botchain/abi";
import { getContractAddress } from "@/lib/botchain/deployment";
import { useSealedContract } from "@/lib/useSealed";
import {
  commitmentFor,
  newSalt,
  phaseAt,
  formatRemaining,
  saltStore,
  type StoredBid,
} from "@/lib/sealed";

export default function LotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const lotId = BigInt(resolvedParams.id);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient(); // stable-hook-result
  const contractAddress = getContractAddress() as Address;

  const { data: block } = useBlock({ watch: true });
  const currentTime = block ? block.timestamp : BigInt(Math.floor(Date.now() / 1000));

  const {
    commitBid,
    revealBid,
    settleLot,
    claimRefund,
    cancelLot,
    loading: txLoading,
  } = useSealedContract();

  // On-chain lot data
  const { data: lot, refetch: refetchLot } = useReadContract({
    address: contractAddress,
    abi: sealedAbi,
    functionName: "auctionOf",
    args: [lotId],
    query: { refetchInterval: 4000 },
  });

  // On-chain caller's bid data
  const { data: userBid, refetch: refetchBid } = useReadContract({
    address: contractAddress,
    abi: sealedAbi,
    functionName: "bidOf",
    args: [lotId, (address || "0x0000000000000000000000000000000000000000") as Address],
    query: { refetchInterval: 4000 },
  });

  // Local storage stored bid state
  const [localBid, setLocalBid] = useState<StoredBid | null>(null);

  useEffect(() => {
    if (address) {
      const stored = saltStore.get(lotId, address);
      setLocalBid(stored);
    }
  }, [address, lotId]);

  // Public revealed bids logs
  const [revealedLogs, setRevealedLogs] = useState<
    Array<{ bidder: string; amount: bigint; blockNumber: bigint }>
  >([]);

  useEffect(() => {
    async function fetchRevealedLogs() {
      if (!publicClient || !contractAddress) return;
      try {
        const logs = await publicClient.getLogs({
          address: contractAddress,
          event: {
            type: "event",
            name: "Revealed",
            inputs: [
              { indexed: true, name: "id", type: "uint256" },
              { indexed: true, name: "bidder", type: "address" },
              { indexed: false, name: "amount", type: "uint128" },
            ],
          },
          args: { id: lotId },
          fromBlock: 0n,
        });

        const mapped = logs.map((l) => ({
          bidder: l.args.bidder as string,
          amount: BigInt(l.args.amount || 0),
          blockNumber: l.blockNumber,
        }));
        setRevealedLogs(mapped);
      } catch (e) {
        console.error("Failed to fetch revealed logs", e);
      }
    }
    fetchRevealedLogs();
  }, [publicClient, contractAddress, lotId, lot?.revealed]);

  // Form states
  const [bidAmount, setBidAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [activeSalt, setActiveSalt] = useState<`0x${string}` | null>(null);
  const [backupDownloaded, setBackupDownloaded] = useState(false);

  // Missing salt paste field
  const [manualSalt, setManualSalt] = useState("");
  const [manualAmount, setManualAmount] = useState("");

  // Initialize salt once on commit step
  useEffect(() => {
    if (!activeSalt) {
      setActiveSalt(newSalt());
    }
  }, [activeSalt]);

  if (!lot) {
    return (
      <PageShell>
        <div className="py-24 text-center font-serif text-[24px] italic text-[#B9C7BD]">
          Retrieving lot from the vault...
        </div>
      </PageShell>
    );
  }

  const phase = phaseAt(
    {
      commitEnd: lot.commitEnd,
      revealEnd: lot.revealEnd,
      settled: lot.settled,
    },
    currentTime
  );

  const reserveEth = formatEther(lot.reserve);
  const isSeller = address && lot.seller.toLowerCase() === address.toLowerCase();
  const hasCommitted = userBid && userBid.commitment !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const hasRevealed = userBid && userBid.revealed;
  const hasClaimed = userBid && userBid.claimed;

  const effectiveSalt = localBid?.salt || (manualSalt as `0x${string}`);
  const effectiveAmount = localBid ? formatEther(BigInt(localBid.amount)) : manualAmount;

  // Handlers
  async function handleSealBid(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSalt || !bidAmount || !depositAmount) return;

    await commitBid(lotId, bidAmount, depositAmount, activeSalt, (bid) => {
      setLocalBid(bid);
    });
    refetchLot();
    refetchBid();
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveSalt || !effectiveAmount) return;

    await revealBid(lotId, effectiveAmount, effectiveSalt as `0x${string}`);
    refetchLot();
    refetchBid();
  }

  function handleSaveBackup() {
    if (!activeSalt || !address || !bidAmount || !depositAmount) return;
    const amountWei = parseEther(bidAmount);
    const depositWei = parseEther(depositAmount);
    const commitment = commitmentFor(lotId, address, amountWei, activeSalt);

    const bid: StoredBid = {
      id: String(lotId),
      bidder: address,
      amount: amountWei.toString(),
      deposit: depositWei.toString(),
      salt: activeSalt,
      commitment,
      createdAt: Date.now(),
    };
    saltStore.downloadBackup(bid);
    setBackupDownloaded(true);
  }

  return (
    <PageShell>
      <div className="flex flex-col lg:flex-row items-start gap-12 lg:gap-16">
        {/* Left Side: Enlarged Sticky Framed Lot */}
        <div className="w-full lg:w-[420px] flex-shrink-0 lg:sticky lg:top-24 flex flex-col items-center">
          <FramedLot
            id={lotId}
            title={lot.title}
            phase={phase}
            isEnlarged
            className="w-full"
          />

          <div className="mt-4 w-full flex items-center justify-between text-[11px] font-mono text-[#7D9688] px-2">
            <span>Lot ID: #{String(lotId)}</span>
            <span>Seller: {lot.seller.slice(0, 6)}...{lot.seller.slice(-4)}</span>
          </div>

          {/* Seller cancellation button if 0 bids */}
          {isSeller && lot.bidders === 0 && !lot.settled && (
            <div className="mt-4 w-full">
              <Button
                variant="danger"
                size="sm"
                onClick={() => cancelLot(lotId)}
                loading={txLoading}
                className="w-full"
              >
                Cancel Auction (0 Bids)
              </Button>
            </div>
          )}
        </div>

        {/* Right Side: Catalogue Sheet */}
        <div className="flex-1 w-full flex flex-col gap-8">
          {/* Catalogue Title & Header */}
          <div className="border-b border-[#214236] pb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="font-mono text-[11px] text-[#C8A24A] uppercase tracking-wider">
                CATALOGUE LOT #{String(lotId).padStart(3, "0")}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-0.5 border border-[#C8A24A]/40 text-[#C8A24A]">
                {phase === 0 && "1. Bidding Window"}
                {phase === 1 && "2. Reveal Window"}
                {phase === 2 && "Awaiting Settle"}
                {phase === 3 && (lot.winner !== "0x0000000000000000000000000000000000000000" ? "Settled" : "Cancelled")}
              </span>
            </div>

            <h1 className="font-serif text-[34px] sm:text-[40px] font-normal leading-tight text-[#F2EFE6]">
              {lot.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-6 text-[13px] font-mono">
              <div>
                <span className="text-[#7D9688]">Reserve: </span>
                <span className="text-[#C8A24A] font-semibold">{reserveEth} BOT</span>
              </div>
              <div>
                <span className="text-[#7D9688]">Sealed Bids: </span>
                <span className="text-[#F2EFE6]">{lot.bidders}</span>
              </div>
              <div>
                <span className="text-[#7D9688]">Reveals: </span>
                <span className="text-[#F2EFE6]">{lot.revealed}</span>
              </div>
            </div>
          </div>

          {/* Phase Timeline */}
          <div className="p-4 bg-[#143528] border border-[#2F5546] rounded-[2px] flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#B9C7BD]">
              <span>Timeline:</span>
              <span>
                {phase === 0 && `Bidding closes in ${formatRemaining(lot.commitEnd - currentTime)}`}
                {phase === 1 && `Reveals close in ${formatRemaining(lot.revealEnd - currentTime)}`}
                {phase >= 2 && "Auction Ended"}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#0F2A22] rounded-[1px] overflow-hidden flex">
              <div
                className={`h-full ${phase >= 0 ? "bg-[#C8A24A]" : "bg-[#214236]"}`}
                style={{ width: "50%" }}
              />
              <div
                className={`h-full ${phase >= 1 ? "bg-[#F0C987]" : "bg-[#214236]"}`}
                style={{ width: "35%" }}
              />
              <div
                className={`h-full ${phase >= 3 ? "bg-[#8BD3A8]" : "bg-[#214236]"}`}
                style={{ width: "15%" }}
              />
            </div>
          </div>

          {/* Numbered Steps Panel: 1 Seal · 2 Reveal · 3 Collect */}
          <div className="p-6 sm:p-8 bg-[#143528] border border-[#2F5546] rounded-[2px] flex flex-col gap-6 shadow-xl">
            {/* Step 1: Seal Bid */}
            <div className={`flex flex-col gap-4 ${phase !== 0 ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#C8A24A] text-[#1B1405] font-mono text-[12px] font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="font-serif text-[20px] text-[#F2EFE6]">
                  Seal Bid
                </h3>
              </div>

              {hasCommitted ? (
                <div className="p-4 bg-[#0F2A22] border border-[#2F5546] text-[12px] font-mono text-[#8BD3A8] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#8BD3A8]" />
                    <span>You have placed a sealed bid on this lot.</span>
                  </div>
                  {localBid && (
                    <div className="text-[#B9C7BD] text-[11px] pt-2 border-t border-[#214236] flex flex-col gap-1">
                      <span>Saved Amount: {formatEther(BigInt(localBid.amount))} BOT</span>
                      <span>Saved Deposit: {formatEther(BigInt(localBid.deposit))} BOT</span>
                      <button
                        type="button"
                        onClick={() => saltStore.downloadBackup(localBid)}
                        className="text-[#C8A24A] underline text-left mt-1 cursor-pointer"
                      >
                        Download Backup JSON
                      </button>
                    </div>
                  )}
                </div>
              ) : isSeller ? (
                <div className="p-3.5 bg-[#0F2A22] border border-[#2F5546] text-[12px] font-sans text-[#B9C7BD]">
                  Sellers cannot bid on their own lot.
                </div>
              ) : (
                <form onSubmit={handleSealBid} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase text-[#F2EFE6]">
                        True Bid Amount (BOT)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={reserveEth}
                        value={bidAmount}
                        onChange={(e) => {
                          setBidAmount(e.target.value);
                          if (!depositAmount || Number(depositAmount) < Number(e.target.value)) {
                            setDepositAmount(e.target.value);
                          }
                        }}
                        placeholder={`Min ${reserveEth}`}
                        className="px-3 py-2 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-mono text-[13px] focus:outline-none focus:border-[#C8A24A]"
                        required
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="font-mono text-[11px] uppercase text-[#F2EFE6]">
                        Deposit Amount (BOT)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={bidAmount || reserveEth}
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder={`≥ ${bidAmount || reserveEth}`}
                        className="px-3 py-2 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-mono text-[13px] focus:outline-none focus:border-[#C8A24A]"
                        required
                      />
                    </div>
                  </div>

                  {/* Over-deposit explainer */}
                  <p className="text-[11px] font-sans text-[#7D9688]">
                    Bidders can hide their real bid by over-depositing. Only the deposit is broadcast; your true bid is masked until reveal.
                  </p>

                  {/* Pre-signature backup offer */}
                  <div className="p-3 bg-[#0F2A22] border border-[#214236] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px]">
                    <div className="text-[11px] font-mono text-[#B9C7BD]">
                      <span>Secret Salt: </span>
                      <span className="text-[#C8A24A]">
                        {activeSalt ? `${activeSalt.slice(0, 10)}...${activeSalt.slice(-8)}` : "Generating..."}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveBackup}
                      disabled={!bidAmount || !depositAmount}
                    >
                      {backupDownloaded ? "Backup Saved ✓" : "Save Backup File"}
                    </Button>
                  </div>

                  <p className="text-[11px] font-mono text-[#FFB4A8]">
                    Your salt lives in this browser. Save the backup file.
                  </p>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={txLoading}
                    disabled={!isConnected || !bidAmount || !depositAmount || Number(depositAmount) < Number(reserveEth)}
                  >
                    Place a sealed bid
                  </Button>
                </form>
              )}
            </div>

            <hr className="border-[#214236]" />

            {/* Step 2: Reveal Bid */}
            <div className={`flex flex-col gap-4 ${phase !== 1 ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#F0C987] text-[#1B1405] font-mono text-[12px] font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="font-serif text-[20px] text-[#F2EFE6]">
                  Reveal Bid
                </h3>
              </div>

              {hasRevealed ? (
                <div className="p-3.5 bg-[#0F2A22] border border-[#2F5546] text-[12px] font-mono text-[#8BD3A8]">
                  ✓ Your bid has been revealed ({formatEther(userBid?.amount || 0n)} BOT).
                </div>
              ) : (
                <form onSubmit={handleReveal} className="flex flex-col gap-4">
                  {localBid ? (
                    <div className="p-3.5 bg-[#0F2A22] border border-[#2F5546] text-[12px] font-mono flex flex-col gap-1.5">
                      <span className="text-[#8BD3A8]">Found stored salt in this browser:</span>
                      <span className="text-[#F2EFE6]">Amount: {formatEther(BigInt(localBid.amount))} BOT</span>
                      <span className="text-[#7D9688] text-[11px] truncate">Salt: {localBid.salt}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="p-3 bg-[#331114] border border-[#FFB4A8]/40 text-[#FFB4A8] text-[12px] font-sans">
                        Miss the reveal and you lose 10% of your deposit. No stored salt was found in this browser.
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-[11px] text-[#F2EFE6]">Bid Amount (BOT)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={manualAmount}
                            onChange={(e) => setManualAmount(e.target.value)}
                            placeholder="Exact bid amount"
                            className="px-3 py-2 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-mono text-[13px]"
                            required
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-[11px] text-[#F2EFE6]">Salt (0x...)</label>
                          <input
                            type="text"
                            value={manualSalt}
                            onChange={(e) => setManualSalt(e.target.value)}
                            placeholder="0x..."
                            className="px-3 py-2 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-mono text-[13px]"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={txLoading}
                    disabled={!isConnected || (!localBid && (!manualSalt || !manualAmount))}
                  >
                    Reveal Bid
                  </Button>
                </form>
              )}
            </div>

            <hr className="border-[#214236]" />

            {/* Step 3: Collect */}
            <div className={`flex flex-col gap-4 ${phase < 2 ? "opacity-50 pointer-events-none" : ""}`}>
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-[#8BD3A8] text-[#1B1405] font-mono text-[12px] font-bold flex items-center justify-center">
                  3
                </span>
                <h3 className="font-serif text-[20px] text-[#F2EFE6]">
                  Collect
                </h3>
              </div>

              {!lot.settled ? (
                <div className="flex flex-col gap-3">
                  <p className="text-[12px] font-sans text-[#B9C7BD]">
                    Reveals have concluded. The auction can now be settled by anyone to compute the second-price result.
                  </p>
                  <Button
                    variant="brass"
                    size="md"
                    onClick={() => settleLot(lotId)}
                    loading={txLoading}
                    disabled={!isConnected}
                  >
                    Settle Auction
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-[#0F2A22] border border-[#2F5546] flex flex-col gap-2 text-[12px] font-mono">
                    <span className="text-[#8BD3A8] font-semibold text-[13px]">Auction Settled</span>
                    {lot.winner !== "0x0000000000000000000000000000000000000000" ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-[#7D9688]">Winner:</span>
                          <span className="text-[#F2EFE6]">{lot.winner.slice(0, 8)}...{lot.winner.slice(-6)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#7D9688]">Second Price:</span>
                          <span className="text-[#8BD3A8] font-bold">
                            {formatEther(lot.second >= lot.reserve ? lot.second : lot.reserve)} BOT
                          </span>
                        </div>
                      </>
                    ) : (
                      <span className="text-[#B9C7BD]">No valid revealed bids were made.</span>
                    )}
                  </div>

                  {hasCommitted && (
                    <div className="flex flex-col gap-2">
                      {hasClaimed ? (
                        <div className="text-[12px] font-mono text-[#8BD3A8]">
                          ✓ You have already claimed your deposit/refund for this lot.
                        </div>
                      ) : (
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => claimRefund(lotId)}
                          loading={txLoading}
                          disabled={!isConnected}
                        >
                          Claim Deposit / Refund
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Public List of Revealed Bids Once Ended */}
          {phase >= 1 && (
            <div className="p-6 bg-[#143528] border border-[#2F5546] rounded-[2px] flex flex-col gap-4">
              <h3 className="font-serif text-[20px] text-[#F2EFE6]">
                Public Ledger of Revealed Bids
              </h3>

              {revealedLogs.length === 0 ? (
                <p className="text-[12px] font-mono text-[#7D9688]">
                  No bids have been unsealed yet.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-[#214236] border border-[#214236]">
                  {revealedLogs.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-3 flex items-center justify-between text-[12px] font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[#7D9688]">#{idx + 1}</span>
                        <span className="text-[#F2EFE6]">
                          {entry.bidder.slice(0, 6)}...{entry.bidder.slice(-4)}
                        </span>
                      </div>
                      <span className="text-[#C8A24A] font-medium">
                        {formatEther(entry.amount)} BOT
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Fine print limitation block */}
          <LimitationBlock />
        </div>
      </div>
    </PageShell>
  );
}

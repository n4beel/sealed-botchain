"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useBlock } from "wagmi";
import { formatEther, type Address } from "viem";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Button from "@/components/ui/Button";
import { sealedAbi } from "@/lib/botchain/abi";
import { getContractAddress } from "@/lib/botchain/deployment";
import { useSealedContract } from "@/lib/useSealed";
import { saltStore, type StoredBid } from "@/lib/sealed";

export default function MyFolioPage() {
  const { address, isConnected } = useAccount();
  const contractAddress = getContractAddress() as Address;

  const { data: block } = useBlock({ watch: true });
  const currentTime = block ? block.timestamp : BigInt(Math.floor(Date.now() / 1000));

  const { withdraw, claimRefund, loading: txLoading } = useSealedContract();

  // Pending balance in pull payment till
  const { data: pendingBalance, refetch: refetchPending } = useReadContract({
    address: contractAddress,
    abi: sealedAbi,
    functionName: "pending",
    args: [(address || "0x0000000000000000000000000000000000000000") as Address],
    query: { refetchInterval: 4000 },
  });

  // Stored bids from localStorage
  const [bids, setBids] = useState<StoredBid[]>([]);
  const [importJsonText, setImportJsonText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState("");

  const loadBids = () => {
    if (address) {
      setBids(saltStore.list(address));
    }
  };

  useEffect(() => {
    loadBids();
  }, [address]);

  async function handleWithdraw() {
    await withdraw();
    refetchPending();
  }

  function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setImportError("");
    try {
      const parsed = saltStore.importJson(importJsonText);
      saltStore.put(parsed);
      loadBids();
      setImportJsonText("");
      setShowImport(false);
    } catch (err) {
      setImportError((err as Error).message || "Invalid backup JSON file.");
    }
  }

  const pendingEth = pendingBalance ? formatEther(pendingBalance) : "0";
  const hasPending = pendingBalance !== undefined && pendingBalance > 0n;

  return (
    <PageShell>
      <div className="max-w-[840px] mx-auto flex flex-col gap-10">
        <div>
          <span className="font-mono text-[11px] text-[#C8A24A] uppercase tracking-wider">
            Bidder & Seller Folio
          </span>
          <h1 className="mt-1 font-serif text-[32px] sm:text-[36px] font-normal leading-tight text-[#F2EFE6]">
            Your Chamber & Saved Salts
          </h1>
          <p className="mt-2 font-sans text-[13px] text-[#B9C7BD]">
            Review all secret salts saved in this browser, claim your deposit returns, and withdraw from the till.
          </p>
        </div>

        <BotChainGate>
          {/* Till Balance Station */}
          <div
            className="p-6 bg-[#143528] border border-[#2F5546] rounded-[2px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)" }}
          >
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[11px] text-[#7D9688] uppercase tracking-wider">
                Pending Balance (Till)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-[36px] font-semibold text-[#8BD3A8] leading-none">
                  {pendingEth}
                </span>
                <span className="font-mono text-[14px] text-[#C8A24A]">BOT</span>
              </div>
              <p className="text-[11px] font-sans text-[#B9C7BD]">
                Accrued refunds from outbid lots, winner change, and seller auction revenue.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={handleWithdraw}
              loading={txLoading}
              disabled={!hasPending}
            >
              Withdraw to Wallet
            </Button>
          </div>

          {/* Stored Commitments & Salts */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[24px] text-[#F2EFE6]">
                Saved Commitments ({bids.length})
              </h2>

              <button
                type="button"
                onClick={() => setShowImport(!showImport)}
                className="font-mono text-[11px] text-[#C8A24A] uppercase tracking-wider underline cursor-pointer"
              >
                {showImport ? "Close Import" : "Import Backup JSON"}
              </button>
            </div>

            {/* Import JSON drawer */}
            {showImport && (
              <form
                onSubmit={handleImportSubmit}
                className="p-4 bg-[#0F2A22] border border-[#2F5546] flex flex-col gap-3 rounded-[2px]"
              >
                <label className="font-mono text-[11px] uppercase text-[#F2EFE6]">
                  Paste Backup File JSON
                </label>
                <textarea
                  rows={4}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{"version": "1.0", "auctionId": "1", ...}'
                  className="w-full p-2.5 bg-[#143528] border border-[#2F5546] text-[#F2EFE6] font-mono text-[12px] focus:outline-none focus:border-[#C8A24A]"
                  required
                />
                {importError && (
                  <span className="font-mono text-[11px] text-[#FFB4A8]">{importError}</span>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="submit" variant="brass" size="sm">
                    Restore Commitment
                  </Button>
                </div>
              </form>
            )}

            {bids.length === 0 ? (
              <div className="p-8 border border-dashed border-[#2F5546] bg-[#143528]/40 text-center flex flex-col items-center justify-center gap-2">
                <p className="font-serif text-[18px] italic text-[#B9C7BD]">
                  No saved bid salts found in this browser.
                </p>
                <p className="text-[12px] font-sans text-[#7D9688]">
                  When you place a sealed bid, its cryptographic salt is preserved locally so you can reveal it.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {bids.map((bid) => (
                  <div
                    key={`${bid.id}-${bid.salt}`}
                    className="p-4 bg-[#143528] border border-[#2F5546] rounded-[2px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/lot/${bid.id}`}
                          className="font-serif text-[18px] text-[#F2EFE6] hover:text-[#C8A24A] transition-colors underline"
                        >
                          Lot #{bid.id}
                        </Link>
                        <span className="text-[11px] font-mono text-[#7D9688]">
                          Placed on {new Date(bid.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[12px] font-mono">
                        <span className="text-[#B9C7BD]">
                          Bid: {formatEther(BigInt(bid.amount))} BOT
                        </span>
                        <span className="text-[#2F5546]">•</span>
                        <span className="text-[#B9C7BD]">
                          Deposit: {formatEther(BigInt(bid.deposit))} BOT
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-[#7D9688] truncate max-w-sm sm:max-w-md">
                        Salt: {bid.salt}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => saltStore.downloadBackup(bid)}
                      >
                        Backup
                      </Button>
                      <Link
                        href={`/lot/${bid.id}`}
                        className="px-3 py-1.5 bg-[#C8A24A] text-[#1B1405] text-[11px] font-mono uppercase tracking-wider font-semibold no-underline hover:opacity-90 transition-opacity"
                      >
                        View Lot
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BotChainGate>
      </div>
    </PageShell>
  );
}

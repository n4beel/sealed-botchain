"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import Button from "@/components/ui/Button";
import { useSealedContract } from "@/lib/useSealed";
import { MAX_TITLE } from "@/lib/limits";

const COMMIT_WINDOWS = [
  { label: "10 mins", secs: 600 },
  { label: "1 hour", secs: 3600 },
  { label: "1 day", secs: 86400 },
  { label: "3 days", secs: 259200 },
  { label: "7 days", secs: 604800 },
];

const REVEAL_WINDOWS = [
  { label: "10 mins", secs: 600 },
  { label: "1 hour", secs: 3600 },
  { label: "1 day", secs: 86400 },
  { label: "3 days", secs: 259200 },
];

export default function NewLotPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { createLot, loading } = useSealedContract();

  const [title, setTitle] = useState("");
  const [reserve, setReserve] = useState("1.0");
  const [commitSecs, setCommitSecs] = useState(86400); // 1 day default
  const [revealSecs, setRevealSecs] = useState(86400); // 1 day default

  // Accurate UTF-8 byte counter
  const byteCount = new TextEncoder().encode(title).length;
  const isTitleValid = byteCount > 0 && byteCount <= MAX_TITLE;
  const isReserveValid = Number(reserve) > 0 && !isNaN(Number(reserve));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isTitleValid || !isReserveValid) return;

    const receipt = await createLot(title, reserve, commitSecs, revealSecs);
    if (receipt) {
      router.push("/");
    }
  }

  return (
    <PageShell>
      <div className="max-w-[640px] mx-auto flex flex-col gap-8">
        <div>
          <span className="font-mono text-[11px] text-[#C8A24A] uppercase tracking-wider">
            Auction Inscription Desk
          </span>
          <h1 className="mt-1 font-serif text-[32px] sm:text-[36px] font-normal leading-tight text-[#F2EFE6]">
            Inscribe a New Lot
          </h1>
          <p className="mt-2 font-sans text-[13px] text-[#B9C7BD] leading-relaxed">
            Hang a single off-chain lot on the wall. Bidders will commit in secret and pay the second-highest price upon reveal.
          </p>
        </div>

        <BotChainGate>
          <form
            onSubmit={handleSubmit}
            className="p-6 sm:p-8 bg-[#143528] border border-[#2F5546] flex flex-col gap-6 rounded-[2px]"
            style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)" }}
          >
            {/* Title with live byte counter */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="title"
                  className="font-mono text-[12px] uppercase tracking-wider text-[#F2EFE6]"
                >
                  Lot Title
                </label>
                <span
                  className={`font-mono text-[11px] ${
                    byteCount > MAX_TITLE ? "text-[#FFB4A8]" : "text-[#7D9688]"
                  }`}
                >
                  {byteCount} / {MAX_TITLE} bytes
                </span>
              </div>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. 18th-Century Cartographer Compass"
                className="w-full px-3.5 py-2.5 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-sans text-[14px] focus:outline-none focus:border-[#C8A24A] transition-colors"
                required
              />
              <p className="text-[11px] text-[#7D9688] font-sans">
                A brief description or catalog title of the physical or off-chain item.
              </p>
            </div>

            {/* Reserve Price */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="reserve"
                className="font-mono text-[12px] uppercase tracking-wider text-[#F2EFE6]"
              >
                Reserve Price (BOT)
              </label>
              <div className="relative">
                <input
                  id="reserve"
                  type="number"
                  step="0.01"
                  min="0.0001"
                  value={reserve}
                  onChange={(e) => setReserve(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0F2A22] border border-[#2F5546] text-[#F2EFE6] font-mono text-[14px] focus:outline-none focus:border-[#C8A24A] transition-colors pr-14"
                  required
                />
                <span className="absolute right-3.5 top-2.5 font-mono text-[13px] text-[#C8A24A]">
                  BOT
                </span>
              </div>
              <p className="text-[11px] text-[#7D9688] font-sans">
                The minimum bid and minimum deposit accepted. If only one bidder reveals, they pay this price.
              </p>
            </div>

            {/* Bidding Window */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[12px] uppercase tracking-wider text-[#F2EFE6]">
                  Bidding Window (Sealed Phase)
                </label>
                <span className="font-mono text-[11px] text-[#C8A24A]">
                  {COMMIT_WINDOWS.find((w) => w.secs === commitSecs)?.label}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {COMMIT_WINDOWS.map((w) => {
                  const active = commitSecs === w.secs;
                  return (
                    <button
                      key={w.secs}
                      type="button"
                      onClick={() => setCommitSecs(w.secs)}
                      className="py-2 text-[11px] font-mono uppercase tracking-wider border transition-colors cursor-pointer text-center"
                      style={{
                        background: active ? "var(--accent)" : "var(--bg-base)",
                        color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                        borderColor: active ? "var(--accent)" : "var(--border-default)",
                      }}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#7D9688] font-sans">
                Time during which bidders submit secret deposit hashes.
              </p>
            </div>

            {/* Reveal Window */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[12px] uppercase tracking-wider text-[#F2EFE6]">
                  Reveal Window (Unsealing Phase)
                </label>
                <span className="font-mono text-[11px] text-[#C8A24A]">
                  {REVEAL_WINDOWS.find((w) => w.secs === revealSecs)?.label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {REVEAL_WINDOWS.map((w) => {
                  const active = revealSecs === w.secs;
                  return (
                    <button
                      key={w.secs}
                      type="button"
                      onClick={() => setRevealSecs(w.secs)}
                      className="py-2 text-[11px] font-mono uppercase tracking-wider border transition-colors cursor-pointer text-center"
                      style={{
                        background: active ? "var(--accent)" : "var(--bg-base)",
                        color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                        borderColor: active ? "var(--accent)" : "var(--border-default)",
                      }}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-[#7D9688] font-sans">
                Window directly following bidding close. Solvers must reveal their secret salts.
              </p>
            </div>

            {/* Consequence sentence */}
            <div className="p-3.5 bg-[#0F2A22] border-l-2 border-[#C8A24A] text-[12px] font-sans text-[#B9C7BD] leading-relaxed">
              <span className="font-semibold text-[#F2EFE6]">Consequence:</span> Once the first sealed bid is cast, the auction cannot be cancelled and runs to the end.
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!isTitleValid || !isReserveValid}
              onClick={handleSubmit}
              className="w-full mt-2"
            >
              Inscribe Lot on Wall
            </Button>
          </form>
        </BotChainGate>
      </div>
    </PageShell>
  );
}

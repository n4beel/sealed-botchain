import { encodeAbiParameters, parseAbiParameters, keccak256, formatEther } from "viem";

export interface StoredBid {
  id: string; // stringified bigint
  bidder: `0x${string}`;
  amount: string; // stringified wei
  deposit: string; // stringified wei
  salt: `0x${string}`;
  commitment: `0x${string}`;
  createdAt: number;
}

/**
 * Computes commitment hash matching Sealed.sol commitmentFor exactly.
 */
export function commitmentFor(
  id: bigint,
  bidder: `0x${string}`,
  amount: bigint,
  salt: `0x${string}`
): `0x${string}` {
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256 id, address bidder, uint128 amount, bytes32 salt"),
    [id, bidder, amount, salt]
  );
  return keccak256(encoded);
}

/**
 * Generates a cryptographically secure 32-byte salt as hex.
 */
export function newSalt(): `0x${string}` {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}` as `0x${string}`;
  }
  // Fallback for node testing if crypto.getRandomValues is missing
  let hex = "";
  for (let i = 0; i < 64; i++) {
    hex += Math.floor(Math.random() * 16).toString(16);
  }
  return `0x${hex}` as `0x${string}`;
}

/**
 * Returns auction phase for a given timestamp (0: commit, 1: reveal, 2: ended, 3: settled).
 */
export function phaseAt(
  auction: { commitEnd: bigint; revealEnd: bigint; settled: boolean },
  nowSec: bigint | number
): number {
  if (auction.settled) return 3;
  const now = BigInt(nowSec);
  if (now < auction.commitEnd) return 0;
  if (now < auction.revealEnd) return 1;
  return 2;
}

/**
 * Calculates Vickrey second price.
 */
export function priceFor(top: bigint, second: bigint, reserve: bigint): bigint {
  if (top === 0n) return 0n;
  return second >= reserve ? second : reserve;
}

/**
 * Formats time remaining in human readable form.
 */
export function formatRemaining(seconds: number | bigint): string {
  const sec = Number(seconds);
  if (sec <= 0) return "Ended";
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${sec % 60}s`;
  return `${sec}s`;
}

const STORAGE_KEY = "sealed_bids_v1";

/**
 * Local storage manager for secret salts and bid parameters.
 */
export const saltStore = {
  isAvailable(): boolean {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
      const testKey = "__sealed_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  },

  getAll(): StoredBid[] {
    if (!this.isAvailable()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as StoredBid[];
    } catch {
      return [];
    }
  },

  list(bidder?: `0x${string}`): StoredBid[] {
    const all = this.getAll();
    if (!bidder) return all;
    const lower = bidder.toLowerCase();
    return all.filter((b) => b.bidder.toLowerCase() === lower);
  },

  get(id: bigint | number | string, bidder: `0x${string}`): StoredBid | null {
    const idStr = String(id);
    const lower = bidder.toLowerCase();
    const all = this.getAll();
    return all.find((b) => b.id === idStr && b.bidder.toLowerCase() === lower) || null;
  },

  put(bid: StoredBid): boolean {
    if (!this.isAvailable()) return false;
    try {
      const all = this.getAll();
      const existingIdx = all.findIndex(
        (b) => b.id === bid.id && b.bidder.toLowerCase() === bid.bidder.toLowerCase()
      );
      if (existingIdx >= 0) {
        all[existingIdx] = bid;
      } else {
        all.push(bid);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  },

  exportJson(bid: StoredBid): string {
    return JSON.stringify(
      {
        version: "1.0",
        auctionId: bid.id,
        bidder: bid.bidder,
        amountEth: formatEther(BigInt(bid.amount)),
        depositEth: formatEther(BigInt(bid.deposit)),
        salt: bid.salt,
        commitment: bid.commitment,
        createdAt: bid.createdAt,
      },
      null,
      2
    );
  },

  downloadBackup(bid: StoredBid): void {
    if (typeof window === "undefined") return;
    const json = this.exportJson(bid);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sealed-lot-${bid.id}-bid-backup.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importJson(jsonString: string): StoredBid {
    const data = JSON.parse(jsonString);
    if (!data.auctionId || !data.bidder || !data.salt || !data.commitment) {
      throw new Error("Invalid sealed bid backup file format.");
    }
    return {
      id: String(data.auctionId),
      bidder: data.bidder as `0x${string}`,
      amount: data.amount ? String(data.amount) : "0",
      deposit: data.deposit ? String(data.deposit) : "0",
      salt: data.salt as `0x${string}`,
      commitment: data.commitment as `0x${string}`,
      createdAt: data.createdAt || Date.now(),
    };
  },
};

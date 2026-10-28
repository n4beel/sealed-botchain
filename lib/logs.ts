import { decodeEventLog } from "viem";
import { sealedAbi } from "./botchain/abi";

export interface CreatedEvent {
  id: bigint;
  seller: `0x${string}`;
  reserve: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
  title: string;
}

export interface CommittedEvent {
  id: bigint;
  bidder: `0x${string}`;
  deposit: bigint;
}

export interface RevealedEvent {
  id: bigint;
  bidder: `0x${string}`;
  amount: bigint;
}

export interface SettledEvent {
  id: bigint;
  winner: `0x${string}`;
  price: bigint;
}

export interface ClaimedEvent {
  id: bigint;
  bidder: `0x${string}`;
  amount: bigint;
}

export interface CancelledEvent {
  id: bigint;
}

export interface WithdrawnEvent {
  to: `0x${string}`;
  amount: bigint;
}

export function parseSealedLog(log: { data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] | [] }) {
  try {
    return decodeEventLog({
      abi: sealedAbi,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
  } catch {
    return null;
  }
}

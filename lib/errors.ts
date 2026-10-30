import { activeBotChain } from "@/lib/botchain/chain";
import { formatEther } from "viem";

/**
 * Human-readable error messages for Sealed contract reverts.
 * Specified in 16-sealed.md §4.
 */
export function decodeContractError(error: unknown): string {
  // A wallet on the other BOT Chain network: writes are pinned to this build's chain (lib/useChainWrite.ts), so wagmi
  // refuses before the wallet opens. Say what to do, not the library's name for it.
  if (/ConnectorChainMismatch|chain mismatch|does not match the target chain/i.test(error instanceof Error ? `${error.name} ${error.message}` : String(error))) {
    return `Your wallet is on a different network. Switch it to ${activeBotChain.name}, then try again.`;
  }
  if (!error) return "An unexpected error occurred.";

  const errString = error instanceof Error ? error.message : String(error);

  if (errString.includes("BadReveal")) {
    return "Those don't match the sealed bid. Check the amount and the salt.";
  }
  if (errString.includes("NotRevealPhase")) {
    return "Reveals open when bidding closes.";
  }
  if (errString.includes("DepositTooSmall")) {
    const match = errString.match(/DepositTooSmall\((\d+)\)/);
    if (match && match[1]) {
      return `The deposit must be at least ${formatEther(BigInt(match[1]))} BOT.`;
    }
    return "The deposit is too small for this reserve.";
  }
  if (errString.includes("SellerCannotBid")) {
    return "Sellers cannot bid on their own lot.";
  }
  if (errString.includes("AlreadyCommitted")) {
    return "You have already placed a sealed bid on this lot.";
  }
  if (errString.includes("HasBids")) {
    return "Cannot cancel an auction that has bids.";
  }
  if (errString.includes("NoCommitment")) {
    return "No sealed bid found for your address.";
  }
  if (errString.includes("BadAmount")) {
    return "The bid amount must be at least the reserve and no more than your deposit.";
  }
  if (errString.includes("CommitEnded")) {
    return "Bidding is closed for this lot.";
  }
  if (errString.includes("ZeroCommitment")) {
    return "Invalid commitment.";
  }
  if (errString.includes("NotEnded")) {
    return "The reveal phase has not ended yet.";
  }
  if (errString.includes("AlreadySettled")) {
    return "This auction is already settled.";
  }
  if (errString.includes("NothingToClaim")) {
    return "No refunds or proceeds to claim.";
  }
  if (errString.includes("NotSeller")) {
    return "Only the seller can cancel this auction.";
  }
  if (errString.includes("NothingToWithdraw")) {
    return "No funds available to withdraw.";
  }
  if (errString.includes("TitleTooLong")) {
    return "Title must be between 1 and 64 bytes.";
  }
  if (errString.includes("ZeroReserve")) {
    return "Reserve price must be greater than zero.";
  }
  if (errString.includes("BadWindow")) {
    return "Auction windows must be within protocol limits.";
  }
  if (errString.includes("NotFound")) {
    return "Auction lot not found.";
  }
  if (errString.includes("User rejected")) {
    return "Transaction was cancelled in your wallet.";
  }

  return errString.length > 120 ? errString.slice(0, 117) + "..." : errString;
}

import { describe, it, expect, beforeEach } from "vitest";
import { parseEther } from "viem";
import {
  commitmentFor,
  newSalt,
  phaseAt,
  priceFor,
  formatRemaining,
  saltStore,
  type StoredBid,
} from "../sealed";
import { decodeContractError } from "../errors";

describe("Sealed client library", () => {
  it("matches on-chain test vector for commitmentFor exactly", () => {
    const id = 1n;
    const bidder = "0x1111111111111111111111111111111111111111" as const;
    const amount = parseEther("1");
    const salt = "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

    const hash = commitmentFor(id, bidder, amount, salt);
    expect(hash).toBe("0x52bd09a15238c8b9c30f35bd3fcae0a592f703140b05b3df23767b74f7e01fbb");
  });

  it("generates a valid 32-byte hex salt", () => {
    const salt = newSalt();
    expect(salt).toMatch(/^0x[a-f0-9]{64}$/i);
  });

  describe("phaseAt", () => {
    const auction = {
      commitEnd: 1000n,
      revealEnd: 2000n,
      settled: false,
    };

    it("identifies commit phase (0)", () => {
      expect(phaseAt(auction, 500n)).toBe(0);
      expect(phaseAt(auction, 999n)).toBe(0);
    });

    it("identifies reveal phase (1)", () => {
      expect(phaseAt(auction, 1000n)).toBe(1);
      expect(phaseAt(auction, 1500n)).toBe(1);
      expect(phaseAt(auction, 1999n)).toBe(1);
    });

    it("identifies ended phase (2)", () => {
      expect(phaseAt(auction, 2000n)).toBe(2);
      expect(phaseAt(auction, 2500n)).toBe(2);
    });

    it("identifies settled phase (3)", () => {
      expect(phaseAt({ ...auction, settled: true }, 500n)).toBe(3);
    });
  });

  describe("priceFor", () => {
    it("returns 0 if no top bid", () => {
      expect(priceFor(0n, 0n, 100n)).toBe(0n);
    });

    it("returns reserve if single bidder", () => {
      expect(priceFor(500n, 0n, 100n)).toBe(100n);
    });

    it("returns second price if second >= reserve", () => {
      expect(priceFor(500n, 300n, 100n)).toBe(300n);
    });

    it("returns reserve if second < reserve", () => {
      expect(priceFor(500n, 50n, 100n)).toBe(100n);
    });
  });

  describe("formatRemaining", () => {
    it("handles zero and negative", () => {
      expect(formatRemaining(0)).toBe("Ended");
      expect(formatRemaining(-5)).toBe("Ended");
    });

    it("formats seconds, minutes, hours, days", () => {
      expect(formatRemaining(30)).toBe("30s");
      expect(formatRemaining(90)).toBe("1m 30s");
      expect(formatRemaining(3660)).toBe("1h 1m");
      expect(formatRemaining(90000)).toBe("1d 1h");
    });
  });

  describe("error decoders", () => {
    it("decodes BadReveal", () => {
      expect(decodeContractError(new Error("execution reverted: BadReveal()"))).toBe(
        "Those don't match the sealed bid. Check the amount and the salt."
      );
    });

    it("decodes NotRevealPhase", () => {
      expect(decodeContractError(new Error("execution reverted: NotRevealPhase()"))).toBe(
        "Reveals open when bidding closes."
      );
    });

    it("decodes DepositTooSmall", () => {
      expect(
        decodeContractError(
          new Error("execution reverted: DepositTooSmall(1000000000000000000)")
        )
      ).toBe("The deposit must be at least 1 BOT.");
    });

    it("decodes SellerCannotBid", () => {
      expect(decodeContractError(new Error("execution reverted: SellerCannotBid()"))).toBe(
        "Sellers cannot bid on their own lot."
      );
    });

    it("decodes AlreadyCommitted", () => {
      expect(decodeContractError(new Error("execution reverted: AlreadyCommitted()"))).toBe(
        "You have already placed a sealed bid on this lot."
      );
    });

    it("decodes HasBids", () => {
      expect(decodeContractError(new Error("execution reverted: HasBids()"))).toBe(
        "Cannot cancel an auction that has bids."
      );
    });

    it("decodes NothingToWithdraw", () => {
      expect(decodeContractError(new Error("execution reverted: NothingToWithdraw()"))).toBe(
        "No funds available to withdraw."
      );
    });
  });

  describe("saltStore backup json", () => {
    it("exports and imports backup JSON correctly", () => {
      const bid: StoredBid = {
        id: "1",
        bidder: "0x1111111111111111111111111111111111111111",
        amount: "1000000000000000000",
        deposit: "2000000000000000000",
        salt: "0x4444444444444444444444444444444444444444444444444444444444444444",
        commitment: "0x52bd09a15238c8b9c30f35bd3fcae0a592f703140b05b3df23767b74f7e01fbb",
        createdAt: 1700000000000,
      };

      const exported = saltStore.exportJson(bid);
      expect(exported).toContain('"auctionId": "1"');
      expect(exported).toContain('"amountEth": "1"');
      expect(exported).toContain('"depositEth": "2"');

      const imported = saltStore.importJson(
        JSON.stringify({
          auctionId: 1,
          bidder: "0x1111111111111111111111111111111111111111",
          amount: "1000000000000000000",
          deposit: "2000000000000000000",
          salt: "0x4444444444444444444444444444444444444444444444444444444444444444",
          commitment: "0x52bd09a15238c8b9c30f35bd3fcae0a592f703140b05b3df23767b74f7e01fbb",
          createdAt: 1700000000000,
        })
      );

      expect(imported.id).toBe("1");
      expect(imported.salt).toBe(bid.salt);
      expect(imported.commitment).toBe(bid.commitment);
    });
  });
});

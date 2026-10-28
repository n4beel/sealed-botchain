import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sealedAbi } from "@/lib/botchain/abi";
import { commitmentFor } from "@/lib/sealed";

const PORT = 8616;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Seller)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Bidder 1)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Bidder 2)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Bidder 3)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Outsider)
].map((k) => privateKeyToAccount(k as `0x${string}`));

describe("Sealed On-Chain Integration Tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;

  const publicClient = createPublicClient({
    chain: localChain,
    transport: http(RPC),
  });

  const [alice, bob, charlie, dave, eve] = ACCOUNTS.map((account) =>
    createWalletClient({
      account,
      chain: localChain,
      transport: http(RPC),
    })
  );

  async function mineBlock() {
    await publicClient.request({
      method: "evm_mine" as any,
      params: [] as any,
    });
  }

  async function advanceTime(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await mineBlock();
  }

  beforeAll(async () => {
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
    } catch {}

    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    for (let i = 0; i < 30; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const artifactPath = join(
      process.cwd(),
      "contracts",
      "out",
      "Sealed.sol",
      "Sealed.json"
    );
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    const bytecode = artifact.bytecode.object as `0x${string}`;

    const deployHash = await alice.deployContract({
      abi: sealedAbi,
      bytecode,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    contractAddress = receipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) anvil.kill();
  });

  it("verifies on-chain commitmentFor matches client library test vector", async () => {
    const id = 1n;
    const bidder = "0x1111111111111111111111111111111111111111" as const;
    const amount = parseEther("1");
    const salt = "0x4444444444444444444444444444444444444444444444444444444444444444" as const;

    const onChainHash = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commitmentFor",
      args: [id, bidder, amount, salt],
    });

    const clientHash = commitmentFor(id, bidder, amount, salt);
    expect(onChainHash).toBe(clientHash);
    expect(clientHash).toBe("0x52bd09a15238c8b9c30f35bd3fcae0a592f703140b05b3df23767b74f7e01fbb");
  });

  it("executes full happy path: commit, reveal, second-price settlement, claims and withdrawal", async () => {
    // 1. Alice creates auction
    const createTx = await alice.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "create",
      args: ["First Edition Book", parseEther("1"), 600n, 600n],
    });
    await publicClient.waitForTransactionReceipt({ hash: createTx });
    const id = 1n;

    // 2. Bob bids 5 BOT with 6 BOT deposit
    const saltBob = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
    const commitBob = commitmentFor(id, bob.account.address, parseEther("5"), saltBob);
    const bobCommitTx = await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commit",
      args: [id, commitBob],
      value: parseEther("6"),
    });
    await publicClient.waitForTransactionReceipt({ hash: bobCommitTx });

    // 3. Charlie bids 3 BOT with 4 BOT deposit
    const saltCharlie = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
    const commitCharlie = commitmentFor(id, charlie.account.address, parseEther("3"), saltCharlie);
    const charlieCommitTx = await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commit",
      args: [id, commitCharlie],
      value: parseEther("4"),
    });
    await publicClient.waitForTransactionReceipt({ hash: charlieCommitTx });

    // 4. Advance time past commit window (600s)
    await advanceTime(601);

    // 5. Bob reveals 5 BOT
    const bobRevealTx = await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "reveal",
      args: [id, parseEther("5"), saltBob],
    });
    await publicClient.waitForTransactionReceipt({ hash: bobRevealTx });

    // 6. Charlie reveals 3 BOT
    const charlieRevealTx = await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "reveal",
      args: [id, parseEther("3"), saltCharlie],
    });
    await publicClient.waitForTransactionReceipt({ hash: charlieRevealTx });

    // 7. Advance time past reveal window (600s)
    await advanceTime(601);

    // 8. Eve settles auction
    const settleTx = await eve.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "settle",
      args: [id],
    });
    await publicClient.waitForTransactionReceipt({ hash: settleTx });

    const auction = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "auctionOf",
      args: [id],
    });
    expect(auction.winner.toLowerCase()).toBe(bob.account.address.toLowerCase());
    expect(auction.top).toBe(parseEther("5"));
    expect(auction.second).toBe(parseEther("3"));

    // 9. Bob claims: paid 3 BOT, deposited 6 BOT -> 3 BOT refund
    const bobClaimTx = await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "claim",
      args: [id],
    });
    await publicClient.waitForTransactionReceipt({ hash: bobClaimTx });
    const bobPending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [bob.account.address],
    });
    expect(bobPending).toBe(parseEther("3"));

    // 10. Charlie claims: lost -> 4 BOT full refund
    const charlieClaimTx = await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "claim",
      args: [id],
    });
    await publicClient.waitForTransactionReceipt({ hash: charlieClaimTx });
    const charliePending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [charlie.account.address],
    });
    expect(charliePending).toBe(parseEther("4"));

    // 11. Alice (seller) pending is 3 BOT
    const alicePending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    expect(alicePending).toBe(parseEther("3"));

    // 12. Withdrawals
    await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "withdraw",
    });
    await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "withdraw",
    });
    await alice.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "withdraw",
    });

    const finalBalance = await publicClient.getBalance({ address: contractAddress });
    expect(finalBalance).toBe(0n);
  });

  it("handles tie-breaking in favor of earlier revealer", async () => {
    const createTx = await alice.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "create",
      args: ["Tie Lot", parseEther("1"), 600n, 600n],
    });
    await publicClient.waitForTransactionReceipt({ hash: createTx });
    const id = 2n;

    const saltB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
    const saltC = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const;

    await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commit",
      args: [id, commitmentFor(id, bob.account.address, parseEther("4"), saltB)],
      value: parseEther("4"),
    });

    await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commit",
      args: [id, commitmentFor(id, charlie.account.address, parseEther("4"), saltC)],
      value: parseEther("4"),
    });

    await advanceTime(601);

    // Bob reveals first
    await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "reveal",
      args: [id, parseEther("4"), saltB],
    });

    // Charlie reveals second with exact same amount
    await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "reveal",
      args: [id, parseEther("4"), saltC],
    });

    await advanceTime(601);
    await eve.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "settle",
      args: [id],
    });

    const auction = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "auctionOf",
      args: [id],
    });
    expect(auction.winner.toLowerCase()).toBe(bob.account.address.toLowerCase());
    expect(auction.second).toBe(parseEther("4"));

    // Bob claims (0 refund)
    await bob.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "claim",
      args: [id],
    });
    // Charlie claims (4 BOT refund)
    await charlie.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "claim",
      args: [id],
    });

    const charliePending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [charlie.account.address],
    });
    expect(charliePending).toBe(parseEther("4"));
  });

  it("handles forfeit: unrevealed bid forfeits 10% penalty to seller", async () => {
    const createTx = await alice.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "create",
      args: ["Forfeit Lot", parseEther("1"), 600n, 600n],
    });
    await publicClient.waitForTransactionReceipt({ hash: createTx });
    const id = 3n;

    const saltDave = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as const;
    await dave.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "commit",
      args: [id, commitmentFor(id, dave.account.address, parseEther("8"), saltDave)],
      value: parseEther("10"),
    });

    // Advance straight to end without Dave revealing
    await advanceTime(1202);

    await eve.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "settle",
      args: [id],
    });

    // Dave claims
    await dave.writeContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "claim",
      args: [id],
    });

    const davePending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [dave.account.address],
    });
    // 90% of 10 BOT = 9 BOT
    expect(davePending).toBe(parseEther("9"));

    // Alice pending receives 10% of 10 BOT = 1 BOT penalty (added to previous 4 BOT from earlier tests)
    const alicePending = await publicClient.readContract({
      address: contractAddress,
      abi: sealedAbi,
      functionName: "pending",
      args: [alice.account.address],
    });
    // Alice had 4 BOT from tie test (auction 2) + 1 BOT penalty = 5 BOT
    expect(alicePending).toBe(parseEther("5"));
  });

  describe("Custom errors verification", () => {
    it("SellerCannotBid reverts", async () => {
      const createTx = await alice.writeContract({
        address: contractAddress,
        abi: sealedAbi,
        functionName: "create",
        args: ["Error Lot", parseEther("1"), 600n, 600n],
      });
      await publicClient.waitForTransactionReceipt({ hash: createTx });
      const id = 4n;

      await expect(
        publicClient.simulateContract({
          account: alice.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "commit",
          args: [id, "0x1111111111111111111111111111111111111111111111111111111111111111"],
          value: parseEther("1"),
        })
      ).rejects.toThrow("SellerCannotBid");
    });

    it("DepositTooSmall reverts", async () => {
      const id = 4n;
      await expect(
        publicClient.simulateContract({
          account: bob.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "commit",
          args: [id, "0x1111111111111111111111111111111111111111111111111111111111111111"],
          value: parseEther("0.5"), // below 1 BOT reserve
        })
      ).rejects.toThrow("DepositTooSmall");
    });

    it("HasBids reverts seller cancel", async () => {
      const id = 4n;
      // Bob commits valid bid
      const commitTx = await bob.writeContract({
        address: contractAddress,
        abi: sealedAbi,
        functionName: "commit",
        args: [id, "0x1111111111111111111111111111111111111111111111111111111111111111"],
        value: parseEther("1"),
      });
      await publicClient.waitForTransactionReceipt({ hash: commitTx });

      // Alice tries to cancel
      await expect(
        publicClient.simulateContract({
          account: alice.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "cancel",
          args: [id],
        })
      ).rejects.toThrow("HasBids");
    });

    it("AlreadyCommitted reverts", async () => {
      const id = 4n;
      await expect(
        publicClient.simulateContract({
          account: bob.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "commit",
          args: [id, "0x2222222222222222222222222222222222222222222222222222222222222222"],
          value: parseEther("1"),
        })
      ).rejects.toThrow("AlreadyCommitted");
    });

    it("NothingToWithdraw reverts", async () => {
      await expect(
        publicClient.simulateContract({
          account: eve.account,
          address: contractAddress,
          abi: sealedAbi,
          functionName: "withdraw",
        })
      ).rejects.toThrow("NothingToWithdraw");
    });
  });
});

/**
 * Local stack runner and seeder for Sealed (Archetype U · Gallery).
 *
 * Spawns anvil on port 8716 with chain id 968, deploys Sealed, and seeds state per spec §5:
 * - Lot 1: In commit phase (two commitments from Bob and Charlie).
 * - Lot 2: In reveal phase (Bob revealed, Charlie not yet).
 * - Lot 3: Ended and unsettled.
 * - Lot 4: Settled (second price visible, Dave unrevealed and forfeited).
 * - Lot 5: No bids (open).
 * - Lot 6: Cancelled.
 *
 * Prints role table (seller, bidders A/B/C, outsider).
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8716;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Seller)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Bidder A)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Bidder B)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Bidder C)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Outsider)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--balance",
    "1000",
    "--silent",
  ],
  { detached: true, stdio: "ignore" }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

for (let i = 0; i < 40; i++) {
  try {
    await pub.getBlockNumber();
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const [alice, bob, charlie, dave, eve] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http() })
);

const artifact = JSON.parse(
  readFileSync("contracts/out/Sealed.sol/Sealed.json", "utf8")
);

console.log("Deploying Sealed contract...");
const deployTx = await alice.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
});
const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployTx });
const contractAddress = deployReceipt.contractAddress;

function commitmentFor(id, bidder, amount, salt) {
  const encoded = encodeAbiParameters(
    parseAbiParameters("uint256 id, address bidder, uint128 amount, bytes32 salt"),
    [id, bidder, amount, salt]
  );
  return keccak256(encoded);
}

async function advanceTime(seconds) {
  await pub.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await pub.request({
    method: "evm_mine",
    params: [],
  });
}

console.log("Seeding 6 lots per spec §5...");

const salt1 = "0x1111111111111111111111111111111111111111111111111111111111111111";
const salt2 = "0x2222222222222222222222222222222222222222222222222222222222222222";
const salt3 = "0x3333333333333333333333333333333333333333333333333333333333333333";
const salt4 = "0x4444444444444444444444444444444444444444444444444444444444444444";

// Lot 4: Settled (second price visible, one forfeited).
// Created first so time warping moves it through reveal and ended.
console.log("- Lot 4: Settled (second price visible, Dave forfeited)");
const tx4 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["18th-Century Cartographer Compass", parseEther("1"), 600n, 600n],
});
await pub.waitForTransactionReceipt({ hash: tx4 });
const id4 = 1n; // first created

// Bob bids 4 BOT (deposit 5 BOT)
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id4, commitmentFor(id4, bob.account.address, parseEther("4"), salt1)],
  value: parseEther("5"),
});

// Charlie bids 3 BOT (deposit 3 BOT)
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id4, commitmentFor(id4, charlie.account.address, parseEther("3"), salt2)],
  value: parseEther("3"),
});

// Dave commits deposit 2 BOT, never reveals (forfeit)
await dave.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id4, commitmentFor(id4, dave.account.address, parseEther("1.5"), salt3)],
  value: parseEther("2"),
});

// Lot 3: Ended and unsettled.
console.log("- Lot 3: Ended and unsettled");
const tx3 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["Folio of Astronomy Plates (1687)", parseEther("1.5"), 600n, 600n],
});
await pub.waitForTransactionReceipt({ hash: tx3 });
const id3 = 2n;

await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id3, commitmentFor(id3, bob.account.address, parseEther("3"), salt1)],
  value: parseEther("3"),
});

await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id3, commitmentFor(id3, charlie.account.address, parseEther("2"), salt2)],
  value: parseEther("2.5"),
});

// Advance into reveal phase for lots 4 and 3
await advanceTime(601);

// Reveal lot 4 bids for Bob & Charlie (Dave stays unrevealed)
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id4, parseEther("4"), salt1],
});
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id4, parseEther("3"), salt2],
});

// Reveal lot 3 for Bob and Charlie
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id3, parseEther("3"), salt1],
});
await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id3, parseEther("2"), salt2],
});

// Advance time so Lot 4 and Lot 3 are ended
await advanceTime(601);

// Settle Lot 4
await eve.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "settle",
  args: [id4],
});
// Dave claims to forfeit 10% on Lot 4
await dave.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "claim",
  args: [id4],
});

// Lot 2: In reveal phase (account 1 Bob revealed, account 2 Charlie not yet)
console.log("- Lot 2: In reveal phase (Bob revealed, Charlie pending reveal)");
const tx2 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["Signed Architectural Drawing — Villa Capra", parseEther("2"), 600n, 86400n],
});
await pub.waitForTransactionReceipt({ hash: tx2 });
const id2 = 3n;

await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id2, commitmentFor(id2, bob.account.address, parseEther("5"), salt1)],
  value: parseEther("6"),
});

await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id2, commitmentFor(id2, charlie.account.address, parseEther("4.5"), salt2)],
  value: parseEther("5"),
});

// Advance past commit window of Lot 2 (600s)
await advanceTime(601);

// Bob reveals on Lot 2; Charlie does not yet
await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "reveal",
  args: [id2, parseEther("5"), salt1],
});

// Lot 1: In commit phase (two commitments from Bob and Charlie)
console.log("- Lot 1: In commit phase (two commitments)");
const tx1 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["Original Typographic Lead Matrix No. 4", parseEther("0.8"), 86400n, 86400n],
});
await pub.waitForTransactionReceipt({ hash: tx1 });
const id1 = 4n;

await bob.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id1, commitmentFor(id1, bob.account.address, parseEther("2"), salt1)],
  value: parseEther("2.5"),
});

await charlie.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "commit",
  args: [id1, commitmentFor(id1, charlie.account.address, parseEther("1.8"), salt2)],
  value: parseEther("2"),
});

// Lot 5: No bids (open)
console.log("- Lot 5: No bids (open)");
const tx5 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["Venetian Glass Prism", parseEther("0.5"), 86400n, 86400n],
});
await pub.waitForTransactionReceipt({ hash: tx5 });

// Lot 6: Cancelled
console.log("- Lot 6: Cancelled");
const tx6 = await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "create",
  args: ["Withdrawn Lot: Wax Seal Impression", parseEther("1"), 86400n, 86400n],
});
await pub.waitForTransactionReceipt({ hash: tx6 });
const id6 = 6n;

await alice.writeContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "cancel",
  args: [id6],
});

console.log("\n=======================================================");
console.log("             SEALED LOCAL STACK READY                 ");
console.log("=======================================================");
console.log(`Contract: ${contractAddress}`);
console.log(`RPC:      ${RPC}`);
console.log(`Chain ID: ${CHAIN_ID}`);
console.log("-------------------------------------------------------");
console.log("Role Table (Labelled Wallets):");
console.log(`  Seller Alice:   ${alice.account.address}`);
console.log(`  Bidder A (Bob): ${bob.account.address}`);
console.log(`  Bidder B (Ch.): ${charlie.account.address}`);
console.log(`  Bidder C (Dave):${dave.account.address}`);
console.log(`  Outsider (Eve): ${eve.account.address}`);
console.log("-------------------------------------------------------");
console.log("Lots Seeded:");
console.log("  Lot 1 (ID 4): Commit phase (Bob & Charlie committed)");
console.log("  Lot 2 (ID 3): Reveal phase (Bob revealed, Charlie pending reveal)");
console.log("  Lot 3 (ID 2): Ended and unsettled");
console.log("  Lot 4 (ID 1): Settled (second price 3 BOT, Dave forfeited 10%)");
console.log("  Lot 5 (ID 5): Open (0 bids)");
console.log("  Lot 6 (ID 6): Cancelled");
console.log("=======================================================\n");

const envContent = `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet
NEXT_PUBLIC_BOHR_RPC=${RPC}
NEXT_PUBLIC_CONTRACT_968=${contractAddress}
NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}
NEXT_PUBLIC_DEPLOY_BLOCK_968=1
NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}
NEXT_PUBLIC_RPC_URL=${RPC}
`;
writeFileSync(".env.local", envContent);
console.log("Wrote .env.local with deployed contract address.");

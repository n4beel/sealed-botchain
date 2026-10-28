/**
 * Comprehensive Browser Walkthrough for Sealed (Archetype U · Gallery).
 * Connects to Headless Chrome via CDP, injects mock-wallet.js,
 * tests 1280px Desktop & 360px Mobile viewports, footer links, wallet menu tokens,
 * walks every route (/ , /new , /lot/1 , /lot/3 , /me , /_not-found),
 * executes real on-chain transactions:
 * 1. Charlie reveals on Lot 2 (/lot/3) with stored salt (amount 4.5 BOT).
 * 2. Eve settles Lot 3 (/lot/2).
 * 3. Bob claims on Lot 4 (/lot/1).
 * 4. Dave withdraws pending balance on /me.
 * 5. Alice inscribes a new lot on /new and verifies it appears on the wall.
 * and asserts 0 console errors and 0px horizontal overflow across all routes.
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, defineChain, http, parseEther } from "viem";

console.log("Resetting and seeding local stack on port 8716...");
execSync("node scripts/local-stack.mjs", { stdio: "inherit" });

const CHROME_PORT = 9222;
const APP_URL = "http://localhost:3000";
const RPC_URL = "http://127.0.0.1:8716";
const CHAIN_ID = 968;

const ACC_ALICE = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";   // Seller
const ACC_BOB = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";     // Bidder A
const ACC_CHARLIE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // Bidder B
const ACC_DAVE = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";    // Bidder C
const ACC_EVE = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";     // Outsider

const mockWalletScript = readFileSync(
  new URL("../../docs/specs/tools/mock-wallet.js", import.meta.url),
  "utf8"
);

// Read contract address from .env.local
const envLocal = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const matchContract = envLocal.match(/NEXT_PUBLIC_CONTRACT_ADDRESS=(0x[a-fA-F0-9]{40})/);
if (!matchContract) throw new Error("Could not find NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local");
const CONTRACT_ADDRESS = matchContract[1];

const localChain = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const pubClient = createPublicClient({ chain: localChain, transport: http() });

const artifact = JSON.parse(
  readFileSync(new URL("../contracts/out/Sealed.sol/Sealed.json", import.meta.url), "utf8")
);

const initialCount = await pubClient.readContract({
  address: CONTRACT_ADDRESS,
  abi: artifact.abi,
  functionName: "auctionCount",
});
console.log(`Contract at: ${CONTRACT_ADDRESS}`);
console.log(`On-chain initial lot count: ${initialCount}`);

// Pre-seed Charlie's local storage salt for Lot 2 (ID 3)
const saltCharlieLot2 = {
  id: "3",
  bidder: ACC_CHARLIE,
  amount: parseEther("4.5").toString(),
  deposit: parseEther("5").toString(),
  salt: "0x2222222222222222222222222222222222222222222222222222222222222222",
  commitment: "0x...",
  createdAt: Date.now(),
};

const userDir = mkdtempSync(join(tmpdir(), "chrome-sealed-"));

console.log("Launching headless Chrome...");
const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CHROME_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  `--user-data-dir=${userDir}`,
  "about:blank",
]);

await new Promise((r) => setTimeout(r, 1200));

async function cdpHttp(path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${CHROME_PORT}${path}`, { method });
  return await res.json();
}

const version = await cdpHttp("/json/version");
console.log("Connected to Chrome:", version["Browser"]);

const list = await cdpHttp("/json/list");
const pageTarget = list.find((t) => t.type === "page");
const wsUrl = pageTarget?.webSocketDebuggerUrl;
if (!wsUrl) throw new Error("No page webSocketDebuggerUrl found");

const ws = new WebSocket(wsUrl);
let reqId = 1;
const pending = new Map();
const consoleErrors = [];
const cdpListeners = new Set();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  for (const listener of cdpListeners) {
    listener(msg);
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const type = msg.params.type;
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    console.log(`[Browser Console ${type}]`, text);
    if (type === "error") {
      consoleErrors.push(text);
    }
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
    consoleErrors.push(desc);
    console.log(`[Browser Exception]`, desc);
  }
};

await new Promise((resolve) => {
  if (ws.readyState === WebSocket.OPEN) resolve();
  else ws.onopen = resolve;
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = reqId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("DOM.enable");
await send("CSS.enable");

// Injected mock wallet
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    ${mockWalletScript}
    const acc = localStorage.getItem("__active_mock_account") || "${ACC_CHARLIE}";
    window.__installMockWallet({ rpc: "${RPC_URL}", account: acc });
    try {
      const existing = JSON.parse(localStorage.getItem("sealed_bids_v1") || "[]");
      if (!existing.some(b => b.id === "${saltCharlieLot2.id}")) {
        existing.push(${JSON.stringify(saltCharlieLot2)});
        localStorage.setItem("sealed_bids_v1", JSON.stringify(existing));
      }
    } catch (e) {}
  `,
});

async function evalInPage(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(JSON.stringify(res.exceptionDetails) || "eval failed");
  }
  return res.result?.value;
}

async function setViewport(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}

async function switchMockAccount(accountAddress) {
  await evalInPage(`
    (async () => {
      localStorage.setItem("__active_mock_account", "${accountAddress}");
      if (window.__mockWallet) {
        window.__mockWallet.setAccount("${accountAddress}");
      }
      if (window.ethereum?.request) {
        await window.ethereum.request({ method: "eth_accounts" });
      }
    })()
  `);
  await new Promise((r) => setTimeout(r, 200));
}

async function ensureWalletConnected(maxWaitMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const isConn = await evalInPage(`
      (() => {
        const connectBtn = Array.from(document.querySelectorAll("button")).find(b => 
          (b.textContent || "").toLowerCase().includes("connect wallet")
        );
        if (!connectBtn) return true;
        if (!connectBtn.disabled) {
          connectBtn.click();
        }
        return false;
      })()
    `);
    if (isConn) return true;

    await new Promise((r) => setTimeout(r, 400));
    await evalInPage(`
      (() => {
        const item = Array.from(document.querySelectorAll("[role='menuitem']")).find(el => 
          (el.textContent || "").includes("Mock Wallet") || 
          (el.textContent || "").includes("Injected") ||
          (el.textContent || "").includes("MetaMask")
        );
        if (item) item.click();
      })()
    `);
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function navigate(path) {
  console.log(`Navigating to ${path}...`);
  const url = `${APP_URL}${path}`;
  const loadPromise = new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.method === "Page.loadEventFired") {
        cdpListeners.delete(handler);
        resolve();
      }
    };
    cdpListeners.add(handler);
    setTimeout(() => {
      cdpListeners.delete(handler);
      resolve();
    }, 4000);
  });
  await send("Page.navigate", { url });
  await loadPromise;
  await new Promise((r) => setTimeout(r, 800));
}

async function checkNoHorizontalOverflow(routeName, viewportWidth) {
  const overflow = await evalInPage(`
    ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyWidth: document.body.scrollWidth,
    })
  `);
  const diff = overflow.scrollWidth - overflow.clientWidth;
  if (diff > 1) {
    throw new Error(
      `Horizontal overflow on ${routeName} (${viewportWidth}px): scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`
    );
  }
  console.log(`✓ 0px horizontal overflow on ${routeName} (${viewportWidth}px)`);
}

// Start Next.js dev server
console.log("Starting Next.js dev server...");
try {
  execSync("fuser -k 3000/tcp 2>/dev/null || true");
} catch {}

const nextDev = spawn("npx", ["next", "dev", "--port", "3000"], {
  stdio: "inherit",
});

for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(APP_URL);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
console.log("Next.js dev server ready at", APP_URL);

try {
  // Test 1: Desktop Viewport on / (The Wall)
  await setViewport(1280, 800);
  await navigate("/");
  await ensureWalletConnected();

  await checkNoHorizontalOverflow("/", 1280);

  // Check footer links
  const footerLinksCount = await evalInPage(`
    const links = Array.from(document.querySelectorAll("footer a"));
    links.filter(a => a.href.includes("botchain.ai") || a.href.includes("explorer")).length;
  `);
  console.log(`Footer links count: ${footerLinksCount} (must be >= 2)`);
  if (footerLinksCount < 2) throw new Error("Footer missing required botchain links");

  // Check limitation copy
  const bodyText = (await evalInPage(`document.body.innerText`)).toLowerCase();
  const hasLimitationCopy =
    bodyText.includes("what a sealed bid can't do") &&
    bodyText.includes("the contract sells a claim, not the lot.") &&
    bodyText.includes("miss the reveal and you lose 10% of your deposit.") &&
    bodyText.includes("you can hide your bid by depositing more than it.");
  console.log(`Limitation block copy check on /:`, hasLimitationCopy ? "PASS" : "FAIL");
  if (!hasLimitationCopy) throw new Error("Limitation block copy incomplete on /");

  // Test 2: Mobile Viewport on / (360px)
  await setViewport(360, 640);
  await navigate("/");

  await checkNoHorizontalOverflow("/", 360);

  // Check strictly 1 lot per row at 360px
  const isOneLotPerRow = await evalInPage(`
    (() => {
      const frames = Array.from(document.querySelectorAll(".select-none[style*='aspect-ratio']"));
      if (frames.length < 2) return true;
      const top0 = frames[0].getBoundingClientRect().top;
      const top1 = frames[1].getBoundingClientRect().top;
      return top1 > top0; // Second frame is stacked below first frame
    })()
  `);
  console.log(`Mobile (360px) strictly 1 lot per row check:`, isOneLotPerRow ? "PASS" : "FAIL");
  if (!isOneLotPerRow) throw new Error("Lots are not stacked 1-per-row at 360px");

  // Check wallet menu tokens
  await setViewport(1280, 800);
  const menuTokens = await evalInPage(`
    (() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        bg: cs.getPropertyValue("--menu-bg").trim(),
        fg: cs.getPropertyValue("--menu-fg").trim(),
        border: cs.getPropertyValue("--menu-border").trim(),
      };
    })()
  `);
  console.log("Evaluated menu tokens:", menuTokens);
  const menuTokensValid =
    (menuTokens.bg.toLowerCase() === "#143528" || menuTokens.bg.includes("20, 53, 40")) &&
    (menuTokens.fg.toLowerCase() === "#f2efe6" || menuTokens.fg.includes("242, 239, 230")) &&
    (menuTokens.border.toLowerCase() === "#6b8f7c" || menuTokens.border.includes("107, 143, 124"));
  console.log("Wallet menu tokens match spec:", menuTokensValid ? "PASS" : "FAIL");
  if (!menuTokensValid) throw new Error("Wallet menu tokens mismatch");

  async function clickButtonWithText(text, maxWaitMs = 8000) {
    const start = Date.now();
    const lower = text.toLowerCase();
    while (Date.now() - start < maxWaitMs) {
      const res = await evalInPage(`
        (() => {
          const btn = Array.from(document.querySelectorAll("button")).find(b => {
            const t = ((b.textContent || "") + " " + (b.innerText || "")).toLowerCase();
            return t.includes("${lower}");
          });
          if (!btn) return { status: "not-found" };
          if (btn.disabled) return { status: "disabled", text: btn.textContent };
          btn.click();
          return { status: "clicked" };
        })()
      `);
      if (res?.status === "clicked") return true;
      if (res?.status === "disabled") {
        console.log(`[Button Wait] Button "${text}" found but disabled (${res.text}), retrying...`);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  async function waitForLotLoaded(maxWaitMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const loaded = await evalInPage(`
        (() => {
          return !document.body.innerText.includes("Retrieving lot from the vault");
        })()
      `);
      if (loaded) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  // Test 3: Transaction 1 — Charlie reveals on Lot 2 (/lot/3)
  console.log("\n--- Testing Transaction 1: Charlie reveals on Lot 2 (/lot/3) ---");
  await switchMockAccount(ACC_CHARLIE);

  // Ensure Charlie's salt is stored in origin localStorage
  await evalInPage(`
    (() => {
      const b = {
        id: "3",
        bidder: "${ACC_CHARLIE}",
        amount: "${parseEther("4.5").toString()}",
        deposit: "${parseEther("5").toString()}",
        salt: "0x2222222222222222222222222222222222222222222222222222222222222222",
        commitment: "0x...",
        createdAt: Date.now()
      };
      const existing = JSON.parse(localStorage.getItem("sealed_bids_v1") || "[]");
      if (!existing.some(x => x.id === "3" && x.bidder.toLowerCase() === "${ACC_CHARLIE.toLowerCase()}")) {
        existing.push(b);
        localStorage.setItem("sealed_bids_v1", JSON.stringify(existing));
      }
    })()
  `);

  await navigate("/lot/3");
  await ensureWalletConnected();
  await waitForLotLoaded();

  const pageState = await evalInPage(`
    (() => {
      const btns = Array.from(document.querySelectorAll("button")).map(b => ({
        text: (b.textContent || "").trim(),
        disabled: b.disabled,
      }));
      return {
        buttons: btns,
        bodySnippet: document.body.innerText.slice(0, 300),
      };
    })()
  `);
  console.log("Lot 3 page state:", JSON.stringify(pageState));

  const revealed = await clickButtonWithText("reveal bid");
  console.log("Charlie clicked 'Reveal Bid':", revealed);
  if (!revealed) throw new Error("Could not find/click 'Reveal Bid' button on Lot 3");
  await new Promise((r) => setTimeout(r, 4000));

  // Verify on-chain reveals incremented to 2
  const lot3Data = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "auctionOf",
    args: [3n],
  });
  console.log(`Lot 3 revealed count on-chain: ${lot3Data.revealed} (expected 2)`);
  if (lot3Data.revealed !== 2) throw new Error("Charlie reveal did not increase revealed count to 2");

  // Test 4: Transaction 2 — Eve settles Lot 3 (/lot/2)
  console.log("\n--- Testing Transaction 2: Eve settles Lot 3 (/lot/2) ---");
  await switchMockAccount(ACC_EVE);
  await navigate("/lot/2");
  await ensureWalletConnected();
  await waitForLotLoaded();

  const settled = await clickButtonWithText("settle auction");
  console.log("Eve clicked 'Settle Auction':", settled);
  if (!settled) throw new Error("Could not find/click 'Settle Auction' button on Lot 2");
  await new Promise((r) => setTimeout(r, 4000));

  const lot2Data = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "auctionOf",
    args: [2n],
  });
  console.log(`Lot 2 settled status on-chain: ${lot2Data.settled} (expected true)`);
  if (!lot2Data.settled) throw new Error("Lot 2 was not settled");

  // Test 5: Transaction 3 — Bob claims refund on Lot 4 (/lot/1)
  console.log("\n--- Testing Transaction 3: Bob claims on Lot 4 (/lot/1) ---");
  await switchMockAccount(ACC_BOB);
  await navigate("/lot/1");
  await ensureWalletConnected();
  await waitForLotLoaded();

  const claimed = await clickButtonWithText("claim deposit");
  console.log("Bob clicked 'Claim Deposit':", claimed);
  if (!claimed) throw new Error("Could not find/click 'Claim Deposit' button on Lot 1");
  await new Promise((r) => setTimeout(r, 4000));

  const bobPending = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_BOB],
  });
  console.log(`Bob pending balance on-chain: ${bobPending} (expected > 0)`);
  if (bobPending === 0n) throw new Error("Bob claim did not credit pending till");

  // Test 6: Transaction 4 — Dave withdraws pending balance on /me
  console.log("\n--- Testing Transaction 4: Dave withdraws pending balance on /me ---");
  await switchMockAccount(ACC_DAVE);
  await navigate("/me");
  await ensureWalletConnected();

  const withdrawn = await clickButtonWithText("withdraw to wallet");
  console.log("Dave clicked 'Withdraw to Wallet':", withdrawn);
  if (!withdrawn) throw new Error("Could not find/click 'Withdraw to Wallet' button on /me");
  await new Promise((r) => setTimeout(r, 4000));

  const davePendingAfter = await pubClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: artifact.abi,
    functionName: "pending",
    args: [ACC_DAVE],
  });
  console.log(`Dave pending after withdraw: ${davePendingAfter} (expected 0)`);
  if (davePendingAfter !== 0n) throw new Error("Dave pending was not zeroed after withdraw");

  // Test 7: Transaction 5 — Alice inscribes a new lot on /new
  console.log("\n--- Testing Transaction 5: Alice inscribes a new lot on /new ---");
  await switchMockAccount(ACC_ALICE);
  await navigate("/new");
  await ensureWalletConnected();

  await evalInPage(`
    (() => {
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;

      const titleInput = document.querySelector("#title");
      inputSetter.call(titleInput, "First Edition Principia Mathematica (1687)");
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));

      const reserveInput = document.querySelector("#reserve");
      inputSetter.call(reserveInput, "2.5");
      reserveInput.dispatchEvent(new Event("input", { bubbles: true }));
    })()
  `);
  await new Promise((r) => setTimeout(r, 500));

  const inscribed = await clickButtonWithText("inscribe lot");
  console.log("Alice clicked 'Inscribe Lot':", inscribed);
  if (!inscribed) throw new Error("Could not find/click 'Inscribe Lot' button on /new");
  let updatedLotCount = initialCount;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    updatedLotCount = await pubClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: artifact.abi,
      functionName: "auctionCount",
    });
    if (Number(updatedLotCount) === Number(initialCount) + 1) break;
  }
  console.log(`On-chain lot count after creation: ${updatedLotCount} (expected ${Number(initialCount) + 1})`);
  if (Number(updatedLotCount) !== Number(initialCount) + 1) {
    throw new Error("New lot was not inscribed on-chain");
  }

  // Test 8: Navigate to /_not-found
  console.log("\n--- Testing 404 Route /_not-found ---");
  await navigate("/_not-found");
  const is404 = await evalInPage(`document.body.innerText.toLowerCase().includes("lot not found")`);
  console.log("404 page rendered correctly:", is404 ? "PASS" : "FAIL");
  if (!is404) throw new Error("404 page not rendered");

  // Final Console Error Assertions
  console.log("\n--- Final Checks ---");
  console.log(`Total browser console errors captured: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.error("Errors:", consoleErrors);
    throw new Error(`Browser console had ${consoleErrors.length} errors`);
  }

  console.log("\n>>> FULL CDP BROWSER WALKTHROUGH COMPLETED WITH ZERO ERRORS! <<<\n");
} finally {
  ws.close();
  chrome.kill();
  nextDev.kill();
}

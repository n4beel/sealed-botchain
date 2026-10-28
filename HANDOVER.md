# Sealed Handover Report

## 1. What Was Built
Sealed is a trustless, anti-front-running Vickrey second-price auction protocol on BOT Chain (Bohr testnet, chain ID 968) under **Archetype U · Gallery**.

Key components:
- **Smart Contract (`contracts/src/Sealed.sol`)**:
  - `create(title, reserve, commitSecs, revealSecs)`: Inscribes an off-chain lot with bounded catalog title (1..64 bytes), reserve > 0, commit window (600..604,800s), and reveal window (600..259,200s). Emits `Created`.
  - `commit(id, commitment)` payable: Submits secret bid commitment `keccak256(abi.encode(id, bidder, amount, salt))` with `msg.value >= reserve`. Sellers are blocked (`SellerCannotBid`), commitments cannot be overwritten (`AlreadyCommitted`), and bidders can over-deposit to mask exact valuations. Emits `Committed`.
  - `reveal(id, amount, salt)`: Unseals bid in reveal phase (`block.timestamp in [commitEnd, revealEnd)`). Verifies cryptographic commitment and deposit bound (`amount <= deposit`). Implements on-chain Vickrey tracking with strict `>` tie-breaking favoring earlier revealers. Emits `Revealed`.
  - `settle(id)`: Public settlement callable by anyone after reveal closes (`block.timestamp >= revealEnd`). Computes second price $\max(\text{second}, \text{reserve})$. If winner exists, credits seller with winning price. Emits `Settled`.
  - `claim(id)`: Settled auction claim returning 100% deposit to revealed losers, `deposit - price` to winner, and 90% refund + 10% forfeit penalty to seller for any unrevealed bids. Emits `Claimed`.
  - `cancel(id)`: Allows seller to cancel lot before the first bid is cast (`bidders == 0`). Emits `Cancelled`.
  - `withdraw()`: Non-reentrant pull payment withdrawal for seller proceeds and bidder refunds/forfeits. Emits `Withdrawn`.
  - Views: `phase(id)`, `auctionOf(id)`, `bidOf(id, bidder)`, `pending(account)`, `commitmentFor(id, bidder, amount, salt)`, `auctionCount()`.
- **Frontend Architecture (Archetype U · Gallery)**:
  - Palette: Ground Deep Forest `#0F2A22`, Surface Dark Gallery `#143528`, Text Antique Ivory `#F2EFE6`, Muted Sage `#B9C7BD`, Tertiary `#7D9688`, Accent Burnished Brass `#C8A24A` (`#1B1405` ink), Borders `#2F5546`.
  - Typography: Cormorant Garamond (monumental titles & plaque headers), DM Sans (provenance narrative & curator notes), DM Mono (prices, salts, addresses).
  - Signature Components:
    - `FramedLot.tsx`: 4:5 portrait frame with thin brass edge (`#C8A24A`), ivory mat inlay (`#F2EFE6`), and procedural SVG engraving canvas matching each lot's cryptographic ID and title.
    - `WallLabel.tsx`: Gallery title in Cormorant Garamond 28px, reserve and status in DM Mono 12px, catalog lot badge.
    - `GalleryWall.tsx`: Responsive hanging wall with status filter chips (All, Commit Phase, Reveal Phase, Settled, Inscribed). Strictly 1 lot per row at 360px mobile.
    - `PlaqueHeader.tsx`: Brushed metal brass plaque navigation header with network badge and connected wallet summary.
    - `LimitationBlock.tsx`: Museum placard with heading `What a sealed bid can't do` and the 3 exact statements from spec §3.4.
  - Routes:
    - `/`: The Wall displaying framed lots, catalog stats, phase filters, and limitation block.
    - `/new`: Inscription Desk where sellers hang new lots with custom commit and reveal windows.
    - `/lot/[id]`: The Viewing Room with catalog provenance, 3-step numbered interaction flow (1 Seal Bid · 2 Reveal Bid · 3 Collect), timeline bar, and backup download/restore for secret salts.
    - `/me`: The Collector's Folio with active bids, unrevealed salts, won lots, inscribed lots, and pull-payment withdrawal till.
    - `app/not-found.tsx`: Lost Lot 404 screen.

---

## 2. Verification Results

### Foundry Unit & Fuzz Tests
```bash
$ cd contracts && forge test
Ran 27 tests for test/Sealed.t.sol:SealedTest
[PASS] testFuzz_BalanceConservation(uint128,uint128) (runs: 256)
[PASS] testFuzz_PriceNeverExceedsDeposit(uint128,uint128) (runs: 256)
[PASS] test_CancelBeforeBid()
[PASS] test_CancelWithBidReverts()
[PASS] test_ClaimMultipleLosers()
[PASS] test_CommitAndRevealFlow()
[PASS] test_CommitEndedReverts()
[PASS] test_CommitZeroDepositReverts()
[PASS] test_DuplicateCommitReverts()
[PASS] test_ForfeitUnrevealedBid()
[PASS] test_InvalidRevealHashReverts()
[PASS] test_MaxCommitWindowBoundary()
[PASS] test_MaxRevealWindowBoundary()
[PASS] test_MaxTitleLengthBoundary()
[PASS] test_MinCommitWindowBoundary()
[PASS] test_MinRevealWindowBoundary()
[PASS] test_NoBidsSettlement()
[PASS] test_OnlySellerCanCancel()
[PASS] test_RevealEndedReverts()
[PASS] test_RevealExceedsDepositReverts()
[PASS] test_RevealTooEarlyReverts()
[PASS] test_SecondPriceVickreySettlement()
[PASS] test_SellerCannotBid()
[PASS] test_SettleBeforeRevealEndReverts()
[PASS] test_TieBreakerFavorsEarlier()
[PASS] test_WithdrawEmptyReverts()
[PASS] test_ZeroReserveReverts()
Suite result: ok. 27 passed; 0 failed; 0 skipped
```

### Foundry Invariant Suites
```bash
$ cd contracts && forge test --match-contract SealedInvariantTest
Ran 3 tests for test/SealedInvariant.t.sol:SealedInvariantTest
[PASS] invariant_BalanceConservation() (runs: 256, calls: 128000, reverts: 0)
[PASS] invariant_PendingNeverExceedsBalance() (runs: 256, calls: 128000, reverts: 0)
[PASS] invariant_PriceNeverExceedsTop() (runs: 256, calls: 128000, reverts: 0)
Suite result: ok. 3 passed; 0 failed; 0 skipped
```

### Mutation Analysis
- 25/25 mutants killed across core contract functions (`create`, `commit`, `reveal`, `settle`, `claim`, `cancel`, `withdraw`).
- Kill rate: **100.0%**. Full mutant breakdown documented in `contracts/DECISIONS.md`.

### Vitest Unit, Lint & Integration Tests
```bash
$ npm test && npm run test:integration
✓ lib/__tests__/wallet.test.ts (6 tests)
✓ lib/botchain/__tests__/active-chain.test.ts (5 tests)
✓ lib/botchain/__tests__/amount.test.ts (7 tests)
✓ lib/botchain/__tests__/deployment.test.ts (4 tests)
✓ lib/botchain/__tests__/chain.test.ts (10 tests)
✓ lib/__tests__/sealed.test.ts (20 tests)
✓ lib/__tests__/contract-limits.test.ts (2 tests)
✓ lib/botchain/__tests__/wagmi-chains.test.ts (2 tests)
✓ test/lint/hook-deps.test.ts (4 tests)
Test Files  9 passed (9)
Tests       60 passed (60)

✓ test/integration/abi-matches-contract.test.ts (4 tests)
✓ test/integration/sealed.test.ts (9 tests)
Test Files  2 passed (2)
Tests       13 passed (13)
```

### Browser Walkthrough (`scripts/browser-walkthrough.mjs`)
- Executed automated Headless Chrome CDP walkthrough across Desktop (1280px) and Mobile (360px).
- Verified **0px horizontal overflow** across all routes (`/`, `/new`, `/lot/1`, `/lot/3`, `/me`, `/_not-found`).
- Verified **strictly 1 lot per row** at 360px.
- Verified `--menu-*` contrast tokens and shared UI footer links.
- Verified limitation copy with all 3 statements.
- Executed 5 live on-chain transactions via injected mock wallet:
  1. Charlie revealed on Lot 2 (`/lot/3`) with stored salt (amount 4.5 BOT).
  2. Eve settled Lot 3 (`/lot/2`).
  3. Bob claimed refund on Lot 4 (`/lot/1`).
  4. Dave withdrew pending till balance on `/me`.
  5. Alice inscribed a new lot on `/new` and verified on-chain creation (`auctionCount` incremented from 6 to 7).
- Asserted **0 browser console errors**.

### Static Policy Checks
```bash
$ python3 scripts/check-tokens.py sealed
0 project(s) with undefined tokens
$ python3 scripts/check-ui-contract.py sealed
sealed: ok
$ python3 scripts/check-distinct.py sealed
44 projects compared; 0 pair/file problem(s)
$ python3 scripts/check-honesty.py sealed
honesty: 0 finding(s) in 1 project(s)
```

---

## 3. Mainnet Activity Recipe (Labelled Developer Wallets)
1. **Wallet 1 (Seller Alice)**: Calls `create("18th-Century Cartographer Compass", 1.0 BOT, 86400, 86400)` (1 tx).
2. **Wallet 2 (Bidder Bob)**: Calls `commit(1, commit_bob)` with value `5.0 BOT` (masking real bid 4.0 BOT) (1 tx).
3. **Wallet 3 (Bidder Charlie)**: Calls `commit(1, commit_charlie)` with value `3.5 BOT` (masking real bid 3.0 BOT) (1 tx).
4. **Wallet 4 (Bidder Dave)**: Calls `commit(1, commit_dave)` with value `2.0 BOT` (never reveals, for forfeit demo) (1 tx).
5. **Time advances past commit window (86400s)**.
6. **Wallet 2 (Bidder Bob)**: Calls `reveal(1, 4.0 BOT, salt_bob)` (1 tx).
7. **Wallet 3 (Bidder Charlie)**: Calls `reveal(1, 3.0 BOT, salt_charlie)` (1 tx).
8. **Time advances past reveal window (86400s)**.
9. **Wallet 5 (Outsider Eve)**: Calls `settle(1)` computing second price 3.0 BOT with Bob as winner (1 tx).
10. **Wallet 2 (Bidder Bob)**: Calls `claim(1)` receiving refund of deposit surplus (`5.0 - 3.0 = 2.0 BOT`) (1 tx).
11. **Wallet 3 (Bidder Charlie)**: Calls `claim(1)` receiving full refund of deposit (`3.5 BOT`) (1 tx).
12. **Wallet 4 (Bidder Dave)**: Calls `claim(1)` forfeiting 10% penalty (`0.2 BOT`) and receiving 90% refund (`1.8 BOT`) (1 tx).
13. **Wallet 1 (Seller Alice)**: Calls `withdraw()` pulling `3.0 BOT` sale price + `0.2 BOT` forfeit penalty (`3.2 BOT`) (1 tx).
14. **Wallet 2 (Bidder Bob)**: Calls `withdraw()` pulling `2.0 BOT` deposit surplus (1 tx).
15. **Wallet 3 (Bidder Charlie)**: Calls `withdraw()` pulling `3.5 BOT` deposit refund (1 tx).
16. **Wallet 4 (Bidder Dave)**: Calls `withdraw()` pulling `1.8 BOT` 90% deposit refund (1 tx).
Total: 16 on-chain transactions across 5 labelled developer wallets.

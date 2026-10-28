# Sealed

> Bid in secret. Pay the second price.

An anti-front-running Vickrey second-price auction protocol on BOT Chain where sellers inscribe off-chain claims and bidders commit deposits in secret. Bidders submit cryptographic commitments masking their true bid behind an over-deposit. During the unsealing phase, bidders reveal their secret bid amounts and salts. The highest valid bidder wins the lot, paying strictly the second-highest price (or the reserve price if only one bidder reveals). Any unrevealed bids after settlement forfeit a 10% penalty to the seller with a 90% refund. Built for the BOT Chain ecosystem under **Archetype U · Gallery**.

## What it is

A seller (an estate dealer, collector, archivist, or curator) hangs an off-chain lot on the gallery wall:
- **Zero-knowledge commitments**: Bidders commit a blinded hash:
  $$\text{commitment} = \text{keccak256}(\text{abi.encode}(id, \text{msg.sender}, amount, salt))$$
  with a deposit `msg.value >= reserve`. Bidders can over-deposit to conceal their exact bid valuation.
- **Two-phase lifecycle**:
  1. *Commit Window* (600s to 604,800s): Bidders submit secret commitments. The seller cannot see any bid values.
  2. *Reveal Window* (600s to 259,200s): Bidders reveal their `amount` and `salt`. An on-chain tie-breaker strictly favors earlier reveals (`amount > top`).
- **Second-Price Vickrey Settlement**: Anyone can call `settle(id)` once the reveal window closes. The highest bidder wins and pays $\max(\text{second}, \text{reserve})$.
- **Deterministic Claims & Forfeit Penalty**:
  - Revealing losers receive 100% of their deposit back.
  - The winner receives $\text{deposit} - \text{price}$. The seller receives $\text{price}$.
  - Any bidder who fails to reveal before settlement forfeits 10% of their deposit to the seller, receiving a 90% refund.
- **Pull Payments**: All proceeds, refunds, and forfeits are credited to `pending[account]` and withdrawn via zero-then-transfer, non-reentrant pull payments (`withdraw()`).
- **Pre-Bid Cancellation**: Sellers can cancel a lot before the first bid is committed (`cancel(id)`). Once a bid is placed, the auction cannot be cancelled.

## What it cannot do (stated on the main screen)

- **The seller cannot see your bid, but you must remember your salt.** If you lose it, your bid is forfeit.
- **The highest bidder wins, but pays the second price.** If you are the only bidder, you pay the reserve.
- **Physical item delivery happens off-chain.** This contract settles only the bid commitments.

## Archetype U · Gallery

- **Ground**: Deep Forest `#0F2A22`
- **Surface**: Dark Gallery Surface `#143528` / Elevated `#1A4333` / Inset `#0B2019`
- **Text**: Antique Ivory `#F2EFE6`, Muted Sage `#B9C7BD`, Tertiary `#7D9688`
- **Accent**: Burnished Brass `#C8A24A` (`#1B1405` ink)
- **Borders**: Muted Verdigris `#2F5546`, Subtle `#214236`, Highlight Brass `#C8A24A`
- **Wallet Menu**: `--menu-bg #143528` · `--menu-fg #F2EFE6` · `--menu-muted #E9E3D2` · `--menu-border #6B8F7C` · `--menu-hover-bg #1F4A38` · `--menu-danger #FFB4A8`
- **Typography**: Cormorant Garamond (gallery wall lot titles & plaque numbers), DM Sans (provenance narrative & curator notes), DM Mono (prices, salts, countdown timers, addresses).

## Signature Components

- **Framed Lot (`FramedLot.tsx`)**: 4:5 portrait frame with thin brass edge (`#C8A24A`), ivory mat inlay (`#F2EFE6`), and procedural SVG engraving canvas matching each lot's cryptographic ID and title.
- **Wall Label (`WallLabel.tsx`)**: Gallery title in Cormorant Garamond 28px, reserve and status in DM Mono 12px, catalog lot badge.
- **Gallery Wall (`GalleryWall.tsx`)**: Responsive hanging wall displaying Framed Lots with status filter chips (All, Commit Phase, Reveal Phase, Settled, Inscribed). Strictly 1 lot per row at 360px mobile.
- **Plaque Header (`PlaqueHeader.tsx`)**: Brushed metal brass plaque navigation header with network badge and connected wallet summary.
- **Limitation Block (`LimitationBlock.tsx`)**: Museum placard with heading `What a sealed bid can't do` and the 3 exact statements from spec §3.4.

## Contract Architecture (`contracts/src/Sealed.sol`)

- `create(string calldata title, uint128 reserve, uint64 commitSecs, uint64 revealSecs) external returns (uint256 id)`: Title ≤ 64 bytes, reserve > 0, commit 600..604,800s, reveal 600..259,200s. Emits `Created`.
- `commit(uint256 id, bytes32 commitment) external payable`: Requires `msg.value >= reserve`, `block.timestamp < commitEnd`, non-seller, uncommitted, non-zero commitment. Emits `Committed`.
- `reveal(uint256 id, uint128 amount, bytes32 salt) external`: Requires commit closed and reveal open (`block.timestamp in [commitEnd, revealEnd)`), matching commitment `commitmentFor(id, msg.sender, amount, salt)`, `amount <= deposit`. Tracks top and second bids with strict `>` earlier revealer tie-break. Emits `Revealed`.
- `settle(uint256 id) external`: Closes auction after reveal end (`block.timestamp >= revealEnd`). Computes second price $\max(\text{second}, \text{reserve})$. Credits seller with winning price if any. Emits `Settled`.
- `claim(uint256 id) external`: Can be called once auction is settled. Returns full deposit to revealed losers, `deposit - price` to winner, and 90% refund + 10% forfeit penalty to seller for unrevealed bids. Emits `Claimed`.
- `cancel(uint256 id) external`: Seller only, before first bid (`bidders == 0`). Emits `Cancelled`.
- `withdraw() external nonReentrant`: Pull payment withdrawal for pending till balances. Emits `Withdrawn`.
- Views: `phase(id)`, `auctionOf(id)`, `bidOf(id, bidder)`, `pending(account)`, `commitmentFor(id, bidder, amount, salt)`, `auctionCount()`.

## Verification & Testing

- **Foundry Contracts**: 27 unit & fuzz tests (`testFuzz_BalanceConservation` and `testFuzz_PriceNeverExceedsDeposit` on 256 runs) passing.
- **Foundry Invariant Suites**: 3 stateful invariant suites (`invariant_BalanceConservation`, `invariant_PriceNeverExceedsTop`, `invariant_PendingNeverExceedsBalance`) with 256 runs, 128,000 calls each with 0 reverts.
- **Mutation Testing**: 25/25 mutants killed (100.0% kill rate, documented in `contracts/DECISIONS.md`).
- **Vitest Unit & Integration**: 60 unit tests + 13 on-chain integration tests passing on port `8616`.
- **CDP Browser Walkthrough**: Automated Headless Chrome CDP walkthrough across 1280px Desktop and 360px Mobile verifying 0px overflow, wallet menu tokens, limitation copy, strictly 1 lot per row at 360px, 404 route, and 5 live on-chain transactions (Charlie reveals on Lot 2, Eve settles Lot 3, Bob claims on Lot 4, Dave withdraws till on /me, Alice inscribes new lot on /new) with **0 console errors**.

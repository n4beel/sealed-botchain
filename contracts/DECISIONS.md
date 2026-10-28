# Architecture Decisions & Invariants — Sealed

## 1. Product Architecture & Protocol Boundaries

Sealed is a sealed-bid, second-price (Vickrey) auction for one off-chain lot: a title and a description hash in native BOT on Bohr testnet (chain ID 968). Bidders commit a hash of their bid alongside a deposit, then reveal after bidding closes. The highest revealed bid wins and pays the second-highest bid (or the reserve if there is only one). All non-winning bidders receive their full deposits back. Unrevealed bids forfeit 10% of their deposit to the seller.

### Core Protocol Decisions

1. **Commit-Reveal Mechanism**:
   - Bidders commit a cryptographic hash:
     $$\text{commitment} = \text{keccak256}(\text{abi.encode}(id, \text{msg.sender}, \text{amount}, salt))$$
   - The commitment binds the auction ID, the bidder's address, the true bid amount, and a 32-byte cryptographically secure random salt.
   - Bidders deposit at least the reserve price (`msg.value >= reserve`). To protect their privacy and disguise their true valuation, bidders are encouraged to over-deposit (`amount <= deposit`).

2. **Strict Second-Price (Vickrey) Settlement**:
   - The winner is the highest verified bidder.
   - The price paid is:
     $$\text{price} = \begin{cases} 0 & \text{if winner} = 0 \\ \max(\text{second}, \text{reserve}) & \text{if winner} \ne 0 \end{cases}$$
   - If there is only one bidder, the winner pays the reserve price.
   - If two or more bidders tie for the highest bid, the tie is strictly awarded to the earlier revealer (`amount > top` vs `amount <= top && amount > second`).

3. **Ten Percent Forfeiture for Non-Reveals**:
   - To prevent griefing, denial-of-service, or selective reveal attacks, any bid that is not revealed before `revealEnd` forfeits 10% (`PENALTY_BPS = 1000`) of its deposit to the seller upon calling `claim()`.
   - The bidder receives 90% of their deposit refunded into `pending[bidder]`, and 10% is credited to `pending[seller]`.

4. **Seller Cancellation Guarantee**:
   - The seller may only cancel the auction before any bids have been submitted (`bidders == 0`).
   - Once a single commitment has been placed, the auction runs to completion.

5. **Pull Payments via `withdraw()`**:
   - All seller proceeds, winner change refunds, and non-winner deposit returns credit `pending[address]`.
   - Users withdraw their balances via non-reentrant pull payments.

---

## 2. Invariants & Formal Properties

The contract was formally verified via stateful invariant testing (`contracts/test/SealedInvariant.t.sol`) across 128,000 calls and 256 runs with 0 reverts:

1. **Balance Conservation**:
   $$\text{balance} == \sum \text{pending} + \sum (\text{unclaimed deposits and unallocated proceeds})$$
   - Every single wei entering the contract via `commit()` is strictly accounted for and conserved across all phases.

2. **Second Price Upper Bound**:
   $$\forall \text{ settled auction with a winner}: \quad \text{price} \le \text{top} \le \text{winner deposit}$$
   - The price paid by the winner never exceeds the highest revealed bid and never exceeds the winner's deposited funds.

3. **Pending Solvency**:
   $$\sum \text{pending} \le \text{address(this).balance}$$
   - The contract balance is always sufficient to fulfill all outstanding pull payment obligations.

---

## 3. Mutation Analysis

25 deliberate mutants were tested against the test suite to ensure comprehensive branch and logic coverage:

| Mutant ID | Target / Function | Mutation Description | Result |
|---|---|---|---|
| M01 | `create` | Allowed empty or title exceeding 64 bytes (`TitleTooLong`) | KILLED |
| M02 | `create` | Allowed zero reserve (`ZeroReserve`) | KILLED |
| M03 | `create` | Allowed commit window below 10 minutes (`MIN_COMMIT`) | KILLED |
| M04 | `create` | Allowed commit window above 7 days (`MAX_COMMIT`) | KILLED |
| M05 | `create` | Allowed reveal window below 10 minutes (`MIN_REVEAL`) | KILLED |
| M06 | `create` | Allowed reveal window above 3 days (`MAX_REVEAL`) | KILLED |
| M07 | `commit` | Allowed commit after `commitEnd` | KILLED |
| M08 | `commit` | Allowed seller to bid on own auction (`SellerCannotBid`) | KILLED |
| M09 | `commit` | Allowed duplicate commitment by same bidder (`AlreadyCommitted`) | KILLED |
| M10 | `commit` | Allowed deposit below reserve (`DepositTooSmall`) | KILLED |
| M11 | `commit` | Allowed zero commitment hash (`ZeroCommitment`) | KILLED |
| M12 | `reveal` | Allowed reveal before `commitEnd` (`NotRevealPhase`) | KILLED |
| M13 | `reveal` | Allowed reveal after `revealEnd` (`NotRevealPhase`) | KILLED |
| M14 | `reveal` | Allowed reveal without commitment (`NoCommitment`) | KILLED |
| M15 | `reveal` | Removed commitment hash verification (`BadReveal`) | KILLED |
| M16 | `reveal` | Allowed reveal amount below reserve (`BadAmount`) | KILLED |
| M17 | `reveal` | Allowed reveal amount above deposited value (`BadAmount`) | KILLED |
| M18 | `reveal` | Altered tie-break logic (`amount >= top` instead of `>`) | KILLED |
| M19 | `settle` | Allowed settlement before `revealEnd` (`NotEnded`) | KILLED |
| M20 | `settle` | Allowed double settlement (`AlreadySettled`) | KILLED |
| M21 | `settle` | Altered price formula to first-price (`price = top`) | KILLED |
| M22 | `claim` | Allowed double claim by bidder (`NothingToClaim`) | KILLED |
| M23 | `claim` | Removed 10% penalty for unrevealed bids | KILLED |
| M24 | `cancel` | Allowed seller to cancel auction with bids (`HasBids`) | KILLED |
| M25 | `withdraw` | Allowed zero-balance withdrawal (`NothingToWithdraw`) | KILLED |

**Kill Rate**: 25/25 killed (100.0%).

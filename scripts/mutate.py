import os
import subprocess
import sys

ORIGINAL_SOL = "contracts/src/Sealed.sol"
BACKUP_SOL = "contracts/src/Sealed.sol.orig"

mutants = [
    # M01: Allow empty or long title
    ("M01", "create", "if (bytes(title).length == 0 || bytes(title).length > MAX_TITLE) {", "if (false) {"),
    # M02: Remove ZeroReserve check
    ("M02", "create", "if (reserve == 0) {", "if (false) {"),
    # M03: Allow commitSecs < MIN_COMMIT
    ("M03", "create", "commitSecs < MIN_COMMIT ||", "false ||"),
    # M04: Allow commitSecs > MAX_COMMIT
    ("M04", "create", "commitSecs > MAX_COMMIT ||", "false ||"),
    # M05: Allow revealSecs < MIN_REVEAL
    ("M05", "create", "revealSecs < MIN_REVEAL ||", "false ||"),
    # M06: Allow revealSecs > MAX_REVEAL
    ("M06", "create", "revealSecs > MAX_REVEAL", "false"),
    # M07: Allow commit after commitEnd
    ("M07", "commit", "if (block.timestamp >= a.commitEnd || a.settled) revert CommitEnded();", "/* if (block.timestamp >= a.commitEnd || a.settled) revert CommitEnded(); */"),
    # M08: Allow seller to bid
    ("M08", "commit", "if (msg.sender == a.seller) revert SellerCannotBid();", "/* if (msg.sender == a.seller) revert SellerCannotBid(); */"),
    # M09: Allow already committed
    ("M09", "commit", "if (_bids[id][msg.sender].commitment != bytes32(0)) revert AlreadyCommitted();", "/* if (_bids[id][msg.sender].commitment != bytes32(0)) revert AlreadyCommitted(); */"),
    # M10: Allow deposit < reserve
    ("M10", "commit", "if (msg.value < a.reserve) revert DepositTooSmall(a.reserve);", "/* if (msg.value < a.reserve) revert DepositTooSmall(a.reserve); */"),
    # M11: Allow zero commitment
    ("M11", "commit", "if (commitment == bytes32(0)) revert ZeroCommitment();", "/* if (commitment == bytes32(0)) revert ZeroCommitment(); */"),
    # M12: Allow reveal before commitEnd
    ("M12", "reveal", "block.timestamp < a.commitEnd ||", "false ||"),
    # M13: Allow reveal after revealEnd
    ("M13", "reveal", "block.timestamp >= a.revealEnd ||", "false ||"),
    # M14: Allow reveal without commitment
    ("M14", "reveal", "if (b.commitment == bytes32(0) || b.revealed) revert NoCommitment();", "/* if (b.commitment == bytes32(0) || b.revealed) revert NoCommitment(); */"),
    # M15: Remove commitment hash verification
    ("M15", "reveal", "if (expected != b.commitment) revert BadReveal();", "/* if (expected != b.commitment) revert BadReveal(); */"),
    # M16: Allow amount < reserve
    ("M16", "reveal", "amount < a.reserve ||", "false ||"),
    # M17: Allow amount > deposit
    ("M17", "reveal", "amount > b.deposit", "false"),
    # M18: Break tie goes to earlier revealer (change > to >=)
    ("M18", "reveal", "if (amount > a.top) {", "if (amount >= a.top) {"),
    # M19: Allow settle before revealEnd
    ("M19", "settle", "if (block.timestamp < a.revealEnd) revert NotEnded();", "/* if (block.timestamp < a.revealEnd) revert NotEnded(); */"),
    # M20: Allow double settle
    ("M20", "settle", "if (a.settled) revert AlreadySettled();", "/* if (a.settled) revert AlreadySettled(); */"),
    # M21: Change second-price to first-price (price = a.top)
    ("M21", "settle", "price = a.second >= a.reserve ? a.second : a.reserve;", "price = a.top;"),
    # M22: Allow double claim
    ("M22", "claim", "if (b.commitment == bytes32(0) || b.claimed) revert NothingToClaim();", "if (b.commitment == bytes32(0)) revert NothingToClaim();"),
    # M23: Remove 10% penalty for unrevealed bids
    ("M23", "claim", "uint256 penalty = (uint256(b.deposit) * PENALTY_BPS) / 10000;", "uint256 penalty = 0;"),
    # M24: Allow cancel when bidders > 0
    ("M24", "cancel", "if (a.bidders > 0) revert HasBids();", "/* if (a.bidders > 0) revert HasBids(); */"),
    # M25: Allow zero withdrawal
    ("M25", "withdraw", "if (amount == 0) revert NothingToWithdraw();", "/* if (amount == 0) revert NothingToWithdraw(); */"),
]

with open(ORIGINAL_SOL, "r") as f:
    orig_code = f.read()

with open(BACKUP_SOL, "w") as f:
    f.write(orig_code)

killed = 0
results = []

try:
    for m_id, func, target, rep in mutants:
        if target not in orig_code:
            print(f"ERROR: Target '{target}' not found in source for {m_id}")
            results.append((m_id, func, "TARGET NOT FOUND", "ERROR"))
            continue
        mutated_code = orig_code.replace(target, rep, 1)
        with open(ORIGINAL_SOL, "w") as f:
            f.write(mutated_code)
        res = subprocess.run(
            ["forge", "test", "--match-contract", "SealedTest"],
            cwd="contracts",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        if res.returncode != 0:
            killed += 1
            print(f"[{m_id}] {func}: KILLED (tests failed as expected)")
            results.append((m_id, func, target, "KILLED"))
        else:
            print(f"[{m_id}] {func}: SURVIVED (mutant did not fail tests!)")
            results.append((m_id, func, target, "SURVIVED"))
finally:
    with open(BACKUP_SOL, "r") as f:
        restored = f.read()
    with open(ORIGINAL_SOL, "w") as f:
        f.write(restored)
    if os.path.exists(BACKUP_SOL):
        os.remove(BACKUP_SOL)
    # Rebuild clean
    subprocess.run(["forge", "build"], cwd="contracts")

print("\n--- SUMMARY ---")
print(f"Total Mutants: {len(mutants)}")
print(f"Killed: {killed}/{len(mutants)} ({killed/len(mutants)*100:.1f}%)")

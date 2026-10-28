// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Sealed.sol";

contract MaliciousReceiver {
    Sealed public target;

    constructor(Sealed _target) {
        target = _target;
    }

    receive() external payable {
        // Attempt reentrancy
        target.withdraw();
    }
}

contract SealedTest is Test {
    Sealed public sealedAuction;

    address public alice = address(0xAA11); // seller
    address public bob = address(0xBB22); // bidder 1
    address public charlie = address(0xCC33); // bidder 2
    address public dave = address(0xDD44); // bidder 3

    function setUp() public {
        sealedAuction = new Sealed();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(dave, 100 ether);
    }

    function test_SecondPriceWins() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Rare Artwork", 1 ether, 3600, 3600);

        bytes32 saltBob = bytes32(uint256(0xB0B));
        bytes32 saltCharlie = bytes32(uint256(0xCC));

        // Bob bids 5 ether (deposit 6 ether)
        bytes32 commitBob = sealedAuction.commitmentFor(id, bob, 5 ether, saltBob);
        vm.prank(bob);
        sealedAuction.commit{value: 6 ether}(id, commitBob);

        // Charlie bids 3 ether (deposit 4 ether)
        bytes32 commitCharlie = sealedAuction.commitmentFor(id, charlie, 3 ether, saltCharlie);
        vm.prank(charlie);
        sealedAuction.commit{value: 4 ether}(id, commitCharlie);

        // Warp to reveal phase
        vm.warp(block.timestamp + 3601);

        vm.prank(bob);
        sealedAuction.reveal(id, 5 ether, saltBob);

        vm.prank(charlie);
        sealedAuction.reveal(id, 3 ether, saltCharlie);

        // Warp past revealEnd
        vm.warp(block.timestamp + 3601);

        // Settle: price should be 3 ether, winner Bob
        sealedAuction.settle(id);
        assertEq(sealedAuction.pending(alice), 3 ether, "Seller should get 3 ether second price");

        // Claims
        vm.prank(bob);
        sealedAuction.claim(id);
        // Bob deposited 6 ether, paid 3 ether -> 3 ether refund
        assertEq(sealedAuction.pending(bob), 3 ether, "Bob should get 3 ether refund");

        vm.prank(charlie);
        sealedAuction.claim(id);
        // Charlie deposited 4 ether, lost -> 4 ether refund
        assertEq(sealedAuction.pending(charlie), 4 ether, "Charlie should get full 4 ether refund");

        // Withdrawals
        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        sealedAuction.withdraw();
        assertEq(bob.balance - bobBefore, 3 ether);

        uint256 charlieBefore = charlie.balance;
        vm.prank(charlie);
        sealedAuction.withdraw();
        assertEq(charlie.balance - charlieBefore, 4 ether);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        sealedAuction.withdraw();
        assertEq(alice.balance - aliceBefore, 3 ether);

        assertEq(address(sealedAuction).balance, 0, "Contract balance should be drained clean");
    }

    function test_SingleBidderPaysReserve() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Rare Manuscript", 2 ether, 3600, 3600);

        bytes32 saltBob = bytes32(uint256(0xB0B));
        bytes32 commitBob = sealedAuction.commitmentFor(id, bob, 5 ether, saltBob);

        vm.prank(bob);
        sealedAuction.commit{value: 5 ether}(id, commitBob);

        // Warp to reveal phase
        vm.warp(block.timestamp + 3601);
        vm.prank(bob);
        sealedAuction.reveal(id, 5 ether, saltBob);

        // Warp past revealEnd and settle
        vm.warp(block.timestamp + 3601);
        sealedAuction.settle(id);

        // Alice gets reserve (2 ether)
        assertEq(sealedAuction.pending(alice), 2 ether);

        // Bob claims refund (5 - 2 = 3 ether)
        vm.prank(bob);
        sealedAuction.claim(id);
        assertEq(sealedAuction.pending(bob), 3 ether);
    }

    function test_TieGoesToEarlierRevealer() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Antique Vase", 1 ether, 3600, 3600);

        bytes32 saltBob = bytes32(uint256(0x1));
        bytes32 saltCharlie = bytes32(uint256(0x2));

        bytes32 commitBob = sealedAuction.commitmentFor(id, bob, 4 ether, saltBob);
        bytes32 commitCharlie = sealedAuction.commitmentFor(id, charlie, 4 ether, saltCharlie);

        vm.prank(bob);
        sealedAuction.commit{value: 4 ether}(id, commitBob);

        vm.prank(charlie);
        sealedAuction.commit{value: 4 ether}(id, commitCharlie);

        // Warp to reveal phase
        vm.warp(block.timestamp + 3601);

        // Bob reveals first
        vm.prank(bob);
        sealedAuction.reveal(id, 4 ether, saltBob);

        // Charlie reveals second with identical amount
        vm.prank(charlie);
        sealedAuction.reveal(id, 4 ether, saltCharlie);

        // Warp past revealEnd and settle
        vm.warp(block.timestamp + 3601);
        sealedAuction.settle(id);

        Sealed.Auction memory a = sealedAuction.auctionOf(id);
        assertEq(a.winner, bob, "Earlier revealer should win tie");
        assertEq(a.top, 4 ether);
        assertEq(a.second, 4 ether);

        // Bob pays second price (4 ether) -> 0 refund
        vm.prank(bob);
        sealedAuction.claim(id);
        assertEq(sealedAuction.pending(bob), 0);

        // Charlie gets full refund (4 ether)
        vm.prank(charlie);
        sealedAuction.claim(id);
        assertEq(sealedAuction.pending(charlie), 4 ether);
    }

    function test_UnrevealedForfeitsTenPercentToSeller() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Unrevealed Lot", 1 ether, 3600, 3600);

        bytes32 saltBob = bytes32(uint256(0x123));
        bytes32 commitBob = sealedAuction.commitmentFor(id, bob, 8 ether, saltBob);

        vm.prank(bob);
        sealedAuction.commit{value: 10 ether}(id, commitBob);

        // Time expires past revealEnd without Bob revealing
        vm.warp(block.timestamp + 7202);

        sealedAuction.settle(id);

        // Bob claims
        vm.prank(bob);
        sealedAuction.claim(id);

        // 10% penalty = 1 ether to seller, 9 ether to Bob
        assertEq(sealedAuction.pending(alice), 1 ether, "Seller should get 10% penalty");
        assertEq(sealedAuction.pending(bob), 9 ether, "Bob should get 90% deposit back");
    }

    function test_RevealBeforeCommitEndReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 1", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x55));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        vm.prank(bob);
        vm.expectRevert(Sealed.NotRevealPhase.selector);
        sealedAuction.reveal(id, 2 ether, salt);
    }

    function test_CommitAfterEndReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 2", 1 ether, 3600, 3600);

        vm.warp(block.timestamp + 3601);

        bytes32 salt = bytes32(uint256(0x55));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, salt);

        vm.prank(bob);
        vm.expectRevert(Sealed.CommitEnded.selector);
        sealedAuction.commit{value: 2 ether}(id, commit);
    }

    function test_SellerCannotBid() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 3", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x55));
        bytes32 commit = sealedAuction.commitmentFor(id, alice, 2 ether, salt);

        vm.prank(alice);
        vm.expectRevert(Sealed.SellerCannotBid.selector);
        sealedAuction.commit{value: 2 ether}(id, commit);
    }

    function test_BadRevealReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 4", 1 ether, 3600, 3600);

        bytes32 correctSalt = bytes32(uint256(0x55));
        bytes32 wrongSalt = bytes32(uint256(0x99));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, correctSalt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        vm.warp(block.timestamp + 3601);

        // Wrong salt
        vm.prank(bob);
        vm.expectRevert(Sealed.BadReveal.selector);
        sealedAuction.reveal(id, 2 ether, wrongSalt);

        // Wrong amount
        vm.prank(bob);
        vm.expectRevert(Sealed.BadReveal.selector);
        sealedAuction.reveal(id, 1.5 ether, correctSalt);
    }

    function test_AmountAboveDepositReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 5", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x55));
        // Commit for 5 ether amount, but only deposit 2 ether
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 5 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        vm.warp(block.timestamp + 3601);

        vm.prank(bob);
        vm.expectRevert(Sealed.BadAmount.selector);
        sealedAuction.reveal(id, 5 ether, salt);
    }

    function test_AmountBelowReserveReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 6", 2 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x55));
        // Commit for 1 ether amount (below 2 ether reserve), deposit 2 ether
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 1 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        vm.warp(block.timestamp + 3601);

        vm.prank(bob);
        vm.expectRevert(Sealed.BadAmount.selector);
        sealedAuction.reveal(id, 1 ether, salt);
    }

    function test_CancelOnlyBeforeFirstBid() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 7", 1 ether, 3600, 3600);

        // Non-seller cannot cancel
        vm.prank(bob);
        vm.expectRevert(Sealed.NotSeller.selector);
        sealedAuction.cancel(id);

        // Bob commits a bid
        bytes32 salt = bytes32(uint256(0x55));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 1 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 1 ether}(id, commit);

        // Seller now cannot cancel
        vm.prank(alice);
        vm.expectRevert(Sealed.HasBids.selector);
        sealedAuction.cancel(id);

        // Another lot with 0 bids can be cancelled
        vm.prank(alice);
        uint256 id2 = sealedAuction.create("Lot 8", 1 ether, 3600, 3600);

        vm.prank(alice);
        sealedAuction.cancel(id2);
        assertEq(sealedAuction.phase(id2), 3, "Cancelled lot should be phase 3");
    }

    function test_SettleOnceOnly() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 9", 1 ether, 3600, 3600);

        vm.warp(block.timestamp + 7201);
        sealedAuction.settle(id);

        vm.expectRevert(Sealed.AlreadySettled.selector);
        sealedAuction.settle(id);
    }

    function test_ClaimOnce() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Lot 10", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x55));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        vm.warp(block.timestamp + 3601);
        vm.prank(bob);
        sealedAuction.reveal(id, 2 ether, salt);

        vm.warp(block.timestamp + 3601);
        sealedAuction.settle(id);

        vm.prank(bob);
        sealedAuction.claim(id);

        vm.prank(bob);
        vm.expectRevert(Sealed.NothingToClaim.selector);
        sealedAuction.claim(id);
    }

    function test_NoBidsSettlesWithNoWinner() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Empty Lot", 1 ether, 3600, 3600);

        vm.warp(block.timestamp + 7201);
        sealedAuction.settle(id);

        Sealed.Auction memory a = sealedAuction.auctionOf(id);
        assertEq(a.winner, address(0));
        assertEq(a.top, 0);
        assertEq(a.second, 0);
        assertEq(sealedAuction.pending(alice), 0);
    }

    function test_ReentrantWithdrawBlocked() public {
        MaliciousReceiver attacker = new MaliciousReceiver(sealedAuction);
        vm.deal(address(attacker), 10 ether);

        vm.prank(alice);
        uint256 id = sealedAuction.create("Attacker Target", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x999));
        bytes32 commit = sealedAuction.commitmentFor(id, address(attacker), 1 ether, salt);

        vm.prank(address(attacker));
        sealedAuction.commit{value: 5 ether}(id, commit);

        // Advance and settle without reveal -> attacker will forfeit 10% and claim 4.5 ether
        vm.warp(block.timestamp + 7201);
        sealedAuction.settle(id);

        vm.prank(address(attacker));
        sealedAuction.claim(id);

        assertEq(sealedAuction.pending(address(attacker)), 4.5 ether);

        // Reentrant withdraw should revert inside receive()
        vm.prank(address(attacker));
        vm.expectRevert(Sealed.TransferFailed.selector);
        sealedAuction.withdraw();
    }

    function test_CommitmentForMatchesOffChainVector() public view {
        uint256 id = 1;
        address bidder = 0x1111111111111111111111111111111111111111;
        uint128 amount = 1000000000000000000; // 1 ether
        bytes32 salt = 0x4444444444444444444444444444444444444444444444444444444444444444;

        bytes32 hash = sealedAuction.commitmentFor(id, bidder, amount, salt);
        assertEq(
            hash,
            0x52bd09a15238c8b9c30f35bd3fcae0a592f703140b05b3df23767b74f7e01fbb,
            "Must match off-chain vector hash exactly"
        );
    }

    function test_BoundaryValidation() public {
        // Title length boundary
        string memory title64 = "1234567890123456789012345678901234567890123456789012345678901234";
        string memory title65 = "12345678901234567890123456789012345678901234567890123456789012345";
        
        vm.prank(alice);
        vm.expectRevert(Sealed.TitleTooLong.selector);
        sealedAuction.create("", 1 ether, 3600, 3600);

        vm.prank(alice);
        vm.expectRevert(Sealed.TitleTooLong.selector);
        sealedAuction.create(title65, 1 ether, 3600, 3600);

        vm.prank(alice);
        uint256 idValid = sealedAuction.create(title64, 1 ether, 3600, 3600);
        assertEq(idValid, 1);

        // Reserve boundary
        vm.prank(alice);
        vm.expectRevert(Sealed.ZeroReserve.selector);
        sealedAuction.create("No Reserve", 0, 3600, 3600);

        // Window boundaries
        vm.prank(alice);
        vm.expectRevert(Sealed.BadWindow.selector);
        sealedAuction.create("Short Commit", 1 ether, 599, 3600);

        vm.prank(alice);
        vm.expectRevert(Sealed.BadWindow.selector);
        sealedAuction.create("Long Commit", 1 ether, 604801, 3600);

        vm.prank(alice);
        vm.expectRevert(Sealed.BadWindow.selector);
        sealedAuction.create("Short Reveal", 1 ether, 3600, 599);

        vm.prank(alice);
        vm.expectRevert(Sealed.BadWindow.selector);
        sealedAuction.create("Long Reveal", 1 ether, 3600, 259201);
    }

    function test_PaginationAndViews() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            sealedAuction.create("Lot item", 1 ether, 3600, 3600);
        }

        Sealed.Auction[] memory items = sealedAuction.latest(0, 10);
        assertEq(items.length, 5);
        assertEq(items[0].commitEnd > 0, true);
    }

    function testFuzz_PriceNeverExceedsDeposit(uint128 reserve, uint128 extraBob, uint128 extraCharlie) public {
        vm.assume(reserve >= 1000 && reserve <= 100 ether);
        vm.assume(extraBob <= 100 ether);
        vm.assume(extraCharlie <= 100 ether);

        uint128 bidBob = reserve + extraBob;
        uint128 bidCharlie = reserve + extraCharlie;
        uint128 depositBob = bidBob + 1 ether;
        uint128 depositCharlie = bidCharlie + 1 ether;

        vm.deal(bob, uint256(depositBob) + 1 ether);
        vm.deal(charlie, uint256(depositCharlie) + 1 ether);

        vm.prank(alice);
        uint256 id = sealedAuction.create("Fuzz Auction", reserve, 3600, 3600);

        bytes32 saltB = bytes32(uint256(0xB0B));
        bytes32 saltC = bytes32(uint256(0xC0C));
        bytes32 commitBob = sealedAuction.commitmentFor(id, bob, bidBob, saltB);
        bytes32 commitCharlie = sealedAuction.commitmentFor(id, charlie, bidCharlie, saltC);

        vm.prank(bob);
        sealedAuction.commit{value: depositBob}(id, commitBob);

        vm.prank(charlie);
        sealedAuction.commit{value: depositCharlie}(id, commitCharlie);

        vm.warp(block.timestamp + 3601);

        vm.prank(bob);
        sealedAuction.reveal(id, bidBob, saltB);

        vm.prank(charlie);
        sealedAuction.reveal(id, bidCharlie, saltC);

        vm.warp(block.timestamp + 3601);
        sealedAuction.settle(id);

        Sealed.Auction memory a = sealedAuction.auctionOf(id);
        uint128 price = a.second >= a.reserve ? a.second : a.reserve;

        assertLe(price, a.top, "Price must never exceed top bid");
        if (a.winner == bob) {
            assertLe(price, depositBob, "Price must never exceed winner deposit");
        } else {
            assertLe(price, depositCharlie, "Price must never exceed winner deposit");
        }
    }

    function testFuzz_BalanceConservation(
        uint128 deposit1,
        uint128 deposit2,
        bool reveal1,
        bool reveal2
    ) public {
        vm.assume(deposit1 >= 1 ether && deposit1 <= 50 ether);
        vm.assume(deposit2 >= 1 ether && deposit2 <= 50 ether);

        vm.deal(bob, deposit1);
        vm.deal(charlie, deposit2);

        vm.prank(alice);
        uint256 id = sealedAuction.create("Conservation Test", 1 ether, 3600, 3600);

        bytes32 salt1 = bytes32(uint256(0x111));
        bytes32 salt2 = bytes32(uint256(0x222));
        bytes32 commit1 = sealedAuction.commitmentFor(id, bob, deposit1, salt1);
        bytes32 commit2 = sealedAuction.commitmentFor(id, charlie, deposit2, salt2);

        vm.prank(bob);
        sealedAuction.commit{value: deposit1}(id, commit1);

        vm.prank(charlie);
        sealedAuction.commit{value: deposit2}(id, commit2);

        vm.warp(block.timestamp + 3601);

        if (reveal1) {
            vm.prank(bob);
            sealedAuction.reveal(id, deposit1, salt1);
        }

        if (reveal2) {
            vm.prank(charlie);
            sealedAuction.reveal(id, deposit2, salt2);
        }

        vm.warp(block.timestamp + 3601);
        sealedAuction.settle(id);

        vm.prank(bob);
        sealedAuction.claim(id);

        vm.prank(charlie);
        sealedAuction.claim(id);

        // Sum of all pending balances must equal contract balance
        uint256 totalPending = sealedAuction.pending(alice) + sealedAuction.pending(bob) + sealedAuction.pending(charlie);
        assertEq(address(sealedAuction).balance, totalPending, "Contract balance must equal sum of pending");
        assertEq(address(sealedAuction).balance, uint256(deposit1) + uint256(deposit2), "Total deposits must be conserved");

        // After all withdraw, balance is 0
        if (sealedAuction.pending(alice) > 0) {
            vm.prank(alice);
            sealedAuction.withdraw();
        }
        if (sealedAuction.pending(bob) > 0) {
            vm.prank(bob);
            sealedAuction.withdraw();
        }
        if (sealedAuction.pending(charlie) > 0) {
            vm.prank(charlie);
            sealedAuction.withdraw();
        }

        assertEq(address(sealedAuction).balance, 0, "All funds successfully withdrawn");
    }

    function test_DoubleCommitReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Double Commit Lot", 1 ether, 3600, 3600);

        bytes32 salt1 = bytes32(uint256(0x111));
        bytes32 salt2 = bytes32(uint256(0x222));
        bytes32 commit1 = sealedAuction.commitmentFor(id, bob, 2 ether, salt1);
        bytes32 commit2 = sealedAuction.commitmentFor(id, bob, 3 ether, salt2);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit1);

        vm.prank(bob);
        vm.expectRevert(Sealed.AlreadyCommitted.selector);
        sealedAuction.commit{value: 3 ether}(id, commit2);
    }

    function test_DepositTooSmallReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Deposit Check Lot", 2 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x111));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, salt);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Sealed.DepositTooSmall.selector, 2 ether));
        sealedAuction.commit{value: 1 ether}(id, commit);
    }

    function test_ZeroCommitmentReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Zero Commit Lot", 1 ether, 3600, 3600);

        vm.prank(bob);
        vm.expectRevert(Sealed.ZeroCommitment.selector);
        sealedAuction.commit{value: 1 ether}(id, bytes32(0));
    }

    function test_RevealAfterRevealEndReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Late Reveal Lot", 1 ether, 3600, 3600);

        bytes32 salt = bytes32(uint256(0x111));
        bytes32 commit = sealedAuction.commitmentFor(id, bob, 2 ether, salt);

        vm.prank(bob);
        sealedAuction.commit{value: 2 ether}(id, commit);

        // Warp past revealEnd (3600 + 3600 = 7200)
        vm.warp(block.timestamp + 7201);

        vm.prank(bob);
        vm.expectRevert(Sealed.NotRevealPhase.selector);
        sealedAuction.reveal(id, 2 ether, salt);
    }

    function test_RevealWithoutCommitmentReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("No Commit Lot", 1 ether, 3600, 3600);

        vm.warp(block.timestamp + 3601);

        bytes32 salt = bytes32(uint256(0x111));
        vm.prank(bob);
        vm.expectRevert(Sealed.NoCommitment.selector);
        sealedAuction.reveal(id, 2 ether, salt);
    }

    function test_SettleBeforeRevealEndReverts() public {
        vm.prank(alice);
        uint256 id = sealedAuction.create("Early Settle Lot", 1 ether, 3600, 3600);

        vm.expectRevert(Sealed.NotEnded.selector);
        sealedAuction.settle(id);

        vm.warp(block.timestamp + 3601); // during reveal phase
        vm.expectRevert(Sealed.NotEnded.selector);
        sealedAuction.settle(id);
    }

    function test_WithdrawEmptyReverts() public {
        vm.prank(bob);
        vm.expectRevert(Sealed.NothingToWithdraw.selector);
        sealedAuction.withdraw();
    }
}


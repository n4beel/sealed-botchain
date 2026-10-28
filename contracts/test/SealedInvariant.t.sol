// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/Sealed.sol";

contract SealedHandler is Test {
    Sealed public target;

    address[] public actors;
    address public currentActor;

    uint256 public auctionId;
    uint128 public reserve = 1 ether;
    uint64 public commitSecs = 3600;
    uint64 public revealSecs = 3600;

    mapping(address => bytes32) public salts;
    mapping(address => uint128) public bidAmounts;
    mapping(address => uint128) public deposits;
    mapping(address => bool) public committed;
    mapping(address => bool) public revealed;
    mapping(address => bool) public claimed;

    uint256 public ghost_totalDeposited;
    uint256 public ghost_totalWithdrawn;

    constructor(Sealed _target) {
        target = _target;

        actors.push(address(0x1001));
        actors.push(address(0x1002));
        actors.push(address(0x1003));
        actors.push(address(0x1004));

        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1000 ether);
        }

        // Creator is actor 0
        vm.prank(actors[0]);
        auctionId = target.create("Invariant Lot", reserve, commitSecs, revealSecs);
    }

    modifier useActor(uint256 actorIndex) {
        currentActor = actors[actorIndex % actors.length];
        _;
    }

    function commitBid(uint256 actorIndex, uint128 rawAmount, uint128 extraDeposit) public useActor(actorIndex) {
        // Seller (actor 0) cannot bid
        if (currentActor == actors[0]) return;
        if (committed[currentActor]) return;

        uint8 phase = target.phase(auctionId);
        if (phase != 0) return;

        uint128 amount = uint128(bound(rawAmount, reserve, 50 ether));
        uint128 extra = uint128(bound(extraDeposit, 0, 10 ether));
        uint128 deposit = amount + extra;

        bytes32 salt = keccak256(abi.encode(currentActor, block.timestamp));
        salts[currentActor] = salt;
        bidAmounts[currentActor] = amount;
        deposits[currentActor] = deposit;
        committed[currentActor] = true;

        bytes32 commitHash = target.commitmentFor(auctionId, currentActor, amount, salt);

        vm.prank(currentActor);
        target.commit{value: deposit}(auctionId, commitHash);

        ghost_totalDeposited += deposit;
    }

    function warpToReveal() public {
        uint8 currentPhase = target.phase(auctionId);
        if (currentPhase == 0) {
            Sealed.Auction memory a = target.auctionOf(auctionId);
            vm.warp(a.commitEnd + 1);
        }
    }

    function revealBid(uint256 actorIndex) public useActor(actorIndex) {
        if (!committed[currentActor] || revealed[currentActor]) return;

        uint8 p = target.phase(auctionId);
        if (p != 1) return;

        bytes32 salt = salts[currentActor];
        uint128 amount = bidAmounts[currentActor];

        revealed[currentActor] = true;

        vm.prank(currentActor);
        target.reveal(auctionId, amount, salt);
    }

    function warpToEnd() public {
        uint8 currentPhase = target.phase(auctionId);
        if (currentPhase == 0 || currentPhase == 1) {
            Sealed.Auction memory a = target.auctionOf(auctionId);
            vm.warp(a.revealEnd + 1);
        }
    }

    function settleAuction() public {
        uint8 p = target.phase(auctionId);
        if (p != 2) return;

        target.settle(auctionId);
    }

    function claimRefund(uint256 actorIndex) public useActor(actorIndex) {
        if (!committed[currentActor] || claimed[currentActor]) return;

        Sealed.Auction memory a = target.auctionOf(auctionId);
        if (!a.settled) return;

        claimed[currentActor] = true;

        vm.prank(currentActor);
        target.claim(auctionId);
    }

    function withdrawPending(uint256 actorIndex) public useActor(actorIndex) {
        uint256 pendingAmt = target.pending(currentActor);
        if (pendingAmt == 0) return;

        vm.prank(currentActor);
        target.withdraw();

        ghost_totalWithdrawn += pendingAmt;
    }

    function withdrawSeller() public {
        address seller = actors[0];
        uint256 pendingAmt = target.pending(seller);
        if (pendingAmt == 0) return;

        vm.prank(seller);
        target.withdraw();

        ghost_totalWithdrawn += pendingAmt;
    }
}

contract SealedInvariantTest is Test {
    Sealed public target;
    SealedHandler public handler;

    function setUp() public {
        target = new Sealed();
        handler = new SealedHandler(target);

        targetContract(address(handler));
    }

    function invariant_BalanceConservation() public view {
        uint256 expectedBalance = handler.ghost_totalDeposited() - handler.ghost_totalWithdrawn();
        assertEq(address(target).balance, expectedBalance, "Target contract balance must strictly match net deposits");
    }

    function invariant_PriceNeverExceedsTop() public view {
        uint256 id = handler.auctionId();
        Sealed.Auction memory a = target.auctionOf(id);

        if (a.settled && a.winner != address(0)) {
            uint128 price = a.second >= a.reserve ? a.second : a.reserve;
            assertLe(price, a.top, "Price must never exceed top bid");
        }
    }

    function invariant_PendingNeverExceedsBalance() public view {
        uint256 totalPending = 0;
        for (uint256 i = 0; i < 4; i++) {
            totalPending += target.pending(handler.actors(i));
        }
        assertLe(totalPending, address(target).balance, "Sum of pending must not exceed contract balance");
    }
}

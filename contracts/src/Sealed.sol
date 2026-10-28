// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Sealed
 * @notice A sealed-bid, second-price (Vickrey) auction for one off-chain lot.
 * Bidders commit a hash of their bid with a deposit, then reveal after bidding closes.
 * The highest revealed bid wins and pays the second-highest bid (or the reserve).
 * Everyone else takes their deposit back. Unrevealed bids forfeit 10% to the seller.
 */
contract Sealed {
    struct Auction {
        address seller;
        uint64 commitEnd; // bids accepted until this time
        uint64 revealEnd; // reveals accepted until this time
        uint128 reserve; // wei; also the minimum deposit and minimum bid
        uint128 top; // highest revealed bid
        uint128 second; // second-highest revealed bid (0 if none)
        address winner; // 0 until a reveal beats the reserve
        uint32 bidders; // commitments made
        uint32 revealed; // valid reveals
        bool settled;
        string title; // <= 64 bytes
    }

    struct Bid {
        bytes32 commitment;
        uint128 deposit;
        uint128 amount;
        bool revealed;
        bool claimed;
    }

    uint256 public constant MAX_TITLE = 64;
    uint256 public constant MIN_COMMIT = 600; // 10 minutes
    uint256 public constant MAX_COMMIT = 604800; // 7 days
    uint256 public constant MIN_REVEAL = 600; // 10 minutes
    uint256 public constant MAX_REVEAL = 259200; // 3 days
    uint256 public constant PENALTY_BPS = 1000; // 10%

    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => mapping(address => Bid)) private _bids;
    mapping(address => uint256) public pending;
    uint256 public auctionCount; // ids start at 1

    uint256 private _reentrancyStatus;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    event Created(
        uint256 indexed id,
        address indexed seller,
        uint128 reserve,
        uint64 commitEnd,
        uint64 revealEnd,
        string title
    );
    event Committed(uint256 indexed id, address indexed bidder, uint128 deposit);
    event Revealed(uint256 indexed id, address indexed bidder, uint128 amount);
    event Settled(uint256 indexed id, address indexed winner, uint128 price);
    event Claimed(uint256 indexed id, address indexed bidder, uint256 amount);
    event Cancelled(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);

    error TitleTooLong();
    error ZeroReserve();
    error BadWindow();
    error SellerCannotBid();
    error AlreadyCommitted();
    error DepositTooSmall(uint128 minDeposit);
    error CommitEnded();
    error ZeroCommitment();
    error NotRevealPhase();
    error NoCommitment();
    error BadReveal();
    error BadAmount();
    error NotEnded();
    error AlreadySettled();
    error NothingToClaim();
    error NotSeller();
    error HasBids();
    error NothingToWithdraw();
    error TransferFailed();
    error NotFound();

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "ReentrancyGuard: reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    constructor() {
        _reentrancyStatus = _NOT_ENTERED;
    }

    /**
     * @notice Inscribes a new auction lot.
     */
    function create(
        string calldata title,
        uint128 reserve,
        uint64 commitSecs,
        uint64 revealSecs
    ) external returns (uint256 id) {
        if (bytes(title).length == 0 || bytes(title).length > MAX_TITLE) {
            revert TitleTooLong();
        }
        if (reserve == 0) {
            revert ZeroReserve();
        }
        if (
            commitSecs < MIN_COMMIT ||
            commitSecs > MAX_COMMIT ||
            revealSecs < MIN_REVEAL ||
            revealSecs > MAX_REVEAL
        ) {
            revert BadWindow();
        }

        uint64 commitEnd = uint64(block.timestamp) + commitSecs;
        uint64 revealEnd = commitEnd + revealSecs;

        id = ++auctionCount;
        _auctions[id] = Auction({
            seller: msg.sender,
            commitEnd: commitEnd,
            revealEnd: revealEnd,
            reserve: reserve,
            top: 0,
            second: 0,
            winner: address(0),
            bidders: 0,
            revealed: 0,
            settled: false,
            title: title
        });

        emit Created(id, msg.sender, reserve, commitEnd, revealEnd, title);
    }

    /**
     * @notice Submit a sealed bid commitment with deposit.
     */
    function commit(uint256 id, bytes32 commitment) external payable {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        if (block.timestamp >= a.commitEnd || a.settled) revert CommitEnded();
        if (msg.sender == a.seller) revert SellerCannotBid();
        if (_bids[id][msg.sender].commitment != bytes32(0)) revert AlreadyCommitted();
        if (msg.value < a.reserve) revert DepositTooSmall(a.reserve);
        if (commitment == bytes32(0)) revert ZeroCommitment();

        _bids[id][msg.sender] = Bid({
            commitment: commitment,
            deposit: uint128(msg.value),
            amount: 0,
            revealed: false,
            claimed: false
        });
        a.bidders++;

        emit Committed(id, msg.sender, uint128(msg.value));
    }

    /**
     * @notice Reveal a previously committed sealed bid.
     */
    function reveal(uint256 id, uint128 amount, bytes32 salt) external {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        if (block.timestamp < a.commitEnd || block.timestamp >= a.revealEnd || a.settled) {
            revert NotRevealPhase();
        }

        Bid storage b = _bids[id][msg.sender];
        if (b.commitment == bytes32(0) || b.revealed) revert NoCommitment();

        bytes32 expected = commitmentFor(id, msg.sender, amount, salt);
        if (expected != b.commitment) revert BadReveal();

        if (amount < a.reserve || amount > b.deposit) revert BadAmount();

        b.revealed = true;
        b.amount = amount;
        a.revealed++;

        if (amount > a.top) {
            a.second = a.top;
            a.top = amount;
            a.winner = msg.sender;
        } else if (amount > a.second) {
            a.second = amount;
        }

        emit Revealed(id, msg.sender, amount);
    }

    /**
     * @notice Settle the auction after reveal phase closes.
     */
    function settle(uint256 id) external {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        if (block.timestamp < a.revealEnd) revert NotEnded();
        if (a.settled) revert AlreadySettled();

        a.settled = true;

        uint128 price = 0;
        if (a.winner != address(0)) {
            price = a.second >= a.reserve ? a.second : a.reserve;
            pending[a.seller] += price;
        }

        emit Settled(id, a.winner, price);
    }

    /**
     * @notice Claim refunds/deposits after auction settlement.
     */
    function claim(uint256 id) external {
        Auction storage a = _auctions[id];
        if (!a.settled) revert NothingToClaim();

        Bid storage b = _bids[id][msg.sender];
        if (b.commitment == bytes32(0) || b.claimed) revert NothingToClaim();

        b.claimed = true;

        if (b.revealed) {
            if (msg.sender == a.winner) {
                uint128 price = a.second >= a.reserve ? a.second : a.reserve;
                uint256 refund = uint256(b.deposit) - uint256(price);
                pending[msg.sender] += refund;
                emit Claimed(id, msg.sender, refund);
            } else {
                pending[msg.sender] += b.deposit;
                emit Claimed(id, msg.sender, b.deposit);
            }
        } else {
            uint256 penalty = (uint256(b.deposit) * PENALTY_BPS) / 10000;
            uint256 refund = uint256(b.deposit) - penalty;
            pending[msg.sender] += refund;
            pending[a.seller] += penalty;
            emit Claimed(id, msg.sender, refund);
        }
    }

    /**
     * @notice Cancel an auction with no bids.
     */
    function cancel(uint256 id) external {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        if (msg.sender != a.seller) revert NotSeller();
        if (a.bidders > 0) revert HasBids();
        if (a.settled) revert AlreadySettled();

        a.settled = true;
        emit Cancelled(id);
    }

    /**
     * @notice Pull payment withdrawal for seller proceeds and bidder refunds.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pending[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pending[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @notice Computes a bid commitment hash.
     */
    function commitmentFor(
        uint256 id,
        address bidder,
        uint128 amount,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(id, bidder, amount, salt));
    }

    /**
     * @notice Get current auction phase: 0 commit, 1 reveal, 2 ended, 3 settled/cancelled.
     */
    function phase(uint256 id) public view returns (uint8) {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        if (a.settled) return 3;
        if (block.timestamp < a.commitEnd) return 0;
        if (block.timestamp < a.revealEnd) return 1;
        return 2;
    }

    /**
     * @notice Get auction details.
     */
    function auctionOf(uint256 id) external view returns (Auction memory) {
        Auction storage a = _auctions[id];
        if (a.seller == address(0)) revert NotFound();
        return a;
    }

    /**
     * @notice Get bid details for an address on an auction.
     */
    function bidOf(uint256 id, address bidder) external view returns (Bid memory) {
        return _bids[id][bidder];
    }

    /**
     * @notice Fetch latest auctions newest first.
     */
    function latest(uint256 offset, uint256 count) external view returns (Auction[] memory items) {
        if (count > 50) count = 50;
        if (auctionCount == 0 || offset >= auctionCount) {
            return new Auction[](0);
        }
        uint256 available = auctionCount - offset;
        if (count > available) {
            count = available;
        }
        items = new Auction[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = auctionCount - offset - i;
            items[i] = _auctions[id];
        }
    }
}

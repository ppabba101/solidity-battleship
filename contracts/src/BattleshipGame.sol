// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

interface IZKVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title BattleshipGame
/// @notice Two-player battleship with zk-proven board legality, shot
///         responses, on-chain escrow, and a per-game wall-clock plus
///         block-number timeout. Each player commits a Poseidon hash of
///         their board; a Noir-generated Solidity verifier asserts the
///         board has a legal fleet before play begins, so the old
///         "commit empty board and never get hit" cheat is impossible.
///         Per-shot responses are also proven against the committed board.
contract BattleshipGame is ReentrancyGuard {
    enum GameState {
        Created,
        Committed,
        Playing,
        Finished
    }

    uint8 public constant BOARD_SIZE = 10;
    uint8 public constant WIN_HITS = 17;
    uint256 public constant MIN_BLOCKS_FOR_TIMEOUT = 5;
    uint256 public constant GRACE = 10; // seconds added on top of clockSeconds
    uint256 public constant ABORT_TIMEOUT = 1 hours;

    struct Game {
        address[2] players;
        bytes32[2] commitments;
        uint8[2] hitsScored; // hits that player[i] has landed on opponent
        bool[2] committed;
        bool[2] drawProposed;
        GameState state;
        uint8 turn; // 0 or 1, index of player whose action is expected
        bool shotPending; // true if a shot has been fired and awaits response
        uint8 pendingX;
        uint8 pendingY;
        uint256 lastActionBlock;
        uint64 lastActionAt; // block.timestamp at last state-changing action
        uint64 createdAt; // block.timestamp at game creation
        uint32 clockSeconds; // per-move clock
        uint256 stakeWei; // per-player stake locked at create/join
        uint256 pot; // total ETH escrowed (0, stakeWei, or 2*stakeWei)
        bool paidOut; // true once pot has been paid/refunded
        address winner;
    }

    IZKVerifier public immutable boardVerifier;
    IZKVerifier public immutable shotVerifier;
    uint256 public immutable minStake;

    uint256 public nextGameId;
    mapping(uint256 => Game) private games;
    // hitBitmap[gameId][playerIdx] is the canonical 100-bit cumulative hit
    // bitmap of confirmed hits on player[playerIdx]'s board. Bit (y*10+x) is
    // set when the contract has verified a HIT response at (x,y).
    mapping(uint256 => uint256[2]) private hitBitmap;
    // firedBitmap[gameId][playerIdx] tracks every cell that has ever been
    // fired at on player[playerIdx]'s board (hit or miss). Used to reject
    // duplicate fireShots which would otherwise trip the circuit's
    // "no double-fire" assertion and hang the frontend.
    mapping(uint256 => uint256[2]) private firedBitmap;

    event GameCreated(
        uint256 indexed gameId,
        address indexed creator,
        address indexed opponent,
        uint32 clockSeconds,
        uint256 stakeWei
    );
    event GameJoined(uint256 indexed gameId, address indexed player);
    event BoardCommitted(uint256 indexed gameId, address indexed player, bytes32 commitment);
    event ShotFired(uint256 indexed gameId, address indexed shooter, uint8 x, uint8 y);
    event ShotResponded(uint256 indexed gameId, address indexed responder, uint8 x, uint8 y, bool hit);
    event ShipSunk(uint256 indexed gameId, address indexed responder, uint8 shipId);
    event GameWon(uint256 indexed gameId, address indexed winner);
    event PotPaid(uint256 indexed gameId, address indexed to, uint256 amount);
    event StakeRefunded(uint256 indexed gameId, address indexed to, uint256 amount);
    event DrawProposed(uint256 indexed gameId, address indexed by);
    event DrawWithdrawn(uint256 indexed gameId, address indexed by);
    event GameCanceled(uint256 indexed gameId);

    constructor(address _boardVerifier, address _shotVerifier, uint256 _minStake) {
        require(_boardVerifier != address(0) && _shotVerifier != address(0), "zero verifier");
        boardVerifier = IZKVerifier(_boardVerifier);
        shotVerifier = IZKVerifier(_shotVerifier);
        minStake = _minStake;
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    function createGame(address opponent, uint32 clockSeconds, uint256 stakeWei)
        external
        payable
        returns (uint256 gameId)
    {
        require(opponent != msg.sender, "bad opponent");
        require(stakeWei >= minStake, "stake below min");
        require(msg.value == stakeWei, "value mismatch");
        require(clockSeconds > 0, "clock zero");

        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.players[0] = msg.sender;
        g.players[1] = opponent; // address(0) means open game
        g.state = GameState.Created;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
        g.createdAt = uint64(block.timestamp);
        g.clockSeconds = clockSeconds;
        g.stakeWei = stakeWei;
        g.pot = stakeWei;
        emit GameCreated(gameId, msg.sender, opponent, clockSeconds, stakeWei);
    }

    function joinGame(uint256 gameId) external payable {
        Game storage g = games[gameId];
        require(g.state == GameState.Created, "bad state");
        require(g.players[0] != msg.sender, "creator cannot join");
        require(g.players[1] == address(0) || g.players[1] == msg.sender, "not invited");
        require(msg.value == g.stakeWei, "value mismatch");

        g.players[1] = msg.sender;
        g.pot = g.stakeWei * 2;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
        emit GameJoined(gameId, msg.sender);
    }

    function commitBoard(
        uint256 gameId,
        bytes32 commitment,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Created || g.state == GameState.Committed, "bad state");
        require(g.players[1] != address(0), "no opponent");
        uint8 idx = _playerIndex(g, msg.sender);
        require(!g.committed[idx], "already committed");

        // publicInputs[0] is the circuit's declared `commitment` field; the
        // remaining 8 are UltraHonk's pairing-point accumulator appended by the
        // prover. We bind the first slot to the caller's `commitment` argument
        // and pass the whole array through to the verifier unchanged.
        require(publicInputs.length >= 1 && publicInputs[0] == commitment, "commitment mismatch");
        require(boardVerifier.verify(proof, publicInputs), "invalid board proof");

        g.commitments[idx] = commitment;
        g.committed[idx] = true;
        emit BoardCommitted(gameId, msg.sender, commitment);

        if (g.committed[0] && g.committed[1]) {
            g.state = GameState.Playing;
            g.turn = 0;
        } else {
            g.state = GameState.Committed;
        }
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Gameplay
    // ---------------------------------------------------------------------

    function fireShot(uint256 gameId, uint8 x, uint8 y) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Playing, "not playing");
        require(!g.shotPending, "shot pending");
        require(x < BOARD_SIZE && y < BOARD_SIZE, "out of range");
        uint8 idx = _playerIndex(g, msg.sender);
        require(idx == g.turn, "not your turn");

        uint8 responder = 1 - g.turn;
        uint256 cellBit = uint256(1) << (uint256(y) * 10 + uint256(x));
        require((firedBitmap[gameId][responder] & cellBit) == 0, "already fired");
        firedBitmap[gameId][responder] |= cellBit;

        g.shotPending = true;
        g.pendingX = x;
        g.pendingY = y;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
        emit ShotFired(gameId, msg.sender, x, y);
    }

    // publicInputs layout (all bytes32):
    //   [0]        commitment
    //   [1]        x
    //   [2]        y
    //   [3]        hit
    //   [4..103]   hit_bitmap_before (100 fields, each 0 or 1)
    //   [104]      sunk_ship_id (0 or 1..=5)
    //   [105..112] UltraHonk pairing accumulator (8 fields)
    function _validateShotInputs(
        uint256 gameId,
        uint8 responder,
        bool hit,
        bytes32[] calldata publicInputs
    ) internal view returns (uint256 sunkShipId) {
        Game storage g = games[gameId];
        require(publicInputs.length >= 105, "bad public inputs");
        require(publicInputs[0] == g.commitments[responder], "commitment mismatch");
        require(uint256(publicInputs[1]) == g.pendingX, "x mismatch");
        require(uint256(publicInputs[2]) == g.pendingY, "y mismatch");
        require(uint256(publicInputs[3]) == (hit ? 1 : 0), "hit mismatch");

        uint256 expectedBitmap = hitBitmap[gameId][responder];
        uint256 declaredBitmap = 0;
        for (uint256 i = 0; i < 100; i++) {
            uint256 bit = uint256(publicInputs[4 + i]);
            require(bit <= 1, "bitmap bit not boolean");
            declaredBitmap |= (bit << i);
        }
        require(declaredBitmap == expectedBitmap, "bitmap mismatch");

        sunkShipId = uint256(publicInputs[104]);
        require(sunkShipId <= 5, "bad sunk id");
    }

    function respondShot(
        uint256 gameId,
        bool hit,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        Game storage g = games[gameId];
        require(g.state == GameState.Playing, "not playing");
        require(g.shotPending, "no pending shot");
        uint8 responder = 1 - g.turn; // opponent of the shooter responds
        require(g.players[responder] == msg.sender, "not responder");

        uint256 sunkShipId = _validateShotInputs(gameId, responder, hit, publicInputs);
        require(shotVerifier.verify(proof, publicInputs), "invalid shot proof");

        emit ShotResponded(gameId, msg.sender, g.pendingX, g.pendingY, hit);

        if (hit) {
            uint256 bit = uint256(1) << (uint256(g.pendingY) * 10 + uint256(g.pendingX));
            hitBitmap[gameId][responder] |= bit;
            if (sunkShipId > 0) {
                emit ShipSunk(gameId, msg.sender, uint8(sunkShipId));
            }
            uint8 shooter = g.turn;
            g.hitsScored[shooter] += 1;
            if (g.hitsScored[shooter] >= WIN_HITS) {
                g.state = GameState.Finished;
                g.winner = g.players[shooter];
                g.shotPending = false;
                g.lastActionBlock = block.number;
                g.lastActionAt = uint64(block.timestamp);
                emit GameWon(gameId, g.winner);
                return;
            }
            // On a hit the shooter keeps the turn (classic battleship rule).
        } else {
            g.turn = 1 - g.turn;
        }

        g.shotPending = false;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Escrow / lifecycle exits
    // ---------------------------------------------------------------------

    /// @notice Creator can cancel an unjoined game. Anyone can sweep an
    ///         abandoned unjoined game after `ABORT_TIMEOUT` seconds.
    function cancelGame(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.state == GameState.Created, "bad state");
        // "joined" = pot has both stakes locked. Until joinGame runs the
        // pot equals the creator's single stake (which may be 0).
        require(g.pot <= g.stakeWei, "already joined");
        bool isCreator = msg.sender == g.players[0];
        bool stale = block.timestamp >= uint256(g.createdAt) + ABORT_TIMEOUT;
        require(isCreator || stale, "not creator or not stale");

        uint256 refund = g.pot;
        address creator = g.players[0];
        g.state = GameState.Finished;
        g.pot = 0;
        g.paidOut = true;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
        emit GameCanceled(gameId);

        if (refund > 0) {
            (bool ok,) = creator.call{value: refund}("");
            require(ok, "refund failed");
            emit StakeRefunded(gameId, creator, refund);
        }
    }

    /// @notice Winner of a normally-finished game collects the pot.
    function claimPot(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.state == GameState.Finished, "not finished");
        require(!g.paidOut, "already paid");
        require(msg.sender == g.winner, "not winner");

        uint256 amount = g.pot;
        address to = g.winner;
        g.pot = 0;
        g.paidOut = true;
        emit PotPaid(gameId, to, amount);

        if (amount > 0) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "payout failed");
        }
    }

    /// @notice If the player whose action is currently expected has missed
    ///         the timeout window, the other player wins by default and
    ///         atomically receives the pot. Requires both a wall-clock
    ///         witness and a minimum block-number gap to defend against
    ///         single-source skew.
    function claimTimeoutWin(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.state == GameState.Playing || g.state == GameState.Committed, "bad state");
        require(
            block.timestamp >= uint256(g.lastActionAt) + uint256(g.clockSeconds) + GRACE,
            "too early"
        );
        require(block.number >= g.lastActionBlock + MIN_BLOCKS_FOR_TIMEOUT, "too few blocks");

        address laggard;
        if (g.state == GameState.Playing) {
            if (g.shotPending) {
                laggard = g.players[1 - g.turn];
            } else {
                laggard = g.players[g.turn];
            }
        } else {
            laggard = g.committed[0] ? g.players[1] : g.players[0];
        }
        require(msg.sender != laggard, "claimant is laggard");
        require(msg.sender == g.players[0] || msg.sender == g.players[1], "not player");

        g.state = GameState.Finished;
        g.winner = msg.sender;
        g.lastActionBlock = block.number;
        g.lastActionAt = uint64(block.timestamp);
        emit GameWon(gameId, msg.sender);

        uint256 amount = g.pot;
        if (amount > 0 && !g.paidOut) {
            g.pot = 0;
            g.paidOut = true;
            emit PotPaid(gameId, msg.sender, amount);
            (bool ok,) = msg.sender.call{value: amount}("");
            require(ok, "payout failed");
        }
    }

    /// @notice Either player may propose a draw during Committed or Playing.
    ///         When both have proposed, the pot is refunded 50/50 atomically.
    function proposeDraw(uint256 gameId) external nonReentrant {
        Game storage g = games[gameId];
        require(g.state == GameState.Committed || g.state == GameState.Playing, "bad state");
        uint8 idx = _playerIndex(g, msg.sender);
        require(!g.drawProposed[idx], "already proposed");
        g.drawProposed[idx] = true;
        emit DrawProposed(gameId, msg.sender);

        if (g.drawProposed[0] && g.drawProposed[1]) {
            uint256 stake = g.stakeWei;
            address p0 = g.players[0];
            address p1 = g.players[1];
            g.state = GameState.Finished;
            g.winner = address(0);
            g.pot = 0;
            g.paidOut = true;
            g.lastActionBlock = block.number;
            g.lastActionAt = uint64(block.timestamp);

            if (stake > 0) {
                (bool ok0,) = p0.call{value: stake}("");
                require(ok0, "refund0 failed");
                emit StakeRefunded(gameId, p0, stake);
                (bool ok1,) = p1.call{value: stake}("");
                require(ok1, "refund1 failed");
                emit StakeRefunded(gameId, p1, stake);
            }
        }
    }

    /// @notice Withdraw a previously-proposed draw flag. Only allowed if
    ///         the draw has not already been finalized.
    function withdrawDrawProposal(uint256 gameId) external {
        Game storage g = games[gameId];
        uint8 idx = _playerIndex(g, msg.sender); // reverts "not player"
        require(g.state == GameState.Committed || g.state == GameState.Playing, "bad state");
        require(g.drawProposed[idx], "no proposal");
        g.drawProposed[idx] = false;
        emit DrawWithdrawn(gameId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getGame(uint256 gameId)
        external
        view
        returns (
            address p0,
            address p1,
            GameState state,
            uint8 turn,
            bool shotPending,
            uint8 pendingX,
            uint8 pendingY,
            uint8 hits0,
            uint8 hits1,
            address winner
        )
    {
        Game storage g = games[gameId];
        return (
            g.players[0],
            g.players[1],
            g.state,
            g.turn,
            g.shotPending,
            g.pendingX,
            g.pendingY,
            g.hitsScored[0],
            g.hitsScored[1],
            g.winner
        );
    }

    function getGameEscrow(uint256 gameId)
        external
        view
        returns (
            uint256 stakeWei,
            uint256 pot,
            bool paidOut,
            uint32 clockSeconds,
            uint64 lastActionAt,
            uint64 createdAt,
            bool drawProposed0,
            bool drawProposed1
        )
    {
        Game storage g = games[gameId];
        return (
            g.stakeWei,
            g.pot,
            g.paidOut,
            g.clockSeconds,
            g.lastActionAt,
            g.createdAt,
            g.drawProposed[0],
            g.drawProposed[1]
        );
    }

    function commitmentOf(uint256 gameId, uint8 playerIdx) external view returns (bytes32) {
        return games[gameId].commitments[playerIdx];
    }

    function hitBitmapOf(uint256 gameId, uint8 playerIdx) external view returns (uint256) {
        return hitBitmap[gameId][playerIdx];
    }

    function firedBitmapOf(uint256 gameId, uint8 playerIdx) external view returns (uint256) {
        return firedBitmap[gameId][playerIdx];
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _playerIndex(Game storage g, address who) internal view returns (uint8) {
        if (g.players[0] == who) return 0;
        if (g.players[1] == who) return 1;
        revert("not player");
    }
}

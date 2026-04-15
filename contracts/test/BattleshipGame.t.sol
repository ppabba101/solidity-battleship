// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";

contract MockVerifier {
    bool public ok = true;

    function setOk(bool v) external {
        ok = v;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return ok;
    }
}

contract BattleshipGameTest is Test {
    BattleshipGame internal game;
    MockVerifier internal boardVerifier;
    MockVerifier internal shotVerifier;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    bytes internal constant PROOF = hex"deadbeef";

    function _pi1(bytes32 commitment) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](1);
        pi[0] = commitment;
    }

    // Build the new 105-element shot publicInputs:
    //   [0]      commitment
    //   [1]      x
    //   [2]      y
    //   [3]      hit
    //   [4..103] hit_bitmap_before (each bit as a separate field)
    //   [104]    sunk_ship_id
    function _piShot(
        bytes32 commitment,
        uint8 x,
        uint8 y,
        bool hit,
        uint256 bitmapBefore,
        uint8 sunkShipId
    ) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](105);
        pi[0] = commitment;
        pi[1] = bytes32(uint256(x));
        pi[2] = bytes32(uint256(y));
        pi[3] = bytes32(uint256(hit ? 1 : 0));
        for (uint256 i = 0; i < 100; i++) {
            pi[4 + i] = bytes32((bitmapBefore >> i) & 1);
        }
        pi[104] = bytes32(uint256(sunkShipId));
    }

    function setUp() public {
        boardVerifier = new MockVerifier();
        shotVerifier = new MockVerifier();
        game = new BattleshipGame(address(boardVerifier), address(shotVerifier));
    }

    function _createGame() internal returns (uint256 id) {
        vm.prank(alice);
        id = game.createGame(bob);
    }

    function _commitBoth(uint256 id) internal {
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        vm.prank(bob);
        game.commitBoard(id, bytes32(uint256(0xB2)), PROOF, _pi1(bytes32(uint256(0xB2))));
    }

    function testCreateGame() public {
        uint256 id = _createGame();
        (address p0, address p1, BattleshipGame.GameState state,,,,,,, address winner) = game.getGame(id);
        assertEq(p0, alice);
        assertEq(p1, bob);
        assertEq(uint8(state), uint8(BattleshipGame.GameState.Created));
        assertEq(winner, address(0));
    }

    function testCommitValidBoard() public {
        uint256 id = _createGame();
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        (,, BattleshipGame.GameState state,,,,,,,) = game.getGame(id);
        assertEq(uint8(state), uint8(BattleshipGame.GameState.Committed));
        assertEq(game.commitmentOf(id, 0), bytes32(uint256(0xA1)));
    }

    function testCommitInvalidBoardRejected() public {
        uint256 id = _createGame();
        boardVerifier.setOk(false);
        vm.prank(alice);
        vm.expectRevert(bytes("invalid board proof"));
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
    }

    function testCheaterCannotCommitEmptyBoard() public {
        // Conceptually: an empty board cannot produce a valid zk proof, so
        // the verifier returns false. We model that directly.
        uint256 id = _createGame();
        boardVerifier.setOk(false);
        vm.prank(alice);
        vm.expectRevert(bytes("invalid board proof"));
        game.commitBoard(id, bytes32(0), PROOF, _pi1(bytes32(0)));
    }

    function testTurnEnforcement() public {
        uint256 id = _createGame();
        _commitBoth(id);
        // Bob cannot fire first; it's alice's turn (turn == 0).
        vm.prank(bob);
        vm.expectRevert(bytes("not your turn"));
        game.fireShot(id, 1, 1);
        // Alice fires successfully.
        vm.prank(alice);
        game.fireShot(id, 1, 1);
        // Alice cannot fire again while a shot is pending.
        vm.prank(alice);
        vm.expectRevert(bytes("shot pending"));
        game.fireShot(id, 2, 2);
    }

    function testFullGameToWin() public {
        uint256 id = _createGame();
        _commitBoth(id);

        // Alice lands 17 hits in a row; bob always responds hit. Walk the
        // canonical bitmap forward so the contract's bitmap check passes.
        uint256 bmp = 0;
        for (uint8 i = 0; i < 17; i++) {
            uint8 xi = i % 10;
            uint8 yi = i / 10;
            vm.prank(alice);
            game.fireShot(id, xi, yi);
            vm.prank(bob);
            game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), xi, yi, true, bmp, 0));
            bmp |= (uint256(1) << (uint256(yi) * 10 + uint256(xi)));
        }

        (,, BattleshipGame.GameState state,,,,,, uint8 hits1, address winner) = game.getGame(id);
        // hits1 is bob's offensive hits; alice's are at index 0 — fetch via another destructure.
        hits1;
        assertEq(uint8(state), uint8(BattleshipGame.GameState.Finished));
        assertEq(winner, alice);
    }

    function testInvalidShotProofRejected() public {
        uint256 id = _createGame();
        _commitBoth(id);
        vm.prank(alice);
        game.fireShot(id, 3, 4);
        shotVerifier.setOk(false);
        vm.prank(bob);
        vm.expectRevert(bytes("invalid shot proof"));
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 3, 4, true, 0, 0));
    }

    function testShipSunkEvent() public {
        // Sink a length-2 destroyer (ship id 5 in canonical order) by firing
        // at (0,0) then (1,0). Second shot has bitmap_before bit 0 set and
        // declares sunk_ship_id=5.
        uint256 id = _createGame();
        _commitBoth(id);

        vm.prank(alice);
        game.fireShot(id, 0, 0);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 0, 0, true, 0, 0));

        vm.prank(alice);
        game.fireShot(id, 1, 0);
        vm.expectEmit(true, true, false, true);
        emit BattleshipGame.ShipSunk(id, bob, 5);
        vm.prank(bob);
        // bitmap_before has bit 0 set (1 << 0 == 1); declare sunk_ship_id=5.
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 1, 0, true, 1, 5));

        assertEq(game.hitBitmapOf(id, 1), uint256(3)); // bits 0 and 1 set
    }

    function testMultiSinkSequence() public {
        // Sink destroyer (ship id 5) at (0,0),(1,0), then sink submarine
        // (ship id 4, length 3) at (0,1),(1,1),(2,1). After shot 5 the
        // destroyer is already sunk — the emitted ShipSunk must be id=4,
        // NOT 5 or 9 (sum of both).
        uint256 id = _createGame();
        _commitBoth(id);

        // Shot 1: destroyer (0,0) — no sink.
        vm.prank(alice);
        game.fireShot(id, 0, 0);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 0, 0, true, 0, 0));

        // Shot 2: destroyer (1,0) — sinks ship 5.
        vm.prank(alice);
        game.fireShot(id, 1, 0);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 1, 0, true, 1, 5));

        // Shot 3: submarine (0,1) — no sink. bitmap has bits 0,1 set.
        uint256 bmp = 3;
        vm.prank(alice);
        game.fireShot(id, 0, 1);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 0, 1, true, bmp, 0));
        bmp |= (uint256(1) << 10);

        // Shot 4: submarine (1,1) — no sink.
        vm.prank(alice);
        game.fireShot(id, 1, 1);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 1, 1, true, bmp, 0));
        bmp |= (uint256(1) << 11);

        // Shot 5: submarine (2,1) — sinks ship 4. Destroyer is already
        // sunk, so the multi-sink bug would have reported 9; we expect 4.
        vm.prank(alice);
        game.fireShot(id, 2, 1);
        vm.expectEmit(true, true, false, true);
        emit BattleshipGame.ShipSunk(id, bob, 4);
        vm.prank(bob);
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 2, 1, true, bmp, 4));
    }

    function testRespondShotRejectsWrongBitmap() public {
        uint256 id = _createGame();
        _commitBoth(id);
        vm.prank(alice);
        game.fireShot(id, 5, 5);
        // Caller tries to pass a non-zero bitmap_before on the first shot.
        vm.prank(bob);
        vm.expectRevert(bytes("bitmap mismatch"));
        game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xB2)), 5, 5, true, 1, 0));
    }

    function testFireShotRejectsDoubleFire() public {
        uint256 id = _createGame();
        _commitBoth(id);

        // Alice fires at (5,5), misses → turn flips to Bob.
        vm.prank(alice);
        game.fireShot(id, 5, 5);
        vm.prank(bob);
        game.respondShot(id, false, PROOF, _piShot(bytes32(uint256(0xB2)), 5, 5, false, 0, 0));

        // Bob fires at (2,2), misses → turn flips back to Alice.
        vm.prank(bob);
        game.fireShot(id, 2, 2);
        vm.prank(alice);
        game.respondShot(id, false, PROOF, _piShot(bytes32(uint256(0xA1)), 2, 2, false, 0, 0));

        // Alice tries to fire at (5,5) again → should revert "already fired".
        vm.prank(alice);
        vm.expectRevert(bytes("already fired"));
        game.fireShot(id, 5, 5);

        // Alice fires at a fresh cell → should work.
        vm.prank(alice);
        game.fireShot(id, 9, 9);
        assertTrue(game.firedBitmapOf(id, 1) != 0, "fired bitmap should track Bob's board");
    }

    function testTimeoutWin() public {
        uint256 id = _createGame();
        _commitBoth(id);

        // Alice fires, bob never responds.
        vm.prank(alice);
        game.fireShot(id, 0, 0);

        // Too early to claim.
        vm.prank(alice);
        vm.expectRevert(bytes("too early"));
        game.claimTimeoutWin(id);

        // Advance past the timeout and claim.
        vm.roll(block.number + 51);
        vm.prank(alice);
        game.claimTimeoutWin(id);

        (,, BattleshipGame.GameState state,,,,,,, address winner) = game.getGame(id);
        assertEq(uint8(state), uint8(BattleshipGame.GameState.Finished));
        assertEq(winner, alice);
    }

    function testTimeoutCommitPhase() public {
        uint256 id = _createGame();
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        // Bob never commits.
        vm.roll(block.number + 51);
        vm.prank(alice);
        game.claimTimeoutWin(id);
        (,, BattleshipGame.GameState state,,,,,,, address winner) = game.getGame(id);
        assertEq(uint8(state), uint8(BattleshipGame.GameState.Finished));
        assertEq(winner, alice);
    }
}

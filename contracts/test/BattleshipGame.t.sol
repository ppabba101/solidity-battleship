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

    function _pi4(bytes32 commitment, uint8 x, uint8 y, bool hit) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](4);
        pi[0] = commitment;
        pi[1] = bytes32(uint256(x));
        pi[2] = bytes32(uint256(y));
        pi[3] = bytes32(uint256(hit ? 1 : 0));
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

        // Alice lands 17 hits in a row; bob always responds hit.
        for (uint8 i = 0; i < 17; i++) {
            vm.prank(alice);
            game.fireShot(id, i % 10, i / 10);
            vm.prank(bob);
            game.respondShot(id, true, PROOF, _pi4(bytes32(uint256(0xB2)), i % 10, i / 10, true));
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
        game.respondShot(id, true, PROOF, _pi4(bytes32(uint256(0xB2)), 3, 4, true));
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

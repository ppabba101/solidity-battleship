// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";
import {MaliciousReceiver} from "./helpers/MaliciousReceiver.sol";

contract MockVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

contract BattleshipGameEscrowTest is Test {
    BattleshipGame internal game;
    MockVerifier internal boardVerifier;
    MockVerifier internal shotVerifier;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal carol = address(0xC0C0);

    uint256 internal constant MIN_STAKE = 1e14; // 0.0001 ETH
    uint256 internal constant STAKE = 1e15; // 0.001 ETH
    uint32 internal constant CLOCK = 60;

    bytes internal constant PROOF = hex"deadbeef";

    function _pi1(bytes32 commitment) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](1);
        pi[0] = commitment;
    }

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
        game = new BattleshipGame(address(boardVerifier), address(shotVerifier), MIN_STAKE);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _create(address creator, address opponent, uint256 stake) internal returns (uint256 id) {
        vm.prank(creator);
        id = game.createGame{value: stake}(opponent, CLOCK, stake);
    }

    function _join(address joiner, uint256 id, uint256 stake) internal {
        vm.prank(joiner);
        game.joinGame{value: stake}(id);
    }

    function _commitBoth(uint256 id) internal {
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        vm.prank(bob);
        game.commitBoard(id, bytes32(uint256(0xB2)), PROOF, _pi1(bytes32(uint256(0xB2))));
    }

    function _playToWin(uint256 id, address winner, address loser, bytes32 loserCommit) internal {
        // winner lands 17 hits in a row at cells (i%10, i/10).
        uint256 bmp = 0;
        for (uint8 i = 0; i < 17; i++) {
            uint8 xi = i % 10;
            uint8 yi = i / 10;
            vm.prank(winner);
            game.fireShot(id, xi, yi);
            vm.prank(loser);
            game.respondShot(id, true, PROOF, _piShot(loserCommit, xi, yi, true, bmp, 0));
            bmp |= (uint256(1) << (uint256(yi) * 10 + uint256(xi)));
        }
    }

    // ---------------------------------------------------------------------
    // createGame
    // ---------------------------------------------------------------------

    function test_createGame_locks_value() public {
        uint256 id = _create(alice, bob, STAKE);
        assertEq(address(game).balance, STAKE);
        (uint256 stakeWei, uint256 pot,,,,,,) = game.getGameEscrow(id);
        assertEq(stakeWei, STAKE);
        assertEq(pot, STAKE);
    }

    function test_createGame_rejects_below_min() public {
        vm.prank(alice);
        vm.expectRevert(bytes("stake below min"));
        game.createGame{value: MIN_STAKE - 1}(bob, CLOCK, MIN_STAKE - 1);
    }

    function test_createGame_rejects_value_mismatch() public {
        vm.prank(alice);
        vm.expectRevert(bytes("value mismatch"));
        game.createGame{value: STAKE - 1}(bob, CLOCK, STAKE);
    }

    // ---------------------------------------------------------------------
    // joinGame
    // ---------------------------------------------------------------------

    function test_joinGame_rejects_wrong_value() public {
        uint256 id = _create(alice, bob, STAKE);
        vm.prank(bob);
        vm.expectRevert(bytes("value mismatch"));
        game.joinGame{value: STAKE - 1}(id);
    }

    function test_joinGame_locks_value() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        assertEq(address(game).balance, 2 * STAKE);
        (, uint256 pot,,,,,,) = game.getGameEscrow(id);
        assertEq(pot, 2 * STAKE);
    }

    function test_joinGame_sets_player2() public {
        // Open game (opponent = address(0)) — anyone can join.
        uint256 id = _create(alice, address(0), STAKE);
        _join(carol, id, STAKE);
        (, address p1,,,,,,,,) = game.getGame(id);
        assertEq(p1, carol);
    }

    // ---------------------------------------------------------------------
    // claimPot
    // ---------------------------------------------------------------------

    function test_claimPot_happy_path() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        _playToWin(id, alice, bob, bytes32(uint256(0xB2)));
        uint256 before = alice.balance;
        vm.prank(alice);
        game.claimPot(id);
        assertEq(alice.balance, before + 2 * STAKE);
        assertEq(address(game).balance, 0);
        (,, bool paidOut,,,,,) = game.getGameEscrow(id);
        assertTrue(paidOut);
    }

    function test_claimPot_reentrancyAttackerReverts() public {
        // Deploy attacker as the player-1 (winner) of a game.
        MaliciousReceiver attacker = new MaliciousReceiver(game);
        vm.deal(address(attacker), 100 ether);

        // Alice creates, attacker joins.
        uint256 id = _create(alice, address(attacker), STAKE);
        vm.prank(address(attacker));
        game.joinGame{value: STAKE}(id);

        // Both commit (alice is players[0], attacker is players[1]).
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        vm.prank(address(attacker));
        game.commitBoard(id, bytes32(uint256(0xB2)), PROOF, _pi1(bytes32(uint256(0xB2))));

        // Attacker is players[1], so on its turn it will fire after alice misses.
        // Easier path: have alice intentionally miss her first shot, then attacker
        // (turn 1) lands 17 hits in a row.
        vm.prank(alice);
        game.fireShot(id, 9, 9);
        vm.prank(address(attacker));
        game.respondShot(id, false, PROOF, _piShot(bytes32(uint256(0xB2)), 9, 9, false, 0, 0));

        // Now turn = 1 (attacker). Attacker (shooter) -> alice responds.
        uint256 bmp = 0;
        for (uint8 i = 0; i < 17; i++) {
            uint8 xi = i % 10;
            uint8 yi = i / 10;
            vm.prank(address(attacker));
            game.fireShot(id, xi, yi);
            vm.prank(alice);
            game.respondShot(id, true, PROOF, _piShot(bytes32(uint256(0xA1)), xi, yi, true, bmp, 0));
            bmp |= (uint256(1) << (uint256(yi) * 10 + uint256(xi)));
        }

        (,,,,,,,,, address winner) = game.getGame(id);
        assertEq(winner, address(attacker));

        uint256 attackerBalBefore = address(attacker).balance;
        attacker.attack(id);

        // Attacker should have received exactly the pot once.
        assertEq(address(attacker).balance, attackerBalBefore + 2 * STAKE);
        assertEq(address(game).balance, 0);
        assertTrue(attacker.reenterAttempted());
        assertTrue(attacker.reenterReverted());
        (,, bool paidOut,,,,,) = game.getGameEscrow(id);
        assertTrue(paidOut);
    }

    function test_claimPot_requires_finished_state() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        vm.prank(alice);
        vm.expectRevert(bytes("not finished"));
        game.claimPot(id);
    }

    function test_claimPot_only_winner() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        _playToWin(id, alice, bob, bytes32(uint256(0xB2)));
        vm.prank(bob);
        vm.expectRevert(bytes("not winner"));
        game.claimPot(id);
    }

    // ---------------------------------------------------------------------
    // claimTimeoutWin
    // ---------------------------------------------------------------------

    function test_timeoutWin_pays_pot_playing() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        vm.prank(alice);
        game.fireShot(id, 0, 0);
        // Bob (responder) misses the deadline.
        vm.roll(block.number + 6);
        vm.warp(block.timestamp + 71);
        uint256 before = alice.balance;
        vm.prank(alice);
        game.claimTimeoutWin(id);
        assertEq(alice.balance, before + 2 * STAKE);
        assertEq(address(game).balance, 0);
    }

    function test_timeoutWin_pays_pot_committed() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        vm.prank(alice);
        game.commitBoard(id, bytes32(uint256(0xA1)), PROOF, _pi1(bytes32(uint256(0xA1))));
        // Bob never commits.
        vm.roll(block.number + 6);
        vm.warp(block.timestamp + 71);
        uint256 before = alice.balance;
        vm.prank(alice);
        game.claimTimeoutWin(id);
        assertEq(alice.balance, before + 2 * STAKE);
    }

    function test_timeoutWin_reverts_too_early() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        vm.prank(alice);
        game.fireShot(id, 0, 0);
        vm.prank(alice);
        vm.expectRevert(bytes("too early"));
        game.claimTimeoutWin(id);
    }

    // ---------------------------------------------------------------------
    // cancelGame
    // ---------------------------------------------------------------------

    function test_cancelGame_creator_refund() public {
        uint256 id = _create(alice, bob, STAKE);
        uint256 before = alice.balance;
        vm.prank(alice);
        game.cancelGame(id);
        assertEq(alice.balance, before + STAKE);
        assertEq(address(game).balance, 0);
    }

    function test_cancelGame_rejects_after_join() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        vm.prank(alice);
        vm.expectRevert(bytes("already joined"));
        game.cancelGame(id);
    }

    function test_cancelGame_stale_sweep_after_timeout() public {
        uint256 id = _create(alice, bob, STAKE);
        // Carol cannot sweep before timeout.
        vm.prank(carol);
        vm.expectRevert(bytes("not creator or not stale"));
        game.cancelGame(id);
        // Warp past ABORT_TIMEOUT.
        vm.warp(block.timestamp + 1 hours + 1);
        uint256 aliceBefore = alice.balance;
        vm.prank(carol);
        game.cancelGame(id);
        // Refund still goes to creator (alice), not the sweeper.
        assertEq(alice.balance, aliceBefore + STAKE);
    }

    // ---------------------------------------------------------------------
    // proposeDraw
    // ---------------------------------------------------------------------

    function test_proposeDraw_one_sided_no_refund() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        game.proposeDraw(id);
        assertEq(alice.balance, aliceBefore);
        assertEq(bob.balance, bobBefore);
        assertEq(address(game).balance, 2 * STAKE);
    }

    function test_proposeDraw_both_sides_refunds_both() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        game.proposeDraw(id);
        vm.prank(bob);
        game.proposeDraw(id);
        assertEq(alice.balance, aliceBefore + STAKE);
        assertEq(bob.balance, bobBefore + STAKE);
        assertEq(address(game).balance, 0);
        (,,,,,,,,, address winner) = game.getGame(id);
        assertEq(winner, address(0));
    }

    // ---------------------------------------------------------------------
    // withdrawDrawProposal
    // ---------------------------------------------------------------------

    function test_withdrawDrawProposal_unsets_flag() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        vm.prank(alice);
        game.proposeDraw(id);
        (,,,,,, bool dp0,) = game.getGameEscrow(id);
        assertTrue(dp0);
        vm.prank(alice);
        game.withdrawDrawProposal(id);
        (,,,,,, bool dp0After,) = game.getGameEscrow(id);
        assertFalse(dp0After);
    }

    function test_withdrawDrawProposal_rejects_non_player() public {
        uint256 id = _create(alice, bob, STAKE);
        _join(bob, id, STAKE);
        _commitBoth(id);
        vm.prank(carol);
        vm.expectRevert(bytes("not player"));
        game.withdrawDrawProposal(id);
    }
}

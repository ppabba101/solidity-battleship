// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";
import {BattleshipGameHandler} from "./handlers/BattleshipGameHandler.sol";

contract MockVerifierInv {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

contract BattleshipGameInvariantTest is StdInvariant, Test {
    BattleshipGame internal game;
    BattleshipGameHandler internal handler;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        MockVerifierInv bv = new MockVerifierInv();
        MockVerifierInv sv = new MockVerifierInv();
        game = new BattleshipGame(address(bv), address(sv), 0);
        handler = new BattleshipGameHandler(game, alice, bob);
        targetContract(address(handler));
    }

    /// Contract balance must always equal the ghost sum of escrowed pots.
    function invariant_balance_eq_sum_active_pots() public view {
        assertEq(address(game).balance, handler.ghostSumActivePots());
    }

    /// No game touched by the handler should be Finished with a non-zero
    /// pot that has not been paid out.
    function invariant_no_stuck_pot() public view {
        uint256 n = game.nextGameId();
        for (uint256 id = 0; id < n; id++) {
            (,, BattleshipGame.GameState state,,,,,,,) = game.getGame(id);
            (, uint256 pot, bool paidOut,,,,,) = game.getGameEscrow(id);
            if (state == BattleshipGame.GameState.Finished && pot > 0) {
                assertTrue(paidOut, "finished game with unpaid pot");
            }
        }
    }
}

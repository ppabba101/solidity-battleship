// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BattleshipGame} from "../../src/BattleshipGame.sol";

/// @notice Foundry invariant handler for BattleshipGame escrow surface.
///         Drives create/join/cancel from two bounded actors and tracks a
///         ghost sum of escrowed pots. The handler does NOT exercise the
///         board-commit / shot-proof paths because they need real-looking
///         publicInputs; the balance invariant only cares that every wei
///         sent in via create/join is accounted for in the ghost sum until
///         it leaves via cancel.
contract BattleshipGameHandler is Test {
    BattleshipGame public game;

    address public alice;
    address public bob;

    uint256 public ghostSumActivePots;

    uint256 public constant STAKE = 1e15;

    uint256[] public openIds; // gameIds in Created state, not yet joined
    uint256[] public joinedIds; // gameIds joined, never finalized in this handler

    constructor(BattleshipGame _game, address _alice, address _bob) {
        game = _game;
        alice = _alice;
        bob = _bob;
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return (seed % 2 == 0) ? alice : bob;
    }

    function createGame(uint256 actorSeed) external {
        address who = _actor(actorSeed);
        address opponent = (who == alice) ? bob : alice;
        vm.prank(who);
        try game.createGame{value: STAKE}(opponent, 60, STAKE) returns (uint256 id) {
            openIds.push(id);
            ghostSumActivePots += STAKE;
        } catch {}
    }

    function joinGame(uint256 idxSeed) external {
        if (openIds.length == 0) return;
        uint256 i = idxSeed % openIds.length;
        uint256 id = openIds[i];
        (address p0,,,,,,,,,) = game.getGame(id);
        address joiner = (p0 == alice) ? bob : alice;
        vm.prank(joiner);
        try game.joinGame{value: STAKE}(id) {
            ghostSumActivePots += STAKE;
            openIds[i] = openIds[openIds.length - 1];
            openIds.pop();
            joinedIds.push(id);
        } catch {}
    }

    function cancelGame(uint256 idxSeed) external {
        if (openIds.length == 0) return;
        uint256 i = idxSeed % openIds.length;
        uint256 id = openIds[i];
        (address p0,,,,,,,,,) = game.getGame(id);
        vm.prank(p0);
        try game.cancelGame(id) {
            ghostSumActivePots -= STAKE;
            openIds[i] = openIds[openIds.length - 1];
            openIds.pop();
        } catch {}
    }
}

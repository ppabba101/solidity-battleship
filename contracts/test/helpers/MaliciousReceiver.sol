// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BattleshipGame} from "../../src/BattleshipGame.sol";

/// @notice Test fixture: a contract that, on receiving ETH, attempts to
///         re-enter `claimPot` on the BattleshipGame. Used to prove the
///         nonReentrant guard on the payout path.
contract MaliciousReceiver {
    BattleshipGame public immutable game;
    uint256 public targetGameId;
    bool public reenterAttempted;
    bool public reenterReverted;

    constructor(BattleshipGame _game) {
        game = _game;
    }

    function setTarget(uint256 gameId) external {
        targetGameId = gameId;
    }

    function attack(uint256 gameId) external {
        targetGameId = gameId;
        game.claimPot(gameId);
    }

    receive() external payable {
        if (!reenterAttempted) {
            reenterAttempted = true;
            try game.claimPot(targetGameId) {
                // unexpected: should have reverted
            } catch {
                reenterReverted = true;
            }
        }
    }
}

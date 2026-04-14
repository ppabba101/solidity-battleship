// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";
import {HonkVerifier as BoardValidityVerifier} from "../src/verifiers/BoardValidityVerifier.sol";
import {HonkVerifier as ShotResponseVerifier} from "../src/verifiers/ShotResponseVerifier.sol";

contract Deploy is Script {
    function run() external returns (BattleshipGame game) {
        vm.startBroadcast();
        BoardValidityVerifier boardVerifier = new BoardValidityVerifier();
        ShotResponseVerifier shotVerifier = new ShotResponseVerifier();
        game = new BattleshipGame(address(boardVerifier), address(shotVerifier));
        vm.stopBroadcast();
        console.log("BattleshipGame deployed at:", address(game));
    }
}

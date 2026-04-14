// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";
import {HonkVerifier as BoardValidityVerifier} from "../src/verifiers/BoardValidityVerifier.sol";
import {HonkVerifier as ShotResponseVerifier} from "../src/verifiers/ShotResponseVerifier.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";

contract Deploy is Script {
    function run() external returns (BattleshipGame game) {
        // FAKE_VERIFIERS=1 swaps the real HonkVerifier contracts for a
        // single-line MockVerifier. Use for demo mode when you want fast
        // proving without the ~30–60s bb.js browser prover.
        bool fakeVerifiers = vm.envOr("FAKE_VERIFIERS", uint256(0)) == 1;
        vm.startBroadcast();
        address boardVerifier;
        address shotVerifier;
        if (fakeVerifiers) {
            boardVerifier = address(new MockVerifier());
            shotVerifier = address(new MockVerifier());
            console.log("Deploying with FAKE verifiers (MockVerifier)");
        } else {
            boardVerifier = address(new BoardValidityVerifier());
            shotVerifier = address(new ShotResponseVerifier());
            console.log("Deploying with REAL verifiers (HonkVerifier)");
        }
        game = new BattleshipGame(boardVerifier, shotVerifier);
        vm.stopBroadcast();
        console.log("BattleshipGame deployed at:", address(game));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BattleshipGame} from "../src/BattleshipGame.sol";
import {HonkVerifier as BoardValidityVerifier} from "../src/verifiers/BoardValidityVerifier.sol";
import {HonkVerifier as ShotResponseVerifier} from "../src/verifiers/ShotResponseVerifier.sol";
import {MockVerifier} from "../src/verifiers/MockVerifier.sol";

/// @title DeployBaseSepolia
/// @notice WP7 deploy script. Deploys BOTH a real-Honk-verifier contract
///         and a preview (MockVerifier) contract to Base Sepolia per
///         ADR-7 (Option E + B hybrid). The lobby reads events from
///         whichever address corresponds to the active UI mode.
///
/// Usage:
///   export PRIVATE_KEY=0x...           # funded Base Sepolia deployer
///   export BASE_SEPOLIA_RPC=https://... # Alchemy recommended
///   export MIN_STAKE=100000000000000    # 1e14 wei = 0.0001 ETH
///   forge script contracts/script/DeployBaseSepolia.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC \
///     --broadcast \
///     --verify \
///     --etherscan-api-key $BASESCAN_API_KEY
///
/// Outputs both addresses to stdout in a grep-friendly format so the
/// README and frontend env files can be updated from a one-liner.
contract DeployBaseSepolia is Script {
    function run() external returns (BattleshipGame realGame, BattleshipGame previewGame) {
        uint256 minStake = vm.envOr("MIN_STAKE", uint256(1e14));

        vm.startBroadcast();

        // --- Real verifiers contract (cryptographic mode) ---
        address realBoardVerifier = address(new BoardValidityVerifier());
        address realShotVerifier = address(new ShotResponseVerifier());
        realGame = new BattleshipGame(realBoardVerifier, realShotVerifier, minStake);
        console.log("REAL_BATTLESHIP_ADDRESS:", address(realGame));
        console.log("REAL_BOARD_VERIFIER:", realBoardVerifier);
        console.log("REAL_SHOT_VERIFIER:", realShotVerifier);

        // --- Preview MockVerifier contract (UX + matchmaking demo) ---
        address mockBoardVerifier = address(new MockVerifier());
        address mockShotVerifier = address(new MockVerifier());
        previewGame = new BattleshipGame(mockBoardVerifier, mockShotVerifier, minStake);
        console.log("PREVIEW_BATTLESHIP_ADDRESS:", address(previewGame));
        console.log("PREVIEW_BOARD_VERIFIER:", mockBoardVerifier);
        console.log("PREVIEW_SHOT_VERIFIER:", mockShotVerifier);

        vm.stopBroadcast();

        console.log("MIN_STAKE (wei):", minStake);
        console.log("");
        console.log("Paste into frontend/.env.production:");
        console.log("  VITE_BATTLESHIP_ADDRESS_REAL=", address(realGame));
        console.log("  VITE_BATTLESHIP_ADDRESS_PREVIEW=", address(previewGame));
    }
}

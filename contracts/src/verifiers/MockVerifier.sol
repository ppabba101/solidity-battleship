// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Demo-mode verifier. Accepts any proof + public inputs. Used when the user
// needs a fast demo without waiting 30-60s for real UltraHonk proving in the
// browser. The viz layer still animates the pipeline correctly because the
// commitBoard / respondShot transactions still land on-chain and emit events;
// only the cryptographic check itself is short-circuited.
//
// To deploy this instead of the real 2460-line HonkVerifier, set the env var
// FAKE_VERIFIERS=1 before running contracts/script/Deploy.s.sol (or use the
// scripts/demo-fast.sh wrapper).
contract MockVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

#!/usr/bin/env node
// Regenerate the Solidity HonkVerifier contracts from the compiled circuits
// using @aztec/bb.js directly. We do it via bb.js (rather than `bb
// write_solidity_verifier`) so the on-chain verifier's VK is guaranteed to
// match the VK the browser prover uses. If the two drift (e.g. because bb CLI
// and @aztec/bb.js are pinned to different versions) sumcheck fails on-chain
// even when the proof itself is correct.
//
// Usage:
//   node scripts/generate-solidity-verifiers.mjs
//
// Prereq: run `nargo compile` in each circuits/<name>/ directory first so the
// target/<name>.json artifact exists.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UltraHonkBackend, Barretenberg } from "@aztec/bb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const targets = [
  {
    circuit: "board_validity",
    out: "contracts/src/verifiers/BoardValidityVerifier.sol",
  },
  {
    circuit: "shot_response",
    out: "contracts/src/verifiers/ShotResponseVerifier.sol",
  },
];

for (const t of targets) {
  const artifactPath = path.join(
    repoRoot,
    "circuits",
    t.circuit,
    "target",
    `${t.circuit}.json`,
  );
  if (!fs.existsSync(artifactPath)) {
    console.error(`[${t.circuit}] missing ${artifactPath}; run \`nargo compile\` first`);
    process.exit(1);
  }
  const circuit = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  console.log(`[${t.circuit}] initialising bb.js backend...`);
  const api = await Barretenberg.new({ threads: 4 });
  const backend = new UltraHonkBackend(circuit.bytecode, api);

  console.log(`[${t.circuit}] computing EVM verification key...`);
  const vk = await backend.getVerificationKey({ verifierTarget: "evm" });

  console.log(`[${t.circuit}] writing Solidity verifier...`);
  const sol = await backend.getSolidityVerifier(vk, { verifierTarget: "evm" });

  const outPath = path.join(repoRoot, t.out);
  fs.writeFileSync(outPath, sol);
  console.log(`[${t.circuit}] wrote ${t.out} (${sol.length} bytes)`);
}

process.exit(0);

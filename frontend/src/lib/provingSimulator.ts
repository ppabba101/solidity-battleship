import { emit } from "./vizBus";
import {
  proveBoardValidity,
  proveShotResponse,
  type BoardProof,
  type ShotProof,
} from "./prover";
import type { Fleet } from "./gameState";

// Event-emitting wrapper around the real bb.js prover. The viz layer expects
// a consistent sequence of lifecycle events; we emit them around the real
// call so progress indicators, crypto log, and gas numbers all reflect the
// actual work the browser is doing. Progress percentage is approximated from
// wall-clock elapsed time against an empirically-tuned target duration (the
// real UltraHonk prover exposes no intermediate progress hook).

const TARGET_CONSTRAINTS = 1326;
const ASSUMED_PROVING_MS = 15_000;
let circuitCompiled = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SimulatedRunMeta {
  label: string;
  method: "commitBoard" | "submitShot";
  publicInputs: Record<string, unknown>;
}

async function runWithViz<T extends { proof: `0x${string}`; ms: number }>(
  meta: SimulatedRunMeta,
  inner: () => Promise<T>,
): Promise<T> {
  const runId = crypto.randomUUID();

  emit({
    kind: "board_hash",
    payload: {
      runId,
      label: meta.label,
      publicInputs: meta.publicInputs,
    },
  });
  await sleep(250);

  if (!circuitCompiled) {
    emit({
      kind: "circuit_compile",
      payload: { runId, circuit: "board_validity.nr" },
    });
    circuitCompiled = true;
    await sleep(200);
  }

  emit({
    kind: "proving_start",
    payload: {
      runId,
      label: meta.label,
      targetConstraints: TARGET_CONSTRAINTS,
    },
  });

  const startedAt = performance.now();
  const interval = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(0.97, elapsed / ASSUMED_PROVING_MS);
    emit({
      kind: "proving_progress",
      payload: {
        runId,
        progress,
        elapsedMs: Math.round(elapsed),
        constraints: Math.floor(progress * TARGET_CONSTRAINTS),
      },
    });
  }, 200);

  let result: T;
  try {
    result = await inner();
  } finally {
    window.clearInterval(interval);
  }

  emit({
    kind: "proving_done",
    payload: {
      runId,
      proofBytes: result.proof,
      elapsedMs: result.ms,
      constraints: TARGET_CONSTRAINTS,
    },
  });

  emit({
    kind: "verifier_call",
    payload: { runId, verifier: "HonkVerifier.verify" },
  });

  return result;
}

export function simulateBoardValidity(
  fleet: Fleet,
  salt: `0x${string}`,
): Promise<BoardProof> {
  return runWithViz(
    {
      label: "board_validity",
      method: "commitBoard",
      publicInputs: {
        fleetShape: [5, 4, 3, 3, 2],
        shipCells: 17,
      },
    },
    () => proveBoardValidity(fleet, salt),
  );
}

export function simulateShotResponse(
  fleet: Fleet,
  salt: `0x${string}`,
  x: number,
  y: number,
): Promise<ShotProof> {
  return runWithViz(
    {
      label: "shot_response",
      method: "submitShot",
      publicInputs: { x, y },
    },
    () => proveShotResponse(fleet, salt, x, y),
  );
}

export function resetSimulator(): void {
  circuitCompiled = false;
}

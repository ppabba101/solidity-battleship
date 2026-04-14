import { emit } from "./vizBus";
import {
  proveBoardValidity,
  proveShotResponse,
  type BoardProof,
  type ShotProof,
} from "./prover";
import type { Fleet } from "./gameState";

// The simulator wraps the stub prover so the viz layer sees a realistic
// sequence of events even though the underlying proof is still a stub.
// Once bb.js is wired in, swap the inner await out for the real call and
// leave the event cadence unchanged.

const TARGET_CONSTRAINTS = 3482;
let circuitCompiled = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomProofBytes(len = 384): `0x${string}` {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

function fakeTxHash(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex as `0x${string}`;
}

export interface SimulatedRunMeta {
  label: string;
  method: "commitBoard" | "submitShot";
  publicInputs: Record<string, unknown>;
}

async function runWithViz<T>(
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
  await sleep(800);

  if (!circuitCompiled) {
    emit({
      kind: "circuit_compile",
      payload: { runId, circuit: "board_validity.nr" },
    });
    circuitCompiled = true;
    await sleep(300);
  }

  emit({
    kind: "proving_start",
    payload: {
      runId,
      label: meta.label,
      targetConstraints: TARGET_CONSTRAINTS,
    },
  });

  // Drive a fake-but-monotonic constraint counter while the real prover runs.
  const startedAt = performance.now();
  const totalMs = 3000 + Math.random() * 2000;
  const interval = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    const progress = Math.min(1, elapsed / totalMs);
    emit({
      kind: "proving_progress",
      payload: {
        runId,
        progress,
        elapsedMs: Math.round(elapsed),
        constraints: Math.floor(progress * TARGET_CONSTRAINTS),
      },
    });
  }, 100);

  let result: T;
  try {
    result = await inner();
  } finally {
    window.clearInterval(interval);
  }

  const proofBytes = randomProofBytes();
  emit({
    kind: "proving_done",
    payload: {
      runId,
      proofBytes,
      elapsedMs: Math.round(performance.now() - startedAt),
      constraints: TARGET_CONSTRAINTS,
    },
  });

  emit({
    kind: "verifier_call",
    payload: { runId, verifier: "HonkVerifier.verify" },
  });
  await sleep(400);

  const txHash = fakeTxHash();
  emit({
    kind: "tx_sent",
    payload: { runId, method: meta.method, hash: txHash },
  });
  await sleep(600);

  emit({
    kind: "tx_mined",
    payload: {
      runId,
      method: meta.method,
      hash: txHash,
      gasUsed: meta.method === "commitBoard" ? 287_451 : 312_908,
      status: "success",
    },
  });

  emit({
    kind: "event_log",
    payload: {
      runId,
      name: meta.method === "commitBoard" ? "BoardCommitted" : "ShotResolved",
      txHash,
    },
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

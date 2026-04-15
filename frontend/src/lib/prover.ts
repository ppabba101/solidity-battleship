// Real browser zk proving via @aztec/bb.js + @noir-lang/noir_js.
//
// The circuits are compiled out-of-band by nargo (see circuits/README.md).
// Their JSON artifacts are imported directly from the workspace sibling
// `circuits/<name>/target/<name>.json` (Vite's `server.fs.allow` is set to
// `..` so this is permitted). Pedersen hashes are computed out-of-circuit
// via BarretenbergSync so the `commitment` public input can be handed to
// both the prover and the on-chain verifier.

import type { Hex } from "viem";
import { toHex } from "viem";
import type { Fleet, Ship } from "./gameState";
import { shipCells, STANDARD_FLEET } from "./gameState";

// Circuit artifacts. Vite rewrites the deep paths at build time.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON import, no types generated
import boardValidityCircuit from "../../../circuits/board_validity/target/board_validity.json";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JSON import, no types generated
import shotResponseCircuit from "../../../circuits/shot_response/target/shot_response.json";

export interface BoardProof {
  commitment: `0x${string}`;
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
  ms: number;
}

export interface ShotProof {
  hit: boolean;
  sunkShipId: number;
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
  ms: number;
}

// ---------------------------------------------------------------------------
// Lazy singletons. bb.js and noir_js both pull in wasm blobs; we pay that
// cost exactly once per page load.
// ---------------------------------------------------------------------------

type NoirCtor = new (circuit: unknown) => {
  execute: (inputs: Record<string, unknown>) => Promise<{ witness: Uint8Array }>;
};
type BackendCtor = new (
  acirBytecode: string,
  api: unknown,
) => {
  generateProof: (
    witness: Uint8Array,
    options?: Record<string, unknown>,
  ) => Promise<{ proof: Uint8Array; publicInputs: string[] }>;
};

interface Prover {
  noir: InstanceType<NoirCtor>;
  backend: InstanceType<BackendCtor>;
}

let bbApiPromise: Promise<unknown> | null = null;
let bbSyncPromise: Promise<{
  pedersenHash: (cmd: {
    inputs: Uint8Array[];
    hashIndex: number;
  }) => { hash: Uint8Array };
}> | null = null;
let boardProverPromise: Promise<Prover> | null = null;
let shotProverPromise: Promise<Prover> | null = null;

async function getBbApi(): Promise<unknown> {
  if (!bbApiPromise) {
    bbApiPromise = (async () => {
      const mod = await import("@aztec/bb.js");
      // Use a modest thread count. Browsers cap at ~navigator.hardwareConcurrency.
      const threads = Math.max(
        1,
        Math.min(8, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1),
      );
      return (mod as unknown as {
        Barretenberg: { new: (opts: { threads: number }) => Promise<unknown> };
      }).Barretenberg.new({ threads });
    })();
  }
  return bbApiPromise;
}

async function getBbSync() {
  if (!bbSyncPromise) {
    bbSyncPromise = (async () => {
      const mod = await import("@aztec/bb.js");
      const sync = await (mod as unknown as {
        BarretenbergSync: { initSingleton: () => Promise<unknown> };
      }).BarretenbergSync.initSingleton();
      return sync as {
        pedersenHash: (cmd: {
          inputs: Uint8Array[];
          hashIndex: number;
        }) => { hash: Uint8Array };
      };
    })();
  }
  return bbSyncPromise;
}

async function buildProver(circuit: unknown): Promise<Prover> {
  const [noirMod, bbMod, api] = await Promise.all([
    import("@noir-lang/noir_js"),
    import("@aztec/bb.js"),
    getBbApi(),
  ]);
  const NoirClass = (noirMod as unknown as { Noir: NoirCtor }).Noir;
  const BackendClass = (bbMod as unknown as {
    UltraHonkBackend: BackendCtor;
  }).UltraHonkBackend;
  const noir = new NoirClass(circuit);
  const backend = new BackendClass(
    (circuit as { bytecode: string }).bytecode,
    api,
  );
  return { noir, backend };
}

function getBoardProver(): Promise<Prover> {
  if (!boardProverPromise) {
    boardProverPromise = buildProver(boardValidityCircuit);
  }
  return boardProverPromise;
}

function getShotProver(): Promise<Prover> {
  if (!shotProverPromise) {
    shotProverPromise = buildProver(shotResponseCircuit);
  }
  return shotProverPromise;
}

// ---------------------------------------------------------------------------
// Field encoding helpers.
// ---------------------------------------------------------------------------

function bigintToField(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hexFromBytes(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out as `0x${string}`;
}

function saltToBigint(salt: `0x${string}`): bigint {
  return BigInt(salt);
}

// Build the 100-cell occupancy board from a Fleet.
function boardFromFleet(fleet: Fleet): number[] {
  const cells = Array(100).fill(0);
  for (const ship of fleet) {
    for (const { x, y } of shipCells(ship)) {
      cells[y * 10 + x] = 1;
    }
  }
  return cells;
}

// Canonicalize the fleet into the five-ship order the circuit expects.
function canonicalFleet(fleet: Fleet): Ship[] {
  const byId = new Map(fleet.map((s) => [s.id, s]));
  return STANDARD_FLEET.map((spec) => {
    const ship = byId.get(spec.id);
    if (!ship) throw new Error(`fleet missing ship ${spec.id}`);
    return ship;
  });
}

// Compute the circuit-compatible Pedersen commitment for a board+salt.
export async function commitmentFor(
  fleet: Fleet,
  salt: `0x${string}`,
): Promise<`0x${string}`> {
  const sync = await getBbSync();
  const board = boardFromFleet(fleet);
  const inputs: Uint8Array[] = new Array(101);
  for (let i = 0; i < 100; i++) inputs[i] = bigintToField(BigInt(board[i]));
  inputs[100] = bigintToField(saltToBigint(salt));
  const out = sync.pedersenHash({ inputs, hashIndex: 0 });
  return hexFromBytes(out.hash);
}

// ---------------------------------------------------------------------------
// Proof generation.
// ---------------------------------------------------------------------------

// Demo-mode stub path. Set VITE_PROVER_MODE=stub in frontend/.env.local to
// skip real bb.js proving entirely. The commitment is still computed for
// real, and publicInputs are the correct length — but the proof bytes are a
// placeholder. Pair with FAKE_VERIFIERS=1 on the contracts side so the
// MockVerifier accepts any proof. Used when the 30–60s real proving time is
// too slow for a live demo.
const PROVER_MODE = (import.meta.env.VITE_PROVER_MODE as string | undefined) ?? "real";
const STUB = PROVER_MODE === "stub";

// Local Node-side prover sidecar. The browser build of @aztec/bb.js
// 5.0.0-nightly.20260324 emits UltraHonk proofs that revert the deployed
// Solidity HonkVerifier with SumcheckFailed (0x9fc3a218), while the Node build
// of the same bb.js version produces proofs that verify cleanly both natively
// and on-chain. We run bb.js in a local Node sidecar (scripts/prove-sidecar.mjs)
// and post witnesses to it instead of calling bb.js in the browser.
const SIDECAR_URL =
  (import.meta.env.VITE_PROVER_SIDECAR_URL as string | undefined) ??
  "http://127.0.0.1:8899";

async function postSidecar<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`sidecar ${path} ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

const STUB_DELAY_MS_MIN = 2500;
const STUB_DELAY_MS_RANGE = 2000;
const ACCUMULATOR_PADDING_FIELDS = 8;

function stubProofBytes(): `0x${string}` {
  return ("0x" + "ab".repeat(128)) as `0x${string}`;
}

function stubAccumulator(): `0x${string}`[] {
  // 8 deterministic-but-distinct 32-byte values standing in for the UltraHonk
  // pairing accumulator. MockVerifier doesn't read them; we just need the
  // array to be the right length.
  return Array.from({ length: ACCUMULATOR_PADDING_FIELDS }, (_, i) => {
    const hex = (i + 1).toString(16).padStart(64, "0");
    return ("0x" + hex) as `0x${string}`;
  });
}

function randomDelayMs(): number {
  return STUB_DELAY_MS_MIN + Math.random() * STUB_DELAY_MS_RANGE;
}

export async function proveBoardValidity(
  fleet: Fleet,
  salt: `0x${string}`,
): Promise<BoardProof> {
  const start = performance.now();
  const ordered = canonicalFleet(fleet);
  const commitment = await commitmentFor(fleet, salt);

  if (STUB) {
    await new Promise((r) => setTimeout(r, randomDelayMs()));
    return {
      commitment,
      proof: stubProofBytes(),
      publicInputs: [commitment, ...stubAccumulator()],
      ms: Math.round(performance.now() - start),
    };
  }

  // Delegate real proving to the local Node sidecar.
  const out = await postSidecar<{
    commitment: `0x${string}`;
    proof: `0x${string}`;
    publicInputs: `0x${string}`[];
    ms: number;
  }>("/prove-board", { fleet: ordered, salt });

  return {
    commitment: out.commitment,
    proof: out.proof,
    publicInputs: out.publicInputs,
    ms: Math.round(performance.now() - start),
  };
}

// Canonical ship lengths, matching both circuits and STANDARD_FLEET order.
const CANONICAL_SHIP_LENS = [5, 4, 3, 3, 2] as const;

// Mirror of the Noir circuit's sunk_ship_id derivation, for the stub path.
function computeSunkShipIdFromFleet(
  orderedFleet: Ship[],
  nextBitmap: bigint,
  shotX: number,
  shotY: number,
  hit: boolean,
): number {
  if (!hit) return 0;
  for (let s = 0; s < orderedFleet.length; s++) {
    const ship = orderedFleet[s];
    const len = CANONICAL_SHIP_LENS[s];
    let touchedByShot = false;
    let covered = 0;
    for (let k = 0; k < len; k++) {
      const cx = ship.orientation === "H" ? ship.x + k : ship.x;
      const cy = ship.orientation === "V" ? ship.y + k : ship.y;
      if (cx === shotX && cy === shotY) touchedByShot = true;
      const bit = (nextBitmap >> BigInt(cy * 10 + cx)) & 1n;
      if (bit === 1n) covered++;
    }
    if (touchedByShot && covered === len) return s + 1;
  }
  return 0;
}

function bitmapToHexFields(bitmap: bigint): `0x${string}`[] {
  const out: `0x${string}`[] = new Array(100);
  for (let i = 0; i < 100; i++) {
    const bit = (bitmap >> BigInt(i)) & 1n;
    out[i] = ("0x" + (bit === 1n ? "01" : "00").padStart(64, "0")) as `0x${string}`;
  }
  return out;
}

export async function proveShotResponse(
  fleet: Fleet,
  salt: `0x${string}`,
  x: number,
  y: number,
  hitBitmapBefore: bigint,
): Promise<ShotProof> {
  const start = performance.now();
  const board = boardFromFleet(fleet);
  const hit = board[y * 10 + x] === 1;
  const commitment = await commitmentFor(fleet, salt);

  if (STUB) {
    await new Promise((r) => setTimeout(r, randomDelayMs()));
    const xHex = ("0x" + x.toString(16).padStart(64, "0")) as `0x${string}`;
    const yHex = ("0x" + y.toString(16).padStart(64, "0")) as `0x${string}`;
    const hitHex = ("0x" + (hit ? "01".padStart(64, "0") : "00".padStart(64, "0"))) as `0x${string}`;
    const ordered = canonicalFleet(fleet);
    const nextBitmap =
      hitBitmapBefore | (hit ? 1n << BigInt(y * 10 + x) : 0n);
    const sunkShipId = computeSunkShipIdFromFleet(ordered, nextBitmap, x, y, hit);
    const sunkHex = ("0x" +
      sunkShipId.toString(16).padStart(64, "0")) as `0x${string}`;
    return {
      hit,
      sunkShipId,
      proof: stubProofBytes(),
      publicInputs: [
        commitment,
        xHex,
        yHex,
        hitHex,
        ...bitmapToHexFields(hitBitmapBefore),
        sunkHex,
        ...stubAccumulator(),
      ],
      ms: Math.round(performance.now() - start),
    };
  }

  // Delegate real proving to the local Node sidecar. The canonical fleet
  // is sent so the sidecar can recompute the 100-cell board identically.
  const ordered = canonicalFleet(fleet);
  void commitment; // commitment is recomputed inside the sidecar and returned in publicInputs[0]
  const out = await postSidecar<{
    hit: boolean;
    sunkShipId: number;
    proof: `0x${string}`;
    publicInputs: `0x${string}`[];
    ms: number;
  }>("/prove-shot", {
    fleet: ordered,
    salt,
    x,
    y,
    hitBitmapBefore: hitBitmapBefore.toString(),
  });

  return {
    hit: out.hit,
    sunkShipId: out.sunkShipId ?? 0,
    proof: out.proof,
    publicInputs: out.publicInputs,
    ms: Math.round(performance.now() - start),
  };
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Clamp to the BN254 scalar field by masking the top 2 bits; this is far
  // below the actual field modulus but guarantees `salt` is a valid Field.
  // BN254 field modulus top byte is 0x30; mask to 0x0f to guarantee we're
  // safely below the field order. 0x3f was too loose (top 2 bits cleared still
  // allows 0x30-0x3f which can exceed the modulus).
  bytes[0] &= 0x0f;
  return toHex(bytes) as Hex;
}

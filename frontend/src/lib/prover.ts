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
    options?: { keccak?: boolean },
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

export async function proveBoardValidity(
  fleet: Fleet,
  salt: `0x${string}`,
): Promise<BoardProof> {
  const start = performance.now();
  const ordered = canonicalFleet(fleet);
  const commitment = await commitmentFor(fleet, salt);

  const shipX = ordered.map((s) => s.x.toString());
  const shipY = ordered.map((s) => s.y.toString());
  const shipO = ordered.map((s) => (s.orientation === "H" ? "0" : "1"));

  const { noir, backend } = await getBoardProver();
  const { witness } = await noir.execute({
    ship_x: shipX,
    ship_y: shipY,
    ship_o: shipO,
    salt,
    commitment,
  });
  const { proof, publicInputs } = await backend.generateProof(witness, {
    keccak: true,
  });

  return {
    commitment,
    proof: hexFromBytes(proof),
    publicInputs: publicInputs.map((p) => p as `0x${string}`),
    ms: Math.round(performance.now() - start),
  };
}

export async function proveShotResponse(
  fleet: Fleet,
  salt: `0x${string}`,
  x: number,
  y: number,
): Promise<ShotProof> {
  const start = performance.now();
  const board = boardFromFleet(fleet);
  const hit = board[y * 10 + x] === 1;
  const commitment = await commitmentFor(fleet, salt);

  const boardInput = board.map((v) => v.toString());
  const { noir, backend } = await getShotProver();
  const { witness } = await noir.execute({
    board: boardInput,
    salt,
    commitment,
    x: x.toString(),
    y: y.toString(),
    hit: hit ? "1" : "0",
  });
  const { proof, publicInputs } = await backend.generateProof(witness, {
    keccak: true,
  });

  return {
    hit,
    proof: hexFromBytes(proof),
    publicInputs: publicInputs.map((p) => p as `0x${string}`),
    ms: Math.round(performance.now() - start),
  };
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // Clamp to the BN254 scalar field by masking the top 2 bits; this is far
  // below the actual field modulus but guarantees `salt` is a valid Field.
  bytes[0] &= 0x3f;
  return toHex(bytes) as Hex;
}

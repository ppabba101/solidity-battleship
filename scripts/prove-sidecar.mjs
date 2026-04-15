#!/usr/bin/env node
// Local Node-side prover sidecar.
//
// Rationale: the browser build of @aztec/bb.js 5.0.0-nightly.20260324 produces
// UltraHonk proofs that revert the on-chain keccak HonkVerifier with
// SumcheckFailed (0x9fc3a218), while the Node build of the SAME bb.js version
// produces proofs that verify both natively and on the deployed Solidity
// verifier. See scripts/diag-*.mjs for the ground-truth diagnostics.
//
// This sidecar runs bb.js under Node (no worker/CRS skew) and exposes two
// HTTP endpoints used by frontend/src/lib/prover.ts when VITE_PROVER_MODE=real.
//
//   POST /prove-board
//   body: { fleet: [{id,length,x,y,orientation}], salt: "0x..." }
//   → { commitment, proof, publicInputs, ms }
//
//   POST /prove-shot
//   body: { fleet, salt, x, y }
//   → { hit, proof, publicInputs, ms }
//
// Both responses match the BoardProof / ShotProof shapes the frontend already
// expected from prover.ts. The frontend posts to the sidecar instead of
// invoking bb.js in the browser.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { UltraHonkBackend, Barretenberg, BarretenbergSync } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const BOARD_CIRCUIT = JSON.parse(
  readFileSync(resolve(ROOT, "circuits/board_validity/target/board_validity.json"), "utf8"),
);
const SHOT_CIRCUIT = JSON.parse(
  readFileSync(resolve(ROOT, "circuits/shot_response/target/shot_response.json"), "utf8"),
);

const STANDARD_FLEET = [
  { id: "carrier", length: 5 },
  { id: "battleship", length: 4 },
  { id: "cruiser", length: 3 },
  { id: "submarine", length: 3 },
  { id: "destroyer", length: 2 },
];

function shipCells(ship) {
  const out = [];
  for (let i = 0; i < ship.length; i++) {
    const x = ship.orientation === "H" ? ship.x + i : ship.x;
    const y = ship.orientation === "V" ? ship.y + i : ship.y;
    out.push({ x, y });
  }
  return out;
}
function boardFromFleet(fleet) {
  const cells = Array(100).fill(0);
  for (const ship of fleet) for (const { x, y } of shipCells(ship)) cells[y * 10 + x] = 1;
  return cells;
}
function canonicalFleet(fleet) {
  const byId = new Map(fleet.map((s) => [s.id, s]));
  return STANDARD_FLEET.map((spec) => {
    const s = byId.get(spec.id);
    if (!s) throw new Error(`fleet missing ship ${spec.id}`);
    return { ...s, length: spec.length };
  });
}
function bigintToField(v) {
  const out = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}
function hexFromBytes(bytes) {
  let s = "0x"; for (const b of bytes) s += b.toString(16).padStart(2, "0"); return s;
}

let bbApiPromise = null;
let bbSyncPromise = null;
let boardProverPromise = null;
let shotProverPromise = null;

async function getApi() {
  if (!bbApiPromise) {
    const threads = Math.max(1, Math.min(8, cpus().length - 1));
    bbApiPromise = Barretenberg.new({ threads });
  }
  return bbApiPromise;
}

async function getSync() {
  if (!bbSyncPromise) bbSyncPromise = BarretenbergSync.initSingleton();
  return bbSyncPromise;
}
async function getBoardProver() {
  if (!boardProverPromise) {
    boardProverPromise = (async () => {
      const api = await getApi();
      const backend = new UltraHonkBackend(BOARD_CIRCUIT.bytecode, api);
      const noir = new Noir(BOARD_CIRCUIT);
      return { noir, backend };
    })();
  }
  return boardProverPromise;
}
async function getShotProver() {
  if (!shotProverPromise) {
    shotProverPromise = (async () => {
      const api = await getApi();
      const backend = new UltraHonkBackend(SHOT_CIRCUIT.bytecode, api);
      const noir = new Noir(SHOT_CIRCUIT);
      return { noir, backend };
    })();
  }
  return shotProverPromise;
}

async function commitmentFor(fleet, saltHex) {
  const sync = await getSync();
  const board = boardFromFleet(fleet);
  const inputs = new Array(101);
  for (let i = 0; i < 100; i++) inputs[i] = bigintToField(BigInt(board[i]));
  inputs[100] = bigintToField(BigInt(saltHex));
  const { hash } = sync.pedersenHash({ inputs, hashIndex: 0 });
  return hexFromBytes(hash);
}

async function proveBoard({ fleet, salt }) {
  const t0 = Date.now();
  const ordered = canonicalFleet(fleet);
  const commitment = await commitmentFor(fleet, salt);
  const shipX = ordered.map((s) => s.x.toString());
  const shipY = ordered.map((s) => s.y.toString());
  const shipO = ordered.map((s) => (s.orientation === "H" ? "0" : "1"));
  const { noir, backend } = await getBoardProver();
  const { witness } = await noir.execute({ ship_x: shipX, ship_y: shipY, ship_o: shipO, salt, commitment });
  const { proof, publicInputs } = await backend.generateProof(witness, { verifierTarget: "evm" });
  return { commitment, proof: hexFromBytes(proof), publicInputs, ms: Date.now() - t0 };
}

async function proveShot({ fleet, salt, x, y }) {
  const t0 = Date.now();
  const board = boardFromFleet(fleet);
  const hit = board[y * 10 + x] === 1;
  const commitment = await commitmentFor(fleet, salt);
  const { noir, backend } = await getShotProver();
  const { witness } = await noir.execute({
    board: board.map((v) => v.toString()),
    salt,
    commitment,
    x: x.toString(),
    y: y.toString(),
    hit: hit ? "1" : "0",
  });
  const { proof, publicInputs } = await backend.generateProof(witness, { verifierTarget: "evm" });
  return { hit, proof: hexFromBytes(proof), publicInputs, ms: Date.now() - t0 };
}

function readJson(req) {
  return new Promise((res, rej) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { res(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (e) { rej(e); }
    });
    req.on("error", rej);
  });
}
function send(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { send(res, 204, {}); return; }
  try {
    if (req.url === "/healthz") { send(res, 200, { ok: true }); return; }
    if (req.url === "/prove-board" && req.method === "POST") {
      const body = await readJson(req);
      const out = await proveBoard(body);
      console.log(`[sidecar] prove-board ok ms=${out.ms} commitment=${out.commitment.slice(0, 10)}…`);
      send(res, 200, out);
      return;
    }
    if (req.url === "/prove-shot" && req.method === "POST") {
      const body = await readJson(req);
      const out = await proveShot(body);
      console.log(`[sidecar] prove-shot ok ms=${out.ms} hit=${out.hit}`);
      send(res, 200, out);
      return;
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    console.error("[sidecar] error:", e?.stack || e);
    send(res, 500, { error: String(e?.message || e) });
  }
});

const PORT = Number(process.env.SIDECAR_PORT || 8899);
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[sidecar] listening on http://127.0.0.1:${PORT}`);
});

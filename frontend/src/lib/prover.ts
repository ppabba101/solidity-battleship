import { keccak256, toHex, stringToBytes } from "viem";
import type { Fleet } from "./gameState";
import { shipCells } from "./gameState";

// TODO: replace with @aztec/bb.js once circuit is compiled in Lane A.

export interface BoardProof {
  commitment: `0x${string}`;
  proof: `0x${string}`;
  ms: number;
}

export interface ShotProof {
  hit: boolean;
  proof: `0x${string}`;
  ms: number;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fakeProvingTime(): number {
  return 3000 + Math.floor(Math.random() * 2000);
}

export async function proveBoardValidity(
  fleet: Fleet,
  salt: `0x${string}`,
): Promise<BoardProof> {
  const start = performance.now();
  const ms = fakeProvingTime();
  await delay(ms);
  const cells = Array(100).fill(0);
  for (const ship of fleet) {
    for (const { x, y } of shipCells(ship)) {
      cells[y * 10 + x] = 1;
    }
  }
  const commitment = keccak256(stringToBytes(cells.join("") + salt));
  const proof = ("0x" + "00".repeat(64)) as `0x${string}`;
  return { commitment, proof, ms: Math.round(performance.now() - start) };
}

export async function proveShotResponse(
  fleet: Fleet,
  _salt: `0x${string}`,
  x: number,
  y: number,
): Promise<ShotProof> {
  const start = performance.now();
  const ms = fakeProvingTime();
  await delay(ms);
  let hit = false;
  for (const ship of fleet) {
    for (const c of shipCells(ship)) {
      if (c.x === x && c.y === y) {
        hit = true;
        break;
      }
    }
  }
  const proof = ("0x" + "00".repeat(64)) as `0x${string}`;
  return { hit, proof, ms: Math.round(performance.now() - start) };
}

export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

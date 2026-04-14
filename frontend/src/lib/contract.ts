import {
  getPublicClient,
  getWalletClient,
  type PlayerIndex,
} from "./burnerWallets";
import { foundry } from "viem/chains";

export const BATTLESHIP_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_boardVerifier", type: "address" },
      { name: "_shotVerifier", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [{ name: "opponent", type: "address" }],
    outputs: [{ name: "gameId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "commitBoard",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fireShot",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "x", type: "uint8" },
      { name: "y", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "respondShot",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "hit", type: "bool" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimTimeoutWin",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "nextGameId",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "GameCreated",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "opponent", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BoardCommitted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "commitment", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ShotFired",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "shooter", type: "address", indexed: true },
      { name: "x", type: "uint8", indexed: false },
      { name: "y", type: "uint8", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ShotResponded",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "responder", type: "address", indexed: true },
      { name: "x", type: "uint8", indexed: false },
      { name: "y", type: "uint8", indexed: false },
      { name: "hit", type: "bool", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameWon",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

const DEFAULT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;

export const CONTRACT_ADDRESS: `0x${string}` = ((import.meta.env
  .VITE_BATTLESHIP_ADDRESS as `0x${string}` | undefined) ??
  DEFAULT_ADDRESS) as `0x${string}`;

async function waitTx(hash: `0x${string}`) {
  const pub = getPublicClient();
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

export async function createGame(
  player: PlayerIndex,
  opponentAddress: `0x${string}`,
): Promise<{ hash: `0x${string}`; gameId: bigint }> {
  const wallet = getWalletClient(player);
  const pub = getPublicClient();
  // Simulate to get the return value (gameId)
  const { request, result } = await pub.simulateContract({
    account: wallet.account!,
    address: CONTRACT_ADDRESS,
    abi: BATTLESHIP_ABI,
    functionName: "createGame",
    args: [opponentAddress],
    chain: foundry,
  });
  const hash = await wallet.writeContract(request);
  await waitTx(hash);
  return { hash, gameId: result as bigint };
}

export async function commitBoard(
  player: PlayerIndex,
  gameId: bigint,
  commitment: `0x${string}`,
  proof: `0x${string}`,
): Promise<`0x${string}`> {
  const wallet = getWalletClient(player);
  const hash = await wallet.writeContract({
    account: wallet.account!,
    address: CONTRACT_ADDRESS,
    abi: BATTLESHIP_ABI,
    functionName: "commitBoard",
    args: [gameId, commitment, proof],
    chain: foundry,
  });
  return waitTx(hash);
}

export async function fireShot(
  player: PlayerIndex,
  gameId: bigint,
  x: number,
  y: number,
): Promise<`0x${string}`> {
  const wallet = getWalletClient(player);
  const hash = await wallet.writeContract({
    account: wallet.account!,
    address: CONTRACT_ADDRESS,
    abi: BATTLESHIP_ABI,
    functionName: "fireShot",
    args: [gameId, x, y],
    chain: foundry,
  });
  return waitTx(hash);
}

export async function respondShot(
  player: PlayerIndex,
  gameId: bigint,
  hit: boolean,
  proof: `0x${string}`,
): Promise<`0x${string}`> {
  const wallet = getWalletClient(player);
  const hash = await wallet.writeContract({
    account: wallet.account!,
    address: CONTRACT_ADDRESS,
    abi: BATTLESHIP_ABI,
    functionName: "respondShot",
    args: [gameId, hit, proof],
    chain: foundry,
  });
  return waitTx(hash);
}

export type GameEventHandlers = {
  onShotFired?: (args: {
    gameId: bigint;
    shooter: `0x${string}`;
    x: number;
    y: number;
  }) => void;
  onShotResponded?: (args: {
    gameId: bigint;
    responder: `0x${string}`;
    x: number;
    y: number;
    hit: boolean;
  }) => void;
  onGameWon?: (args: { gameId: bigint; winner: `0x${string}` }) => void;
};

export function watchGameEvents(handlers: GameEventHandlers): () => void {
  const pub = getPublicClient();
  const unsubs: Array<() => void> = [];

  unsubs.push(
    pub.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: BATTLESHIP_ABI,
      eventName: "ShotFired",
      onLogs: (logs) => {
        for (const l of logs) {
          const a = l.args as {
            gameId?: bigint;
            shooter?: `0x${string}`;
            x?: number;
            y?: number;
          };
          handlers.onShotFired?.({
            gameId: a.gameId!,
            shooter: a.shooter!,
            x: Number(a.x),
            y: Number(a.y),
          });
        }
      },
    }),
  );

  unsubs.push(
    pub.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: BATTLESHIP_ABI,
      eventName: "ShotResponded",
      onLogs: (logs) => {
        for (const l of logs) {
          const a = l.args as {
            gameId?: bigint;
            responder?: `0x${string}`;
            x?: number;
            y?: number;
            hit?: boolean;
          };
          handlers.onShotResponded?.({
            gameId: a.gameId!,
            responder: a.responder!,
            x: Number(a.x),
            y: Number(a.y),
            hit: !!a.hit,
          });
        }
      },
    }),
  );

  unsubs.push(
    pub.watchContractEvent({
      address: CONTRACT_ADDRESS,
      abi: BATTLESHIP_ABI,
      eventName: "GameWon",
      onLogs: (logs) => {
        for (const l of logs) {
          const a = l.args as { gameId?: bigint; winner?: `0x${string}` };
          handlers.onGameWon?.({ gameId: a.gameId!, winner: a.winner! });
        }
      },
    }),
  );

  return () => {
    for (const u of unsubs) u();
  };
}

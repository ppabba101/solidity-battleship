import {
  getPublicClient,
  getWalletClient,
  type PlayerIndex,
} from "./burnerWallets";
import { foundry } from "viem/chains";
import { decodeEventLog } from "viem";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;
import { emit } from "./vizBus";

type TxMethod =
  | "createGame"
  | "joinGame"
  | "commitBoard"
  | "fireShot"
  | "respondShot"
  | "claimPot"
  | "cancelGame"
  | "proposeDraw";

function emitTxSent(method: TxMethod, hash: `0x${string}`) {
  emit({ kind: "tx_sent", payload: { method, hash } });
}

async function emitTxMined(
  method: TxMethod,
  hash: `0x${string}`,
  eventName?: string,
  publicClient?: AnyClient,
) {
  try {
    const pub = publicClient ?? getPublicClient();
    const receipt = await pub.getTransactionReceipt({ hash });
    emit({
      kind: "tx_mined",
      payload: {
        method,
        hash,
        gasUsed: Number(receipt.gasUsed),
        status: receipt.status,
      },
    });
    if (eventName) {
      emit({ kind: "event_log", payload: { name: eventName, txHash: hash } });
    }
  } catch {
    /* receipt fetch failed; already mined by waitTx */
  }
}

export const BATTLESHIP_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_boardVerifier", type: "address" },
      { name: "_shotVerifier", type: "address" },
      { name: "_minStake", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [
      { name: "opponent", type: "address" },
      { name: "clockSeconds", type: "uint32" },
      { name: "stakeWei", type: "uint256" },
    ],
    outputs: [{ name: "gameId", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "joinGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "claimPot",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "proposeDraw",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawDrawProposal",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "minStake",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "p0", type: "address" },
      { name: "p1", type: "address" },
      { name: "state", type: "uint8" },
      { name: "turn", type: "uint8" },
      { name: "shotPending", type: "bool" },
      { name: "pendingX", type: "uint8" },
      { name: "pendingY", type: "uint8" },
      { name: "hits0", type: "uint8" },
      { name: "hits1", type: "uint8" },
      { name: "winner", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameEscrow",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "stakeWei", type: "uint256" },
      { name: "pot", type: "uint256" },
      { name: "paidOut", type: "bool" },
      { name: "clockSeconds", type: "uint32" },
      { name: "lastActionAt", type: "uint64" },
      { name: "createdAt", type: "uint64" },
      { name: "drawProposed0", type: "bool" },
      { name: "drawProposed1", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "commitBoard",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
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
      { name: "publicInputs", type: "bytes32[]" },
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
    type: "function",
    name: "commitmentOf",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "playerIdx", type: "uint8" },
    ],
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hitBitmapOf",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "playerIdx", type: "uint8" },
    ],
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
      { name: "clockSeconds", type: "uint32", indexed: false },
      { name: "stakeWei", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameJoined",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PotPaid",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "StakeRefunded",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DrawProposed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "DrawWithdrawn",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "by", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "GameCanceled",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
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
    name: "ShipSunk",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "responder", type: "address", indexed: true },
      { name: "shipId", type: "uint8", indexed: false },
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

/**
 * Explicit contract context. WP6+ pipes one of these through GameShell so
 * the same call sites work for the local-hotseat anvil burner path AND the
 * Privy-backed Base Sepolia path.
 */
export interface ContractCtx {
  address: `0x${string}`;
  // viem WalletClient — left as `any` to dodge generics drift across
  // transitive viem versions (Privy pulls a second copy of viem).
  walletClient: AnyClient;
  publicClient: AnyClient;
  // viem Chain — passed to writeContract for the simulate/sign flow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain: any;
}

async function waitTxOn(pub: AnyClient, hash: `0x${string}`) {
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

function localCtx(player: PlayerIndex): ContractCtx {
  return {
    address: CONTRACT_ADDRESS,
    walletClient: getWalletClient(player),
    publicClient: getPublicClient(),
    chain: foundry,
  };
}

export async function createGame(
  player: PlayerIndex,
  opponentAddress: `0x${string}`,
  opts?: {
    ctx?: ContractCtx;
    clockSeconds?: number;
    stakeWei?: bigint;
  },
): Promise<{ hash: `0x${string}`; gameId: bigint }> {
  const ctx = opts?.ctx ?? localCtx(player);
  const clockSeconds = opts?.clockSeconds ?? 60;
  const stakeWei = opts?.stakeWei ?? 0n;
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  // Simulate to capture the return value (gameId). On Sepolia the simulate
  // call is also our pre-flight revert guard for "value mismatch" / "stake
  // below min" before we ask Privy to sign.
  const { request, result } = await pub.simulateContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "createGame",
    args: [opponentAddress, clockSeconds, stakeWei],
    value: stakeWei,
    chain: ctx.chain,
  });
  const hash = (await wallet.writeContract(request)) as `0x${string}`;
  emitTxSent("createGame", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("createGame", hash, "GameCreated", pub);
  // Some Privy/wagmi builds don't return the `result` field; in that case
  // pull the gameId from the GameCreated event log on the receipt.
  let gameId = result as bigint | undefined;
  if (gameId === undefined) {
    const receipt = await pub.getTransactionReceipt({ hash });
    for (const log of receipt.logs ?? []) {
      try {
        const decoded = decodeEventLog({
          abi: BATTLESHIP_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "GameCreated") {
          gameId = (decoded.args as { gameId: bigint }).gameId;
          break;
        }
      } catch {
        /* not our event */
      }
    }
  }
  if (gameId === undefined) throw new Error("createGame: no gameId in receipt");
  return { hash, gameId };
}

export async function joinGame(
  ctx: ContractCtx,
  gameId: bigint,
  stakeWei: bigint,
): Promise<`0x${string}`> {
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const { request } = await pub.simulateContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "joinGame",
    args: [gameId],
    value: stakeWei,
    chain: ctx.chain,
  });
  const hash = (await wallet.writeContract(request)) as `0x${string}`;
  emitTxSent("joinGame", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("joinGame", hash, "GameJoined", pub);
  return hash;
}

export async function claimPot(
  ctx: ContractCtx,
  gameId: bigint,
): Promise<`0x${string}`> {
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const { request } = await pub.simulateContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "claimPot",
    args: [gameId],
    chain: ctx.chain,
  });
  const hash = (await wallet.writeContract(request)) as `0x${string}`;
  emitTxSent("claimPot", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("claimPot", hash, "PotPaid", pub);
  return hash;
}

export async function cancelGame(
  ctx: ContractCtx,
  gameId: bigint,
): Promise<`0x${string}`> {
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const { request } = await pub.simulateContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "cancelGame",
    args: [gameId],
    chain: ctx.chain,
  });
  const hash = (await wallet.writeContract(request)) as `0x${string}`;
  emitTxSent("cancelGame", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("cancelGame", hash, "GameCanceled", pub);
  return hash;
}

export async function proposeDraw(
  ctx: ContractCtx,
  gameId: bigint,
): Promise<`0x${string}`> {
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const { request } = await pub.simulateContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "proposeDraw",
    args: [gameId],
    chain: ctx.chain,
  });
  const hash = (await wallet.writeContract(request)) as `0x${string}`;
  emitTxSent("proposeDraw", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("proposeDraw", hash, "DrawProposed", pub);
  return hash;
}

export interface GameEscrow {
  stakeWei: bigint;
  pot: bigint;
  paidOut: boolean;
  clockSeconds: number;
  lastActionAt: bigint;
  createdAt: bigint;
  drawProposed: [boolean, boolean];
}

export async function readGameEscrow(
  ctx: { address: `0x${string}`; publicClient: AnyClient },
  gameId: bigint,
): Promise<GameEscrow> {
  const tup = (await ctx.publicClient.readContract({
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "getGameEscrow",
    args: [gameId],
  })) as readonly [bigint, bigint, boolean, number, bigint, bigint, boolean, boolean];
  return {
    stakeWei: tup[0],
    pot: tup[1],
    paidOut: tup[2],
    clockSeconds: Number(tup[3]),
    lastActionAt: tup[4],
    createdAt: tup[5],
    drawProposed: [tup[6], tup[7]],
  };
}

export interface GameView {
  p0: `0x${string}`;
  p1: `0x${string}`;
  state: number;
  turn: number;
  shotPending: boolean;
  pendingX: number;
  pendingY: number;
  hits0: number;
  hits1: number;
  winner: `0x${string}`;
}

export async function readGame(
  ctx: { address: `0x${string}`; publicClient: AnyClient },
  gameId: bigint,
): Promise<GameView> {
  const tup = (await ctx.publicClient.readContract({
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "getGame",
    args: [gameId],
  })) as readonly [
    `0x${string}`, `0x${string}`, number, number, boolean,
    number, number, number, number, `0x${string}`,
  ];
  return {
    p0: tup[0],
    p1: tup[1],
    state: Number(tup[2]),
    turn: Number(tup[3]),
    shotPending: tup[4],
    pendingX: Number(tup[5]),
    pendingY: Number(tup[6]),
    hits0: Number(tup[7]),
    hits1: Number(tup[8]),
    winner: tup[9],
  };
}

export async function commitBoard(
  player: PlayerIndex,
  gameId: bigint,
  commitment: `0x${string}`,
  proof: `0x${string}`,
  publicInputs: readonly `0x${string}`[],
  ctxOpt?: ContractCtx,
): Promise<`0x${string}`> {
  const ctx = ctxOpt ?? localCtx(player);
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const hash = (await wallet.writeContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "commitBoard",
    args: [gameId, commitment, proof, publicInputs],
    chain: ctx.chain,
  })) as `0x${string}`;
  emitTxSent("commitBoard", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("commitBoard", hash, "BoardCommitted", pub);
  return hash;
}

export async function fireShot(
  player: PlayerIndex,
  gameId: bigint,
  x: number,
  y: number,
  ctxOpt?: ContractCtx,
): Promise<`0x${string}`> {
  const ctx = ctxOpt ?? localCtx(player);
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const hash = (await wallet.writeContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "fireShot",
    args: [gameId, x, y],
    chain: ctx.chain,
  })) as `0x${string}`;
  emitTxSent("fireShot", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("fireShot", hash, "ShotFired", pub);
  return hash;
}

export async function respondShot(
  player: PlayerIndex,
  gameId: bigint,
  hit: boolean,
  proof: `0x${string}`,
  publicInputs: readonly `0x${string}`[],
  ctxOpt?: ContractCtx,
): Promise<`0x${string}`> {
  const ctx = ctxOpt ?? localCtx(player);
  const wallet = ctx.walletClient;
  const pub = ctx.publicClient;
  const hash = (await wallet.writeContract({
    account: wallet.account!,
    address: ctx.address,
    abi: BATTLESHIP_ABI,
    functionName: "respondShot",
    args: [gameId, hit, proof, publicInputs],
    chain: ctx.chain,
  })) as `0x${string}`;
  emitTxSent("respondShot", hash);
  await waitTxOn(pub, hash);
  await emitTxMined("respondShot", hash, "ShotResponded", pub);
  return hash;
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
  onShipSunk?: (args: {
    gameId: bigint;
    responder: `0x${string}`;
    shipId: number;
  }) => void;
  onGameWon?: (args: { gameId: bigint; winner: `0x${string}` }) => void;
};

export async function readHitBitmap(
  gameId: bigint,
  playerIdx: 0 | 1,
  ctxOpt?: { address: `0x${string}`; publicClient: AnyClient },
): Promise<bigint> {
  const pub = ctxOpt?.publicClient ?? getPublicClient();
  const address = ctxOpt?.address ?? CONTRACT_ADDRESS;
  const v = (await pub.readContract({
    address,
    abi: BATTLESHIP_ABI,
    functionName: "hitBitmapOf",
    args: [gameId, playerIdx],
  })) as bigint;
  return v;
}

export function watchGameEvents(
  handlers: GameEventHandlers,
  ctxOpt?: { address: `0x${string}`; publicClient: AnyClient },
): () => void {
  const pub = ctxOpt?.publicClient ?? getPublicClient();
  const watchAddress = ctxOpt?.address ?? CONTRACT_ADDRESS;
  const unsubs: Array<() => void> = [];

  unsubs.push(
    pub.watchContractEvent({
      address: watchAddress,
      abi: BATTLESHIP_ABI,
      eventName: "ShotFired",
      onLogs: (logs: AnyClient[]) => {
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
      address: watchAddress,
      abi: BATTLESHIP_ABI,
      eventName: "ShotResponded",
      onLogs: (logs: AnyClient[]) => {
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
      address: watchAddress,
      abi: BATTLESHIP_ABI,
      eventName: "ShipSunk",
      onLogs: (logs: AnyClient[]) => {
        for (const l of logs) {
          const a = l.args as {
            gameId?: bigint;
            responder?: `0x${string}`;
            shipId?: number;
          };
          handlers.onShipSunk?.({
            gameId: a.gameId!,
            responder: a.responder!,
            shipId: Number(a.shipId),
          });
        }
      },
    }),
  );

  unsubs.push(
    pub.watchContractEvent({
      address: watchAddress,
      abi: BATTLESHIP_ABI,
      eventName: "GameWon",
      onLogs: (logs: AnyClient[]) => {
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

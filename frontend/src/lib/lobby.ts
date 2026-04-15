import { zeroAddress } from "viem";

// We intentionally use `any` for the public client to sidestep viem version
// skew: transitive deps (Privy, etc.) can pull a second viem release whose
// generics diverge, triggering a false-positive TS2322 at callsites. We only
// need .getLogs() structurally here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LobbyClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawLog = any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenGame {
  gameId: bigint;
  creator: `0x${string}`;
  createdAtBlock: bigint;
  clockSeconds: number;
  stakeWei: bigint;
}

// ---------------------------------------------------------------------------
// ABI fragments — only the events we need here
// ---------------------------------------------------------------------------

const GAME_CREATED_EVENT = {
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
} as const;

const GAME_JOINED_EVENT = {
  type: "event",
  name: "GameJoined",
  inputs: [
    { name: "gameId", type: "uint256", indexed: true },
    { name: "player", type: "address", indexed: true },
  ],
  anonymous: false,
} as const;

// ---------------------------------------------------------------------------
// Exponential backoff helper
// ---------------------------------------------------------------------------

interface RetryOptions {
  baseMs?: number;
  factor?: number;
  maxMs?: number;
  maxRetries?: number;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { baseMs = 1000, factor = 2, maxMs = 30_000, maxRetries = 5 } = opts;
  let attempt = 0;
  let delayMs = baseMs;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) throw err;
      await new Promise((res) => setTimeout(res, delayMs));
      delayMs = Math.min(delayMs * factor, maxMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

const MAX_GAMES = 250;
const BLOCK_WINDOW = 4500n;

export async function fetchOpenGames(opts: {
  contractAddress: `0x${string}`;
  publicClient: LobbyClient;
  currentBlock: bigint;
}): Promise<OpenGame[]> {
  const { contractAddress, publicClient, currentBlock } = opts;
  const fromBlock = currentBlock > BLOCK_WINDOW ? currentBlock - BLOCK_WINDOW : 0n;

  // 1. Fetch GameCreated logs with backoff
  const createdLogs: RawLog[] = await withRetry<RawLog[]>(() =>
    publicClient.getLogs({
      address: contractAddress,
      event: GAME_CREATED_EVENT,
      fromBlock,
      toBlock: currentBlock,
    }),
  );

  // 2. Filter to open games (opponent == zeroAddress)
  const openCandidates = createdLogs.filter(
    (log) =>
      log.args.opponent?.toLowerCase() === zeroAddress.toLowerCase(),
  );

  // 3. Fetch GameJoined logs to exclude already-joined games
  const joinedLogs: RawLog[] = await withRetry<RawLog[]>(() =>
    publicClient.getLogs({
      address: contractAddress,
      event: GAME_JOINED_EVENT,
      fromBlock,
      toBlock: currentBlock,
    }),
  );

  const joinedGameIds = new Set<bigint>(
    joinedLogs
      .map((log) => log.args.gameId)
      .filter((id): id is bigint => id !== undefined),
  );

  // 4. Exclude joined games
  const unjoined = openCandidates.filter(
    (log) => log.args.gameId !== undefined && !joinedGameIds.has(log.args.gameId),
  );

  // 5. Map to OpenGame, sort by createdAtBlock desc, cap at 250
  //
  // NOTE: We intentionally skip a multicall to verify state == Created for
  // each candidate to avoid complexity and extra RPC round-trips. The result
  // may include stale games whose state has advanced (e.g. cancelled) but
  // whose GameJoined event wasn't emitted. WP6 rendering should treat this
  // gracefully (e.g. show a "join failed" toast if joinGame reverts).
  const games: OpenGame[] = unjoined
    .map((log) => ({
      gameId: log.args.gameId!,
      creator: log.args.creator!,
      createdAtBlock: log.blockNumber ?? 0n,
      clockSeconds: Number(log.args.clockSeconds ?? 0),
      stakeWei: log.args.stakeWei ?? 0n,
    }))
    .sort((a, b) => (a.createdAtBlock < b.createdAtBlock ? 1 : -1))
    .slice(0, MAX_GAMES);

  return games;
}

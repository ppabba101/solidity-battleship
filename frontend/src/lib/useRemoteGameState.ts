import { useCallback, useEffect, useRef, useState } from "react";
import {
  BATTLESHIP_ABI,
  readGame,
  readHitBitmap,
  watchGameEvents,
  type ContractCtx,
} from "./contract";
import type { Seat } from "./useSeat";

const ZERO = "0x0000000000000000000000000000000000000000";

export interface RemoteGameState {
  phase: "placement" | "playing" | "finished";
  state: number; // GameState enum: 0 Created, 1 Committed, 2 Playing, 3 Finished
  turn: Seat;
  shotPending: boolean;
  pendingX: number;
  pendingY: number;
  myHits: number; // hits I have landed on opponent
  opponentHits: number; // hits opponent has landed on me
  myHitBitmap: bigint; // cells on MY board that are hit (defense view)
  opponentHitBitmap: bigint; // cells on OPPONENT'S board that are hit (offense view)
  winner: `0x${string}`;
  committedMe: boolean;
  committedThem: boolean;
}

export function useRemoteGameState(opts: {
  ctx: ContractCtx | null;
  gameId: bigint | null;
  mySeat: Seat | null;
}): {
  state: RemoteGameState | null;
  isLoading: boolean;
  refetch: () => void;
} {
  const { ctx, gameId, mySeat } = opts;
  const [state, setState] = useState<RemoteGameState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    tickRef.current += 1;
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!ctx || gameId === null || mySeat === null) {
      setState(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const readCtx = { address: ctx.address, publicClient: ctx.publicClient };
    const opponentSeat: Seat = mySeat === 0 ? 1 : 0;

    async function poll() {
      try {
        const g = await readGame(readCtx, gameId!);
        const [bm0, bm1] = await Promise.all([
          readHitBitmap(gameId!, 0, readCtx),
          readHitBitmap(gameId!, 1, readCtx),
        ]);
        // Determine whether each player has committed by reading commitmentOf.
        // Once state >= Committed (1) both have committed; below that we have
        // to check each slot individually for the "I committed, waiting on
        // opponent" UI.
        let committedMe = false;
        let committedThem = false;
        if (g.state >= 1) {
          committedMe = true;
          committedThem = true;
        } else {
          try {
            const [c0, c1] = (await Promise.all([
              ctx!.publicClient.readContract({
                address: ctx!.address,
                abi: BATTLESHIP_ABI,
                functionName: "commitmentOf",
                args: [gameId!, 0],
              }),
              ctx!.publicClient.readContract({
                address: ctx!.address,
                abi: BATTLESHIP_ABI,
                functionName: "commitmentOf",
                args: [gameId!, 1],
              }),
            ])) as [`0x${string}`, `0x${string}`];
            const empty =
              "0x0000000000000000000000000000000000000000000000000000000000000000";
            const c0set = c0.toLowerCase() !== empty;
            const c1set = c1.toLowerCase() !== empty;
            committedMe = mySeat === 0 ? c0set : c1set;
            committedThem = mySeat === 0 ? c1set : c0set;
          } catch {
            /* commitmentOf may not be available; fall back to false */
          }
        }
        if (cancelled) return;
        const phase: RemoteGameState["phase"] =
          g.state >= 3 ? "finished" : g.state >= 2 ? "playing" : "placement";
        setState({
          phase,
          state: g.state,
          turn: (g.turn === 1 ? 1 : 0) as Seat,
          shotPending: g.shotPending,
          pendingX: g.pendingX,
          pendingY: g.pendingY,
          myHits: mySeat === 0 ? g.hits0 : g.hits1,
          opponentHits: mySeat === 0 ? g.hits1 : g.hits0,
          // hitBitmapOf(playerIdx) returns the bitmap on PLAYER[playerIdx]'s
          // OWN board. So the "hits on my board" = bitmap of mySeat.
          myHitBitmap: mySeat === 0 ? bm0 : bm1,
          opponentHitBitmap: opponentSeat === 0 ? bm0 : bm1,
          winner: g.winner,
          committedMe,
          committedThem,
        });
        setIsLoading(false);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }
    poll();
    const id = window.setInterval(poll, 2000);

    // Subscribe to chain events to retrigger poll on opponent action.
    let stop: (() => void) | undefined;
    try {
      stop = watchGameEvents(
        {
          onShotFired: () => poll(),
          onShotResponded: () => poll(),
          onShipSunk: () => poll(),
          onGameWon: () => poll(),
        },
        { address: ctx.address, publicClient: ctx.publicClient },
      );
    } catch {
      /* event subscription optional */
    }

    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (stop) stop();
    };
  }, [ctx, gameId, mySeat, tick]);

  return { state, isLoading, refetch };
}

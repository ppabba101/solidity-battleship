import { useEffect, useState } from "react";
import { readGame, readGameEscrow, type ContractCtx } from "./contract";

export type Seat = 0 | 1;

export type SeatStatus =
  | { kind: "loading" }
  | {
      kind: "joinable";
      creatorAddress: `0x${string}`;
      stakeWei: bigint;
      clockSeconds: number;
    }
  | { kind: "seated"; seat: Seat; opponentAddress: `0x${string}` }
  | { kind: "spectator" }
  | { kind: "not-found" }
  | { kind: "error"; error: Error };

const ZERO = "0x0000000000000000000000000000000000000000";

function eqAddr(
  a: `0x${string}` | null | undefined,
  b: `0x${string}` | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function useSeat(opts: {
  ctx: ContractCtx | null;
  gameId: bigint | null;
  myAddress: `0x${string}` | null;
}): { status: SeatStatus; refetch: () => void } {
  const { ctx, gameId, myAddress } = opts;
  const [status, setStatus] = useState<SeatStatus>({ kind: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ctx || gameId === null) {
      setStatus({ kind: "loading" });
      return;
    }
    let cancelled = false;
    const readCtx = { address: ctx.address, publicClient: ctx.publicClient };
    async function poll() {
      try {
        const g = await readGame(readCtx, gameId!);
        if (cancelled) return;
        // Game truly missing returns p0 == zero address.
        if (eqAddr(g.p0, ZERO as `0x${string}`)) {
          setStatus({ kind: "not-found" });
          return;
        }
        if (eqAddr(myAddress, g.p0)) {
          setStatus({
            kind: "seated",
            seat: 0,
            opponentAddress: g.p1,
          });
          return;
        }
        if (eqAddr(myAddress, g.p1)) {
          setStatus({
            kind: "seated",
            seat: 1,
            opponentAddress: g.p0,
          });
          return;
        }
        // Slot 1 still open?
        if (eqAddr(g.p1, ZERO as `0x${string}`)) {
          // Pull stake/clock from escrow for the join CTA.
          try {
            const e = await readGameEscrow(readCtx, gameId!);
            if (cancelled) return;
            setStatus({
              kind: "joinable",
              creatorAddress: g.p0,
              stakeWei: e.stakeWei,
              clockSeconds: e.clockSeconds,
            });
          } catch (err) {
            if (cancelled) return;
            setStatus({
              kind: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            });
          }
          return;
        }
        // Both slots taken, neither is me → spectator.
        setStatus({ kind: "spectator" });
      } catch (err) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
    poll();
    const id = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ctx, gameId, myAddress, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}

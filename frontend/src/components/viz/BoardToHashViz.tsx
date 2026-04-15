import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Fleet } from "../../lib/gameState";
import { shipCells, idx as cellIdx } from "../../lib/gameState";

// Shows the current player's real fleet as an orange grid and streams the
// real pedersen commitment hex once it has been proven. Props-driven so
// switching players re-animates with the other player's values; going back
// to placement (null commitment) hides the viz.

const CELL = 18;
const GRID = 10;

export interface BoardToHashVizProps {
  fleet: Fleet;
  commitment: `0x${string}` | null;
  salt: `0x${string}`;
}

export function BoardToHashViz({ fleet, commitment, salt }: BoardToHashVizProps) {
  const [lit, setLit] = useState<number[]>([]);
  const [byteCursor, setByteCursor] = useState(0);

  // Derive the real ship cells from the fleet.
  const shipCellIndices = fleet.flatMap((ship) =>
    shipCells(ship).map((c) => cellIdx(c.x, c.y)),
  );

  // Re-run the animation whenever the real commitment changes (including
  // clearing to null). Tied to commitment + fleet reference so switching
  // players refreshes everything.
  useEffect(() => {
    if (!commitment) {
      setLit([]);
      setByteCursor(0);
      return;
    }
    setLit([]);
    setByteCursor(0);
    const timers: number[] = [];
    shipCellIndices.forEach((cell, i) => {
      timers.push(
        window.setTimeout(() => {
          setLit((l) => [...l, cell]);
        }, i * 90),
      );
    });
    timers.push(
      window.setTimeout(() => {
        const id = window.setInterval(() => {
          setByteCursor((c) => {
            const next = c + 4;
            if (next >= commitment.length) {
              window.clearInterval(id);
              return commitment.length;
            }
            return next;
          });
        }, 40);
        timers.push(id);
      }, shipCellIndices.length * 90),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitment]);

  if (!commitment) return null;

  return (
    <div className="p-4 rounded-xl border border-navy-light bg-navy/80 font-mono text-[10px]">
      <div className="text-[10px] uppercase tracking-widest text-orange font-semibold mb-3">
        pedersen(board ∥ salt)
      </div>
      <div className="flex items-start gap-3">
        <svg
          width={CELL * GRID + 2}
          height={CELL * GRID + 2}
          className="shrink-0"
        >
          {Array.from({ length: GRID * GRID }).map((_, i) => {
            const x = (i % GRID) * CELL + 1;
            const y = Math.floor(i / GRID) * CELL + 1;
            const on = lit.includes(i);
            return (
              <motion.rect
                key={i}
                x={x}
                y={y}
                width={CELL - 2}
                height={CELL - 2}
                rx={2}
                fill={on ? "#F97316" : "#13315C"}
                animate={{ opacity: on ? 1 : 0.4 }}
              />
            );
          })}
        </svg>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">
            commitment
          </div>
          <div className="text-orange break-all leading-[1.35] text-[10px] mt-0.5 max-w-full">
            {commitment.slice(0, byteCursor) || "…"}
            {byteCursor < commitment.length && (
              <span className="inline-block w-[5px] h-[9px] bg-orange animate-pulse align-middle ml-0.5" />
            )}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-2">
            salt (private)
          </div>
          <div className="text-slate-400 break-all leading-[1.35] text-[10px] mt-0.5">
            {salt.slice(0, 22)}…
          </div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-2">
            cells lit
          </div>
          <div className="text-slate-100 tabular-nums">
            {lit.length}/{shipCellIndices.length || 17}
          </div>
        </div>
      </div>
    </div>
  );
}

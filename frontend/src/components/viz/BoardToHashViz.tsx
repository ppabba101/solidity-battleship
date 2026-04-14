import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { subscribe, type VizEvent } from "../../lib/vizBus";

// Lights up 17 ship cells one-by-one then resolves into a Poseidon commitment.
// Triggers on any `board_hash` event that carries a commitment-shaped payload.

const CELL = 18;
const GRID = 10;

export function BoardToHashViz() {
  const [lit, setLit] = useState<number[]>([]);
  const [byteCursor, setByteCursor] = useState(0);
  const [commitment, setCommitment] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const unsub = subscribe((e: VizEvent) => {
      if (e.kind !== "board_hash") return;
      if ((e.payload?.label as string) !== "board_validity") return;
      const hex =
        "0x" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      setCommitment(hex);
      setLit([]);
      setByteCursor(0);
      setRunning(true);

      // 17 ship cells placed at arbitrary-but-stable indices.
      const cells: number[] = [];
      for (let i = 0; i < 17; i++) cells.push((i * 7 + 3) % 100);

      cells.forEach((cell, i) => {
        window.setTimeout(() => {
          setLit((l) => [...l, cell]);
        }, i * 90);
      });

      window.setTimeout(() => {
        // Stream bytes.
        const id = window.setInterval(() => {
          setByteCursor((c) => {
            const next = c + 4;
            if (next >= hex.length) {
              window.clearInterval(id);
              return hex.length;
            }
            return next;
          });
        }, 40);
      }, 17 * 90);

      window.setTimeout(() => {
        setRunning(false);
      }, 2800);
    });
    return unsub;
  }, []);

  if (!running && !commitment) return null;

  return (
    <div className="p-4 rounded-xl border border-navy-light bg-navy/80 font-mono text-[10px]">
      <div className="text-[10px] uppercase tracking-widest text-orange font-semibold mb-3">
        Poseidon(board ∥ salt)
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
                animate={{
                  opacity: on ? 1 : 0.4,
                }}
              />
            );
          })}
        </svg>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">
            commitment
          </div>
          <div className="text-orange break-all leading-[1.35] text-[10px] mt-0.5 max-w-full">
            {commitment ? commitment.slice(0, byteCursor) || "…" : "…"}
            <span className="inline-block w-[5px] h-[9px] bg-orange animate-pulse align-middle ml-0.5" />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-2">
            cells lit
          </div>
          <div className="text-slate-100 tabular-nums">{lit.length}/17</div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { subscribe, type VizEvent } from "../../lib/vizBus";

interface RunState {
  runId: string;
  label: string;
  startedAt: number;
  progress: number;
  constraints: number;
  targetConstraints: number;
  proofBytes?: string;
  done: boolean;
  elapsedMs: number;
  publicInputs?: Record<string, unknown>;
  commitment?: string;
}

export function ProvingPanel() {
  const [run, setRun] = useState<RunState | null>(null);
  const [now, setNow] = useState(0);
  const [byteCursor, setByteCursor] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribe((e: VizEvent) => {
      const runId = (e.payload?.runId as string | undefined) ?? "unknown";
      if (e.kind === "board_hash") {
        setRun({
          runId,
          label: (e.payload?.label as string) ?? "proof",
          startedAt: performance.now(),
          progress: 0,
          constraints: 0,
          targetConstraints: 3482,
          done: false,
          elapsedMs: 0,
          publicInputs: e.payload?.publicInputs as Record<string, unknown>,
          commitment:
            "0x" +
            Array.from(crypto.getRandomValues(new Uint8Array(32)))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(""),
        });
        setByteCursor(0);
      } else if (e.kind === "proving_start") {
        setRun((r) =>
          r
            ? {
                ...r,
                targetConstraints:
                  (e.payload?.targetConstraints as number) ??
                  r.targetConstraints,
              }
            : r,
        );
      } else if (e.kind === "proving_progress") {
        setRun((r) =>
          r
            ? {
                ...r,
                progress: (e.payload?.progress as number) ?? r.progress,
                constraints:
                  (e.payload?.constraints as number) ?? r.constraints,
                elapsedMs: (e.payload?.elapsedMs as number) ?? r.elapsedMs,
              }
            : r,
        );
      } else if (e.kind === "proving_done") {
        setRun((r) =>
          r
            ? {
                ...r,
                progress: 1,
                constraints: r.targetConstraints,
                proofBytes: e.payload?.proofBytes as string,
                elapsedMs: (e.payload?.elapsedMs as number) ?? r.elapsedMs,
                done: true,
              }
            : r,
        );
      } else if (e.kind === "tx_mined") {
        // Auto-dismiss once the full chain of events completes.
        window.setTimeout(() => setRun(null), 1500);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!run || run.done) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => {
      setNow(performance.now());
    }, 50);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [run?.runId, run?.done]);

  // Stream the proof byte preview once the bytes arrive. UltraHonk proofs
  // start with a mostly-zero header (public-inputs-size + padding); reveal
  // from the first non-zero byte so the user actually sees the high-entropy
  // middle of the proof instead of a wall of zeros.
  useEffect(() => {
    if (!run?.proofBytes) return;
    setByteCursor(0);
    const id = window.setInterval(() => {
      setByteCursor((c) => {
        const next = c + 16;
        const total = run.proofBytes?.length ?? 0;
        if (next >= Math.min(total, 1600)) {
          window.clearInterval(id);
          return Math.min(total, 1600);
        }
        return next;
      });
    }, 15);
    return () => window.clearInterval(id);
  }, [run?.proofBytes]);

  const startOffset = (() => {
    const bytes = run?.proofBytes;
    if (!bytes) return 0;
    // Skip the leading "0x" plus any all-zero hex pairs in the header.
    const hex = bytes.startsWith("0x") ? bytes.slice(2) : bytes;
    let i = 0;
    while (i + 2 <= hex.length && hex[i] === "0" && hex[i + 1] === "0") i += 2;
    return (bytes.startsWith("0x") ? 2 : 0) + i;
  })();

  const visible = !!run;
  const elapsed = run
    ? run.done
      ? run.elapsedMs
      : Math.max(0, now - run.startedAt)
    : 0;

  return (
    <AnimatePresence>
      {visible && run && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center p-6 pointer-events-none"
        >
          <motion.div
            initial={{ scale: 0.95, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="pointer-events-auto w-full max-w-xl bg-navy border border-orange/50 rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-navy-light flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-orange font-semibold">
                  Generating zero-knowledge proof
                </div>
                <div className="text-sm font-mono text-slate-100">
                  {run.label}
                </div>
              </div>
              <div className="font-mono text-2xl text-orange tabular-nums">
                {(elapsed / 1000).toFixed(2)}s
              </div>
            </div>

            <div className="p-5 space-y-4 font-mono text-[11px] text-slate-200">
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>constraints</span>
                  <span className="tabular-nums">
                    {run.constraints.toLocaleString()} /{" "}
                    {run.targetConstraints.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded bg-navy-deep overflow-hidden">
                  <motion.div
                    className="h-full bg-orange"
                    animate={{ width: `${Math.round(run.progress * 100)}%` }}
                    transition={{ ease: "linear", duration: 0.1 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[10px]">
                <div className="p-2 rounded bg-navy-deep border border-navy-light">
                  <div className="text-slate-500">commitment</div>
                  <div className="text-orange break-all">
                    {run.commitment
                      ? run.commitment.slice(0, 18) +
                        "…" +
                        run.commitment.slice(-6)
                      : "pending"}
                  </div>
                </div>
                <div className="p-2 rounded bg-navy-deep border border-navy-light">
                  <div className="text-slate-500">public inputs</div>
                  <div className="text-slate-200">
                    {run.publicInputs
                      ? Object.entries(run.publicInputs)
                          .map(
                            ([k, v]) =>
                              `${k}=${Array.isArray(v) ? `[${v.join(",")}]` : v}`,
                          )
                          .join(" · ")
                      : "—"}
                  </div>
                </div>
                <div className="p-2 rounded bg-navy-deep border border-navy-light">
                  <div className="text-slate-500">ship cells</div>
                  <div className="text-slate-200">17</div>
                </div>
                <div className="p-2 rounded bg-navy-deep border border-navy-light">
                  <div className="text-slate-500">fleet shape</div>
                  <div className="text-slate-200">[5,4,3,3,2]</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 mb-1 flex justify-between">
                  <span>proof bytes (streaming)</span>
                  {run.proofBytes && (
                    <span className="text-orange/70">
                      {Math.floor(((run.proofBytes.length - 2) / 2))} bytes · UltraHonk
                    </span>
                  )}
                </div>
                <div className="h-16 p-2 rounded bg-black/40 border border-navy-light overflow-hidden text-[10px] text-orange-bright break-all leading-tight">
                  {run.proofBytes ? (
                    <>
                      <span className="text-slate-600">0x…</span>
                      {run.proofBytes.slice(startOffset, startOffset + byteCursor) || "…"}
                    </>
                  ) : (
                    "awaiting prover…"
                  )}
                  <span className="inline-block w-[6px] h-[10px] bg-orange animate-pulse align-middle ml-0.5" />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!run.done}
                  onClick={() => setRun(null)}
                  className="px-3 py-1.5 text-[11px] rounded border border-orange/50 text-orange disabled:opacity-30 disabled:cursor-not-allowed hover:bg-orange/10"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

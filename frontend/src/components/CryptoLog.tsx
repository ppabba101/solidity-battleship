import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, ChevronRight, ChevronDown } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: number;
  text: string;
  proving_ms?: number;
  txHash?: string;
  commitment?: string;
  proveMs?: number;
  chainMs?: number;
  totalMs?: number;
  proofPreview?: string;
  proofBytes?: number;
}

interface CryptoLogProps {
  entries: LogEntry[];
}

function hasDetail(e: LogEntry): boolean {
  return !!(
    e.txHash ||
    e.commitment ||
    e.proveMs !== undefined ||
    e.chainMs !== undefined ||
    e.totalMs !== undefined ||
    e.proofPreview ||
    e.proofBytes !== undefined
  );
}

function fmtMs(ms?: number): string {
  if (ms === undefined) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}

function LogRow({ e }: { e: LogEntry }) {
  const [open, setOpen] = useState(false);
  const expandable = hasDetail(e);
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="p-2 rounded bg-navy-deep border border-navy-light"
    >
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        className={`w-full text-left flex items-start gap-1.5 ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {expandable ? (
          open ? (
            <ChevronDown className="w-3 h-3 mt-0.5 text-orange shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 mt-0.5 text-orange shrink-0" />
          )
        ) : (
          <span className="w-3 h-3 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-slate-500 text-[9px]">
            {new Date(e.timestamp).toLocaleTimeString()}
          </div>
          <div className="text-slate-100 break-words">{e.text}</div>
          {e.proving_ms !== undefined && !expandable && (
            <div className="text-orange text-[10px]">
              {(e.proving_ms / 1000).toFixed(2)}s proving
            </div>
          )}
          {expandable &&
            (e.proveMs !== undefined ||
              e.chainMs !== undefined ||
              e.totalMs !== undefined) && (
              <div className="text-orange text-[10px]">
                prove {fmtMs(e.proveMs)} · verify+tx {fmtMs(e.chainMs)} · total{" "}
                {fmtMs(e.totalMs)}
              </div>
            )}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 pt-2 border-t border-navy-light space-y-1.5 text-[10px] text-slate-300">
              {e.txHash && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500">
                    tx hash
                  </div>
                  <div className="break-all text-orange font-mono">{e.txHash}</div>
                </div>
              )}
              {e.commitment && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500">
                    commitment
                  </div>
                  <div className="break-all text-slate-200 font-mono">
                    {e.commitment}
                  </div>
                </div>
              )}
              {(e.proveMs !== undefined ||
                e.chainMs !== undefined ||
                e.totalMs !== undefined) && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500">
                    timing
                  </div>
                  <div className="font-mono text-slate-200">
                    prove&nbsp;{fmtMs(e.proveMs)} &nbsp;·&nbsp; verify+tx&nbsp;
                    {fmtMs(e.chainMs)} &nbsp;·&nbsp; total&nbsp;{fmtMs(e.totalMs)}
                  </div>
                </div>
              )}
              {(e.proofPreview || e.proofBytes !== undefined) && (
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-slate-500">
                    proof{e.proofBytes !== undefined ? ` (${e.proofBytes} bytes)` : ""}
                  </div>
                  {e.proofPreview && (
                    <div className="break-all text-slate-400 font-mono">
                      {e.proofPreview}…
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function CryptoLog({ entries }: CryptoLogProps) {
  return (
    <div className="flex flex-col flex-1 min-h-[240px]">
      <div className="px-4 py-3 border-b border-navy-light flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-orange" />
        <div className="text-xs uppercase tracking-widest text-slate-300 font-semibold">
          What's happening cryptographically
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <LogRow key={e.id} e={e} />
          ))}
        </AnimatePresence>
        {entries.length === 0 && (
          <div className="text-slate-500 italic">
            No proofs yet. Place your fleet to begin.
          </div>
        )}
      </div>
    </div>
  );
}

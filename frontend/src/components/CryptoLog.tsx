import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: number;
  text: string;
  proving_ms?: number;
}

interface CryptoLogProps {
  entries: LogEntry[];
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
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-2 rounded bg-navy-deep border border-navy-light"
            >
              <div className="text-slate-500 text-[9px]">
                {new Date(e.timestamp).toLocaleTimeString()}
              </div>
              <div className="text-slate-100">{e.text}</div>
              {e.proving_ms !== undefined && (
                <div className="text-orange text-[10px]">
                  {(e.proving_ms / 1000).toFixed(2)}s proving
                </div>
              )}
            </motion.div>
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

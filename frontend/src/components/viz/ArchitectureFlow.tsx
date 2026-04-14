import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { subscribe, type VizEvent, type VizEventKind } from "../../lib/vizBus";

// Six-station pipeline diagram that pulses as real events fire on the bus.
// Each station maps to one or more VizEventKinds. Layout is pure CSS so long
// subtitles like "board_validity.nr" / "HonkVerifier" never overflow.

type StationId =
  | "board"
  | "hash"
  | "circuit"
  | "proof"
  | "verifier"
  | "contract";

const STATIONS: {
  id: StationId;
  label: string;
  sub: string;
  icon: string;
}[] = [
  { id: "board", label: "Board", sub: "10×10 + salt", icon: "⛵" },
  { id: "hash", label: "Poseidon", sub: "commitment", icon: "#" },
  { id: "circuit", label: "Noir Circuit", sub: "board_validity.nr", icon: "λ" },
  { id: "proof", label: "UltraPlonk", sub: "~384 bytes", icon: "π" },
  { id: "verifier", label: "Verifier", sub: "HonkVerifier", icon: "✓" },
  { id: "contract", label: "BattleshipGame", sub: "state machine", icon: "⚓" },
];

const KIND_TO_STATION: Partial<Record<VizEventKind, StationId>> = {
  board_hash: "hash",
  circuit_compile: "circuit",
  proving_start: "proof",
  proving_progress: "proof",
  proving_done: "proof",
  verifier_call: "verifier",
  tx_sent: "contract",
  tx_mined: "contract",
  event_log: "contract",
};

export function ArchitectureFlow() {
  const [active, setActive] = useState<StationId | null>(null);
  const [pulseId, setPulseId] = useState(0);

  useEffect(() => {
    let prevIdx = 0;
    const unsub = subscribe((e: VizEvent) => {
      const station = KIND_TO_STATION[e.kind];
      if (!station) return;
      const idx = STATIONS.findIndex((s) => s.id === station);
      if (idx < 0) return;
      setActive(station);
      setPulseId((p) => p + 1);
      prevIdx = idx;
      if (e.kind === "tx_mined" || e.kind === "event_log") {
        window.setTimeout(() => {
          prevIdx = 0;
          setActive(null);
        }, 1200);
      }
    });
    return unsub;
  }, []);

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-stretch gap-0 min-w-[720px]">
        {STATIONS.map((s, i) => {
          const isActive = active === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <motion.div
                animate={{ scale: isActive ? 1.04 : 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`relative flex-1 min-w-[130px] h-[68px] px-3 py-2 rounded-xl border flex items-center gap-2 bg-navy-deep transition-colors ${
                  isActive
                    ? "border-orange shadow-[0_0_14px_rgba(249,115,22,0.55)]"
                    : "border-navy-light"
                }`}
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-base font-bold ${
                    isActive
                      ? "bg-orange/20 text-orange-bright"
                      : "bg-navy-light/40 text-orange"
                  }`}
                >
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="text-[11px] font-semibold text-slate-100 truncate">
                    {s.label}
                  </div>
                  <div className="text-[9px] text-slate-500 font-mono truncate">
                    {s.sub}
                  </div>
                </div>
                {isActive && (
                  <motion.div
                    key={pulseId}
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.15 }}
                    transition={{ duration: 0.9 }}
                    className="pointer-events-none absolute inset-0 rounded-xl border border-orange"
                  />
                )}
              </motion.div>
              {i < STATIONS.length - 1 && (
                <div className="shrink-0 w-6 flex items-center justify-center relative">
                  <div className="w-full h-px border-t border-dashed border-navy-light" />
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        key={`dot-${pulseId}`}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 10, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: "easeInOut" }}
                        className="absolute w-1.5 h-1.5 rounded-full bg-orange"
                        style={{ filter: "drop-shadow(0 0 4px #F97316)" }}
                      />
                    )}
                  </AnimatePresence>
                  <div className="absolute right-0 w-0 h-0 border-y-[4px] border-y-transparent border-l-[6px] border-l-navy-light" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

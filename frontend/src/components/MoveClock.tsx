import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export interface MoveClockProps {
  deadlineUnixMs: number | null;
  onExpire?: () => void;
  label?: string;
}

export function MoveClock({ deadlineUnixMs, onExpire, label }: MoveClockProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(
    deadlineUnixMs === null ? null : Math.max(0, deadlineUnixMs - Date.now()),
  );
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    if (deadlineUnixMs === null) {
      setRemainingMs(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, deadlineUnixMs - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [deadlineUnixMs, onExpire]);

  if (remainingMs === null) {
    return (
      <div data-testid="move-clock" data-seconds="-1" className="font-mono text-slate-500">
        —:—
      </div>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const ss = (totalSeconds % 60).toString().padStart(2, "0");
  const colorClass =
    totalSeconds <= 5
      ? "text-red-500"
      : totalSeconds <= 15
        ? "text-orange-400"
        : "text-slate-100";

  return (
    <motion.div
      data-testid="move-clock"
      data-seconds={totalSeconds}
      className={`font-mono tabular-nums text-xl ${colorClass}`}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {label ? <span className="text-[10px] uppercase tracking-wider mr-2">{label}</span> : null}
      {mm}:{ss}
    </motion.div>
  );
}

import { motion } from "framer-motion";
import { Ship, Flame, Droplet, Target, X } from "lucide-react";
import {
  BOARD_SIZE,
  cellClass,
  cellIcon,
  type CellState,
} from "../lib/gameState";

interface GridProps {
  cells: CellState[];
  label: string;
  onCellClick?: (i: number) => void;
  onCellHover?: (i: number) => void;
  onCellLeave?: () => void;
  onCellDragOver?: (i: number, e: React.DragEvent) => void;
  onCellDrop?: (i: number, e: React.DragEvent) => void;
  disabled?: boolean;
}

function IconFor({ kind }: { kind: ReturnType<typeof cellIcon> }) {
  if (!kind) return null;
  const cls = "w-3.5 h-3.5";
  if (kind === "ship") return <Ship className={cls} />;
  if (kind === "hit") return <Flame className={cls} />;
  if (kind === "miss") return <Droplet className={cls} />;
  if (kind === "pending") return <Target className={cls} />;
  if (kind === "sunk") return <X className={cls} />;
  return null;
}

export function Grid({
  cells,
  label,
  onCellClick,
  onCellHover,
  onCellLeave,
  onCellDragOver,
  onCellDrop,
  disabled,
}: GridProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
        {label}
      </div>
      <div
        className={`relative grid gap-[3px] p-2 bg-navy-deep rounded-lg border border-navy-light shadow-inner transition-opacity w-fit ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{
          gridTemplateColumns: "repeat(10, 32px)",
          gridTemplateRows: "repeat(10, 32px)",
        }}
        onMouseLeave={onCellLeave}
      >
        {disabled && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-navy border border-orange/40 text-[9px] uppercase tracking-widest text-orange font-semibold pointer-events-none z-10">
            Busy
          </div>
        )}
        {cells.map((state, i) => (
          <motion.button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onCellClick?.(i)}
            onMouseEnter={() => onCellHover?.(i)}
            onDragOver={(e) => {
              e.preventDefault();
              onCellDragOver?.(i, e);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onCellDrop?.(i, e);
            }}
            className={cellClass(state)}
            animate={
              state === "CONFIRMED_HIT" || state === "OWN_SHIP_HIT"
                ? { scale: [1, 1.25, 1], rotate: [0, 8, 0] }
                : state === "CONFIRMED_MISS" || state === "OWN_MISS"
                  ? { scale: [1, 1.1, 1] }
                  : state === "SUNK"
                    ? { scale: [1, 0.9, 1] }
                    : { scale: 1 }
            }
            transition={{ duration: 0.35 }}
          >
            <IconFor kind={cellIcon(state)} />
          </motion.button>
        ))}
      </div>
      <div className="text-[10px] text-slate-500">
        {BOARD_SIZE}x{BOARD_SIZE} grid
      </div>
    </div>
  );
}

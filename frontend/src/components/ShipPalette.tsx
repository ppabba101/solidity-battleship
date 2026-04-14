import { Ship as ShipIcon, RotateCw } from "lucide-react";
import { STANDARD_FLEET, type Fleet, type Orientation } from "../lib/gameState";
import { cn } from "../lib/utils";

interface ShipPaletteProps {
  fleet: Fleet;
  selectedId: string | null;
  orientations: Record<string, Orientation>;
  onSelect: (shipId: string) => void;
  onRotate: (shipId: string) => void;
  onDragStart: (shipId: string, length: number) => void;
}

export function ShipPalette({
  fleet,
  selectedId,
  orientations,
  onSelect,
  onRotate,
  onDragStart,
}: ShipPaletteProps) {
  const placedIds = new Set(fleet.map((s) => s.id));

  return (
    <div className="flex flex-col gap-2 w-56">
      <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
        Fleet
      </div>
      <div className="flex flex-col gap-2">
        {STANDARD_FLEET.map((spec) => {
          const placed = placedIds.has(spec.id);
          const selected = selectedId === spec.id;
          const orientation = orientations[spec.id] ?? "H";
          return (
            <div
              key={spec.id}
              draggable={!placed}
              onDragStart={(e) => {
                if (placed) return;
                e.dataTransfer.setData("text/ship-id", spec.id);
                e.dataTransfer.effectAllowed = "move";
                onDragStart(spec.id, spec.length);
              }}
              onClick={() => {
                if (!placed) onSelect(spec.id);
              }}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md border text-sm select-none transition-all",
                placed
                  ? "bg-navy-light/30 border-slate-700 text-slate-500 line-through cursor-not-allowed"
                  : selected
                    ? "bg-navy-light border-orange text-slate-100 cursor-grab active:cursor-grabbing ring-2 ring-orange/60 shadow-[0_0_12px_rgba(249,115,22,0.5)]"
                    : "bg-navy-light border-slate-600 text-slate-100 cursor-grab active:cursor-grabbing hover:border-orange",
              )}
            >
              <ShipIcon className="w-4 h-4 text-orange" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{spec.name}</div>
                <div className="text-[10px] text-slate-400">
                  length {spec.length}
                </div>
              </div>
              <div
                className={cn(
                  "font-mono text-[10px] px-1 py-0.5 rounded border",
                  placed
                    ? "border-slate-700 text-slate-600"
                    : "border-slate-600 text-slate-300",
                )}
                title={orientation === "H" ? "Horizontal" : "Vertical"}
              >
                {orientation}
              </div>
              <button
                type="button"
                disabled={placed}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!placed) onRotate(spec.id);
                }}
                aria-label={`Rotate ${spec.name}`}
                className={cn(
                  "p-1 rounded border",
                  placed
                    ? "border-slate-700 text-slate-600 cursor-not-allowed"
                    : "border-slate-600 text-slate-200 hover:border-orange hover:text-orange",
                )}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
        Click a ship, then click a cell to place. Press{" "}
        <kbd className="px-1 py-0.5 bg-navy-light rounded">R</kbd> or click{" "}
        <span className="inline-block align-middle">
          <RotateCw className="w-3 h-3 inline" />
        </span>{" "}
        to rotate.{" "}
        <kbd className="px-1 py-0.5 bg-navy-light rounded">Esc</kbd> cancels.
      </div>
    </div>
  );
}

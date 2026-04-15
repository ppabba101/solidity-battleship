import { Ship as ShipIcon } from "lucide-react";
import { STANDARD_FLEET, type Fleet, type Ship } from "../lib/gameState";

interface FleetStatusProps {
  opponentFleet: Fleet;
  sunkShipIds: Set<string>;
}

// Renders the canonical 5-ship roster and strikes through ship types the
// shooter has already sunk on the opponent's fleet.
export function FleetStatus({ opponentFleet, sunkShipIds }: FleetStatusProps) {
  // Match by ship id when we know the live opponent fleet, otherwise fall back
  // to the canonical roster. Treat unknown ids as not yet sunk.
  const fleetById = new Map<string, Ship>();
  for (const s of opponentFleet) fleetById.set(s.id, s);

  return (
    <div className="flex flex-col gap-1.5 mt-3 p-3 rounded-lg border border-navy-light bg-navy-deep/60 w-[180px]">
      <div className="text-[10px] uppercase tracking-widest text-orange font-semibold mb-1">
        Enemy Fleet
      </div>
      {STANDARD_FLEET.map((spec) => {
        const sunk = sunkShipIds.has(spec.id);
        return (
          <div
            key={spec.id}
            className={`flex items-center justify-between text-[11px] font-mono ${
              sunk ? "text-slate-500 line-through" : "text-slate-200"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <ShipIcon
                className={`w-3 h-3 ${sunk ? "text-slate-600" : "text-orange"}`}
              />
              {spec.name}
            </span>
            <span className="tabular-nums">{spec.length}</span>
          </div>
        );
      })}
      <div className="text-[9px] text-slate-500 mt-1">
        {STANDARD_FLEET.length - sunkShipIds.size} of {STANDARD_FLEET.length} afloat
      </div>
    </div>
  );
}

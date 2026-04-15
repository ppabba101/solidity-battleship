import { ArchitectureFlow } from "./ArchitectureFlow";
import { ProvingPanel } from "./ProvingPanel";
import { BoardToHashViz } from "./BoardToHashViz";
import { ChainPanel } from "./ChainPanel";
import type { Fleet } from "../../lib/gameState";

// Top-of-screen pipeline diagram + proving modal.
// Side-rail panels are exported separately and composed into App.tsx's sidebar.

export function VizLayer() {
  return (
    <>
      <div className="border-b border-navy-light bg-navy/40 px-6 py-4">
        <div className="text-[10px] uppercase tracking-widest text-orange font-semibold mb-3">
          Behind the scenes — zk pipeline
        </div>
        <ArchitectureFlow />
      </div>
      <ProvingPanel />
    </>
  );
}

export interface VizSidebarProps {
  fleet: Fleet;
  commitment: `0x${string}` | null;
  salt: `0x${string}`;
}

export function VizSidebar({ fleet, commitment, salt }: VizSidebarProps) {
  return (
    <div className="space-y-3 min-w-0">
      <BoardToHashViz fleet={fleet} commitment={commitment} salt={salt} />
      <ChainPanel />
    </div>
  );
}

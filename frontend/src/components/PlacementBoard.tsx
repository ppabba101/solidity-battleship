import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid } from "./Grid";
import { ShipPalette } from "./ShipPalette";
import { Button } from "./ui/button";
import {
  BOARD_CELLS,
  BOARD_SIZE,
  STANDARD_FLEET,
  canPlaceShip,
  idx,
  isFleetValid,
  placeFleet,
  randomizeFleet,
  shipCells,
  type CellState,
  type Fleet,
  type Orientation,
  type Ship,
} from "../lib/gameState";

interface PlacementBoardProps {
  fleet: Fleet;
  setFleet: (fleet: Fleet) => void;
  onReady: () => void;
  proving?: boolean;
}

type ActiveShip = {
  id: string;
  length: number;
  orientation: Orientation;
  // When moving a previously placed ship, we remove it from the fleet while
  // it is "in hand". source === "board" signals re-placement mode.
  source: "palette" | "board";
};

export function PlacementBoard({
  fleet,
  setFleet,
  onReady,
  proving,
}: PlacementBoardProps) {
  // Per-ship default orientation used when picking up from the palette.
  const [orientations, setOrientations] = useState<Record<string, Orientation>>(
    () =>
      Object.fromEntries(STANDARD_FLEET.map((s) => [s.id, "H"])) as Record<
        string,
        Orientation
      >,
  );
  const [active, setActive] = useState<ActiveShip | null>(null);
  const [lastHoverIdx, setLastHoverIdx] = useState<number | null>(null);
  const [hoverCells, setHoverCells] = useState<{
    indices: number[];
    valid: boolean;
  } | null>(null);

  const specById = useMemo(
    () => Object.fromEntries(STANDARD_FLEET.map((s) => [s.id, s])),
    [],
  );

  // Rotate the orientation of a ship, whether it is active (in-hand) or not.
  const rotateShip = useCallback(
    (shipId: string) => {
      setOrientations((prev) => ({
        ...prev,
        [shipId]: prev[shipId] === "H" ? "V" : "H",
      }));
      setActive((curr) =>
        curr && curr.id === shipId
          ? { ...curr, orientation: curr.orientation === "H" ? "V" : "H" }
          : curr,
      );
    },
    [],
  );

  const cancelActive = useCallback(() => {
    setActive(null);
    setHoverCells(null);
    setLastHoverIdx(null);
  }, []);

  // Global keyboard listener: R rotates active ship, Escape cancels.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelActive();
        return;
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        rotateShip(active.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, rotateShip, cancelActive]);

  // Map of cell index -> placed ship id, used for "pick up placed ship".
  const cellToShip = useMemo(() => {
    const m = new Map<number, Ship>();
    for (const ship of fleet) {
      for (const c of shipCells(ship)) {
        m.set(idx(c.x, c.y), ship);
      }
    }
    return m;
  }, [fleet]);

  const baseCells = placeFleet(fleet);
  const cells: CellState[] = baseCells.slice();
  if (hoverCells) {
    for (const i of hoverCells.indices) {
      cells[i] = hoverCells.valid ? "HOVER_VALID" : "HOVER_INVALID";
    }
  }

  const selectFromPalette = useCallback(
    (shipId: string) => {
      const spec = specById[shipId];
      if (!spec) return;
      // Toggle off if already active from palette.
      if (active && active.id === shipId && active.source === "palette") {
        cancelActive();
        return;
      }
      setActive({
        id: shipId,
        length: spec.length,
        orientation: orientations[shipId] ?? "H",
        source: "palette",
      });
      setHoverCells(null);
    },
    [active, cancelActive, orientations, specById],
  );

  const pickUpPlaced = useCallback(
    (shipId: string) => {
      const existing = fleet.find((s) => s.id === shipId);
      if (!existing) return;
      // Remove from fleet so the board shows it as free while re-placing.
      setFleet(fleet.filter((s) => s.id !== shipId));
      setOrientations((prev) => ({ ...prev, [shipId]: existing.orientation }));
      setActive({
        id: shipId,
        length: existing.length,
        orientation: existing.orientation,
        source: "board",
      });
      setHoverCells(null);
    },
    [fleet, setFleet],
  );

  const previewAt = useCallback(
    (i: number) => {
      if (!active) return;
      setLastHoverIdx(i);
      const x = i % BOARD_SIZE;
      const y = Math.floor(i / BOARD_SIZE);
      const candidate: Ship = {
        id: active.id,
        length: active.length,
        x,
        y,
        orientation: active.orientation,
      };
      const valid = canPlaceShip(fleet, candidate);
      const indices: number[] = [];
      for (const c of shipCells(candidate)) {
        if (c.x >= 0 && c.x < BOARD_SIZE && c.y >= 0 && c.y < BOARD_SIZE) {
          indices.push(idx(c.x, c.y));
        }
      }
      setHoverCells({ indices, valid });
    },
    [active, fleet],
  );

  // Re-run the hover preview whenever the active ship's orientation changes
  // while the cursor is still parked on the same cell. Without this, pressing
  // R during hover only updates the state but the green/red overlay still
  // reflects the old orientation until you move the mouse.
  useEffect(() => {
    if (active && lastHoverIdx !== null) {
      previewAt(lastHoverIdx);
    }
    // previewAt is stable per (active, fleet); we intentionally watch
    // orientation + fleet so rotation and new placements retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.orientation, fleet]);

  const commitAt = useCallback(
    (i: number) => {
      if (!active) return false;
      const x = i % BOARD_SIZE;
      const y = Math.floor(i / BOARD_SIZE);
      const candidate: Ship = {
        id: active.id,
        length: active.length,
        x,
        y,
        orientation: active.orientation,
      };
      if (!canPlaceShip(fleet, candidate)) return false;
      const next = fleet.filter((s) => s.id !== candidate.id);
      next.push(candidate);
      setFleet(next);
      setHoverCells(null);
      setActive(null);
      return true;
    },
    [active, fleet, setFleet],
  );

  const onCellClick = useCallback(
    (i: number) => {
      // If a ship is active, clicking commits placement.
      if (active) {
        commitAt(i);
        return;
      }
      // Otherwise, if the clicked cell is part of a placed ship, pick it up.
      const placed = cellToShip.get(i);
      if (placed) {
        pickUpPlaced(placed.id);
      }
    },
    [active, cellToShip, commitAt, pickUpPlaced],
  );

  const onCellHover = useCallback(
    (i: number) => {
      if (active) previewAt(i);
    },
    [active, previewAt],
  );

  // HTML5 drag-drop (still supported as a secondary path).
  const onCellDragOver = useCallback(
    (i: number) => {
      if (!active) return;
      previewAt(i);
    },
    [active, previewAt],
  );

  const onCellDrop = useCallback(
    (i: number) => {
      if (!active) return;
      commitAt(i);
    },
    [active, commitAt],
  );

  const onDragStartFromPalette = useCallback(
    (id: string, length: number) => {
      setActive({
        id,
        length,
        orientation: orientations[id] ?? "H",
        source: "palette",
      });
    },
    [orientations],
  );

  const complete =
    fleet.length === STANDARD_FLEET.length && isFleetValid(fleet);

  const hint = active
    ? active.source === "board"
      ? `Moving ${specById[active.id]?.name ?? active.id} — click a cell to drop (R to rotate, Esc to cancel)`
      : `Click a cell to place ${specById[active.id]?.name ?? active.id} (R to rotate, Esc to cancel)`
    : complete
      ? "Fleet ready — click a placed ship to move it, or press Ready"
      : "Click a ship in the palette, or click a placed ship to move it";

  return (
    <div className="flex gap-6 items-start">
      <ShipPalette
        fleet={fleet}
        selectedId={active?.source === "palette" ? active.id : null}
        orientations={orientations}
        onSelect={selectFromPalette}
        onRotate={rotateShip}
        onDragStart={onDragStartFromPalette}
      />
      <div className="flex flex-col gap-3">
        <Grid
          cells={cells}
          label="Your Fleet — Placement"
          onCellClick={onCellClick}
          onCellHover={onCellHover}
          onCellDragOver={(i) => onCellDragOver(i)}
          onCellDrop={(i) => onCellDrop(i)}
          onCellLeave={() => setHoverCells(null)}
        />
        <div
          className={
            "text-[11px] px-3 py-2 rounded-md border " +
            (active
              ? "border-orange/60 bg-orange/10 text-orange"
              : "border-slate-700 bg-navy-light/30 text-slate-300")
          }
          aria-live="polite"
        >
          {hint}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              cancelActive();
              setFleet(randomizeFleet());
            }}
            disabled={proving}
          >
            Randomize
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              cancelActive();
              setFleet([]);
            }}
            disabled={proving || fleet.length === 0}
          >
            Clear
          </Button>
          <Button onClick={onReady} disabled={!complete || proving}>
            {proving ? "Proving…" : "Ready"}
          </Button>
        </div>
        <div className="text-[11px] text-slate-500">
          {fleet.length}/{STANDARD_FLEET.length} ships placed •{" "}
          {BOARD_CELLS - baseCells.filter((c) => c === "EMPTY").length}/17 cells
        </div>
      </div>
    </div>
  );
}

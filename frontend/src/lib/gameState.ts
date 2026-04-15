export type CellState =
  | "EMPTY"
  | "OWN_SHIP"
  | "OWN_SHIP_HIT"
  | "OWN_MISS"
  | "UNKNOWN"
  | "PENDING_SHOT"
  | "CONFIRMED_HIT"
  | "CONFIRMED_MISS"
  | "SUNK"
  | "HOVER_VALID"
  | "HOVER_INVALID";

export type Orientation = "H" | "V";

export interface Ship {
  id: string;
  length: number;
  x: number;
  y: number;
  orientation: Orientation;
}

export type Fleet = Ship[];

export const BOARD_SIZE = 10;
export const BOARD_CELLS = BOARD_SIZE * BOARD_SIZE;

export const STANDARD_FLEET: { id: string; name: string; length: number }[] = [
  { id: "carrier", name: "Carrier", length: 5 },
  { id: "battleship", name: "Battleship", length: 4 },
  { id: "cruiser", name: "Cruiser", length: 3 },
  { id: "submarine", name: "Submarine", length: 3 },
  { id: "destroyer", name: "Destroyer", length: 2 },
];

export function idx(x: number, y: number): number {
  return y * BOARD_SIZE + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function shipCells(ship: Ship): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < ship.length; i++) {
    const x = ship.orientation === "H" ? ship.x + i : ship.x;
    const y = ship.orientation === "V" ? ship.y + i : ship.y;
    out.push({ x, y });
  }
  return out;
}

export function placeFleet(fleet: Fleet): CellState[] {
  const cells: CellState[] = Array(BOARD_CELLS).fill("EMPTY");
  for (const ship of fleet) {
    for (const { x, y } of shipCells(ship)) {
      if (inBounds(x, y)) cells[idx(x, y)] = "OWN_SHIP";
    }
  }
  return cells;
}

export function isShipSunk(ship: Ship, hits: Set<number>): boolean {
  for (const { x, y } of shipCells(ship)) {
    if (!hits.has(idx(x, y))) return false;
  }
  return true;
}

export function detectSunkShips(
  opponentFleet: Fleet,
  hitCellIndices: number[],
): Ship[] {
  const hitSet = new Set<number>(hitCellIndices);
  return opponentFleet.filter((s) => isShipSunk(s, hitSet));
}

export function shipDisplayName(id: string): string {
  const spec = STANDARD_FLEET.find((s) => s.id === id);
  return spec ? spec.name : id;
}

export function applyHits(
  own: CellState[],
  hits: { x: number; y: number; hit: boolean }[],
): CellState[] {
  const out = own.slice();
  for (const h of hits) {
    const i = idx(h.x, h.y);
    if (h.hit) {
      out[i] = "OWN_SHIP_HIT";
    } else if (out[i] === "EMPTY") {
      out[i] = "OWN_MISS";
    }
  }
  return out;
}

export function isFleetValid(fleet: Fleet): boolean {
  const expected = [5, 4, 3, 3, 2].sort().join(",");
  const actual = fleet
    .map((s) => s.length)
    .sort()
    .join(",");
  if (expected !== actual) return false;

  const occupied = new Set<number>();
  for (const ship of fleet) {
    for (const { x, y } of shipCells(ship)) {
      if (!inBounds(x, y)) return false;
      const i = idx(x, y);
      if (occupied.has(i)) return false;
      occupied.add(i);
    }
  }
  return true;
}

export function canPlaceShip(fleet: Fleet, candidate: Ship): boolean {
  const occupied = new Set<number>();
  for (const ship of fleet) {
    if (ship.id === candidate.id) continue;
    for (const { x, y } of shipCells(ship)) {
      occupied.add(idx(x, y));
    }
  }
  for (const { x, y } of shipCells(candidate)) {
    if (!inBounds(x, y)) return false;
    if (occupied.has(idx(x, y))) return false;
  }
  return true;
}

export function randomizeFleet(): Fleet {
  for (let attempt = 0; attempt < 500; attempt++) {
    const fleet: Fleet = [];
    let ok = true;
    for (const spec of STANDARD_FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200; tries++) {
        const orientation: Orientation = Math.random() < 0.5 ? "H" : "V";
        const maxX =
          orientation === "H" ? BOARD_SIZE - spec.length : BOARD_SIZE - 1;
        const maxY =
          orientation === "V" ? BOARD_SIZE - spec.length : BOARD_SIZE - 1;
        const x = Math.floor(Math.random() * (maxX + 1));
        const y = Math.floor(Math.random() * (maxY + 1));
        const ship: Ship = {
          id: spec.id,
          length: spec.length,
          x,
          y,
          orientation,
        };
        if (canPlaceShip(fleet, ship)) {
          fleet.push(ship);
          placed = true;
          break;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok && isFleetValid(fleet)) return fleet;
  }
  throw new Error("Could not randomize fleet");
}

export function cellClass(state: CellState): string {
  const base =
    "w-full h-full flex items-center justify-center text-xs font-bold rounded-sm border transition-colors duration-150";
  switch (state) {
    case "EMPTY":
      return `${base} bg-navy-light/40 border-navy-light hover:bg-navy-light/70`;
    case "OWN_SHIP":
      return `${base} bg-slate-400 border-slate-300 text-navy`;
    case "OWN_SHIP_HIT":
      return `${base} bg-orange border-orange-bright text-white`;
    case "OWN_MISS":
      return `${base} bg-sky-700/50 border-sky-600 text-sky-200`;
    case "UNKNOWN":
      return `${base} bg-navy-light/60 border-navy-light hover:bg-navy-light hover:border-orange hover:ring-2 hover:ring-orange/40 hover:shadow-[0_0_10px_rgba(249,115,22,0.5)]`;
    case "PENDING_SHOT":
      return `${base} bg-yellow-500/40 border-yellow-400 animate-pulseShot`;
    case "CONFIRMED_HIT":
      return `${base} bg-orange border-orange-bright text-white`;
    case "CONFIRMED_MISS":
      return `${base} bg-sky-700/70 border-sky-500 text-sky-100`;
    case "SUNK":
      return `${base} bg-red-700 border-red-400 text-white`;
    case "HOVER_VALID":
      return `${base} bg-emerald-500/50 border-emerald-300`;
    case "HOVER_INVALID":
      return `${base} bg-red-600/50 border-red-400`;
    default:
      return base;
  }
}

export function cellIcon(
  state: CellState,
): "ship" | "hit" | "miss" | "pending" | "sunk" | null {
  switch (state) {
    case "OWN_SHIP":
      return "ship";
    case "OWN_SHIP_HIT":
    case "CONFIRMED_HIT":
      return "hit";
    case "OWN_MISS":
    case "CONFIRMED_MISS":
      return "miss";
    case "PENDING_SHOT":
      return "pending";
    case "SUNK":
      return "sunk";
    default:
      return null;
  }
}

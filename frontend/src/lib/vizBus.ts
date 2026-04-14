// Tiny zero-dep event bus for the "Behind the Scenes" viz layer.
// Everything cryptographic that happens during the demo should emit here.

export type VizEventKind =
  | "board_hash"
  | "circuit_compile"
  | "proving_start"
  | "proving_progress"
  | "proving_done"
  | "verifier_call"
  | "tx_sent"
  | "tx_mined"
  | "event_log";

export interface VizEvent {
  id: string;
  ts: number;
  kind: VizEventKind;
  // Free-form payload — each station reads what it needs.
  payload?: Record<string, unknown>;
}

type Listener = (event: VizEvent) => void;

const listeners = new Set<Listener>();
const RING_SIZE = 200;
const ring: VizEvent[] = [];

function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `viz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emit(
  event: Omit<VizEvent, "id" | "ts"> & { id?: string; ts?: number },
): VizEvent {
  const full: VizEvent = {
    id: event.id ?? nextId(),
    ts: event.ts ?? Date.now(),
    kind: event.kind,
    payload: event.payload,
  };
  ring.push(full);
  if (ring.length > RING_SIZE) ring.shift();
  listeners.forEach((fn) => {
    try {
      fn(full);
    } catch (err) {
      // Never let a bad listener take down the bus.
      console.error("[vizBus] listener error", err);
    }
  });
  return full;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getRecent(): VizEvent[] {
  return ring.slice();
}

export function clearRecent(): void {
  ring.length = 0;
}

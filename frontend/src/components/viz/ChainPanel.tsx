import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { getPublicClient } from "../../lib/burnerWallets";
import { CONTRACT_ADDRESS } from "../../lib/contract";
import { subscribe, type VizEvent } from "../../lib/vizBus";

interface TxRow {
  hash: string;
  method: string;
  gasUsed?: number;
  status: "pending" | "success" | "reverted";
}

interface EventRow {
  id: string;
  name: string;
  ts: number;
  txHash?: string;
}

export function ChainPanel() {
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);
  const [connected, setConnected] = useState(false);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const client = getPublicClient();
    const tick = async () => {
      try {
        const bn = await client.getBlockNumber();
        if (cancelled) return;
        setBlockNumber(bn);
        setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribe((e: VizEvent) => {
      if (e.kind === "tx_sent") {
        const hash = (e.payload?.hash as string) ?? "0x";
        const method = (e.payload?.method as string) ?? "call";
        setTxs((list) =>
          [{ hash, method, status: "pending" as const }, ...list].slice(0, 5),
        );
      } else if (e.kind === "tx_mined") {
        const hash = (e.payload?.hash as string) ?? "0x";
        const gasUsed = e.payload?.gasUsed as number | undefined;
        setTxs((list) =>
          list.map((t) =>
            t.hash === hash ? { ...t, status: "success", gasUsed } : t,
          ),
        );
      } else if (e.kind === "event_log") {
        setEvents((list) =>
          [
            {
              id: e.id,
              name: (e.payload?.name as string) ?? "Event",
              ts: e.ts,
              txHash: e.payload?.txHash as string | undefined,
            },
            ...list,
          ].slice(0, 6),
        );
      }
    });
    return unsub;
  }, []);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(CONTRACT_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="border border-navy-light rounded-xl bg-navy/80 font-mono text-[11px] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-navy-light flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-orange" />
        <div className="text-[10px] uppercase tracking-widest text-orange font-semibold">
          Chain
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? "bg-green-400" : "bg-red-500"
              }`}
              style={connected ? { boxShadow: "0 0 6px #4ade80" } : undefined}
            />
            <span className="text-slate-200">Anvil (31337)</span>
          </div>
          <div className="text-slate-400 tabular-nums">
            #{blockNumber?.toString() ?? "—"}
          </div>
        </div>

        <button
          type="button"
          onClick={copyAddr}
          className="w-full text-left p-2 rounded-md bg-navy-deep border border-navy-light hover:border-orange/50 transition-colors overflow-hidden"
          title="Click to copy"
        >
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">
            BattleshipGame
          </div>
          <div className="text-orange font-mono text-[10px] break-all leading-tight mt-0.5">
            {copied
              ? "copied ✓"
              : `${CONTRACT_ADDRESS.slice(0, 10)}…${CONTRACT_ADDRESS.slice(-8)}`}
          </div>
        </button>

        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">
            Last 5 transactions
          </div>
          {txs.length === 0 ? (
            <div className="text-slate-500 italic">No transactions yet.</div>
          ) : (
            <div className="space-y-1">
              {txs.map((t) => (
                <div
                  key={t.hash}
                  className="flex items-center justify-between gap-2 p-1.5 rounded bg-navy-deep border border-navy-light"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-200 truncate">
                      {t.hash.slice(0, 10)}…{t.hash.slice(-4)}
                    </div>
                    <div className="text-[9px] text-slate-500">{t.method}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      {t.gasUsed ? `${t.gasUsed.toLocaleString()} gas` : "—"}
                    </div>
                    <div
                      className={`text-[10px] ${
                        t.status === "success"
                          ? "text-green-400"
                          : t.status === "reverted"
                            ? "text-red-400"
                            : "text-orange"
                      }`}
                    >
                      {t.status === "success"
                        ? "✓"
                        : t.status === "reverted"
                          ? "✗"
                          : "…"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">
            Events
          </div>
          {events.length === 0 ? (
            <div className="text-slate-500 italic">No events emitted yet.</div>
          ) : (
            <div className="space-y-1">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-1.5 rounded bg-navy-deep border border-navy-light"
                >
                  <div className="text-orange">{ev.name}</div>
                  <div className="text-[9px] text-slate-500">
                    {new Date(ev.ts).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

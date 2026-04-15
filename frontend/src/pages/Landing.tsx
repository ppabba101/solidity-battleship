import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Landing page mounted at `/`. WP4 will flesh out the public-games list and
 * WP5/WP6 the fund-wallet / escrow affordances. This file intentionally stays
 * a stub + sign-in shell so downstream WPs have a stable mount point.
 */
export default function Landing() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"preview" | "real">("preview");

  const onNewGame = () => {
    // WP4 replaces this with a real createGame flow; for now synth a
    // placeholder gameId so the router surface is testable end-to-end.
    const placeholderId = Math.floor(Date.now() / 1000);
    navigate(`/${mode}/g/${placeholderId}`);
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 gap-8 text-slate-100">
      <div className="max-w-2xl w-full space-y-6">
        <header className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-orange font-semibold">
            zkBattleship
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            Trustless Battleship on Base
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            Sign in with email, stake ETH, and play a fully on-chain game of
            Battleship with zero-knowledge fleet commitments.
          </p>
        </header>

        <section className="flex flex-wrap items-center gap-3">
          {!ready ? (
            <button
              disabled
              className="px-4 py-2 rounded bg-slate-700 text-slate-400 text-sm"
            >
              Loading…
            </button>
          ) : !authenticated ? (
            <button
              onClick={login}
              className="px-4 py-2 rounded bg-orange text-navy font-semibold text-sm hover:brightness-110"
            >
              Sign in with email
            </button>
          ) : (
            <>
              <span className="text-xs text-slate-400 font-mono break-all">
                {user?.wallet?.address ?? user?.id ?? "signed in"}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 rounded border border-slate-600 text-slate-300 text-xs hover:bg-slate-800"
              >
                Sign out
              </button>
            </>
          )}
        </section>

        <section className="space-y-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Mode
          </div>
          <div className="inline-flex rounded border border-slate-700 overflow-hidden">
            <button
              onClick={() => setMode("preview")}
              className={`px-3 py-1.5 text-xs ${mode === "preview" ? "bg-orange text-navy" : "text-slate-300 hover:bg-slate-800"}`}
            >
              Preview (MockVerifier)
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-3 py-1.5 text-xs ${mode === "real" ? "bg-orange text-navy" : "text-slate-300 hover:bg-slate-800"}`}
            >
              Real (HonkVerifier)
            </button>
          </div>
        </section>

        <section className="flex gap-3">
          <button
            onClick={onNewGame}
            disabled={ready && !authenticated}
            className="px-4 py-2 rounded bg-slate-800 border border-slate-600 text-sm hover:bg-slate-700 disabled:opacity-40"
          >
            New game
          </button>
          <Link
            to="/local"
            className="px-4 py-2 rounded border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
          >
            Local hot-seat (dev)
          </Link>
        </section>

        <section className="space-y-2 pt-4 border-t border-slate-800">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            Public games
          </div>
          <p className="text-xs text-slate-500">
            WP4 will list open games from on-chain `GameCreated` events here.
          </p>
        </section>

        <section className="space-y-2 pt-4 border-t border-slate-800">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            How it works
          </div>
          <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
            <li>Sign in with email; Privy spins up an embedded wallet.</li>
            <li>Fund the wallet with a bit of Base Sepolia ETH.</li>
            <li>Create or join a game, commit your fleet with a zk proof.</li>
            <li>Fire shots — every response is proven in the browser.</li>
            <li>Winner claims the pot on-chain.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { formatEther, parseEther, isAddress, zeroAddress } from "viem";
import {
  ActiveModeContext,
  useActiveContractAddress,
  type ActiveMode,
} from "../lib/activeMode";
import { useLobby } from "../lib/useLobby";
import { useContractCtx, basePublicClient } from "../lib/privyClient";
import { createGame as contractCreateGame, joinGame as contractJoinGame } from "../lib/contract";
import { FundWalletPanel } from "../components/FundWalletPanel";

const FAUCET_URL =
  "https://portal.cdp.coinbase.com/products/faucet?projectId=base-sepolia";
const DEFAULT_STAKE = "0.0001";
const MIN_STAKE_WEI = 100_000_000_000_000n; // 1e14

function ModeToggle({
  mode,
  setMode,
}: {
  mode: ActiveMode;
  setMode: (m: ActiveMode) => void;
}) {
  return (
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
  );
}

function CreateGameDialog({
  open,
  onClose,
  contractAddress,
  mode,
  balanceWei,
}: {
  open: boolean;
  onClose: () => void;
  contractAddress: `0x${string}`;
  mode: ActiveMode;
  balanceWei: bigint | null;
}) {
  const navigate = useNavigate();
  const ctx = useContractCtx(contractAddress);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [clock, setClock] = useState(60);
  const [opponent, setOpponent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const stakeWei = (() => {
    try {
      return parseEther(stake);
    } catch {
      return null;
    }
  })();
  const stakeValid = stakeWei !== null && stakeWei >= MIN_STAKE_WEI;
  const opponentValid = opponent === "" || isAddress(opponent);
  const balanceOk =
    balanceWei !== null && stakeWei !== null
      ? balanceWei >= stakeWei + parseEther("0.001")
      : true;
  const canSubmit =
    !!ctx && stakeValid && opponentValid && balanceOk && !submitting;

  const onSubmit = async () => {
    if (!ctx || stakeWei === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const opponentAddr =
        opponent === ""
          ? (zeroAddress as `0x${string}`)
          : (opponent as `0x${string}`);
      const { gameId } = await contractCreateGame(0, opponentAddr, {
        ctx,
        clockSeconds: clock,
        stakeWei,
      });
      navigate(`/${mode}/g/${gameId.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full bg-navy border border-slate-700 rounded-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold">New game</h2>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Stake (ETH)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
          />
          {!stakeValid && (
            <div className="text-xs text-red-400">
              Min stake is 0.0001 ETH (1e14 wei)
            </div>
          )}
          {stakeValid && !balanceOk && (
            <div className="text-xs text-red-400">
              Insufficient balance for stake + gas buffer.
            </div>
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Per-move clock
          </label>
          <div className="inline-flex rounded border border-slate-700 overflow-hidden">
            {[30, 60, 120].map((s) => (
              <button
                key={s}
                onClick={() => setClock(s)}
                className={`px-3 py-1.5 text-xs ${clock === s ? "bg-orange text-navy" : "text-slate-300 hover:bg-slate-800"}`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Opponent address (blank = open game)
          </label>
          <input
            type="text"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="0x…"
            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono"
          />
          {!opponentValid && (
            <div className="text-xs text-red-400">Invalid address</div>
          )}
        </div>
        {error && (
          <div className="text-xs text-red-400 break-all">{error}</div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            data-testid="create-game-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-sm rounded bg-orange text-navy font-semibold hover:brightness-110 disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Create game"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PublicGamesList({
  contractAddress,
  mode,
}: {
  contractAddress: `0x${string}`;
  mode: ActiveMode;
}) {
  const navigate = useNavigate();
  const ctx = useContractCtx(contractAddress);
  const { games, isLoading, error, refetch } = useLobby(contractAddress);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const onJoin = async (gameId: bigint, stakeWei: bigint) => {
    if (!ctx) return;
    setJoining(gameId.toString());
    setJoinError(null);
    try {
      await contractJoinGame(ctx, gameId, stakeWei);
      navigate(`/${mode}/g/${gameId.toString()}`);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(null);
    }
  };

  return (
    <section className="space-y-2 pt-4 border-t border-slate-800">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
          Public games
        </div>
        <button
          onClick={refetch}
          className="text-[11px] text-slate-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
      {isLoading && (
        <p className="text-xs text-slate-500">Loading open games…</p>
      )}
      {error && (
        <p className="text-xs text-red-400">
          Failed to load lobby: {error.message}
        </p>
      )}
      {!isLoading && !error && games.length === 0 && (
        <p className="text-xs text-slate-500">
          No open games. Create one to start the lobby.
        </p>
      )}
      <div className="space-y-2">
        {games.map((g) => (
          <div
            key={g.gameId.toString()}
            className="flex items-center justify-between border border-slate-700 rounded p-3 bg-navy-light/40"
          >
            <div className="space-y-0.5">
              <div className="text-xs font-mono text-slate-300">
                {g.creator.slice(0, 6)}…{g.creator.slice(-4)}
              </div>
              <div className="text-[11px] text-slate-500">
                {Number(formatEther(g.stakeWei)).toFixed(4)} ETH ·{" "}
                {g.clockSeconds}s clock
              </div>
            </div>
            <button
              data-testid="join-game-submit"
              onClick={() => onJoin(g.gameId, g.stakeWei)}
              disabled={!ctx || joining === g.gameId.toString()}
              className="px-3 py-1.5 text-xs rounded bg-orange text-navy font-semibold hover:brightness-110 disabled:opacity-40"
            >
              {joining === g.gameId.toString() ? "Joining…" : "Join"}
            </button>
          </div>
        ))}
      </div>
      {joinError && (
        <p className="text-xs text-red-400 break-all">{joinError}</p>
      )}
    </section>
  );
}

export default function Landing() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const [mode, setMode] = useState<ActiveMode>("preview");
  const [createOpen, setCreateOpen] = useState(false);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);

  // Read mode-scoped contract address through the standard hook by wrapping
  // ourselves in the matching context.
  return (
    <ActiveModeContext.Provider value={mode}>
      <LandingInner
        ready={ready}
        authenticated={authenticated}
        login={login}
        logout={logout}
        userAddress={(user?.wallet?.address as `0x${string}` | undefined) ?? null}
        userId={user?.id ?? null}
        mode={mode}
        setMode={setMode}
        createOpen={createOpen}
        setCreateOpen={setCreateOpen}
        balanceWei={balanceWei}
        setBalanceWei={setBalanceWei}
      />
    </ActiveModeContext.Provider>
  );
}

function LandingInner(props: {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
  userAddress: `0x${string}` | null;
  userId: string | null;
  mode: ActiveMode;
  setMode: (m: ActiveMode) => void;
  createOpen: boolean;
  setCreateOpen: (o: boolean) => void;
  balanceWei: bigint | null;
  setBalanceWei: (w: bigint | null) => void;
}) {
  const {
    ready,
    authenticated,
    login,
    logout,
    userAddress,
    userId,
    mode,
    setMode,
    createOpen,
    setCreateOpen,
    balanceWei,
    setBalanceWei,
  } = props;
  const contractAddress = useActiveContractAddress();
  const pub = useMemo(() => basePublicClient(), []);

  // Poll balance for the signed-in wallet
  useEffect(() => {
    if (!userAddress) {
      setBalanceWei(null);
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const b = await pub.getBalance({ address: userAddress! });
        if (!cancelled) setBalanceWei(b);
      } catch {
        /* swallow */
      }
    }
    poll();
    const id = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userAddress, pub, setBalanceWei]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 gap-8 text-slate-100">
      <div className="max-w-3xl w-full space-y-6">
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
                {userAddress ?? userId ?? "signed in"}
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
          <ModeToggle mode={mode} setMode={setMode} />
        </section>

        <section className="flex flex-wrap gap-3">
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!ready || !authenticated}
            className="px-4 py-2 rounded bg-orange text-navy font-semibold text-sm hover:brightness-110 disabled:opacity-40"
          >
            New game
          </button>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
          >
            Get test ETH ↗
          </a>
          <Link
            to="/local"
            className="px-4 py-2 rounded border border-slate-700 text-slate-300 text-sm hover:bg-slate-800"
          >
            Local hot-seat (dev)
          </Link>
        </section>

        {authenticated && userAddress && (
          <section className="flex justify-center pt-4 border-t border-slate-800">
            <FundWalletPanel
              address={userAddress}
              balanceWei={balanceWei}
              minRequiredWei={MIN_STAKE_WEI + parseEther("0.001")}
            />
          </section>
        )}

        <PublicGamesList contractAddress={contractAddress} mode={mode} />

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

      <CreateGameDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        contractAddress={contractAddress}
        mode={mode}
        balanceWei={balanceWei}
      />
    </div>
  );
}

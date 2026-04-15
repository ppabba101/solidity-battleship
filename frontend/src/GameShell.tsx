import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusBar } from "./components/StatusBar";
import { CryptoLog, type LogEntry } from "./components/CryptoLog";
import { PlacementBoard } from "./components/PlacementBoard";
import { Grid } from "./components/Grid";
import { WinScreen } from "./components/WinScreen";
import { VizLayer, VizSidebar } from "./components/viz/VizLayer";
import { FleetStatus } from "./components/FleetStatus";
import { SunkOverlay } from "./components/SunkOverlay";
import {
  BOARD_CELLS,
  BOARD_SIZE,
  applyHits,
  idx as cellIdx,
  placeFleet,
  shipCells,
  shipDisplayName,
  type CellState,
  type Fleet,
} from "./lib/gameState";
import { randomSalt } from "./lib/prover";
import {
  simulateBoardValidity,
  simulateShotResponse,
  resetSimulator,
} from "./lib/provingSimulator";
import { clearRecent as clearVizBus } from "./lib/vizBus";
import { createBurners, getPublicClient } from "./lib/burnerWallets";
import type { ActiveMode } from "./lib/activeMode";
import {
  CONTRACT_ADDRESS,
  type ContractCtx,
  type GameEscrow,
  cancelGame as contractCancelGame,
  claimPot as contractClaimPot,
  commitBoard as contractCommitBoard,
  createGame as contractCreateGame,
  fireShot as contractFireShot,
  joinGame as contractJoinGame,
  proposeDraw as contractProposeDraw,
  readGame,
  readGameEscrow,
  respondShot as contractRespondShot,
  watchGameEvents,
} from "./lib/contract";
import { useActiveWalletClient, basePublicClient } from "./lib/privyClient";
import { useSeat, type Seat } from "./lib/useSeat";
import { useRemoteGameState } from "./lib/useRemoteGameState";
import { baseSepoliaChain } from "./lib/rpcConfig";
import { playSfx } from "./lib/sfx";
import { formatEther } from "viem";

type Phase = "placement" | "playing" | "finished";

interface PlayerState {
  fleet: Fleet;
  salt: `0x${string}`;
  // Real pedersen commitment of this player's board, set after onReady.
  // Null until the player has proven + committed.
  commitment: `0x${string}` | null;
  ownCells: CellState[];
  enemyCells: CellState[];
  shots: number;
  hits: number;
  // Cumulative 100-bit hit bitmap on THIS player's own board (confirmed hits
  // the opponent has landed). Canonical against the on-chain hitBitmapOf.
  ownHitBitmap: bigint;
}

function blankPlayer(): PlayerState {
  return {
    fleet: [],
    salt: randomSalt(),
    commitment: null,
    ownCells: Array(BOARD_CELLS).fill("EMPTY"),
    enemyCells: Array(BOARD_CELLS).fill("UNKNOWN"),
    shots: 0,
    hits: 0,
    ownHitBitmap: 0n,
  };
}

export interface GameShellProps {
  /**
   * Execution mode for the contract layer. `local` uses the anvil burner
   * wallets (hot-seat demo); `preview` + `real` use the deployed Base
   * Sepolia addresses driven by Privy-backed wallets (wired in WP4+).
   */
  mode: ActiveMode;
  /**
   * Optional gameId from the route (`/preview/g/:gameId` or
   * `/real/g/:gameId`). Used by the join flow. The local hot-seat
   * path leaves this null and mints a fresh gameId via createGame.
   */
  urlGameId?: string | null;
  /**
   * Contract address override. Defaults to the env-backed `CONTRACT_ADDRESS`
   * (local anvil). The Privy-backed routes pipe the mode-scoped address
   * via `useActiveContractAddress()`.
   */
  contractAddress?: `0x${string}`;
  /**
   * Pre-built contract context. Provided by `GameRoom` (Privy path) so the
   * GameShell body never has to call Privy hooks directly (keeps the local
   * hot-seat App.tsx mount working without a PrivyProvider).
   * `null` while the wallet is still loading.
   */
  privyCtx?: ContractCtx | null;
  /** Address of the active Privy wallet, used to identify which seat the
   * caller is sitting in (creator vs joiner) and which UI affordances to
   * show. */
  privyAddress?: `0x${string}` | null;
}

export function GameShell(props: GameShellProps) {
  if (props.mode === "local") return <LocalGameShell {...props} />;
  return <RemoteGameShell {...props} />;
}

function LocalGameShell({
  mode,
  urlGameId,
  contractAddress,
  privyCtx,
  privyAddress,
}: GameShellProps) {
  const isLocal = mode === "local";
  const effectiveAddress = (contractAddress ?? CONTRACT_ADDRESS) as `0x${string}`;
  // Optional ctx for non-local paths. When `isLocal === true` we pass
  // `undefined` to all contract helpers so they fall back to the burner
  // wallets and anvil public client just like before.
  const ctx: ContractCtx | undefined = isLocal
    ? undefined
    : privyCtx ?? undefined;
  const [phase, setPhase] = useState<Phase>("placement");
  const [player, setPlayer] = useState<0 | 1>(0);
  const [p1, setP1] = useState<PlayerState>(blankPlayer());
  const [p2, setP2] = useState<PlayerState>(blankPlayer());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [proving, setProving] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [chainConnected, setChainConnected] = useState(false);
  const [balance, setBalance] = useState("0.00");
  const [totalProvingMs, setTotalProvingMs] = useState(0);
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [gameId, setGameId] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sunkAnnouncement, setSunkAnnouncement] = useState<string | null>(null);
  // Track which opponent ship ids each shooter has fully sunk so the FleetStatus
  // tracker stays in sync across re-renders.
  const [p1SunkIds, setP1SunkIds] = useState<Set<string>>(new Set());
  const [p2SunkIds, setP2SunkIds] = useState<Set<string>>(new Set());
  // Bumped on playAgain so child components holding their own state
  // (ChainPanel tx/event buffers, BoardToHashViz, ProvingPanel leftover run)
  // fully remount instead of keeping stale values across games.
  const [resetKey, setResetKey] = useState(0);
  // Escrow state — non-local mode polls getGameEscrow whenever gameId or
  // phase changes so the WinScreen / Cancel / Draw buttons can decide what
  // to render.
  const [escrow, setEscrow] = useState<GameEscrow | null>(null);
  const [escrowError, setEscrowError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  const burners = useMemo(() => createBurners(), []);

  // Always read latest player states inside async handlers.
  const p1Ref = useRef(p1);
  const p2Ref = useRef(p2);
  // Hard lock against concurrent shot rounds. Set synchronously before any
  // async work in fireShot so rapid clicks can't overlap rounds.
  const inRoundRef = useRef(false);
  useEffect(() => {
    p1Ref.current = p1;
  }, [p1]);
  useEffect(() => {
    p2Ref.current = p2;
  }, [p2]);

  const appendLog = (
    text: string,
    proving_ms?: number,
    meta?: Partial<LogEntry>,
  ) => {
    setLog((l) => [
      ...l,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        text,
        proving_ms,
        ...meta,
      },
    ]);
  };

  useEffect(() => {
    let cancelled = false;
    const client = isLocal ? getPublicClient() : basePublicClient();
    const accountAddress = isLocal
      ? (player === 0 ? burners.player1.address : burners.player2.address)
      : (privyAddress ?? null);
    (async () => {
      try {
        await client.getBlockNumber();
        if (cancelled) return;
        setChainConnected(true);
        if (accountAddress) {
          const bal = await client.getBalance({ address: accountAddress });
          if (cancelled) return;
          setBalance(Number(formatEther(bal)).toFixed(4));
        }
      } catch {
        if (!cancelled) setChainConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, burners, isLocal, privyAddress]);

  // Remote mode: hydrate gameId from the URL on mount.
  useEffect(() => {
    if (isLocal) return;
    if (!urlGameId) return;
    try {
      setGameId(BigInt(urlGameId));
    } catch {
      setError(`Invalid gameId in URL: ${urlGameId}`);
    }
  }, [isLocal, urlGameId]);

  // Remote mode: poll getGameEscrow so cancel/draw/claim buttons reflect
  // canonical chain state.
  useEffect(() => {
    if (isLocal) return;
    if (gameId === null) return;
    let cancelled = false;
    const ctxRead = {
      address: effectiveAddress,
      publicClient: basePublicClient(),
    };
    async function poll() {
      try {
        const e = await readGameEscrow(ctxRead, gameId!);
        if (!cancelled) {
          setEscrow(e);
          setEscrowError(null);
        }
        // Read game core state too — sets winner if game has finished
        // independently of the event watcher (refresh case).
        const g = await readGame(ctxRead, gameId!);
        if (!cancelled && g.state === 3 && g.winner) {
          if (privyAddress) {
            setWinner(
              g.winner.toLowerCase() === privyAddress.toLowerCase() ? 0 : 1,
            );
          }
          setPhase("finished");
        }
      } catch (err) {
        if (!cancelled)
          setEscrowError(err instanceof Error ? err.message : String(err));
      }
    }
    poll();
    const id = window.setInterval(poll, 6_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isLocal, gameId, effectiveAddress, privyAddress]);

  // Subscribe to on-chain game events for the crypto log + win detection.
  useEffect(() => {
    let stop: (() => void) | undefined;
    const watchCtx = isLocal
      ? undefined
      : { address: effectiveAddress, publicClient: basePublicClient() };
    try {
      stop = watchGameEvents({
        onShotFired: ({ gameId: gid, x, y }) => {
          appendLog(`chain: ShotFired game=${gid} (${x},${y})`);
        },
        onShotResponded: ({ gameId: gid, hit }) => {
          appendLog(`chain: ShotResponded game=${gid} ${hit ? "HIT" : "MISS"}`);
        },
        onShipSunk: ({ gameId: gid, shipId }) => {
          appendLog(`chain: ShipSunk game=${gid} shipId=${shipId}`);
        },
        onGameWon: ({ gameId: gid, winner: w }) => {
          appendLog(`chain: GameWon game=${gid} winner=${w.slice(0, 10)}…`);
          let wIdx: 0 | 1 = 0;
          if (isLocal) {
            wIdx =
              w.toLowerCase() === burners.player1.address.toLowerCase() ? 0 : 1;
          } else if (privyAddress) {
            wIdx =
              w.toLowerCase() === privyAddress.toLowerCase() ? 0 : 1;
          }
          setWinner(wIdx);
          setPhase("finished");
          playSfx("win", muted);
        },
      }, watchCtx);
    } catch (e) {
      // Watcher fails if RPC not up — non-fatal in demo mode.
      console.warn("watchGameEvents failed", e);
    }
    return () => {
      if (stop) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burners, isLocal, effectiveAddress, privyAddress]);

  const current = player === 0 ? p1 : p2;
  const opponent = player === 0 ? p2 : p1;
  const setCurrent = player === 0 ? setP1 : setP2;
  const setOpponent = player === 0 ? setP2 : setP1;

  const onReady = async () => {
    setProving("Proving your board…");
    const proveStart = performance.now();
    try {
      const { commitment, proof, publicInputs, ms } = await simulateBoardValidity(
        current.fleet,
        current.salt,
      );
      const proveMs = ms;
      setTotalProvingMs((m) => m + proveMs);

      // On-chain: first player creates the game, both players commitBoard.
      let currentGameId = gameId;
      try {
        const chainStart = performance.now();
        if (currentGameId === null) {
          if (isLocal) {
            const opponentAddr =
              player === 0 ? burners.player2.address : burners.player1.address;
            const { gameId: gid } = await contractCreateGame(
              player,
              opponentAddr,
            );
            currentGameId = gid;
            setGameId(gid);
            appendLog(`chain: createGame → gameId=${gid.toString()}`);
          } else if (urlGameId) {
            // Remote mode: gameId comes from the route. The game was minted
            // by the Landing page's createGame dialog (or by another browser
            // who shared the link).
            currentGameId = BigInt(urlGameId);
            setGameId(currentGameId);
          } else {
            throw new Error("remote mode: missing urlGameId");
          }
        }
        const txHash = await contractCommitBoard(
          player,
          currentGameId,
          commitment,
          proof,
          publicInputs,
          ctx,
        );
        const chainMs = Math.round(performance.now() - chainStart);
        const totalMs = Math.round(performance.now() - proveStart);
        appendLog(
          `\u2713 Board proven for Player ${player + 1} (prove ${(proveMs / 1000).toFixed(2)}s, verify+tx ${(chainMs / 1000).toFixed(2)}s, total ${(totalMs / 1000).toFixed(2)}s)`,
          proveMs,
          {
            txHash,
            commitment,
            proveMs,
            chainMs,
            totalMs,
            proofBytes: Math.max(0, (proof.length - 2) / 2),
            // Skip the zero-padded public-inputs-size header at the start
            // of the proof and show 100 chars of real high-entropy bytes.
            proofPreview: proof.slice(300, 400),
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("commitBoard failed", e);
        setError(`On-chain commit failed: ${msg}`);
        appendLog(`\u26A0 commitBoard failed: ${msg.slice(0, 120)}`);
        // Keep going in demo mode so the hot-seat flow still works.
      }

      setCurrent({
        ...current,
        commitment,
        ownCells: placeFleet(current.fleet),
      });
      const otherReady = (player === 0 ? p2 : p1).fleet.length === 5;
      if (otherReady) {
        setPhase("playing");
        // Player 1 always shoots first to match the on-chain turn (game creator).
        setPlayer(0);
        appendLog("\u2713 Both boards committed on-chain. Battle begins.");
      } else {
        setPlayer((player === 0 ? 1 : 0) as 0 | 1);
      }
    } finally {
      setProving(null);
    }
  };

  const fireShot = async (i: number) => {
    if (phase !== "playing") return;
    if (inRoundRef.current) return;
    if (current.enemyCells[i] !== "UNKNOWN") return;
    inRoundRef.current = true;
    try {
      await runShotRound(i);
    } finally {
      inRoundRef.current = false;
    }
  };

  const runShotRound = async (i: number) => {
    const x = i % BOARD_SIZE;
    const y = Math.floor(i / BOARD_SIZE);
    playSfx("fire", muted);

    const pending = current.enemyCells.slice();
    pending[i] = "PENDING_SHOT";
    setCurrent({ ...current, enemyCells: pending });

    const revertPending = () => {
      const reverted = current.enemyCells.slice();
      reverted[i] = "UNKNOWN";
      setCurrent({ ...current, enemyCells: reverted });
      setProving(null);
    };

    // 1) fireShot tx from shooter burner. MUST succeed before we prove the
    //    response or submit respondShot — otherwise the chain has no pending
    //    shot and respondShot will always revert with "no pending shot".
    if (gameId !== null) {
      try {
        setProving("Submitting shot on-chain…");
        const fireStart = performance.now();
        const tx = await contractFireShot(player, gameId, x, y, ctx);
        const fireMs = Math.round(performance.now() - fireStart);
        appendLog(
          `chain: fireShot (${x},${y}) verify+tx ${(fireMs / 1000).toFixed(2)}s`,
          undefined,
          { txHash: tx, chainMs: fireMs, totalMs: fireMs },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("fireShot failed", e);
        setError(`On-chain fireShot failed: ${msg}`);
        appendLog(`\u26A0 fireShot failed: ${msg.slice(0, 120)}`);
        revertPending();
        return;
      }
    }

    // 2) Compute + prove response as the opponent (hot-seat local demo).
    //    Pass the opponent's canonical pre-shot hit bitmap into the circuit so
    //    the proof binds sunk_ship_id to the actual on-chain state.
    setProving(`Proving shot (${x},${y})…`);
    const proveWallStart = performance.now();
    const { hit, sunkShipId, proof, publicInputs: shotPublicInputs, ms } =
      await simulateShotResponse(
        opponent.fleet,
        opponent.salt,
        x,
        y,
        opponent.ownHitBitmap,
      );
    const proveMs = ms;
    setTotalProvingMs((m) => m + proveMs);
    playSfx(hit ? "hit" : "miss", muted);

    // 3) respondShot tx from opponent burner.
    if (gameId !== null) {
      try {
        setProving("Submitting response on-chain…");
        const responder: 0 | 1 = player === 0 ? 1 : 0;
        const respondChainStart = performance.now();
        const tx = await contractRespondShot(responder, gameId, hit, proof, shotPublicInputs);
        const chainMs = Math.round(performance.now() - respondChainStart);
        const totalMs = Math.round(performance.now() - proveWallStart);
        appendLog(
          `\u2713 Shot (${x},${y}) ${hit ? "HIT" : "MISS"} (prove ${(proveMs / 1000).toFixed(2)}s, verify+tx ${(chainMs / 1000).toFixed(2)}s, total ${(totalMs / 1000).toFixed(2)}s)`,
          proveMs,
          {
            txHash: tx,
            proveMs,
            chainMs,
            totalMs,
            proofBytes: Math.max(0, (proof.length - 2) / 2),
            // Skip the zero-padded public-inputs-size header at the start
            // of the proof and show 100 chars of real high-entropy bytes.
            proofPreview: proof.slice(300, 400),
          },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("respondShot failed", e);
        setError(`On-chain respondShot failed: ${msg}`);
        appendLog(`\u26A0 respondShot failed: ${msg.slice(0, 120)}`);
        revertPending();
        return;
      }
    }

    const nextEnemy = current.enemyCells.slice();
    nextEnemy[i] = hit ? "CONFIRMED_HIT" : "CONFIRMED_MISS";
    const nextShots = current.shots + 1;
    const nextHits = current.hits + (hit ? 1 : 0);
    let nextOpponentCells = applyHits(opponent.ownCells, [{ x, y, hit }]);
    const nextOpponentBitmap =
      hit ? opponent.ownHitBitmap | (1n << BigInt(y * 10 + x)) : opponent.ownHitBitmap;

    // Sink detection is now circuit-driven: the prover returns sunkShipId in
    // {0, 1..=5}, cryptographically bound to the opponent's committed fleet
    // and the canonical pre-shot bitmap enforced by the contract. We use the
    // 1-indexed id to look up the ship in the canonical fleet order.
    const shooterPrevSunk = player === 0 ? p1SunkIds : p2SunkIds;
    const setShooterSunk = player === 0 ? setP1SunkIds : setP2SunkIds;
    if (sunkShipId > 0) {
      const canonical = [
        "carrier",
        "battleship",
        "cruiser",
        "submarine",
        "destroyer",
      ];
      const sunkId = canonical[sunkShipId - 1];
      const sunkShip = opponent.fleet.find((s) => s.id === sunkId);
      if (sunkShip && !shooterPrevSunk.has(sunkShip.id)) {
        for (const { x: sx, y: sy } of shipCells(sunkShip)) {
          const ci = cellIdx(sx, sy);
          nextEnemy[ci] = "SUNK";
          nextOpponentCells[ci] = "SUNK";
        }
        const updatedSunk = new Set(shooterPrevSunk);
        updatedSunk.add(sunkShip.id);
        setShooterSunk(updatedSunk);

        const name = shipDisplayName(sunkShip.id);
        appendLog(`\u2693 ${name} SUNK! (zk-verified, shipId=${sunkShipId})`);
        playSfx("sunk", muted);
        setSunkAnnouncement(name);
        window.setTimeout(() => {
          setSunkAnnouncement((cur) => (cur === name ? null : cur));
        }, 2000);
      }
    }

    setCurrent({
      ...current,
      enemyCells: nextEnemy,
      shots: nextShots,
      hits: nextHits,
    });
    setOpponent({
      ...opponent,
      ownCells: nextOpponentCells,
      ownHitBitmap: nextOpponentBitmap,
    });
    setProving(null);

    if (nextHits >= 17) {
      playSfx("win", muted);
      setWinner(player);
      setPhase("finished");
      appendLog(`Player ${player + 1} wins! All 17 hull cells destroyed.`);
      return;
    }
    // Classic battleship: hit keeps turn, miss flips.
    if (!hit) {
      setPlayer((player === 0 ? 1 : 0) as 0 | 1);
    }
  };

  const refreshEscrow = async () => {
    if (isLocal || gameId === null) return;
    try {
      const e = await readGameEscrow(
        { address: effectiveAddress, publicClient: basePublicClient() },
        gameId,
      );
      setEscrow(e);
    } catch (err) {
      setEscrowError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClaimPot = async () => {
    if (!ctx || gameId === null) return;
    setActionPending("claim");
    try {
      await contractClaimPot(ctx, gameId);
      appendLog("✓ claimPot succeeded");
      await refreshEscrow();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`claimPot failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const handleCancelGame = async () => {
    if (!ctx || gameId === null) return;
    setActionPending("cancel");
    try {
      await contractCancelGame(ctx, gameId);
      appendLog("✓ cancelGame succeeded");
      await refreshEscrow();
      setPhase("finished");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`cancelGame failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const handleProposeDraw = async () => {
    if (!ctx || gameId === null) return;
    setActionPending("draw");
    try {
      await contractProposeDraw(ctx, gameId);
      appendLog("✓ proposeDraw succeeded");
      await refreshEscrow();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`proposeDraw failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const handleJoinGame = async () => {
    if (!ctx || gameId === null || !escrow) return;
    setActionPending("join");
    try {
      await contractJoinGame(ctx, gameId, escrow.stakeWei);
      appendLog("✓ joinGame succeeded");
      await refreshEscrow();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`joinGame failed: ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  void handleJoinGame;
  void escrowError;

  const playAgain = () => {
    setP1(blankPlayer());
    setP2(blankPlayer());
    setLog([]);
    setTotalProvingMs(0);
    setWinner(null);
    setPlayer(0);
    setGameId(null);
    setError(null);
    setP1SunkIds(new Set());
    setP2SunkIds(new Set());
    setSunkAnnouncement(null);
    setPhase("placement");
    // Clear module-level state that isn't tied to React re-renders.
    clearVizBus();
    resetSimulator();
    // Force ChainPanel, BoardToHashViz, and ProvingPanel to fully remount
    // so their own useState buffers (tx ring, events, last run) reset.
    setResetKey((k) => k + 1);
  };

  const shareUrl =
    !isLocal && gameId !== null
      ? `${window.location.origin}/${mode}/g/${gameId.toString()}`
      : null;
  const isCreator =
    !isLocal && escrow !== null && privyAddress !== null;
  // pot/2 = stake; show pretty ETH
  const stakeEth =
    escrow && escrow.stakeWei > 0n
      ? Number(formatEther(escrow.stakeWei)).toFixed(4)
      : "0";
  const potEth =
    escrow && escrow.pot > 0n
      ? Number(formatEther(escrow.pot)).toFixed(4)
      : "0";
  void isCreator;

  return (
    <div className="h-full flex flex-col">
      {!isLocal && mode === "preview" && (
        <div
          data-testid="preview-banner"
          className="w-full bg-amber-900/50 border-b border-amber-600 text-amber-100 text-xs px-4 py-2 text-center"
        >
          Preview mode — proofs are simulated for UX testing. Switch to Real
          mode for cryptographic guarantees.
        </div>
      )}
      <VizLayer key={`viz-layer-${resetKey}`} />
      <StatusBar
        player={player}
        onSwitchPlayer={() => setPlayer((player === 0 ? 1 : 0) as 0 | 1)}
        chainConnected={chainConnected}
        balance={balance}
        muted={muted}
        onToggleMute={() => setMuted((m) => !m)}
        onDeployFresh={playAgain}
      />
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 overflow-auto p-8">
          {phase === "placement" && (
            <div className="max-w-4xl mx-auto">
              <div className="mb-8 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-orange font-semibold">
                  Phase 1 — Placement
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Player {player + 1}, place your fleet
                </h1>
                <p className="text-slate-400 text-sm max-w-2xl">
                  Drag ships onto the grid, press R to rotate, then click Ready
                  to prove board legality.
                </p>
                <p className="text-slate-500 text-[11px] font-mono pt-1 break-all">
                  contract: {CONTRACT_ADDRESS}
                </p>
              </div>
              {!isLocal && shareUrl && (
                <div className="mb-4 p-3 rounded border border-slate-700 bg-navy-light/40 space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    Share link
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs text-slate-200 break-all flex-1">
                      {shareUrl}
                    </code>
                    <button
                      data-testid="share-link-copy"
                      onClick={() => navigator.clipboard.writeText(shareUrl)}
                      className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 hover:bg-slate-700"
                    >
                      Copy
                    </button>
                  </div>
                  {escrow && (
                    <div className="text-xs text-slate-400">
                      Stake: <span className="text-white">{stakeEth} ETH</span>
                      {" · "}Pot: <span className="text-white">{potEth} ETH</span>
                    </div>
                  )}
                </div>
              )}
              {!isLocal && escrow && escrow.pot <= escrow.stakeWei && (
                <div className="mb-4">
                  <button
                    data-testid="cancel-game-button"
                    onClick={handleCancelGame}
                    disabled={!!actionPending}
                    className="px-3 py-1.5 text-xs rounded border border-red-700 text-red-300 hover:bg-red-900/30 disabled:opacity-40"
                  >
                    {actionPending === "cancel" ? "Canceling…" : "Cancel game (refund)"}
                  </button>
                </div>
              )}
              <div data-testid="placement-ready-wrapper">
                <PlacementBoard
                  fleet={current.fleet}
                  setFleet={(f) => setCurrent({ ...current, fleet: f })}
                  onReady={onReady}
                  proving={!!proving}
                />
              </div>
            </div>
          )}

          {phase === "playing" && (
            <div className="max-w-5xl mx-auto">
              <div className="mb-8 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.2em] text-orange font-semibold">
                  Phase 2 — Battle
                </div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange" />
                  </span>
                  Player {player + 1}'s turn
                </h1>
                <p className="text-slate-400 text-sm max-w-2xl">
                  Click a cell on Enemy Waters to fire. Every response is proven
                  in zk.
                </p>
              </div>
              <div className="flex gap-10 items-start">
                <Grid cells={current.ownCells} label="Your Fleet" />
                <Grid
                  cells={current.enemyCells}
                  label="Enemy Waters"
                  onCellClick={fireShot}
                  disabled={!!proving}
                />
                <FleetStatus
                  opponentFleet={opponent.fleet}
                  sunkShipIds={player === 0 ? p1SunkIds : p2SunkIds}
                />
              </div>
              {!isLocal && escrow && (
                <div className="mt-4">
                  <button
                    data-testid="propose-draw-button"
                    onClick={handleProposeDraw}
                    disabled={!!actionPending}
                    className="px-3 py-1.5 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    {actionPending === "draw" ? "Proposing…" : "Propose draw"}
                  </button>
                  {escrow.drawProposed[0] || escrow.drawProposed[1] ? (
                    <span className="ml-3 text-xs text-amber-400">
                      Draw proposed by{" "}
                      {escrow.drawProposed[0] && escrow.drawProposed[1]
                        ? "both players"
                        : "one player"}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </main>
        <aside className="w-96 shrink-0 border-l border-navy-light bg-navy/60 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-navy-light">
            <VizSidebar
              key={`viz-sidebar-${resetKey}`}
              fleet={current.fleet}
              commitment={current.commitment}
              salt={current.salt}
            />
          </div>
          <CryptoLog entries={log} />
        </aside>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 max-w-sm bg-red-900/90 border border-red-500 rounded-lg p-4 shadow-2xl"
          >
            <div className="text-sm font-semibold text-red-100 mb-1">
              Chain error
            </div>
            <div className="text-xs text-red-200 font-mono break-all">
              {error}
            </div>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-xs text-red-300 hover:text-white underline"
            >
              dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <SunkOverlay shipName={sunkAnnouncement} />

      <WinScreen
        open={phase === "finished"}
        won={winner === player}
        shots={current.shots}
        hits={current.hits}
        provingMs={totalProvingMs}
        onPlayAgain={playAgain}
        potEth={!isLocal && escrow ? potEth : undefined}
        paidOut={!isLocal && escrow ? escrow.paidOut : undefined}
        canClaim={!isLocal && winner === player && !!escrow && !escrow.paidOut}
        onClaimPot={handleClaimPot}
        claiming={actionPending === "claim"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remote (Privy) game shell — seat-aware single-player view.
// ---------------------------------------------------------------------------

function RemoteGameShell({
  mode,
  urlGameId,
  contractAddress,
  privyCtx,
  privyAddress,
}: GameShellProps) {
  const effectiveAddress = (contractAddress ?? CONTRACT_ADDRESS) as `0x${string}`;
  const ctx: ContractCtx | null = privyCtx ?? null;
  const gameId =
    urlGameId && urlGameId.length > 0
      ? (() => {
          try {
            return BigInt(urlGameId);
          } catch {
            return null;
          }
        })()
      : null;

  const { status, refetch } = useSeat({
    ctx,
    gameId,
    myAddress: privyAddress ?? null,
  });

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [autoJoinCancelled, setAutoJoinCancelled] = useState(false);

  // Auto-join countdown: when we land on a joinable game via share link,
  // wait 2 s then fire joinGame unless the user clicks Cancel.
  useEffect(() => {
    if (status.kind !== "joinable") return;
    if (autoJoinCancelled) return;
    if (!ctx || gameId === null) return;
    const handle = window.setTimeout(async () => {
      setJoining(true);
      setJoinError(null);
      try {
        await contractJoinGame(ctx, gameId, status.stakeWei);
        refetch();
      } catch (e) {
        setJoinError(e instanceof Error ? e.message : String(e));
      } finally {
        setJoining(false);
      }
    }, 2000);
    return () => window.clearTimeout(handle);
  }, [status, ctx, gameId, refetch, autoJoinCancelled]);

  const onManualJoin = async () => {
    if (status.kind !== "joinable" || !ctx || gameId === null) return;
    setJoining(true);
    setJoinError(null);
    try {
      await contractJoinGame(ctx, gameId, status.stakeWei);
      refetch();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {mode === "preview" && (
        <div
          data-testid="preview-banner"
          className="w-full bg-amber-900/50 border-b border-amber-600 text-amber-100 text-xs px-4 py-2 text-center"
        >
          Preview mode — proofs are simulated for UX testing. Switch to Real
          mode for cryptographic guarantees.
        </div>
      )}
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-[0.2em] text-orange font-semibold">
              {mode === "preview" ? "Preview" : "Real"} game
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Game #{gameId !== null ? gameId.toString() : "?"}
            </h1>
            <p className="text-slate-500 text-[11px] font-mono break-all">
              contract: {effectiveAddress}
            </p>
            {privyAddress && (
              <p className="text-slate-500 text-[11px] font-mono break-all">
                you: {privyAddress}
              </p>
            )}
          </div>

          {status.kind === "loading" && (
            <div className="text-slate-300">Loading game state…</div>
          )}

          {status.kind === "not-found" && (
            <div className="text-slate-300">
              Game not found.{" "}
              <a href="/" className="text-orange underline">
                Back to lobby
              </a>
            </div>
          )}

          {status.kind === "error" && (
            <div className="space-y-2">
              <div className="text-red-300 text-sm break-all">
                {status.error.message}
              </div>
              <button
                onClick={refetch}
                className="px-3 py-1 rounded border border-slate-600 text-slate-200 text-sm hover:bg-slate-800"
              >
                Retry
              </button>
            </div>
          )}

          {status.kind === "spectator" && (
            <div className="text-slate-300">
              You're not a player in this game.{" "}
              <a href="/" className="text-orange underline">
                Back to lobby
              </a>
            </div>
          )}

          {status.kind === "joinable" && (
            <div className="space-y-3 p-4 rounded border border-slate-700 bg-navy-light/40">
              <div className="text-sm text-slate-200">
                Creator{" "}
                <span className="font-mono text-xs">
                  {status.creatorAddress.slice(0, 10)}…
                </span>{" "}
                wagered{" "}
                <span className="font-semibold text-white">
                  {Number(formatEther(status.stakeWei)).toFixed(4)} ETH
                </span>
                {" · "}clock {status.clockSeconds}s
              </div>
              {!autoJoinCancelled && !joining && (
                <div className="text-amber-300 text-xs">
                  Auto-joining in 2 seconds…
                </div>
              )}
              <div className="flex gap-2">
                <button
                  data-testid="remote-join-button"
                  onClick={onManualJoin}
                  disabled={joining}
                  className="px-3 py-1.5 text-sm rounded bg-orange text-navy font-semibold disabled:opacity-50"
                >
                  {joining
                    ? "Joining…"
                    : `Join (${Number(formatEther(status.stakeWei)).toFixed(4)} ETH)`}
                </button>
                {!autoJoinCancelled && (
                  <button
                    onClick={() => setAutoJoinCancelled(true)}
                    disabled={joining}
                    className="px-3 py-1.5 text-sm rounded border border-slate-600 text-slate-200 hover:bg-slate-800"
                  >
                    Cancel auto-join
                  </button>
                )}
              </div>
              {joinError && (
                <div className="text-xs text-red-300 break-all">{joinError}</div>
              )}
            </div>
          )}

          {status.kind === "seated" && ctx && gameId !== null && privyAddress && (
            <SeatedRemoteGame
              ctx={ctx}
              gameId={gameId}
              mySeat={status.seat}
              opponentAddress={status.opponentAddress}
              myAddress={privyAddress}
              mode={mode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface SeatedRemoteGameProps {
  ctx: ContractCtx;
  gameId: bigint;
  mySeat: Seat;
  opponentAddress: `0x${string}`;
  myAddress: `0x${string}`;
  mode: ActiveMode;
}

interface MyPlayerState {
  fleet: Fleet;
  salt: `0x${string}`;
  commitment: `0x${string}` | null;
  ownCells: CellState[];
}

function blankMyPlayer(): MyPlayerState {
  return {
    fleet: [],
    salt: randomSalt(),
    commitment: null,
    ownCells: Array(BOARD_CELLS).fill("EMPTY"),
  };
}

function bitmapToHitCells(bitmap: bigint): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < BOARD_CELLS; i++) {
    if ((bitmap >> BigInt(i)) & 1n) out.add(i);
  }
  return out;
}

function SeatedRemoteGame({
  ctx,
  gameId,
  mySeat,
  opponentAddress,
  myAddress,
  mode,
}: SeatedRemoteGameProps) {
  const { state: remote, refetch } = useRemoteGameState({
    ctx,
    gameId,
    mySeat,
  });
  const [me, setMe] = useState<MyPlayerState>(blankMyPlayer());
  const [proving, setProving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [escrow, setEscrow] = useState<GameEscrow | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const inRoundRef = useRef(false);

  const appendLog = (text: string, meta?: Partial<LogEntry>) => {
    setLog((l) => [
      ...l,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        text,
        ...meta,
      },
    ]);
  };

  // Refresh escrow alongside game state for the WinScreen / pot UI.
  useEffect(() => {
    let cancelled = false;
    const readCtx = { address: ctx.address, publicClient: ctx.publicClient };
    async function poll() {
      try {
        const e = await readGameEscrow(readCtx, gameId);
        if (!cancelled) setEscrow(e);
      } catch {
        /* non-fatal */
      }
    }
    poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ctx, gameId]);

  const phase = remote?.phase ?? "placement";
  const isMyTurnToFire =
    !!remote && remote.phase === "playing" && !remote.shotPending && remote.turn === mySeat;
  const isMyTurnToRespond =
    !!remote &&
    remote.phase === "playing" &&
    remote.shotPending &&
    remote.turn === ((1 - mySeat) as Seat);

  // When opponent fires, automatically prove + submit our shot response.
  // Guard with inRoundRef to keep pollers from triggering duplicate sends.
  useEffect(() => {
    if (!remote || !isMyTurnToRespond) return;
    if (!me.commitment || me.fleet.length !== 5) return;
    if (inRoundRef.current) return;
    inRoundRef.current = true;
    (async () => {
      try {
        const x = remote.pendingX;
        const y = remote.pendingY;
        setProving(`Proving response (${x},${y})…`);
        const { hit, proof, publicInputs, ms } = await simulateShotResponse(
          me.fleet,
          me.salt,
          x,
          y,
          remote.myHitBitmap,
        );
        appendLog(
          `prove respond (${x},${y}) ${hit ? "HIT" : "MISS"} (${(ms / 1000).toFixed(2)}s)`,
        );
        setProving("Submitting response on-chain…");
        await contractRespondShot(mySeat, gameId, hit, proof, publicInputs, ctx);
        appendLog(`✓ respondShot tx mined`);
        refetch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("respondShot failed", e);
        setError(`respondShot failed: ${msg}`);
      } finally {
        setProving(null);
        inRoundRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurnToRespond, remote?.pendingX, remote?.pendingY, me.commitment]);

  const onReady = async () => {
    setProving("Proving your board…");
    try {
      const { commitment, proof, publicInputs, ms } = await simulateBoardValidity(
        me.fleet,
        me.salt,
      );
      appendLog(`prove board (${(ms / 1000).toFixed(2)}s)`);
      setProving("Submitting commitBoard on-chain…");
      const tx = await contractCommitBoard(
        mySeat,
        gameId,
        commitment,
        proof,
        publicInputs,
        ctx,
      );
      appendLog(`✓ commitBoard tx ${tx.slice(0, 10)}…`);
      setMe({
        ...me,
        commitment,
        ownCells: placeFleet(me.fleet),
      });
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("commitBoard failed", e);
      setError(`commitBoard failed: ${msg}`);
    } finally {
      setProving(null);
    }
  };

  const fireAt = async (i: number) => {
    if (!isMyTurnToFire || !remote) return;
    if (inRoundRef.current) return;
    inRoundRef.current = true;
    try {
      const x = i % BOARD_SIZE;
      const y = Math.floor(i / BOARD_SIZE);
      setProving("Submitting fireShot on-chain…");
      await contractFireShot(mySeat, gameId, x, y, ctx);
      appendLog(`✓ fireShot (${x},${y})`);
      refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("fireShot failed", e);
      setError(`fireShot failed: ${msg}`);
    } finally {
      setProving(null);
      inRoundRef.current = false;
    }
  };

  const handleClaimPot = async () => {
    setActionPending("claim");
    try {
      await contractClaimPot(ctx, gameId);
      appendLog("✓ claimPot");
      const e = await readGameEscrow(
        { address: ctx.address, publicClient: ctx.publicClient },
        gameId,
      );
      setEscrow(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionPending(null);
    }
  };

  // Build defense (my fleet + opponent's hits on me) and offense (my hits on
  // opponent) cell views from on-chain state.
  const defenseCells: CellState[] = (() => {
    const base = placeFleet(me.fleet);
    if (!remote) return base;
    const hits = bitmapToHitCells(remote.myHitBitmap);
    for (const i of hits) {
      base[i] = base[i] === "OWN_SHIP" ? "OWN_SHIP_HIT" : "OWN_MISS";
    }
    return base;
  })();

  const offenseCells: CellState[] = (() => {
    const cells: CellState[] = Array(BOARD_CELLS).fill("UNKNOWN");
    if (!remote) return cells;
    // We don't know misses (no chain record of misses on the offense view in
    // single-seat mode without per-shot indexing); show landed hits only.
    const hits = bitmapToHitCells(remote.opponentHitBitmap);
    for (const i of hits) cells[i] = "CONFIRMED_HIT";
    if (remote.shotPending && remote.turn === mySeat) {
      // We fired and are awaiting opponent's response.
      const i = remote.pendingY * BOARD_SIZE + remote.pendingX;
      if (cells[i] === "UNKNOWN") cells[i] = "PENDING_SHOT";
    }
    return cells;
  })();

  const finished = remote?.phase === "finished";
  const won =
    finished && remote?.winner.toLowerCase() === myAddress.toLowerCase();
  const potEth =
    escrow && escrow.pot > 0n
      ? Number(formatEther(escrow.pot)).toFixed(4)
      : "0";
  void mode;
  void opponentAddress;

  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-400">
        Seat {mySeat} · opponent{" "}
        <span className="font-mono">{opponentAddress.slice(0, 10)}…</span>
      </div>

      {phase === "placement" && !me.commitment && (
        <div data-testid="remote-placement">
          <h2 className="text-xl font-semibold mb-3">Place your fleet</h2>
          <PlacementBoard
            fleet={me.fleet}
            setFleet={(f) => setMe({ ...me, fleet: f })}
            onReady={onReady}
            proving={!!proving}
          />
        </div>
      )}

      {phase === "placement" && me.commitment && (
        <div className="text-slate-200">
          ✓ Your board is committed. Waiting for opponent to commit…
        </div>
      )}

      {phase === "playing" && (
        <div className="space-y-4">
          <div className="text-sm">
            {isMyTurnToFire && (
              <span className="text-orange font-semibold">
                Your turn — fire on Enemy Waters
              </span>
            )}
            {isMyTurnToRespond && (
              <span className="text-amber-300 font-semibold">
                Opponent fired ({remote!.pendingX},{remote!.pendingY}) — proving
                response…
              </span>
            )}
            {!isMyTurnToFire && !isMyTurnToRespond && (
              <span className="text-slate-400">Waiting for opponent…</span>
            )}
          </div>
          <div className="flex gap-10 items-start flex-wrap">
            <Grid cells={defenseCells} label="Your Fleet" />
            <Grid
              cells={offenseCells}
              label="Enemy Waters"
              onCellClick={fireAt}
              disabled={!isMyTurnToFire || !!proving}
            />
          </div>
        </div>
      )}

      {proving && (
        <div className="text-xs text-slate-400">{proving}</div>
      )}

      {error && (
        <div className="text-xs text-red-300 break-all">
          {error}{" "}
          <button
            onClick={() => setError(null)}
            className="underline ml-2"
          >
            dismiss
          </button>
        </div>
      )}

      {log.length > 0 && (
        <div className="text-[11px] text-slate-500 font-mono space-y-0.5 pt-2 border-t border-slate-800">
          {log.slice(-6).map((l) => (
            <div key={l.id}>{l.text}</div>
          ))}
        </div>
      )}

      <WinScreen
        open={finished}
        won={!!won}
        shots={remote?.myHits ?? 0}
        hits={remote?.myHits ?? 0}
        provingMs={0}
        onPlayAgain={() => {
          window.location.href = "/";
        }}
        potEth={escrow ? potEth : undefined}
        paidOut={escrow ? escrow.paidOut : undefined}
        canClaim={!!won && !!escrow && !escrow.paidOut}
        onClaimPot={handleClaimPot}
        claiming={actionPending === "claim"}
      />
    </div>
  );
}

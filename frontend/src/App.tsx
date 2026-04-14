import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StatusBar } from "./components/StatusBar";
import { CryptoLog, type LogEntry } from "./components/CryptoLog";
import { PlacementBoard } from "./components/PlacementBoard";
import { Grid } from "./components/Grid";
import { WinScreen } from "./components/WinScreen";
import { VizLayer, VizSidebar } from "./components/viz/VizLayer";
import {
  BOARD_CELLS,
  BOARD_SIZE,
  applyHits,
  placeFleet,
  type CellState,
  type Fleet,
} from "./lib/gameState";
import { randomSalt } from "./lib/prover";
import {
  simulateBoardValidity,
  simulateShotResponse,
} from "./lib/provingSimulator";
import { createBurners, getPublicClient } from "./lib/burnerWallets";
import {
  CONTRACT_ADDRESS,
  commitBoard as contractCommitBoard,
  createGame as contractCreateGame,
  fireShot as contractFireShot,
  respondShot as contractRespondShot,
  watchGameEvents,
} from "./lib/contract";
import { playSfx } from "./lib/sfx";
import { formatEther } from "viem";

type Phase = "placement" | "playing" | "finished";

interface PlayerState {
  fleet: Fleet;
  salt: `0x${string}`;
  ownCells: CellState[];
  enemyCells: CellState[];
  shots: number;
  hits: number;
}

function blankPlayer(): PlayerState {
  return {
    fleet: [],
    salt: randomSalt(),
    ownCells: Array(BOARD_CELLS).fill("EMPTY"),
    enemyCells: Array(BOARD_CELLS).fill("UNKNOWN"),
    shots: 0,
    hits: 0,
  };
}

export default function App() {
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

  const appendLog = (text: string, proving_ms?: number) => {
    setLog((l) => [
      ...l,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        text,
        proving_ms,
      },
    ]);
  };

  useEffect(() => {
    let cancelled = false;
    const client = getPublicClient();
    const account = player === 0 ? burners.player1 : burners.player2;
    (async () => {
      try {
        await client.getBlockNumber();
        if (cancelled) return;
        setChainConnected(true);
        const bal = await client.getBalance({ address: account.address });
        if (cancelled) return;
        setBalance(Number(formatEther(bal)).toFixed(2));
      } catch {
        if (!cancelled) setChainConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player, burners]);

  // Subscribe to on-chain game events for the crypto log + win detection.
  useEffect(() => {
    let stop: (() => void) | undefined;
    try {
      stop = watchGameEvents({
        onShotFired: ({ gameId: gid, x, y }) => {
          appendLog(`chain: ShotFired game=${gid} (${x},${y})`);
        },
        onShotResponded: ({ gameId: gid, hit }) => {
          appendLog(`chain: ShotResponded game=${gid} ${hit ? "HIT" : "MISS"}`);
        },
        onGameWon: ({ gameId: gid, winner: w }) => {
          appendLog(`chain: GameWon game=${gid} winner=${w.slice(0, 10)}…`);
          const wIdx =
            w.toLowerCase() === burners.player1.address.toLowerCase() ? 0 : 1;
          setWinner(wIdx as 0 | 1);
          setPhase("finished");
          playSfx("win", muted);
        },
      });
    } catch (e) {
      // Watcher fails if RPC not up — non-fatal in demo mode.
      console.warn("watchGameEvents failed", e);
    }
    return () => {
      if (stop) stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burners]);

  const current = player === 0 ? p1 : p2;
  const opponent = player === 0 ? p2 : p1;
  const setCurrent = player === 0 ? setP1 : setP2;
  const setOpponent = player === 0 ? setP2 : setP1;

  const onReady = async () => {
    setProving("Proving your board…");
    const start = performance.now();
    try {
      const { commitment, proof, publicInputs, ms } = await simulateBoardValidity(
        current.fleet,
        current.salt,
      );
      const elapsed = Math.round(performance.now() - start);
      setTotalProvingMs((m) => m + ms);
      appendLog(
        `\u2713 Board legality proven for Player ${player + 1} in ${(elapsed / 1000).toFixed(2)}s`,
        ms,
      );

      // On-chain: first player creates the game, both players commitBoard.
      let currentGameId = gameId;
      try {
        if (currentGameId === null) {
          const opponentAddr =
            player === 0 ? burners.player2.address : burners.player1.address;
          const { gameId: gid } = await contractCreateGame(
            player,
            opponentAddr,
          );
          currentGameId = gid;
          setGameId(gid);
          appendLog(`chain: createGame → gameId=${gid.toString()}`);
        }
        const txHash = await contractCommitBoard(
          player,
          currentGameId,
          commitment,
          proof,
          publicInputs,
        );
        appendLog(
          `chain: commitBoard tx=${txHash.slice(0, 10)}… commitment=${commitment.slice(0, 10)}…`,
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

    // 1) fireShot tx from shooter burner.
    if (gameId !== null) {
      try {
        setProving("Submitting shot on-chain…");
        const tx = await contractFireShot(player, gameId, x, y);
        appendLog(`chain: fireShot tx=${tx.slice(0, 10)}… (${x},${y})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("fireShot failed", e);
        setError(`On-chain fireShot failed: ${msg}`);
        appendLog(`\u26A0 fireShot failed: ${msg.slice(0, 120)}`);
      }
    }

    // 2) Compute + prove response as the opponent (hot-seat local demo).
    setProving(`Proving shot (${x},${y})…`);
    const start = performance.now();
    const { hit, proof, publicInputs: shotPublicInputs, ms } = await simulateShotResponse(
      opponent.fleet,
      opponent.salt,
      x,
      y,
    );
    const elapsed = Math.round(performance.now() - start);
    setTotalProvingMs((m) => m + ms);
    appendLog(
      `\u2713 Shot at (${x},${y}) proven ${hit ? "HIT" : "MISS"} in ${(elapsed / 1000).toFixed(2)}s`,
      ms,
    );
    playSfx(hit ? "hit" : "miss", muted);

    // 3) respondShot tx from opponent burner.
    if (gameId !== null) {
      try {
        setProving("Submitting response on-chain…");
        const responder: 0 | 1 = player === 0 ? 1 : 0;
        const tx = await contractRespondShot(responder, gameId, hit, proof, shotPublicInputs);
        appendLog(
          `chain: respondShot tx=${tx.slice(0, 10)}… ${hit ? "HIT" : "MISS"}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("respondShot failed", e);
        setError(`On-chain respondShot failed: ${msg}`);
        appendLog(`\u26A0 respondShot failed: ${msg.slice(0, 120)}`);
      }
    }

    const nextEnemy = current.enemyCells.slice();
    nextEnemy[i] = hit ? "CONFIRMED_HIT" : "CONFIRMED_MISS";
    const nextShots = current.shots + 1;
    const nextHits = current.hits + (hit ? 1 : 0);
    setCurrent({
      ...current,
      enemyCells: nextEnemy,
      shots: nextShots,
      hits: nextHits,
    });
    setOpponent({
      ...opponent,
      ownCells: applyHits(opponent.ownCells, [{ x, y, hit }]),
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

  const playAgain = () => {
    setP1(blankPlayer());
    setP2(blankPlayer());
    setLog([]);
    setTotalProvingMs(0);
    setWinner(null);
    setPlayer(0);
    setGameId(null);
    setError(null);
    setPhase("placement");
  };

  return (
    <div className="h-full flex flex-col">
      <VizLayer />
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
              <PlacementBoard
                fleet={current.fleet}
                setFleet={(f) => setCurrent({ ...current, fleet: f })}
                onReady={onReady}
                proving={!!proving}
              />
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
              <div className="flex gap-10">
                <Grid cells={current.ownCells} label="Your Fleet" />
                <Grid
                  cells={current.enemyCells}
                  label="Enemy Waters"
                  onCellClick={fireShot}
                  disabled={!!proving}
                />
              </div>
            </div>
          )}
        </main>
        <aside className="w-96 shrink-0 border-l border-navy-light bg-navy/60 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-navy-light">
            <VizSidebar />
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

      <WinScreen
        open={phase === "finished"}
        won={winner === player}
        shots={current.shots}
        hits={current.hits}
        provingMs={totalProvingMs}
        onPlayAgain={playAgain}
      />
    </div>
  );
}

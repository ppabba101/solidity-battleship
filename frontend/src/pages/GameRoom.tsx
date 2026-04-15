import { useParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import {
  ActiveModeContext,
  useActiveContractAddress,
  type ActiveMode,
} from "../lib/activeMode";
import { GameShell } from "../GameShell";
import { useContractCtx } from "../lib/privyClient";

interface GameRoomProps {
  mode: Exclude<ActiveMode, "local">;
}

function GameRoomInner({ mode }: GameRoomProps) {
  const { gameId } = useParams<{ gameId: string }>();
  const { ready, authenticated, login } = usePrivy();
  const contractAddress = useActiveContractAddress();
  const ctx = useContractCtx(contractAddress);

  if (!ready) {
    return (
      <div className="min-h-full flex items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (!authenticated) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="space-y-4 text-center">
          <p className="text-slate-200 text-sm">
            Sign in to join this game.
          </p>
          <button
            onClick={login}
            className="px-4 py-2 rounded bg-orange text-navy font-semibold text-sm hover:brightness-110"
          >
            Sign in with email
          </button>
        </div>
      </div>
    );
  }

  return (
    <GameShell
      mode={mode}
      urlGameId={gameId ?? null}
      contractAddress={contractAddress}
      privyCtx={ctx}
      privyAddress={ctx?.walletClient?.account?.address as `0x${string}` | null ?? null}
    />
  );
}

/**
 * Thin route wrapper that reads `:gameId` from the URL and mounts the
 * existing game UI (GameShell) inside an ActiveModeContext provider.
 */
export default function GameRoom({ mode }: GameRoomProps) {
  return (
    <ActiveModeContext.Provider value={mode}>
      <GameRoomInner mode={mode} />
    </ActiveModeContext.Provider>
  );
}

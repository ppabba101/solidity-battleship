import { useParams } from "react-router-dom";
import { ActiveModeContext, type ActiveMode } from "../lib/activeMode";
import { GameShell } from "../GameShell";

interface GameRoomProps {
  mode: Exclude<ActiveMode, "local">;
}

/**
 * Thin route wrapper that reads `:gameId` from the URL and mounts the
 * existing game UI (GameShell) inside an ActiveModeContext provider.
 */
export default function GameRoom({ mode }: GameRoomProps) {
  const { gameId } = useParams<{ gameId: string }>();
  return (
    <ActiveModeContext.Provider value={mode}>
      <GameShell mode={mode} urlGameId={gameId ?? null} />
    </ActiveModeContext.Provider>
  );
}

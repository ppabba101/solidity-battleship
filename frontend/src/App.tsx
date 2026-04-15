import { GameShell } from "./GameShell";
import { CONTRACT_ADDRESS } from "./lib/contract";
import { ActiveModeContext } from "./lib/activeMode";

/**
 * Legacy hot-seat entry point. Mounted at `/local` by the router and used
 * directly by `scripts/demo-fast.sh` via `VITE_LOCAL_HOTSEAT=1` to bypass
 * Privy entirely. Keeps the anvil burner-wallet flow alive for dev.
 */
export default function App() {
  return (
    <ActiveModeContext.Provider value="local">
      <GameShell
        mode="local"
        urlGameId={null}
        contractAddress={CONTRACT_ADDRESS}
      />
    </ActiveModeContext.Provider>
  );
}

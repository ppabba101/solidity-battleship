import { createContext, useContext } from "react";

export type ActiveMode = "preview" | "real" | "local";

export const ActiveModeContext = createContext<ActiveMode>("local");

export function useActiveMode(): ActiveMode {
  return useContext(ActiveModeContext);
}

const DEFAULT_LOCAL_ADDRESS =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3" as `0x${string}`;

/**
 * Pick the contract address for the currently active mode. Reads the
 * mode-scoped env vars set in `.env.example` / `.env.production`.
 */
export function useActiveContractAddress(): `0x${string}` {
  const mode = useActiveMode();
  const env = import.meta.env as Record<string, string | undefined>;
  if (mode === "real") {
    return (
      (env.VITE_BATTLESHIP_ADDRESS_REAL as `0x${string}` | undefined) ??
      DEFAULT_LOCAL_ADDRESS
    );
  }
  if (mode === "preview") {
    return (
      (env.VITE_BATTLESHIP_ADDRESS_PREVIEW as `0x${string}` | undefined) ??
      DEFAULT_LOCAL_ADDRESS
    );
  }
  return (
    (env.VITE_BATTLESHIP_ADDRESS as `0x${string}` | undefined) ??
    DEFAULT_LOCAL_ADDRESS
  );
}

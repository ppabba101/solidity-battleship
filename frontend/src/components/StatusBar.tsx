import { Circle, Volume2, VolumeX, RefreshCw, User } from "lucide-react";
import { Button } from "./ui/button";

interface StatusBarProps {
  player: 0 | 1;
  onSwitchPlayer: () => void;
  chainConnected: boolean;
  balance: string;
  muted: boolean;
  onToggleMute: () => void;
  onDeployFresh?: () => void;
}

export function StatusBar({
  player,
  onSwitchPlayer,
  chainConnected,
  balance,
  muted,
  onToggleMute,
  onDeployFresh,
}: StatusBarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-navy-light bg-navy">
      <div className="flex items-center gap-4 min-w-0">
        <div className="text-lg font-bold tracking-tight shrink-0">
          Battleship<span className="text-orange">.zk</span>
        </div>
        <div className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-orange/50 bg-orange/10 pl-2 pr-3 py-1 font-mono text-[11px] text-orange-bright">
          <User className="w-3 h-3" />
          <span className="text-slate-400 uppercase tracking-wider text-[9px]">
            Now playing
          </span>
          <span className="font-semibold text-orange">Player {player + 1}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
          <Circle
            className={`w-2 h-2 ${
              chainConnected
                ? "fill-emerald-500 text-emerald-500"
                : "fill-red-500 text-red-500"
            }`}
          />
          {chainConnected ? "Anvil 31337" : "disconnected"}
        </div>
        <div className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
          {balance} ETH
        </div>
        <Button variant="secondary" size="sm" onClick={onSwitchPlayer}>
          Switch Player
        </Button>
        {onDeployFresh && (
          <Button variant="outline" size="sm" onClick={onDeployFresh}>
            <RefreshCw className="w-3 h-3" /> Fresh Game
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onToggleMute}>
          {muted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

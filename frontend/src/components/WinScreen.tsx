import { useEffect } from "react";
import confetti from "canvas-confetti";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

interface WinScreenProps {
  open: boolean;
  won: boolean;
  shots: number;
  hits: number;
  provingMs: number;
  onPlayAgain: () => void;
}

export function WinScreen({
  open,
  won,
  shots,
  hits,
  provingMs,
  onPlayAgain,
}: WinScreenProps) {
  useEffect(() => {
    if (open && won) {
      const end = Date.now() + 1500;
      (function frame() {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ["#F97316", "#0B2545", "#ffffff"],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ["#F97316", "#0B2545", "#ffffff"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
  }, [open, won]);

  const hitRate = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  return (
    <Dialog open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-3xl">
            {won ? "You Win!" : "You Lose"}
          </DialogTitle>
          <DialogDescription>
            {won
              ? "Every response was proven in zero-knowledge."
              : "Your opponent sunk your fleet."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded bg-navy-light">
            <div className="text-2xl font-bold">{shots}</div>
            <div className="text-[10px] uppercase text-slate-400">Shots</div>
          </div>
          <div className="p-3 rounded bg-navy-light">
            <div className="text-2xl font-bold">{hitRate}%</div>
            <div className="text-[10px] uppercase text-slate-400">Hit Rate</div>
          </div>
          <div className="p-3 rounded bg-navy-light">
            <div className="text-2xl font-bold">
              {(provingMs / 1000).toFixed(1)}s
            </div>
            <div className="text-[10px] uppercase text-slate-400">
              Total Proving
            </div>
          </div>
        </div>
        <Button onClick={onPlayAgain}>Play Again</Button>
      </DialogContent>
    </Dialog>
  );
}

const STATS: { label: string; value: string }[] = [
  { label: "Circuit", value: "board_validity.nr" },
  { label: "Constraints", value: "~3,482 (approx.)" },
  { label: "Proving system", value: "UltraPlonk (Aztec bb)" },
  { label: "Verifier gas", value: "~265,000" },
  { label: "Trusted setup", value: "none ✓" },
];

export function CircuitStatsCard() {
  return (
    <div className="border border-navy-light rounded-xl bg-navy/80 p-4 font-mono text-[11px]">
      <div className="text-[10px] uppercase tracking-widest text-orange font-semibold mb-3">
        Circuit Stats
      </div>
      <ul className="space-y-2">
        {STATS.map((s) => (
          <li key={s.label} className="flex items-start gap-2">
            <span
              className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-orange shrink-0"
              style={{ boxShadow: "0 0 4px #F97316" }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                {s.label}
              </div>
              <div className="text-slate-100 text-[11px] break-all leading-tight">
                {s.value}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

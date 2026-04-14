export type SfxKey = "hit" | "miss" | "sunk" | "fire" | "win";

// SFX are on by default now that real audio files are present in public/sfx.
// To disable, set VITE_SFX_ENABLED=0 in frontend/.env.local.
const SFX_ENABLED = import.meta.env.VITE_SFX_ENABLED !== "0";

const cache = new Map<SfxKey, HTMLAudioElement>();

function get(key: SfxKey): HTMLAudioElement | null {
  if (!SFX_ENABLED) return null;
  let a = cache.get(key);
  if (!a) {
    a = new Audio(`/sfx/${key}.mp3`);
    a.preload = "auto";
    cache.set(key, a);
  }
  return a;
}

export function playSfx(key: SfxKey, muted: boolean) {
  if (muted || !SFX_ENABLED) return;
  try {
    const a = get(key);
    if (!a) return;
    a.currentTime = 0;
    void a.play().catch(() => {});
  } catch {
    /* no-op */
  }
}

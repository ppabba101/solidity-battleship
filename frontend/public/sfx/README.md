# SFX — Synthetic Sound Effects

These are short synthetic audio files generated with `ffmpeg` lavfi filters. They are real, valid MP3s (not placeholders).

| File | Duration | Description |
|------|----------|-------------|
| `fire.mp3` | ~300ms | Cannon whoosh — played on shot launch |
| `hit.mp3` | ~500ms | Explosion boom (brown noise + low sine) — confirmed hit |
| `miss.mp3` | ~400ms | Water splash (filtered pink noise) — confirmed miss |
| `sunk.mp3` | ~800ms | Foghorn descend (sine + pitch shift) — ship fully sunk |
| `win.mp3` | ~1.1s | C-E-G-C ascending arpeggio — victory screen |

## Upgrading to real audio

Drop in royalty-free MP3s with the same filenames (0.5–2s recommended). The SFX loader will pick them up automatically on next build/reload.

## Regenerating the synthetic SFX

From the repo root:

```bash
bash frontend/public/sfx/regen.sh
```

Requires `ffmpeg` (`brew install ffmpeg` on macOS).

## Disabling SFX

Set `VITE_SFX_ENABLED=0` in `frontend/.env.local`. SFX are enabled by default.

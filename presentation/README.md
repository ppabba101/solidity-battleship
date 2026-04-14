# Battleship, Proven — Presentation

Companion slide deck for the Solidity Battleship zk-SNARK overhaul.

## Files

| File | Description |
|---|---|
| `generate.py` | python-pptx script that builds the deck |
| `battleship-zk-demo.pptx` | Generated PowerPoint (9 slides, ~8 min) |

## Regenerate

```bash
cd presentation
python3 generate.py
```

The script writes `battleship-zk-demo.pptx` to the same directory.

## Dependencies

python-pptx must be installed:

```bash
pip install python-pptx
# or, if pip is not on PATH:
python3 -m pip install python-pptx --user
# or on systems with PEP 668 restrictions:
python3 -m pip install python-pptx --break-system-packages
```

## Visual design system

The deck is a **dark editorial** treatment — near-black navy background with a
tight neutral ramp, one orange primary accent, and a cyan secondary. It is
deliberately typographic: large hero sizes on the title and demo slides, a
36pt slide title, an 11pt tracked-out small-caps eyebrow, and a short orange
rule below every title. Every non-title slide carries a `battleship.zk`
wordmark and a slim orange progress bar showing `n / 9`.

### Palette

| Role              | Hex       |
|-------------------|-----------|
| Background        | `#0A0F1A` |
| Surface           | `#1B2942` |
| Hairline          | `#273449` |
| Primary text      | `#F8FAFC` |
| Secondary text    | `#94A3B8` |
| Accent (primary)  | `#F97316` |
| Accent (secondary)| `#38BDF8` |
| Warning           | `#F87171` |
| Good              | `#4ADE80` |

### Typography

- **Body:** Inter (fallback Helvetica Neue → Calibri)
- **Code / mono:** JetBrains Mono (fallback Menlo → Consolas)
- **Hero:** 72pt bold
- **Slide title:** 36pt bold
- **Eyebrow:** 11pt bold, tracked-out (~300), CYAN
- **Body copy:** 14–24pt depending on slide density

Install [Inter](https://fonts.google.com/specimen/Inter) and
[JetBrains Mono](https://www.jetbrains.com/lp/mono/) for pixel-perfect
rendering. Without them, PowerPoint/Keynote substitute the fallbacks.

### Per-slide layout

| # | Treatment                                                       |
|---|-----------------------------------------------------------------|
| 1 | Hero — "Battleship," / "proven." split across two lines, 72pt   |
| 2 | Pull quote with oversized orange " and white/orange split line  |
| 3 | Empty 10x10 grid + numbered cheat-flow (the "feel-it" slide)    |
| 4 | Centered quote: "The proof IS the validity certificate."        |
| 5 | 2 × 2 tile grid: Noir · UltraHonk · Pedersen · HonkVerifier     |
| 6 | Horizontal 6-station flow (Fleet → Pedersen → Noir → Honk → Sol → Game) |
| 7 | Single "LIVE DEMO →" in 96pt orange, centred                    |
| 8 | Numbered on-chain recap with orange number discs                |
| 9 | 60/40 split: roadmap on left, giant "Questions?" on right       |

## Regeneration workflow

Every change to `generate.py` should be followed by:

```bash
python3 presentation/generate.py                      # rebuild .pptx
python3 presentation/_render_preview.py               # rasterize to preview/
```

`_render_preview.py` walks the pptx shape tree with Pillow and emits
1600×900 approximations in `presentation/preview/`. It also prints any text
that overflows its bounding box so regressions are caught without needing
LibreOffice installed.

### Dependencies

```bash
python3 -m pip install python-pptx pillow --break-system-packages
```

## Slide overview

| # | Title | Owner | Duration |
|---|---|---|---|
| 1 | Battleship, Proven (title) | Pranav | ~30 s |
| 2 | The Problem | Vikram | ~1 min |
| 3 | The Validity Gap | Vikram | ~1 min |
| 4 | The Fix: zk-SNARKs | Vikram | ~1 min |
| 5 | Noir + UltraHonk | Vikram | ~1 min |
| 6 | System Architecture | Pranav | ~1 min |
| 7 | Live Demo | Both | ~2 min |
| 8 | What Was Proven On-Chain | Vikram | ~1 min |
| 9 | What's Next & Q&A | Pranav | ~30 s |

## Demo slide note

Slide 7 is intentionally minimal — a single large "LIVE DEMO →" heading. The live application does the talking. Speaker notes for that slide contain a full script for both presenters: Pranav drives the UI while Vikram narrates the crypto log panel.

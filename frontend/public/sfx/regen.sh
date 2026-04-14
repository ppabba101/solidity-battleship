#!/usr/bin/env bash
# Regenerate synthetic SFX using ffmpeg lavfi filters.
# Run from the repo root: bash frontend/public/sfx/regen.sh
# Requires: ffmpeg (brew install ffmpeg)

set -euo pipefail

OUT="frontend/public/sfx"

echo "Generating fire.mp3 (~300ms, cannon whoosh)..."
ffmpeg -f lavfi -i "sine=frequency=800:duration=0.3,volume=1" \
  -af "afade=t=out:st=0.2:d=0.1,bass=g=10" \
  -ar 44100 -b:a 128k -y "$OUT/fire.mp3"

echo "Generating hit.mp3 (~500ms, explosion boom)..."
ffmpeg -f lavfi -i "anoisesrc=color=brown:duration=0.5" \
  -f lavfi -i "sine=frequency=80:duration=0.5" \
  -filter_complex "[0][1]amix=inputs=2:duration=first:dropout_transition=0,afade=t=out:st=0.3:d=0.2,volume=2" \
  -ar 44100 -b:a 128k -y "$OUT/hit.mp3"

echo "Generating miss.mp3 (~400ms, water splash)..."
ffmpeg -f lavfi -i "anoisesrc=color=pink:duration=0.4" \
  -af "highpass=f=800,afade=t=out:st=0.2:d=0.2" \
  -ar 44100 -b:a 128k -y "$OUT/miss.mp3"

echo "Generating sunk.mp3 (~800ms, foghorn descend)..."
ffmpeg -f lavfi -i "sine=frequency=200:duration=0.8,volume=1" \
  -af "asetrate=44100*1.2,atempo=0.83,afade=t=out:st=0.6:d=0.2" \
  -ar 44100 -b:a 128k -y "$OUT/sunk.mp3"

echo "Generating win.mp3 (~1.1s, C-E-G-C arpeggio)..."
ffmpeg -f lavfi -i "sine=frequency=523:duration=0.25" \
  -f lavfi -i "sine=frequency=659:duration=0.25" \
  -f lavfi -i "sine=frequency=784:duration=0.25" \
  -f lavfi -i "sine=frequency=1047:duration=0.4" \
  -filter_complex "[0][1]concat=n=2:v=0:a=1[a01];[a01][2]concat=n=2:v=0:a=1[a012];[a012][3]concat=n=2:v=0:a=1[aout]" \
  -map "[aout]" -ar 44100 -b:a 128k -y "$OUT/win.mp3"

echo "Done. Files written to $OUT/"
ls -lh "$OUT"/*.mp3

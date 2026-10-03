#!/usr/bin/env bash
# Synthesize the spoken question the live harness feeds Chrome's fake mic.
# macOS only (`say`), plus ffmpeg. Output: 48 kHz mono PCM16 WAV with a short
# lead-in and a long silent tail, so GPT-Live's VAD ends the turn on silence.
#
#   e2e/live/make-question-wav.sh [text] [out.wav]
set -euo pipefail
TEXT="${1:-What are your opening hours?}"
OUT="${2:-$(dirname "$0")/.out/question.wav}"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -t persona-live-XXXXXX).aiff"
trap 'rm -f "$TMP"' EXIT
say -v Samantha -o "$TMP" "$TEXT"
ffmpeg -loglevel error -y -i "$TMP" \
  -af "adelay=1500|1500,apad=pad_dur=20" \
  -ar 48000 -ac 1 -c:a pcm_s16le "$OUT"
echo "$OUT"

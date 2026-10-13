#!/usr/bin/env bash
# Fails when the fsociety00 stylesheet declares a font size that can render below 11px.
#
#   tools/check-fonts.sh            skip .case-* and .developer-* selectors (owned by phases 4 and 7)
#   tools/check-fonts.sh --all      check the whole file (required from phase 7 on)
#   tools/check-fonts.sh [--all] path/to/styles.css
#
# What counts as too small:
#   * a px value below 11 (8px, 9px, 10px, 10.5px ...)
#   * an em/rem value that computes below 11px at the smallest root size the game uses.
#     The root font size is clamp(18px, 4.8vw, 22px), so the floor is 18px.
set -euo pipefail

MIN_PX=11
ROOT_FLOOR_PX=18
all=0
file=""
for arg in "$@"; do
  case "$arg" in
    --all) all=1 ;;
    *) file="$arg" ;;
  esac
done
if [ -z "$file" ]; then
  file="$(cd "$(dirname "$0")/.." && pwd)/sites/fsociety00/public/styles.css"
fi
[ -f "$file" ] || { echo "check-fonts: $file not found" >&2; exit 2; }

awk -v min="$MIN_PX" -v root="$ROOT_FLOOR_PX" -v all="$all" '
  function trim(s) { gsub(/^[ \t\r\n]+|[ \t\r\n]+$/, "", s); return s }
  BEGIN { depth = 0; buf = ""; bad = 0; skipped = 0 }
  {
    line = $0
    lineno = NR
    n = length(line)
    for (i = 1; i <= n; i++) {
      c = substr(line, i, 1)
      if (c == "{") {
        sel[++depth] = trim(buf)
        buf = ""
      } else if (c == "}") {
        buf = ""
        if (depth > 0) depth--
      } else if (c == ";") {
        decl = trim(buf)
        buf = ""
        check(decl)
      } else {
        buf = buf c
      }
    }
    buf = buf " "
  }
  function innermost(   d) {
    for (d = depth; d >= 1; d--) if (sel[d] !~ /^@/) return sel[d]
    return ""
  }
  function check(decl,   value, num, unit, px, s) {
    if (decl !~ /^font-size[ \t]*:/) return
    value = decl
    sub(/^font-size[ \t]*:[ \t]*/, "", value)
    # max(11px, 0.58em) style floors are accepted when the px floor is high enough.
    if (value ~ /^max\([ \t]*[0-9]*\.?[0-9]+px/) {
      num = value
      sub(/^max\([ \t]*/, "", num); sub(/px.*$/, "", num)
      if ((num + 0) >= min) return
    }
    if (match(value, /^[0-9]*\.?[0-9]+(px|rem|em)/) == 0) return
    num = value; unit = value
    sub(/(px|rem|em).*$/, "", num)
    sub(/^[0-9]*\.?[0-9]+/, "", unit); sub(/[^a-z].*$/, "", unit)
    px = (unit == "px") ? num + 0 : (num + 0) * root
    if (px >= min) return
    s = innermost()
    if (!all && s ~ /\.(case|developer)-/) { skipped++; return }
    printf("styles.css:%d  %s  font-size: %s%s  (~%.1fpx, min %dpx)\n", lineno, s, num, unit, px, min)
    bad++
  }
  END {
    if (skipped) printf("note: %d declaration(s) in .case-*/.developer-* skipped (use --all to include them)\n", skipped)
    if (bad) { printf("FAIL: %d font-size declaration(s) below %dpx\n", bad, min); exit 1 }
    print "OK: no font-size below " min "px"
  }
' "$file"

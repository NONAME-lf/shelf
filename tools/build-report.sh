#!/usr/bin/env bash
# Build DOCX + PDF from a Markdown report: tools/build-report.sh docs/reports/stage1-uml.md
set -euo pipefail
SRC="${1:?usage: build-report.sh <report.md>}"
DIR="$(cd "$(dirname "$SRC")" && pwd)"
BASE="$(basename "${SRC%.md}")"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

COMMON=(--from markdown+smart+implicit_figures --toc --toc-depth=2 --number-sections
        -V lang=uk --resource-path=".:..:$ROOT/docs/uml/img")

pandoc "$BASE.md" "${COMMON[@]}" -o "$BASE.docx"
pandoc "$BASE.md" "${COMMON[@]}" \
  --pdf-engine=xelatex --include-in-header "$ROOT/tools/titlepage.tex" \
  -V mainfont="Times New Roman" -V sansfont="Arial" -V monofont="Menlo" \
  -V fontsize=12pt -V geometry:margin=2cm -V linestretch=1.15 -V colorlinks=true \
  -o "$BASE.pdf"
ls -la "$BASE.docx" "$BASE.pdf"

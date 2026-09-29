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

# DOCX takes the vector .svg exports, PDF the raster .png ones; the Markdown
# therefore names images without an extension. native_numbering gives the DOCX captions
# the same figure numbers as the PDF.
pandoc "$BASE.md" "${COMMON[@]}" --default-image-extension=svg -t docx+native_numbering -o "$BASE.docx"
# float + \floatplacement{figure}{H} pin every figure to the spot where it is written,
# so a figure always stays with the «Пояснення» paragraph next to it; pdflscape provides
# the \begin{landscape} pages used by the wide diagrams.
pandoc "$BASE.md" "${COMMON[@]}" --default-image-extension=png \
  --pdf-engine=xelatex --include-in-header "$ROOT/tools/titlepage.tex" \
  -V header-includes='\usepackage{pdflscape}' \
  -V header-includes='\usepackage{float}' \
  -V header-includes='\floatplacement{figure}{H}' \
  -V mainfont="Times New Roman" -V sansfont="Arial" -V monofont="Menlo" \
  -V fontsize=12pt -V geometry:margin=2cm -V linestretch=1.15 -V colorlinks=true \
  -o "$BASE.pdf"

# pandoc's docx writer leaves the section without a page size, so Word falls back to
# US Letter. Put A4 (11906 x 16838 twips) and 2 cm margins into the final <w:sectPr>.
python3 - "$BASE.docx" <<'PY'
import os, re, shutil, sys, tempfile, zipfile

PGSZ = '<w:pgSz w:w="11906" w:h="16838"/>'
PGMAR = ('<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
         'w:header="708" w:footer="708" w:gutter="0"/>')
# CT_SectPr fixes the order of its children; w:pgSz follows these if they are present.
BEFORE_PGSZ = ("w:headerReference", "w:footerReference", "w:footnotePr", "w:endnotePr", "w:type")


def patch(xml: str) -> str:
    m = None
    for m in re.finditer(r"<w:sectPr(?:\s[^>]*)?>", xml):
        pass
    if m is None:                       # no section properties at all: nothing to anchor to
        return xml
    open_end = m.end()
    close = xml.index("</w:sectPr>", open_end)
    body = xml[open_end:close]
    if "<w:pgSz" in body:               # already patched (or pandoc learned to emit it)
        return xml
    pos = 0                             # insert after the children that must precede w:pgSz
    for tag in BEFORE_PGSZ:
        for cm in re.finditer(r"<%s(?:\s[^>]*)?(?:/>|>.*?</%s>)" % (tag, tag), body, re.S):
            pos = max(pos, cm.end())
    ins = PGSZ if "<w:pgMar" in body else PGSZ + PGMAR
    return xml[:open_end] + body[:pos] + ins + body[pos:] + xml[close:]


path = sys.argv[1]
with zipfile.ZipFile(path) as zin:
    items = [(i, zin.read(i.filename)) for i in zin.infolist()]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), suffix=".docx")
os.close(fd)
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for info, data in items:
        if info.filename == "word/document.xml":
            data = patch(data.decode("utf-8")).encode("utf-8")
        zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
        zi.compress_type = info.compress_type
        zi.external_attr = info.external_attr
        zout.writestr(zi, data)
shutil.move(tmp, path)
print("[docx] A4 page size written into", path)
PY

ls -la "$BASE.docx" "$BASE.pdf"

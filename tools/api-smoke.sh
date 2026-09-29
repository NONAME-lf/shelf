#!/usr/bin/env bash
# HTTP smoke test of the running API: bash tools/api-smoke.sh  (SHELF_API overrides http://localhost:4000)
set -euo pipefail
API="${SHELF_API:-http://localhost:4000}/api"
EMAIL="smoke-$(date +%s)@shelf.dev"
PASS="smoke-pass-123"
BODY="{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"Smoke\"}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

json() { python3 -c "import sys, json; print(json.load(sys.stdin)$1)"; }
code() { curl -s -o "${OUT:-/dev/null}" -w '%{http_code}' "$@"; }
expect() { if [ "$1" != "$2" ]; then echo "FAIL: $3 — expected $2, got $1"; exit 1; fi; echo "ok  $3"; }

expect "$(code "$API/health")" 200 "health"
TOKEN=$(curl -sf -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "$BODY" | json "['accessToken']")
echo "ok  register"
expect "$(code -X POST "$API/auth/register" -H 'Content-Type: application/json' -d "$BODY")" 409 "duplicate register → 409"
expect "$(code "$API/workspace/files")" 401 "no token → 401"
AUTH=(-H "Authorization: Bearer $TOKEN")

printf 'fun main() = println("v1")\n' > "$TMP/Main.kt"
expect "$(OUT="$TMP/r1.json" code "${AUTH[@]}" -F "file=@$TMP/Main.kt" "$API/workspace/files")" 201 "upload new → 201"
ID=$(json "['id']" < "$TMP/r1.json")
printf 'fun main() = println("v2")\n' > "$TMP/Main.kt"
expect "$(OUT="$TMP/r2.json" code "${AUTH[@]}" -F "file=@$TMP/Main.kt" "$API/workspace/files")" 200 "re-upload same name → 200"
expect "$(json "['id']" < "$TMP/r2.json")" "$ID" "new version keeps the id"
if [ "$(json "['checksum']" < "$TMP/r1.json")" = "$(json "['checksum']" < "$TMP/r2.json")" ]; then echo "FAIL: checksum did not change"; exit 1; fi
echo "ok  new version has a new checksum"

printf 'звіт\n' > "$TMP/Звіт.txt"
curl -sf "${AUTH[@]}" -F "file=@$TMP/Звіт.txt" "$API/workspace/files" > "$TMP/r3.json"
expect "$(json "['name']" < "$TMP/r3.json")" "Звіт.txt" "cyrillic name round-trip"
DISPOSITION=$(curl -s -D - -o /dev/null "${AUTH[@]}" "$API/workspace/files/$(json "['id']" < "$TMP/r3.json")/content" | tr -d '\r' | grep -i '^content-disposition')
case "$DISPOSITION" in *"filename*=UTF-8''%D0%97%D0%B2%D1%96%D1%82.txt"*) echo "ok  content-disposition keeps the UTF-8 name";; *) echo "FAIL: $DISPOSITION"; exit 1;; esac

expect "$(curl -sf "${AUTH[@]}" "$API/workspace/files" | json '.__len__()')" 2 "list has 2 files"
expect "$(curl -sf "${AUTH[@]}" "$API/workspace/files/$ID/content")" 'fun main() = println("v2")' "content is the latest version"
CONTENT_TYPE=$(curl -s -D - -o /dev/null "${AUTH[@]}" "$API/workspace/files/$ID/content" | tr -d '\r' | grep -i '^content-type')
case "$CONTENT_TYPE" in *text/plain*) echo "ok  .kt is served as text/plain";; *) echo "FAIL: $CONTENT_TYPE"; exit 1;; esac

dd if=/dev/zero of="$TMP/big.bin" bs=1048576 count=51 2>/dev/null
expect "$(code "${AUTH[@]}" -F "file=@$TMP/big.bin" "$API/workspace/files")" 413 "51 MB → 413"
expect "$(code "${AUTH[@]}" "$API/workspace/files/not-a-uuid")" 400 "malformed id → 400"
expect "$(code "${AUTH[@]}" -X DELETE "$API/workspace/files/$ID")" 204 "delete → 204"
expect "$(code "${AUTH[@]}" "$API/workspace/files/$ID")" 404 "deleted file → 404"
echo "api-smoke: OK"

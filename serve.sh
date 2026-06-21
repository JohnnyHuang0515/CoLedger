#!/usr/bin/env bash
#
# 同甘共股 (CoLedger) — macOS 一鍵公開部署
#
# 由 FastAPI 後端「同時供應前端 build + API」，再開一條 Cloudflare 免費快速通道
# 取得公開 https 網址。前端走相對 /api（同源），邀請連結用 window.location.origin，
# 所以全部跑在同一個 port 上、公開網址即自動生效，不必設定任何 BASE_URL。
#
# 用法（在 repo 根目錄執行）：
#   ./serve.sh                 # 完整：裝依賴 → build 前端 → 開通道 → 啟動
#   SKIP_BUILD=1 ./serve.sh    # 重啟用：跳過前端 build（已 build 過時更快）
#   PORT=8080 ./serve.sh       # 換 port（預設 8000）
#
# 流程：
#   1. 確認 / 用 Homebrew 安裝 node、python、cloudflared
#   2. backend：建 venv + pip install -r requirements.txt
#   3. frontend：npm install + npm run build（產生 dist）
#   4. 開 cloudflared 快速通道（免費、隨機 https 網址），自動抓出公開網址
#   5. uvicorn 啟動後端（同時供應 dist 與 /api）→ 公開網址即可使用
#   按 Ctrl-C 會一起關閉通道與後端。
#
# 注意：
#   • 這台機器要一直開著，別人才連得到（app 跑在這台上）。
#   • 快速通道「每次重開網址都會變」，舊邀請連結會失效。
#     要固定網址需綁自己的網域（named tunnel）——跟我說再帶你設。
#   • 全新機器是空資料庫，首次啟動會自動建表並 seed 範例資料。

set -euo pipefail

PORT="${PORT:-8000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FE_DIR="$SCRIPT_DIR/frontend"
BE_DIR="$SCRIPT_DIR/backend"

say()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 0. Homebrew（找不到就試常見路徑載入，再沒有就請使用者先裝）──
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$b" ] && eval "$("$b" shellenv)" && break
  done
fi
command -v brew >/dev/null 2>&1 || die "找不到 Homebrew。先到 https://brew.sh 安裝，再重跑 ./serve.sh"

# ── 1. 套件：node / python / cloudflared（缺什麼補什麼）──
ensure() { command -v "$1" >/dev/null 2>&1 || { say "安裝 $2 …"; brew install "$2"; }; }
ensure node node
ensure python3 python
ensure cloudflared cloudflared

# ── 2. 後端：venv + 依賴 ──
cd "$BE_DIR"
[ -d .venv ] || { say "建立 Python venv …"; python3 -m venv .venv; }
say "安裝後端依賴（pip install -r requirements.txt）…"
./.venv/bin/pip install -q --upgrade pip
./.venv/bin/pip install -q -r requirements.txt

# ── 3. 前端：install + build（產生 dist，給後端供應）──
cd "$FE_DIR"
say "安裝前端依賴（npm install）…"
npm install
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  say "建置前端（npm run build → dist）…"
  npm run build
fi
[ -d "$FE_DIR/dist" ] || die "找不到 frontend/dist，請先 build（不要設 SKIP_BUILD）。"

# ── 4. 開 Cloudflare 快速通道，抓公開網址 ──
TUNNEL_LOG="$(mktemp -t coledger-tunnel)"
CF_PID=""
APP_PID=""
cleanup() {
  printf '\n'; say "關閉中…"
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$CF_PID" ] && kill "$CF_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT INT TERM

say "開啟 Cloudflare 快速通道（指向 http://localhost:${PORT}）…"
cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
CF_PID=$!

URL=""
for _ in $(seq 1 60); do
  URL="$(grep -Eo 'https://[a-z0-9.-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || { echo "--- cloudflared 輸出 ---"; cat "$TUNNEL_LOG"; die "cloudflared 啟動失敗"; }
  sleep 1
done
[ -n "$URL" ] || { echo "--- cloudflared 輸出 ---"; cat "$TUNNEL_LOG"; die "60 秒內沒抓到通道網址"; }

# ── 5. 啟動後端（同時供應前端 dist + API）──
printf '\n\033[1;32m──────────────────────────────────────────────\033[0m\n'
printf '  公開網址： \033[1;32m%s\033[0m\n' "$URL"
printf '  本機測試： http://localhost:%s\n' "$PORT"
printf '  （邀請連結會自動用公開網址；API 走同源 /api）\n'
printf '  按 Ctrl-C 一起關閉後端與通道\n'
printf '\033[1;32m──────────────────────────────────────────────\033[0m\n\n'

cd "$BE_DIR"
say "啟動後端（uvicorn，port ${PORT}）…"
./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$PORT" &
APP_PID=$!

wait "$APP_PID"

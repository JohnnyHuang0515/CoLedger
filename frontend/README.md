# 協作股票紀錄 — Frontend

Taiwan-stock collaborative portfolio tracker (POC frontend).

Stack: React 18 + Vite + TypeScript + Tailwind CSS + React Router + TanStack Query.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:8000`, so the **backend must be
running on :8000** (see `../backend/README.md`). Build for production with:

```bash
npm run build        # tsc -b && vite build
npm run preview
```

## Demo login

The login page is prefilled with `alice@demo.tw / demo1234` (seeded OWNER of
社團「投資先鋒社」). After login you land on a club-entry screen — paste the seeded
club id (or create / join one) to enter.

## Structure

```
src/
  api/            typed API client (types.ts, client.ts wrapper, endpoints.ts) — matches BUILD-CONTRACT §4
  auth/           AuthContext (token + /auth/me), RequireAuth guard
  club/           ClubContext + ClubLayout (resolves my_role; provides AppShell)
  components/     shared UI + feature components (see below)
  hooks/          react-query hooks + query keys, useDebounce
  lib/            format helpers, error-code → 中文 messages, queryClient
  pages/          one page per route
```

### Routes (BUILD-CONTRACT §6)

| Page | Route |
|---|---|
| 登入 / 註冊 | `/login`, `/register` |
| 個人持股總覽 (P-1) | `/clubs/:clubId` |
| 共享檢視 (P-2) | `/clubs/:clubId/holdings` |
| 社團彙總 (P-4) | `/clubs/:clubId/summary` |
| 交易紀錄 (P-6) | `/clubs/:clubId/transactions` |
| 成員管理 (P-5, OWNER) | `/clubs/:clubId/members` |
| 變更紀錄 (P-6) | `/clubs/:clubId/activity` |

### Components

- **C-1 TransactionForm** — create/edit modal: C-7 代號自動完成、買賣別、股數、成交價、即時金額、日期、歸屬成員（OWNER 可代操）、備註。無手續費/證交稅。
- **C-2 HoldingTable** — 部位/成本/現價/市值/未實現損益（持股表只列未實現）。
- **C-3 PnLSummaryCard** — 總市值/總未實現/總已實現（彙總頁加第 4 張熱門持股卡）。
- **C-4 TransactionList** — 日期/股票/買賣/股數/成交價/金額/本筆已實現(僅SELL)/代操 badge/動作。
- **C-5 MemberRoster** (MembersPage) — 角色/狀態 pill、邀請、改角色、移除（OWNER only）。
- **C-6 ChangeLogPanel** (ActivityPage) — 時間軸 + 前後值。
- **C-7 StockSymbolPicker** — debounced autocomplete over `GET /api/stocks?q=`.
- **C-8 StaleBadge** — 報價過時/無報價（琥珀色）。
- **C-9 ConfirmDialog**, **C-10 Toast**, **C-11 EmptyState** + LoadingState/ErrorState.
- **PnLPill** — 綠漲紅跌（國際慣例，依設計 tokens）。

### Role-aware UI

VIEWER sees everything but write actions (新增/編輯/刪除交易、成員管理) are hidden/disabled.
Authorization is also enforced by the backend — the UI does not rely on hiding alone.

## Notes / contract gaps

- The contract has **no "list my clubs" endpoint**, so after login the app remembers the
  last-visited club id (localStorage) and otherwise shows a club-entry screen to
  open / create / join a club by id or invite token.

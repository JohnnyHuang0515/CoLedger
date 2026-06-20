# 協作股票紀錄系統 — Backend (POC)

FastAPI + SQLAlchemy 2.x + SQLite。實作 `BUILD-CONTRACT.md` 的全部後端契約：
JWT Bearer 認證、移動平均損益（§3）、後端授權（VIEWER/代操）、ChangeLog、
soft-delete 重算、mock/finmind 報價 provider，以及鎖死的種子資料（§5）。

## 安裝與啟動

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 啟動（first run 會自動建表 + 若 DB 空則自動 seed）
uvicorn app.main:app --reload --port 8000
```

API base：`http://localhost:8000/api`，互動文件 `http://localhost:8000/docs`。

## 重新 seed（重建鎖死的 demo 資料）

```bash
python -m app.seed     # 會 DROP 所有表後重建 demo 資料
```

Demo 帳號（密碼皆 `demo1234`）：

| Email | 顯示名 | 角色 |
|---|---|---|
| alice@demo.tw | Alice | OWNER（投資先鋒社） |
| bob@demo.tw | Bob | MEMBER |
| carol@demo.tw | Carol | MEMBER |
| dave@demo.tw | Dave | VIEWER |

## 環境變數

啟動時會自動讀取 `backend/.env`（透過 python-dotenv；已設定的系統環境變數優先）。
本專案附的 `.env` **預設 `QUOTE_PROVIDER=finmind`（真實台股報價）**。

| 變數 | 預設 | 說明 |
|---|---|---|
| `QUOTE_PROVIDER` | `mock`（程式碼預設；附帶的 `.env` 設為 `finmind`） | `mock`（離線、固定價，§5）或 `finmind`（真實台股收盤，best-effort） |
| `FINMIND_TOKEN` | _(空)_ | FinMind API token（選填，提升免費額度；無 token 也能輕量使用） |
| `QUOTE_REFRESH_MINUTES` | `15` | 讀取時每檔最多每隔此分鐘數重抓一次 FinMind（節流，避免打爆額度；對齊 NFR-4） |
| `QUOTE_STALE_MINUTES` | `20` | 若超過此分鐘數仍抓不到新報價（來源掛掉）→ 標 `stale=true`（FR-10/NFR-5） |
| `DATABASE_URL` | `sqlite:///./app.db` | DB 連線字串 |
| `JWT_SECRET` | `poc-dev-secret-change-me` | JWT 簽章密鑰 |
| `JWT_EXPIRE_MINUTES` | `720` | token 有效時間（分鐘） |
| `CORS_ORIGINS` | `http://localhost:5173` | 允許的前端來源（逗號分隔） |

## 報價 provider

切換只改 `.env` 的 `QUOTE_PROVIDER`（介面在 `app/services/quote_provider.py`）：

- **mock**：回 `BUILD-CONTRACT §5` 的固定價，離線可跑、數值穩定，給驗收 / 離線開發用。
- **finmind**（目前 `.env` 預設）：打 FinMind `TaiwanStockPrice` dataset，**回最近一個交易日的收盤價**（免費額度為日收盤、非盤中即時）。
  - 抓取採 14 天回看視窗取最新一筆收盤（只查「今天」常常還沒出資料）。
  - **節流**：讀取（holdings / summary / quote）時才抓，且每檔每 `QUOTE_REFRESH_MINUTES` 分鐘最多一次；啟動時會先批次抓一次持有中的代號，蓋掉 seed 的 mock 價。
  - **stale 語意**：因為是日收盤，`stale` 改以「我們多久沒成功抓到新報價」判斷（來源掛掉才會 `stale=true`），而非資料時點本身；每檔仍回 `price_as_of` 真實收盤日期讓前端透明顯示。這是對 §3「以 as_of 判斷過時」的務實調整（真實來源為 EOD 而非盤中延遲報價）。
  - 任何失敗都 best-effort 保留上次快取、不影響交易讀寫（NFR-5）。
  - 想要更高額度 / 盤中資料：到 https://finmindtrade.com/ 註冊取得 token 填入 `FINMIND_TOKEN`。

## 台股代號主檔同步（全市場代號自動帶入）

`app/services/stock_master.py` 從 FinMind `TaiwanStockInfo` 抓**全部上市/上櫃**代號
（約 3,700 檔，含 ETF；興櫃排除），upsert 進 `stocks` 表，供代號搜尋 / 自動完成
（`GET /api/stocks?q=`）與驗證（BR-9）。

- **自動**：`QUOTE_PROVIDER != mock` 且主檔還只有種子量（< 100 檔）時，啟動會自動同步一次（best-effort，之後啟動略過）。
- **手動**：`python -m app.sync_stocks` 可隨時重新同步。

> 注意：`python -m app.seed` 會清空重建（主檔回到 8 檔種子）；下次啟動會自動再同步補回全市場。

## 主要結構

```
app/
  main.py              # app 組裝、CORS、錯誤模型、啟動自動 seed
  config.py            # env 設定
  db.py / models.py    # SQLAlchemy engine / ORM（Holding 不建表，即時推導）
  schemas.py           # Pydantic v2 請求/回應（money 一律字串）
  auth.py / deps.py    # 密碼雜湊 / JWT；當前使用者 + 社團成員/角色解析
  errors.py            # §6.5 錯誤模型與 handler
  routers/             # auth, clubs, members, transactions, holdings,
                       #   summary, activity, stocks
  services/
    holdings_calc.py   # 移動平均損益（§3，鎖死）
    quote_provider.py  # mock / finmind
    quotes_read.py     # 報價快取讀取 + stale 判斷
    stock_master.py    # 代號主檔同步整合點（stub）
    changelog.py       # ChangeLog 寫入（BR-8，同一交易內）
  seed.py              # 鎖死的 demo 資料（§5）
```

## 移動平均演算（§3，鎖死）

對「某成員 × 某代號」的所有 `ACTIVE` 交易，依 `traded_at` 再 `created_at` 排序逐筆走訪：
買入更新移動平均成本與股數；賣出計「本筆已實現 = 股數 ×（賣價 − 當下均價）」、
累加到個股已實現、股數減少、均價不變。任一賣出後股數 < 0 → `422 INSUFFICIENT_HOLDING`。
金額一律 `Decimal`，輸出字串（如 `"600.00"`）。

三層已實現：本筆（交易列 `realized_pnl`）／個股累計（Holding.realized_pnl）／
社團總（summary.total_realized_pnl）。
```

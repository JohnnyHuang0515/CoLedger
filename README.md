# 協作股票紀錄系統（Collaborative Stock Tracker）

台股原生、為小社團而生的協作型持股帳本——多人共用一份空間記錄自己的買賣與部位、互相看得到，自動抓現價算損益，並看得到誰在何時改了什麼，取代 Excel 互傳。

> **階段**：POC（自己人先用，社團 5–20 人）

## 技術棧

| 層 | 技術 |
|---|---|
| 後端 | FastAPI · SQLAlchemy 2.x · SQLite · JWT 認證 |
| 前端 | React 18 · Vite · TypeScript · Tailwind CSS · React Router · TanStack Query |
| 報價來源 | FinMind（真實台股 EOD 收盤）/ mock（離線固定價） |

## 專案結構

```
collaborative-stock-tracker/
├── backend/     FastAPI 後端（API、移動平均損益、授權、報價 provider）
└── frontend/    React 前端（持股總覽、共享檢視、社團彙總、交易、變更紀錄）
```

各自的詳細說明見 [`backend/README.md`](./backend/README.md) 與 [`frontend/README.md`](./frontend/README.md)。

## 快速開始

需要兩個終端機：後端跑在 `:8000`，前端跑在 `:5173`（前端會把 `/api` 代理到後端）。

### 1. 後端

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # 視需要調整（預設用 mock 報價，離線可跑）
uvicorn app.main:app --reload --port 8000
```

首次啟動會自動建表，DB 為空時自動 seed demo 資料。API 文件：`http://localhost:8000/docs`。

### 2. 前端

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

### Demo 帳號（密碼皆 `demo1234`）

| Email | 角色 |
|---|---|
| alice@demo.tw | OWNER（投資先鋒社） |
| bob@demo.tw / carol@demo.tw | MEMBER |
| dave@demo.tw | VIEWER |

登入後在社團入口貼上 demo 社團 id（或自行建立 / 加入）即可進入。

## 核心設計前提

- **帳本模型**：各自部位、共享檢視（每人記自己的、互相看得到、社團彙總）
- **損益基礎**：移動平均成本，只看價差（不計手續費 / 證交稅）
- **市場 / 幣別**：台股（上市 / 上櫃）、TWD
- **權限**：團主（管理）/ 成員（編輯自己、檢視他人）/ 唯讀；團主可代操（歸屬與登錄者分開）

## 環境變數

複製 `backend/.env.example` 為 `backend/.env` 後依需要調整；常用項目：

| 變數 | 預設 | 說明 |
|---|---|---|
| `QUOTE_PROVIDER` | `mock` | `mock`（離線固定價）或 `finmind`（真實台股收盤） |
| `FINMIND_TOKEN` | _(空)_ | FinMind API token（選填，提升免費額度） |
| `JWT_SECRET` | `poc-dev-secret-change-me` | JWT 簽章密鑰（正式環境請更換） |
| `DATABASE_URL` | `sqlite:///./app.db` | DB 連線字串 |

完整清單見 `backend/README.md`。

---

> 規格 / 設計文件（需求、領域模型、流程、ADR、設計稿）另存於版控之外，不隨此 repo 發佈。

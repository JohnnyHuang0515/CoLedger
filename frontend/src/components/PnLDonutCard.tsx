import type { HoldingRow, Ledger } from '../api/types';
import { formatReturnPct, formatSignedMoney, pnlSign, toNum } from '../lib/format';
import { CountUpMoney } from './CountUpMoney';
import { DonutChart, slicesFromHoldings } from './DonutChart';

interface PnLDonutCardProps {
  ledger: Ledger;
  // 用來算甜甜圈獲利/虧損兩段的持股（個人 = 自己；社團「全部」= 全體成員合併）。
  holdings: HoldingRow[];
  // hero 大字標題：個人「總資產」/ 社團「社團總資產」。
  title: string;
}

type Sign = 'profit' | 'loss' | 'neutral';
function signColor(sign: Sign): string {
  return sign === 'profit' ? 'text-profit' : sign === 'loss' ? 'text-loss' : 'text-text-primary';
}

// 賺賠 Bento — DashboardPage 與 ClubViewPage 共用。
// 桌機：左欄(藍色總資產 hero + 4 帳本磚) ｜ 右側甜甜圈磚；手機：直排，磚改 2×2。
// P&L 一律用後端 ledger 值；甜甜圈兩段大小是 market_value 純顯示分組（見 DonutChart）。
export function PnLDonutCard({ ledger, holdings, title }: PnLDonutCardProps) {
  const slices = slicesFromHoldings(holdings);
  const pctSign = pnlSign(ledger.return_pct);
  const realSign = pnlSign(ledger.realized_pnl);

  // 總損益 = 未實現 + 已實現（兩者皆後端值，僅相加做顯示）。
  const unreal = toNum(ledger.unrealized_pnl) ?? 0;
  const real = toNum(ledger.realized_pnl) ?? 0;
  const totalPnl = unreal + real;
  const totalSign: Sign = totalPnl > 0 ? 'profit' : totalPnl < 0 ? 'loss' : 'neutral';
  // 總損益的「方向」用符號表示即可（在藍底上用白字，不用紅綠以保對比）。
  const totalArrow = totalSign === 'profit' ? '▲' : totalSign === 'loss' ? '▼' : '';

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
      {/* 左：藍色總資產 hero + 帳本磚 */}
      <div className="flex flex-1 flex-col gap-3">
        <div className="rounded-card bg-primary px-6 py-5 text-on-primary">
          <span className="text-sm font-medium text-on-primary/80">{title}</span>
          <div className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
            <CountUpMoney value={ledger.total_assets} prefix="$" />
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-on-primary/90">
            總損益 {totalArrow} {formatSignedMoney(String(totalPnl))}
          </div>
        </div>

        {/* 帳本磚：手機 2×2、桌機一排四格。已實現依正負帶綠/紅色調。 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="淨入金" value={`$${formatMoneyInt(ledger.net_deposit)}`} />
          <StatTile label="本金" value={`$${formatMoneyInt(ledger.cost_basis)}`} />
          <StatTile label="現金餘額" value={`$${formatMoneyInt(ledger.cash_balance)}`} />
          <StatTile label="已實現" value={formatSignedMoney(ledger.realized_pnl)} tone={realSign} />
        </div>
      </div>

      {/* 右：甜甜圈磚（報酬率 + 獲利/虧損圖例） */}
      <div className="flex items-center justify-center rounded-card border border-border bg-surface px-5 py-5 md:w-[300px] md:shrink-0">
        <DonutChart
          slices={slices}
          size={148}
          center={
            <>
              <span className="text-[11px] font-medium text-text-secondary">報酬率</span>
              <span className={`text-xl font-bold tabular-nums ${signColor(pctSign)}`}>
                {formatReturnPct(ledger.return_pct)}
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}

// 帳本磚：中性=白底框；P&L(已實現)依正負帶 profit-soft / loss-soft 色調。
function StatTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Sign }) {
  const bg =
    tone === 'profit'
      ? 'bg-profit-soft'
      : tone === 'loss'
        ? 'bg-loss-soft'
        : 'bg-surface border border-border';
  const valueClass =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-text-primary';
  return (
    <div className={`flex flex-col justify-center gap-1 rounded-xl px-4 py-3 ${bg}`}>
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className={`text-base font-bold tabular-nums md:text-[17px] ${valueClass}`}>{value}</span>
    </div>
  );
}

// 整數金額（沿用 toLocaleString，無小數）。
function formatMoneyInt(v: string | null | undefined): string {
  const n = toNum(v);
  if (n === null) return '—';
  return Math.round(n).toLocaleString('zh-TW');
}

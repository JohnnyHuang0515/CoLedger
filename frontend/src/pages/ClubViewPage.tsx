import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { useClub } from '../club/ClubContext';
import { useHoldings, useMembers, useSummary } from '../hooks/queries';
import { PnLDonutCard } from '../components/PnLDonutCard';
import { HoldingTable } from '../components/HoldingTable';
import { PnLPill } from '../components/PnLPill';
import { Card } from '../components/ui';
import { EmptyState, ErrorState, SkeletonRows, SkeletonSummary } from '../components/states';
import { UsersIcon, InboxIcon, CalculatorIcon } from '../components/icons';
import {
  formatLots,
  formatMoney,
  formatQty,
  formatReturnPct,
  formatSignedMoney,
  formatTime,
  pnlSign,
  toNum,
} from '../lib/format';
import type { HoldingRow, Ledger, MemberHoldings, SummaryResponse } from '../api/types';
import { roleRank } from '../lib/members';
import { fadeItem, listContainer } from '../lib/motionPresets';

type Tab = 'members' | 'symbols';
// 成員篩選：'all' = 全部（社團儀表板）；否則為 member.user_id。
type Scope = 'all' | string;

// P-2 社團檢視 — 合併共享檢視 + 社團彙總.
// 社團總計 ledger header（共用）＋ 分段切換〔按成員｜按個股〕.
export function ClubViewPage() {
  const { clubId } = useClub();
  const holdingsQ = useHoldings(clubId, 'all');
  const summaryQ = useSummary(clubId);
  const membersQ = useMembers(clubId);
  const [tab, setTab] = useState<Tab>('members');
  const [scope, setScope] = useState<Scope>('all');

  const isLoading = holdingsQ.isLoading || summaryQ.isLoading;
  const isError = holdingsQ.isError || summaryQ.isError;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Card>
          <SkeletonSummary />
        </Card>
        <Card>
          <SkeletonRows />
        </Card>
      </div>
    );
  }
  if (isError || !holdingsQ.data || !summaryQ.data) {
    const err = holdingsQ.error ?? summaryQ.error;
    return (
      <Card>
        <ErrorState
          error={err}
          onRetry={() => {
            holdingsQ.refetch();
            summaryQ.refetch();
          }}
        />
      </Card>
    );
  }

  const summary = summaryQ.data;
  // 團主置頂：holdings 的成員不含 role，從 members API 取 role 來排序。
  const roleByUser = new Map((membersQ.data?.members ?? []).map((m) => [m.user_id, m.role] as const));
  const members = [...holdingsQ.data.members].sort(
    (a, b) => roleRank(roleByUser.get(a.user_id) ?? 'MEMBER') - roleRank(roleByUser.get(b.user_id) ?? 'MEMBER'),
  );
  const asOf = summary.as_of ?? holdingsQ.data.as_of;

  // 範圍式儀表板：全部 → 社團 (club_ledger + 全體成員 holdings 合併)；某成員 → 該成員 ledger + holdings。
  const selectedMember = scope === 'all' ? null : members.find((m) => m.user_id === scope) ?? null;
  const scopeLedger: Ledger = selectedMember ? selectedMember.ledger : summary.club_ledger;
  const scopeHoldings: HoldingRow[] = selectedMember
    ? selectedMember.holdings
    : members.flatMap((m) => m.holdings);
  const scopeTitle = selectedMember ? `${selectedMember.display_name} 總資產` : '社團總資產';
  // 若選定成員已不在清單（資料更新後消失），顯示上回退到「全部」（filter pill 也會落在全部）。
  const effectiveScope: Scope = scope !== 'all' && !selectedMember ? 'all' : scope;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-text-primary">社團檢視</h1>
        <p className="text-xs text-text-muted">資料時間 {formatTime(asOf)}（只計有效成員）</p>
      </div>

      {/* 成員篩選：全部 / 各成員 — 決定 header 與下方資料的範圍 */}
      <MemberFilter members={members} scope={effectiveScope} onChange={setScope} />

      {/* 範圍式賺賠甜甜圈儀表板 — 兩個分頁共用；依成員選擇餵 club 或 member 資料 */}
      <PnLDonutCard ledger={scopeLedger} holdings={scopeHoldings} title={scopeTitle} />

      {/* 分段切換 */}
      <div className="flex w-full max-w-xs rounded-lg border border-border bg-surface p-1 text-sm font-medium">
        <SegButton active={tab === 'members'} onClick={() => setTab('members')}>
          按成員
        </SegButton>
        <SegButton active={tab === 'symbols'} onClick={() => setTab('symbols')}>
          按個股
        </SegButton>
      </div>

      {tab === 'members' ? (
        <MembersView members={selectedMember ? [selectedMember] : members} />
      ) : (
        <SymbolsView summary={summary} />
      )}
    </div>
  );
}

// 成員篩選列 — 橫向可捲動的 pill：全部 + 每位成員。
function MemberFilter({
  members,
  scope,
  onChange,
}: {
  members: MemberHoldings[];
  scope: Scope;
  onChange: (s: Scope) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      <FilterPill active={scope === 'all'} onClick={() => onChange('all')}>
        全部
      </FilterPill>
      {members.map((m) => (
        <FilterPill key={m.user_id} active={scope === m.user_id} onClick={() => onChange(m.user_id)}>
          {m.display_name}
        </FilterPill>
      ))}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-primary bg-primary text-on-primary'
          : 'border-border bg-surface text-text-secondary hover:bg-subtle'
      }`}
    >
      {children}
    </button>
  );
}

// ---- 按成員：每位成員的 ledger 摘要 + 其持股（精簡列）(修 #1) ----
function MembersView({ members }: { members: MemberHoldings[] }) {
  if (members.length === 0) {
    return (
      <Card>
        <EmptyState icon={<UsersIcon />} title="沒有成員持股資料" />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {members.map((m) => (
        <Card key={m.user_id}>
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-bold text-text-primary">{m.display_name}</h2>
            <MemberLedgerSummary ledger={m.ledger} />
          </div>
          {m.holdings.length === 0 ? (
            <EmptyState icon={<InboxIcon />} title="尚無持股" />
          ) : (
            <HoldingTable holdings={m.holdings} variant="condensed" />
          )}
        </Card>
      ))}
    </div>
  );
}

// 成員 ledger 摘要：淨入金 / 本金 / 未實現＋已實現損益 / 報酬率.
function MemberLedgerSummary({ ledger }: { ledger: Ledger }) {
  const pctSign = pnlSign(ledger.return_pct);
  const pctColor =
    pctSign === 'profit' ? 'text-profit' : pctSign === 'loss' ? 'text-loss' : 'text-text-secondary';
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-2 text-xs tabular-nums sm:grid-cols-3 lg:grid-cols-5">
      <LedgerStat label="淨入金" value={`$${formatMoney(ledger.net_deposit)}`} />
      <LedgerStat label="本金" value={`$${formatMoney(ledger.cost_basis)}`} />
      <LedgerStat
        label="未實現"
        value={formatSignedMoney(ledger.unrealized_pnl)}
        valueClass={pnlColorClass(ledger.unrealized_pnl)}
      />
      <LedgerStat
        label="已實現"
        value={formatSignedMoney(ledger.realized_pnl)}
        valueClass={pnlColorClass(ledger.realized_pnl)}
      />
      <LedgerStat label="報酬率" value={formatReturnPct(ledger.return_pct)} valueClass={pctColor} />
    </div>
  );
}

function pnlColorClass(v: string | null): string {
  const s = pnlSign(v);
  return s === 'profit' ? 'text-profit' : s === 'loss' ? 'text-loss' : 'text-text-secondary';
}

function LedgerStat({
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-text-muted">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

// ---- 按個股：by_symbol 聚合表（沿用原社團彙總的表格 / 手機列）----
function SymbolsView({ summary }: { summary: SummaryResponse }) {
  // 佔比 = 該檔合計市值 ÷ 全部合計市值（投資組合權重，全部加起來＝100%）。
  const totalMarketValue = summary.by_symbol.reduce(
    (sum, s) => sum + (toNum(s.total_market_value) ?? 0),
    0,
  );
  const sharePct = (v: string | null): number =>
    totalMarketValue > 0 ? ((toNum(v) ?? 0) / totalMarketValue) * 100 : 0;

  return (
    <Card>
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-bold text-text-primary">個股合計</h2>
      </div>
      {summary.by_symbol.length === 0 ? (
        <EmptyState icon={<CalculatorIcon />} title="尚無持股合計" />
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
                  <th className="px-4 py-3">股票</th>
                  <th className="px-4 py-3 text-right">合計股數</th>
                  <th className="px-4 py-3 text-right">合計市值</th>
                  <th className="px-4 py-3 text-center">佔比</th>
                  <th className="px-4 py-3 text-right">合計未實現損益</th>
                </tr>
              </thead>
              <motion.tbody variants={listContainer} initial="hidden" animate="show">
                {summary.by_symbol.map((s) => {
                  const pct = sharePct(s.total_market_value);
                  return (
                    <motion.tr
                      key={s.stock_symbol}
                      variants={fadeItem}
                      className="border-b border-border/60 hover:bg-subtle/50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">{s.name}</div>
                        <div className="text-xs text-text-secondary">{s.stock_symbol}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatQty(s.total_quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(s.total_market_value)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle">
                            <motion.div
                              className="h-full rounded-full bg-primary/60"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                            />
                          </div>
                          <span className="text-text-secondary">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PnLPill value={s.total_unrealized_pnl} />
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </table>
          </div>

          {/* 手機：精簡列 — 名稱 / 代號・張數 ｜ 損益$ / 市值 */}
          <motion.div className="md:hidden" variants={listContainer} initial="hidden" animate="show">
            {summary.by_symbol.map((s) => (
              <motion.div
                key={s.stock_symbol}
                variants={fadeItem}
                className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-text-primary">{s.name}</span>
                  <span className="text-[11px] tabular-nums text-text-muted">
                    {s.stock_symbol} ・ {formatLots(s.total_quantity)}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <PnLPill value={s.total_unrealized_pnl} />
                  <span className="text-[11px] tabular-nums text-text-muted">
                    NT${formatMoney(s.total_market_value)} ・ {sharePct(s.total_market_value).toFixed(1)}%
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </>
      )}
    </Card>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 transition ${
        active ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-subtle'
      }`}
    >
      {children}
    </button>
  );
}

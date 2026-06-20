import { useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../auth/AuthContext';
import { useClub, rememberClub } from '../club/ClubContext';
import { useMyClubs } from '../hooks/queries';
import {
  BarChartIcon,
  UsersIcon,
  CalculatorIcon,
  ReceiptIcon,
  SettingsIcon,
  ClockIcon,
} from './icons';

const ROLE_LABEL: Record<string, string> = { OWNER: '團主', MEMBER: '成員', VIEWER: '唯讀' };

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  ownerOnly?: boolean;
}

function navItems(clubId: string): NavItem[] {
  return [
    { to: `/clubs/${clubId}`, label: '持股總覽', icon: <BarChartIcon /> },
    { to: `/clubs/${clubId}/holdings`, label: '共享檢視', icon: <UsersIcon /> },
    { to: `/clubs/${clubId}/summary`, label: '社團彙總', icon: <CalculatorIcon /> },
    { to: `/clubs/${clubId}/transactions`, label: '交易紀錄', icon: <ReceiptIcon /> },
    { to: `/clubs/${clubId}/members`, label: '成員管理', icon: <SettingsIcon />, ownerOnly: true },
    { to: `/clubs/${clubId}/activity`, label: '變更紀錄', icon: <ClockIcon /> },
  ];
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { club, clubId, myRole, isOwner } = useClub();
  const navigate = useNavigate();
  const location = useLocation();
  const items = navItems(clubId).filter((i) => !i.ownerOnly || isOwner);

  const [menuOpen, setMenuOpen] = useState(false);
  const clubs = useMyClubs().data?.clubs ?? [];
  const switchTo = (id: string) => {
    setMenuOpen(false);
    if (id !== clubId) {
      rememberClub(id);
      navigate(`/clubs/${id}`);
    }
  };

  const roleLabel = ROLE_LABEL[myRole];

  return (
    <div className="flex min-h-full flex-col bg-app">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-subtle"
            >
              <span className="max-w-[40vw] truncate text-lg font-bold text-text-primary sm:max-w-none">
                {club.name}
              </span>
              <span className="text-xs text-text-muted" aria-hidden>
                ▾
              </span>
            </button>
            <span className="hidden rounded-full bg-subtle px-2 py-0.5 text-xs text-text-secondary sm:inline">
              {roleLabel}
            </span>

            <AnimatePresence>
              {menuOpen && (
                <>
                  {/* click-away backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: 'top left' }}
                    className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
                  >
                  <div className="px-3 pb-1 pt-2 text-xs font-medium text-text-muted">切換社團</div>
                  <ul className="max-h-72 overflow-y-auto">
                    {clubs.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => switchTo(c.id)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-subtle"
                        >
                          <span
                            className={`truncate ${
                              c.id === clubId ? 'font-bold text-primary' : 'text-text-primary'
                            }`}
                          >
                            {c.name}
                          </span>
                          <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-xs text-text-secondary">
                            {ROLE_LABEL[c.my_role]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate('/?pick=1');
                    }}
                    className="w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-primary hover:bg-subtle"
                  >
                    ＋ 建立 / 加入其他社團
                  </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          {/* desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === `/clubs/${clubId}`}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-text-secondary hover:bg-subtle'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {user?.display_name}
            </span>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-subtle"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      {/* Content — keyed remount fades each route in. No AnimatePresence/exit
          here on purpose: mode="wait" + React.StrictMode can leave the incoming
          page stuck at opacity:0 (blank). A plain keyed motion.div always
          replays initial→animate on mount, so it can't get stuck. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-6">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Mobile bottom TabBar — columns track the visible item count (no empty cell) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/clubs/${clubId}`}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-[10px] transition-transform active:scale-90 ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`
            }
          >
            <span className="text-base" aria-hidden>
              {item.icon}
            </span>
            <span className="leading-none">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

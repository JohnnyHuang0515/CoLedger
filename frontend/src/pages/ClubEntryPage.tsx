import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listMyClubs, createClub } from '../api/endpoints';
import type { Role } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button, Card } from '../components/ui';
import { LoadingState, ErrorState } from '../components/states';
import { useToast } from '../components/Toast';
import { errorMessage } from '../lib/errors';
import { rememberClub } from '../club/ClubContext';

const ROLE_LABEL: Record<Role, string> = { OWNER: '團主', MEMBER: '成員', VIEWER: '唯讀' };

/**
 * Landing after login. Fetches the caller's clubs via GET /api/clubs
 * (BUILD-CONTRACT §4). Auto-enters when there is exactly one club; otherwise
 * shows a picker plus create / accept-invite forms.
 */
export function ClubEntryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const clubsQuery = useQuery({ queryKey: ['my-clubs'], queryFn: listMyClubs });
  const clubs = clubsQuery.data?.clubs ?? [];

  // ?pick=1 (from the header club-switcher) → stay on this page to create/join,
  // i.e. don't auto-bounce single-club users straight back into their club.
  const [params] = useSearchParams();
  const pickMode = params.has('pick');

  const [clubName, setClubName] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (id: string) => {
    rememberClub(id);
    navigate(`/clubs/${id}`);
  };

  // Auto-enter when the user belongs to exactly one club (unless picking).
  useEffect(() => {
    if (!pickMode && clubsQuery.isSuccess && clubs.length === 1) {
      open(clubs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickMode, clubsQuery.isSuccess, clubs.length]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await createClub({ name: clubName.trim() });
      toast.success('社團已建立');
      open(res.club.id);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-xl font-bold text-text-primary">歡迎，{user?.display_name}</h1>
      <p className="text-sm text-text-secondary">選擇進入社團，或建立 / 加入一個。</p>

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-bold text-text-primary">我的社團</h2>
        {clubsQuery.isLoading ? (
          <LoadingState label="載入社團…" />
        ) : clubsQuery.isError ? (
          <ErrorState error={clubsQuery.error} onRetry={() => clubsQuery.refetch()} />
        ) : clubs.length === 0 ? (
          <p className="py-2 text-sm text-text-secondary">
            你還沒有社團，建立一個，或打開別人給你的邀請連結加入。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {clubs.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => open(c.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-3 text-left hover:border-primary hover:bg-primary-soft"
                >
                  <span className="font-medium text-text-primary">{c.name}</span>
                  <span className="rounded-full bg-bg-subtle px-2.5 py-0.5 text-xs text-text-secondary">
                    {ROLE_LABEL[c.my_role]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-bold text-text-primary">建立新社團</h2>
        <form className="flex gap-2" onSubmit={onCreate}>
          <input
            value={clubName}
            onChange={(e) => setClubName(e.target.value)}
            placeholder="社團名稱，如 投資先鋒社"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" disabled={busy || !clubName.trim()}>
            建立
          </Button>
        </form>
      </Card>

      <p className="px-1 text-xs text-text-muted">
        被邀請加入別人的社團？打開對方給你的「邀請連結」即可加入。
      </p>
    </div>
  );
}

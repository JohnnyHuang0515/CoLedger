import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInvitePreview, acceptInvite } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card } from '../components/ui';
import { LoadingState, ErrorState } from '../components/states';
import { useToast } from '../components/Toast';
import { errorMessage } from '../lib/errors';
import { rememberClub } from '../club/ClubContext';

const ROLE_LABEL: Record<string, string> = { OWNER: '團主', MEMBER: '成員', VIEWER: '唯讀' };

/**
 * /join/:token — public landing for an invite link. Shows what the link grants,
 * then either lets a logged-in user accept, or routes to login/register (with a
 * ?next back to this page) for a logged-out visitor.
 */
export function JoinPage() {
  const { token = '' } = useParams();
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ['invite-preview', token],
    queryFn: () => getInvitePreview(token),
    enabled: Boolean(token),
    retry: false,
  });

  const next = encodeURIComponent(`/join/${token}`);

  const onAccept = async () => {
    setBusy(true);
    try {
      const res = await acceptInvite(token);
      rememberClub(res.membership.club_id);
      toast.success('已加入社團');
      navigate(`/clubs/${res.membership.club_id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-bold text-text-primary">社團邀請</h1>

        {loading || preview.isLoading ? (
          <LoadingState label="讀取邀請…" />
        ) : preview.isError ? (
          <ErrorState error={preview.error} />
        ) : preview.data ? (
          <>
            <p className="mb-6 mt-2 text-sm text-text-secondary">
              你被邀請加入{' '}
              <span className="font-bold text-text-primary">{preview.data.club_name}</span>
              ，角色為{' '}
              <span className="font-medium text-primary">
                {ROLE_LABEL[preview.data.role] ?? preview.data.role}
              </span>
              。
            </p>

            {isAuthenticated ? (
              <>
                <Button onClick={onAccept} disabled={busy} className="w-full">
                  {busy ? '加入中…' : `以 ${user?.display_name} 的身分加入`}
                </Button>
                <p className="mt-3 text-center text-xs text-text-muted">
                  不是你？{' '}
                  <Link to="/login" className="text-primary hover:underline">
                    換帳號登入
                  </Link>
                </p>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={() => navigate(`/login?next=${next}`)}>
                  登入後加入
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate(`/register?next=${next}`)}
                >
                  註冊新帳號
                </Button>
              </div>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}

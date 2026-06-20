import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useClubQuery } from '../hooks/queries';
import { ClubContext, rememberClub, forgetClub } from './ClubContext';
import type { ClubContextValue } from './ClubContext';
import { AppShell } from '../components/AppShell';
import { ErrorState, LoadingState } from '../components/states';
import { errorCode } from '../lib/errors';

// Resolves club + my_role from GET /api/clubs/:id and provides them to all club pages.
export function ClubLayout() {
  const { clubId } = useParams<{ clubId: string }>();
  const { data, isLoading, isError, error, refetch } = useClubQuery(clubId ?? null);

  // Not a member (or club gone): we shouldn't show a raw error or keep it as the
  // "last club". Forget it and bounce to the club picker.
  const code = isError ? errorCode(error) : null;
  const noAccess = code === 'FORBIDDEN' || code === 'CLUB_NOT_FOUND';

  // Only remember a club we can actually access.
  useEffect(() => {
    if (clubId && data) rememberClub(clubId);
  }, [clubId, data]);

  useEffect(() => {
    if (noAccess) forgetClub();
  }, [noAccess]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="載入社團…" />
      </div>
    );
  }

  if (noAccess || !clubId) {
    return <Navigate to="/?pick=1" replace />;
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const value: ClubContextValue = {
    clubId,
    club: data.club,
    myRole: data.my_role,
    isOwner: data.my_role === 'OWNER',
    canWrite: data.my_role === 'OWNER' || data.my_role === 'MEMBER',
  };

  return (
    <ClubContext.Provider value={value}>
      <AppShell>
        <Outlet />
      </AppShell>
    </ClubContext.Provider>
  );
}

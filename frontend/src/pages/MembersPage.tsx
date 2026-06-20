import { useState } from 'react';
import { useClub } from '../club/ClubContext';
import { useAuth } from '../auth/AuthContext';
import {
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useUpdateMemberRole,
} from '../hooks/queries';
import { Button, Card, RolePill, StatusPill } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, SkeletonRows } from '../components/states';
import { CheckIcon, UserIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { errorMessage } from '../lib/errors';
import type { Invite, InviteRole, Member, Role } from '../api/types';

const ROLE_LABEL: Record<string, string> = { OWNER: '團主', MEMBER: '成員', VIEWER: '唯讀' };

function inviteUrl(token: string): string {
  return `${window.location.origin}/join/${token}`;
}

// P-5 成員管理 — 成員清單 (角色/狀態 pill) + 邀請連結 + 改角色/移除 (OWNER only).
export function MembersPage() {
  const { clubId, isOwner } = useClub();
  const { user } = useAuth();
  const toast = useToast();

  const { data, isLoading, isError, error, refetch } = useMembers(clubId);
  const roleMut = useUpdateMemberRole(clubId);
  const removeMut = useRemoveMember(clubId);

  // Invite links (owner only).
  const invitesQuery = useInvites(clubId, isOwner);
  const createInvite = useCreateInvite(clubId);
  const revokeInvite = useRevokeInvite(clubId);
  const [newRole, setNewRole] = useState<InviteRole>('MEMBER');
  // token of the invite whose link was just copied — drives the ✓ feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const onCreateInvite = async () => {
    try {
      const res = await createInvite.mutateAsync({ role: newRole });
      try {
        await navigator.clipboard.writeText(inviteUrl(res.invite.token));
        toast.success('已建立並複製邀請連結');
      } catch {
        toast.success('已建立邀請連結');
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1800);
    } catch {
      toast.error('複製失敗，請手動選取連結');
    }
  };

  const onRevoke = async (inv: Invite) => {
    try {
      await revokeInvite.mutateAsync(inv.id);
      toast.success('已撤銷邀請連結');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onChangeRole = async (m: Member, role: Role) => {
    if (role === m.role) return;
    try {
      await roleMut.mutateAsync({ userId: m.user_id, role });
      toast.success('角色已更新');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onRemove = async () => {
    if (!removeTarget) return;
    try {
      await removeMut.mutateAsync(removeTarget.user_id);
      toast.success('成員已移除');
      setRemoveTarget(null);
    } catch (err) {
      toast.error(errorMessage(err));
      setRemoveTarget(null);
    }
  };

  const members = data?.members ?? [];
  const invites = invitesQuery.data?.invites ?? [];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-bold text-text-primary">成員管理</h1>

      {/* Member roster */}
      <Card>
        {isLoading ? (
          <SkeletonRows rows={3} />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : members.length === 0 ? (
          <EmptyState icon={<UserIcon />} title="尚無成員" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-text-muted">
                  <th className="px-4 py-3">成員</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">狀態</th>
                  {isOwner && <th className="px-4 py-3 text-right">操作</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSelf = m.user_id === user?.id;
                  return (
                    <tr key={m.user_id} className="border-b border-border/60 hover:bg-subtle/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">
                          {m.display_name}
                          {isSelf && <span className="ml-1 text-xs text-text-muted">（你）</span>}
                        </div>
                        <div className="text-xs text-text-secondary">{m.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {isOwner && !isSelf ? (
                          <select
                            value={m.role}
                            onChange={(e) => onChangeRole(m, e.target.value as Role)}
                            disabled={roleMut.isPending}
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
                          >
                            <option value="OWNER">團主</option>
                            <option value="MEMBER">成員</option>
                            <option value="VIEWER">唯讀</option>
                          </select>
                        ) : (
                          <RolePill role={m.role} />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={m.status} />
                      </td>
                      {isOwner && (
                        <td className="px-4 py-3 text-right">
                          {!isSelf && m.status !== 'REMOVED' ? (
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(m)}
                              className="text-loss hover:underline"
                            >
                              移除
                            </button>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite links — OWNER only */}
      {isOwner ? (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-text-primary">邀請連結</h2>
          <p className="mb-4 mt-1 text-xs text-text-secondary">
            把連結傳給對方，他點開、登入或註冊後就會以你指定的角色加入。連結可重複使用，直到你撤銷。
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as InviteRole)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="MEMBER">成員（可登錄自己的交易）</option>
              <option value="VIEWER">唯讀（僅檢視）</option>
            </select>
            <Button onClick={onCreateInvite} disabled={createInvite.isPending}>
              {createInvite.isPending ? '產生中…' : '＋ 產生邀請連結'}
            </Button>
          </div>

          {invitesQuery.isLoading ? (
            <LoadingState />
          ) : invites.length === 0 ? (
            <p className="py-2 text-sm text-text-secondary">目前沒有有效的邀請連結。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {ROLE_LABEL[inv.role]}
                  </span>
                  <code className="min-w-[8rem] flex-1 truncate text-xs text-text-muted">
                    {inviteUrl(inv.token)}
                  </code>
                  <button
                    type="button"
                    onClick={() => onCopy(inv.token)}
                    className={`inline-flex items-center gap-1 text-sm transition-colors ${
                      copiedToken === inv.token
                        ? 'text-profit'
                        : 'text-primary hover:underline'
                    }`}
                  >
                    {copiedToken === inv.token ? (
                      <>
                        <CheckIcon /> 已複製
                      </>
                    ) : (
                      '複製'
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRevoke(inv)}
                    disabled={revokeInvite.isPending}
                    className="text-sm text-loss hover:underline"
                  >
                    撤銷
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <p className="text-xs text-text-muted">只有團主可以建立邀請連結、調整角色或移除成員。</p>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="移除成員"
        message={removeTarget ? `確定要將「${removeTarget.display_name}」移出社團嗎？` : ''}
        confirmLabel="移除"
        busy={removeMut.isPending}
        onConfirm={onRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

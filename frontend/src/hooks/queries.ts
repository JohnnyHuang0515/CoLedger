import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/endpoints';
import type {
  ActivityQuery,
  CreateCashTransactionRequest,
  CreateTransactionRequest,
  InviteRole,
  Role,
  TransactionsQuery,
  UpdateTransactionRequest,
} from '../api/types';

// ---- Query keys ----
export const qk = {
  club: (clubId: string) => ['club', clubId] as const,
  members: (clubId: string) => ['members', clubId] as const,
  holdings: (clubId: string, member: 'me' | 'all') => ['holdings', clubId, member] as const,
  summary: (clubId: string) => ['summary', clubId] as const,
  transactions: (clubId: string, q: TransactionsQuery) =>
    ['transactions', clubId, q] as const,
  activity: (clubId: string, q: ActivityQuery) => ['activity', clubId, q] as const,
  invites: (clubId: string) => ['invites', clubId] as const,
  stocks: (q: string) => ['stocks', q] as const,
};

// Invalidate everything affected by a transaction write (holdings/summary/tx/activity).
function invalidateAfterTxWrite(qc: ReturnType<typeof useQueryClient>, clubId: string) {
  qc.invalidateQueries({ queryKey: ['holdings', clubId] });
  qc.invalidateQueries({ queryKey: ['summary', clubId] });
  qc.invalidateQueries({ queryKey: ['transactions', clubId] });
  qc.invalidateQueries({ queryKey: ['activity', clubId] });
}

// ---- Club / Members ----
export function useMyClubs() {
  return useQuery({ queryKey: ['my-clubs'], queryFn: api.listMyClubs });
}

export function useClubQuery(clubId: string | null) {
  return useQuery({
    queryKey: clubId ? qk.club(clubId) : ['club', 'none'],
    queryFn: () => api.getClub(clubId as string),
    enabled: Boolean(clubId),
  });
}

export function useMembers(clubId: string) {
  return useQuery({
    queryKey: qk.members(clubId),
    queryFn: () => api.getMembers(clubId),
  });
}

export function useHoldings(clubId: string, member: 'me' | 'all') {
  return useQuery({
    queryKey: qk.holdings(clubId, member),
    queryFn: () => api.getHoldings(clubId, member),
  });
}

export function useSummary(clubId: string) {
  return useQuery({
    queryKey: qk.summary(clubId),
    queryFn: () => api.getSummary(clubId),
  });
}

export function useTransactions(clubId: string, query: TransactionsQuery) {
  return useQuery({
    queryKey: qk.transactions(clubId, query),
    queryFn: () => api.getTransactions(clubId, query),
  });
}

export function useActivity(clubId: string, query: ActivityQuery) {
  return useQuery({
    queryKey: qk.activity(clubId, query),
    queryFn: () => api.getActivity(clubId, query),
  });
}

// ---- Mutations ----
export function useCreateTransaction(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTransactionRequest) => api.createTransaction(clubId, input),
    onSuccess: () => invalidateAfterTxWrite(qc, clubId),
  });
}

export function useCreateCashTransaction(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCashTransactionRequest) => api.createCashTransaction(clubId, input),
    onSuccess: () => invalidateAfterTxWrite(qc, clubId),
  });
}

export function useUpdateTransaction(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { txId: string; input: UpdateTransactionRequest }) =>
      api.updateTransaction(clubId, vars.txId, vars.input),
    onSuccess: () => invalidateAfterTxWrite(qc, clubId),
  });
}

export function useDeleteTransaction(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (txId: string) => api.deleteTransaction(clubId, txId),
    onSuccess: () => invalidateAfterTxWrite(qc, clubId),
  });
}

export function useInvites(clubId: string, enabled = true) {
  return useQuery({
    queryKey: qk.invites(clubId),
    queryFn: () => api.listInvites(clubId),
    enabled,
  });
}

export function useCreateInvite(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: InviteRole }) => api.createInvite(clubId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(clubId) }),
  });
}

export function useRevokeInvite(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) => api.revokeInvite(clubId, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(clubId) }),
  });
}

export function useUpdateMemberRole(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; role: Role }) =>
      api.updateMemberRole(clubId, vars.userId, { role: vars.role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.members(clubId) });
      qc.invalidateQueries({ queryKey: qk.club(clubId) });
    },
  });
}

export function useRemoveMember(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(clubId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(clubId) }),
  });
}

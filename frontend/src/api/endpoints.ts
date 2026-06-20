// One function per endpoint. Paths and field names match BUILD-CONTRACT.md §4 exactly.
import { apiFetch } from './client';
import type {
  AcceptInvitationResponse,
  ActivityQuery,
  ActivityResponse,
  AuthResponse,
  ClubListResponse,
  CreateClubResponse,
  CreateTransactionRequest,
  CreateInviteResponse,
  GetClubResponse,
  HoldingsResponse,
  InvitePreview,
  InviteRole,
  InvitesResponse,
  MeResponse,
  MembersResponse,
  QuoteResponse,
  Role,
  StocksResponse,
  SummaryResponse,
  TransactionMutationResponse,
  TransactionsQuery,
  TransactionsResponse,
  UpdateMemberResponse,
  UpdateTransactionRequest,
} from './types';

// ---- Auth ----
export function register(input: {
  email: string;
  display_name: string;
  password: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: input });
}

export function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: input });
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>('/auth/me');
}

// ---- Clubs / Members ----
export function listMyClubs(): Promise<ClubListResponse> {
  return apiFetch<ClubListResponse>('/clubs');
}

export function createClub(input: { name: string }): Promise<CreateClubResponse> {
  return apiFetch<CreateClubResponse>('/clubs', { method: 'POST', body: input });
}

export function getClub(clubId: string): Promise<GetClubResponse> {
  return apiFetch<GetClubResponse>(`/clubs/${clubId}`);
}

export function getMembers(clubId: string): Promise<MembersResponse> {
  return apiFetch<MembersResponse>(`/clubs/${clubId}/members`);
}

export function createInvite(
  clubId: string,
  input: { role: InviteRole },
): Promise<CreateInviteResponse> {
  return apiFetch<CreateInviteResponse>(`/clubs/${clubId}/invites`, {
    method: 'POST',
    body: input,
  });
}

export function listInvites(clubId: string): Promise<InvitesResponse> {
  return apiFetch<InvitesResponse>(`/clubs/${clubId}/invites`);
}

export function revokeInvite(clubId: string, inviteId: string): Promise<void> {
  return apiFetch<void>(`/clubs/${clubId}/invites/${inviteId}`, { method: 'DELETE' });
}

export function getInvitePreview(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>(`/invites/${token}`);
}

export function acceptInvite(token: string): Promise<AcceptInvitationResponse> {
  return apiFetch<AcceptInvitationResponse>(`/invites/${token}/accept`, { method: 'POST' });
}

export function updateMemberRole(
  clubId: string,
  userId: string,
  input: { role: Role },
): Promise<UpdateMemberResponse> {
  return apiFetch<UpdateMemberResponse>(`/clubs/${clubId}/members/${userId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function removeMember(clubId: string, userId: string): Promise<void> {
  return apiFetch<void>(`/clubs/${clubId}/members/${userId}`, { method: 'DELETE' });
}

// ---- Transactions ----
export function createTransaction(
  clubId: string,
  input: CreateTransactionRequest,
): Promise<TransactionMutationResponse> {
  return apiFetch<TransactionMutationResponse>(`/clubs/${clubId}/transactions`, {
    method: 'POST',
    body: input,
  });
}

export function updateTransaction(
  clubId: string,
  txId: string,
  input: UpdateTransactionRequest,
): Promise<TransactionMutationResponse> {
  return apiFetch<TransactionMutationResponse>(`/clubs/${clubId}/transactions/${txId}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteTransaction(
  clubId: string,
  txId: string,
): Promise<TransactionMutationResponse> {
  return apiFetch<TransactionMutationResponse>(`/clubs/${clubId}/transactions/${txId}`, {
    method: 'DELETE',
  });
}

export function getTransactions(
  clubId: string,
  query: TransactionsQuery = {},
): Promise<TransactionsResponse> {
  return apiFetch<TransactionsResponse>(`/clubs/${clubId}/transactions`, {
    query: {
      member: query.member,
      symbol: query.symbol,
      side: query.side,
      from: query.from,
      to: query.to,
    },
  });
}

// ---- Holdings / Summary / Activity ----
export function getHoldings(
  clubId: string,
  member: 'me' | 'all' = 'me',
): Promise<HoldingsResponse> {
  return apiFetch<HoldingsResponse>(`/clubs/${clubId}/holdings`, { query: { member } });
}

export function getSummary(clubId: string): Promise<SummaryResponse> {
  return apiFetch<SummaryResponse>(`/clubs/${clubId}/summary`);
}

export function getActivity(
  clubId: string,
  query: ActivityQuery = {},
): Promise<ActivityResponse> {
  return apiFetch<ActivityResponse>(`/clubs/${clubId}/activity`, {
    query: { member: query.member, from: query.from, to: query.to },
  });
}

// ---- Stocks / Quote ----
export function searchStocks(q: string): Promise<StocksResponse> {
  return apiFetch<StocksResponse>('/stocks', { query: { q } });
}

export function getQuote(symbol: string): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/stocks/${symbol}/quote`);
}

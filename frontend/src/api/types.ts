// API type definitions — aligned field-for-field with BUILD-CONTRACT.md §4 and 6-interfaces.md §6.2.
// All money fields are string decimals (e.g. "600.00"). Quantities are integers (shares).

export type Role = 'OWNER' | 'MEMBER' | 'VIEWER';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';
export type Side = 'BUY' | 'SELL';
export type TxStatus = 'ACTIVE' | 'DELETED';
export type Market = 'TWSE' | 'TPEX';
export type ChangeAction = 'CREATE' | 'UPDATE' | 'DELETE';

// ---- Auth ----
export interface User {
  id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface MeResponse {
  user: User;
}

// ---- Clubs / Members ----
export interface Club {
  id: string;
  name: string;
  owner_user_id: string;
}

export interface CreateClubResponse {
  club: Club;
}

export interface ClubListItem {
  id: string;
  name: string;
  owner_user_id: string;
  my_role: Role;
}

export interface ClubListResponse {
  clubs: ClubListItem[];
}

export interface GetClubResponse {
  club: Club;
  my_role: Role;
}

export interface Member {
  user_id: string;
  display_name: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  joined_at: string | null;
}

export interface MembersResponse {
  members: Member[];
}

export type InviteRole = Exclude<Role, 'OWNER'>; // MEMBER | VIEWER

export interface Invite {
  id: string;
  token: string;
  role: InviteRole;
  created_by: string;
  created_at: string;
}

export interface InvitesResponse {
  invites: Invite[];
}

export interface CreateInviteResponse {
  invite: Invite;
}

export interface InvitePreview {
  club_id: string;
  club_name: string;
  role: Role;
}

export interface AcceptInvitationResponse {
  membership: {
    club_id: string;
    user_id: string;
    role: Role;
    status: 'ACTIVE';
  };
}

export interface UpdateMemberResponse {
  member: Member;
}

// ---- Transactions ----
export interface TransactionCore {
  id: string;
  stock_symbol: string;
  side: Side;
  quantity: number;
  price: string;
  amount: string;
  traded_at: string;
  status: TxStatus;
  member_user_id?: string;
  created_by_user_id?: string;
  is_proxy?: boolean;
}

export interface HoldingSnapshot {
  stock_symbol: string;
  quantity: number;
  avg_cost: string;
  realized_pnl: string;
}

export interface CreateTransactionRequest {
  member_user_id?: string;
  stock_symbol: string;
  side: Side;
  quantity: number;
  price: string;
  traded_at: string;
  is_opening_balance?: boolean;
  note?: string;
}

export interface UpdateTransactionRequest {
  quantity?: number;
  price?: string;
  traded_at?: string;
  note?: string;
}

export interface TransactionMutationResponse {
  transaction: TransactionCore;
  holding: HoldingSnapshot;
}

// Full row shape from GET /transactions list
export interface TransactionRow {
  id: string;
  member_user_id: string;
  member_name: string;
  created_by_user_id: string;
  created_by_name: string;
  is_proxy: boolean;
  stock_symbol: string;
  name: string;
  side: Side;
  quantity: number;
  price: string;
  amount: string;
  traded_at: string;
  realized_pnl: string | null; // 本筆已實現, only SELL has value else null
  note: string | null;
  status: TxStatus;
}

export interface TransactionsResponse {
  transactions: TransactionRow[];
}

export interface TransactionsQuery {
  member?: string;
  symbol?: string;
  side?: Side;
  from?: string;
  to?: string;
}

// ---- Holdings ----
export interface HoldingRow {
  stock_symbol: string;
  name: string;
  quantity: number;
  avg_cost: string;
  price: string | null;
  price_as_of: string | null;
  stale: boolean;
  market_value: string | null;
  unrealized_pnl: string | null;
  realized_pnl: string;
}

export interface MemberHoldings {
  user_id: string;
  display_name: string;
  holdings: HoldingRow[];
}

export interface HoldingsResponse {
  as_of: string;
  members: MemberHoldings[];
}

// ---- Summary ----
export interface SummaryBySymbol {
  stock_symbol: string;
  name: string;
  total_quantity: number;
  total_market_value: string;
  total_unrealized_pnl: string;
}

export interface SummaryResponse {
  as_of: string;
  total_market_value: string;
  total_unrealized_pnl: string;
  total_realized_pnl: string;
  by_symbol: SummaryBySymbol[];
}

// ---- Activity ----
export interface ActivityEntry {
  id: string;
  actor: string;
  summary: string;
  entity_type: string;
  entity_id: string;
  action: ChangeAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface ActivityResponse {
  entries: ActivityEntry[];
  page: { next: string | null };
}

export interface ActivityQuery {
  member?: string;
  from?: string;
  to?: string;
}

// ---- Stocks / Quote ----
export interface StockResult {
  symbol: string;
  name: string;
  market: Market;
}

export interface StocksResponse {
  results: StockResult[];
}

export interface QuoteResponse {
  symbol: string;
  price: string;
  as_of: string;
  stale: boolean;
}

// ---- Error model (§6.5) ----
export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CLUB_NOT_FOUND'
  | 'TRANSACTION_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'STOCK_NOT_FOUND'
  | 'ALREADY_MEMBER'
  | 'CANNOT_REMOVE_SOLE_OWNER'
  | 'INVALID_TRANSACTION_INPUT'
  | 'INSUFFICIENT_HOLDING'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: Record<string, unknown>;
    trace_id?: string;
  };
}

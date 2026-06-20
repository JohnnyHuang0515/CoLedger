"""Pydantic v2 request/response schemas — shapes locked by BUILD-CONTRACT §4/§6."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

# --- helpers -------------------------------------------------------------


def money_str(value: Decimal | None) -> str | None:
    """Render a Decimal as a 2dp string ("600.00"); None passes through."""
    if value is None:
        return None
    q = Decimal(value).quantize(Decimal("0.01"))
    if q == 0:  # avoid "-0.00"
        q = Decimal("0.00")
    return f"{q}"


# --- Auth ----------------------------------------------------------------


class RegisterRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1)
    password: str = Field(min_length=4)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MeResponse(BaseModel):
    user: UserOut


# --- Clubs / Members -----------------------------------------------------


class CreateClubRequest(BaseModel):
    name: str = Field(min_length=1)


class ClubOut(BaseModel):
    id: str
    name: str
    owner_user_id: str


class CreateClubResponse(BaseModel):
    club: ClubOut


class ClubInfoResponse(BaseModel):
    club: ClubOut
    my_role: str


class ClubListItem(BaseModel):
    id: str
    name: str
    owner_user_id: str
    my_role: str


class ClubListResponse(BaseModel):
    clubs: list[ClubListItem]


class MemberOut(BaseModel):
    user_id: str
    display_name: str
    email: str
    role: str
    status: str
    joined_at: str | None = None


class MembersResponse(BaseModel):
    members: list[MemberOut]


class CreateInviteRequest(BaseModel):
    role: str  # MEMBER | VIEWER


class InviteOut(BaseModel):
    id: str
    token: str
    role: str
    created_by: str
    created_at: str


class InviteListResponse(BaseModel):
    invites: list[InviteOut]


class CreateInviteResponse(BaseModel):
    invite: InviteOut


class InvitePreviewResponse(BaseModel):
    club_id: str
    club_name: str
    role: str


class MembershipOut(BaseModel):
    club_id: str
    user_id: str
    role: str
    status: str


class AcceptInviteResponse(BaseModel):
    membership: MembershipOut


class PatchMemberRequest(BaseModel):
    role: str


class PatchMemberResponse(BaseModel):
    member: MemberOut


# --- Transactions --------------------------------------------------------


class CreateTransactionRequest(BaseModel):
    member_user_id: str | None = None
    stock_symbol: str
    side: str  # BUY | SELL
    quantity: int
    price: Decimal
    traded_at: date
    is_opening_balance: bool = False
    note: str | None = None


class PatchTransactionRequest(BaseModel):
    quantity: int | None = None
    price: Decimal | None = None
    traded_at: date | None = None
    note: str | None = None


class TransactionOut(BaseModel):
    """Shape returned by POST/PATCH transactions (§6.2 + contract §4)."""

    id: str
    stock_symbol: str
    side: str
    quantity: int
    price: str
    amount: str
    traded_at: str
    status: str
    member_user_id: str
    created_by_user_id: str
    is_proxy: bool


class HoldingShortOut(BaseModel):
    stock_symbol: str
    quantity: int
    avg_cost: str
    realized_pnl: str


class CreateTransactionResponse(BaseModel):
    transaction: TransactionOut
    holding: HoldingShortOut


class TransactionListItem(BaseModel):
    id: str
    member_user_id: str
    member_name: str
    created_by_user_id: str
    created_by_name: str
    is_proxy: bool
    stock_symbol: str
    name: str
    side: str
    quantity: int
    price: str
    amount: str
    traded_at: str
    realized_pnl: str | None  # 本筆已實現 (SELL only, else null)
    note: str | None
    status: str


class TransactionListResponse(BaseModel):
    transactions: list[TransactionListItem]


# --- Holdings / Summary / Activity --------------------------------------


class HoldingFullOut(BaseModel):
    stock_symbol: str
    name: str
    quantity: int
    avg_cost: str
    price: str | None
    price_as_of: str | None
    stale: bool
    market_value: str | None
    unrealized_pnl: str | None
    realized_pnl: str


class MemberHoldingsOut(BaseModel):
    user_id: str
    display_name: str
    holdings: list[HoldingFullOut]


class HoldingsResponse(BaseModel):
    as_of: str
    members: list[MemberHoldingsOut]


class SummaryBySymbol(BaseModel):
    stock_symbol: str
    name: str
    total_quantity: int
    total_market_value: str | None
    total_unrealized_pnl: str | None


class SummaryResponse(BaseModel):
    as_of: str
    total_market_value: str
    total_unrealized_pnl: str
    total_realized_pnl: str
    by_symbol: list[SummaryBySymbol]


class ActivityEntry(BaseModel):
    id: str
    actor: str
    summary: str  # human-readable 中文 description (names/symbols resolved)
    entity_type: str
    entity_id: str
    action: str
    before: dict | None
    after: dict | None
    created_at: str


class ActivityPage(BaseModel):
    next: str | None = None


class ActivityResponse(BaseModel):
    entries: list[ActivityEntry]
    page: ActivityPage


# --- Stocks / Quote ------------------------------------------------------


class StockOut(BaseModel):
    symbol: str
    name: str
    market: str


class StockListResponse(BaseModel):
    results: list[StockOut]


class QuoteResponse(BaseModel):
    symbol: str
    price: str | None
    as_of: str | None
    stale: bool

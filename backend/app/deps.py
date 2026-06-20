"""FastAPI dependencies: auth + club membership/role resolution."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import errors
from .auth import decode_access_token
from .db import get_db
from .models import Club, Membership, MembershipStatus, Role, User

# auto_error=False so a missing token yields our 401 shape, not FastAPI's.
_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise errors.unauthorized()
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise errors.unauthorized("token 無效或已過期")
    user = db.get(User, user_id)
    if user is None:
        raise errors.unauthorized("使用者不存在")
    return user


@dataclass
class ClubContext:
    """Resolved club + the caller's ACTIVE membership in it."""

    club: Club
    membership: Membership
    user: User

    @property
    def role(self) -> Role:
        return self.membership.role

    @property
    def is_owner(self) -> bool:
        return self.membership.role == Role.OWNER

    @property
    def is_viewer(self) -> bool:
        return self.membership.role == Role.VIEWER


def require_club_member(club_id: str, user: User, db: Session) -> ClubContext:
    """Caller must exist and be an ACTIVE member of the club.

    Raises CLUB_NOT_FOUND if the club doesn't exist, FORBIDDEN if the caller
    is not an active member (per AC-12.2).
    """
    club = db.get(Club, club_id)
    if club is None:
        raise errors.club_not_found()
    membership = db.scalar(
        select(Membership).where(
            Membership.club_id == club_id,
            Membership.user_id == user.id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    )
    if membership is None:
        raise errors.forbidden("非該社團成員")
    return ClubContext(club=club, membership=membership, user=user)

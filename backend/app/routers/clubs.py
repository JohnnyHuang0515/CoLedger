"""Club routes: create club, get club info."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import Club, Membership, MembershipStatus, Role, User
from ..schemas import (
    ClubInfoResponse,
    ClubListItem,
    ClubListResponse,
    ClubOut,
    CreateClubRequest,
    CreateClubResponse,
)

router = APIRouter(prefix="/api/clubs", tags=["clubs"])


@router.post("", status_code=201, response_model=CreateClubResponse)
def create_club(
    body: CreateClubRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateClubResponse:
    club = Club(name=body.name, owner_user_id=current.id)
    db.add(club)
    db.flush()  # get club.id
    # Caller becomes OWNER + ACTIVE (AC-2.1, BR-12).
    db.add(
        Membership(
            club_id=club.id,
            user_id=current.id,
            role=Role.OWNER,
            status=MembershipStatus.ACTIVE,
            joined_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(club)
    return CreateClubResponse(
        club=ClubOut(id=club.id, name=club.name, owner_user_id=club.owner_user_id)
    )


@router.get("", response_model=ClubListResponse)
def list_my_clubs(
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubListResponse:
    """List clubs where the caller is an ACTIVE member (BUILD-CONTRACT §4)."""
    rows = db.execute(
        select(Club, Membership.role)
        .join(Membership, Membership.club_id == Club.id)
        .where(
            Membership.user_id == current.id,
            Membership.status == MembershipStatus.ACTIVE,
        )
        .order_by(Club.name)
    ).all()
    return ClubListResponse(
        clubs=[
            ClubListItem(
                id=club.id,
                name=club.name,
                owner_user_id=club.owner_user_id,
                my_role=role.value,
            )
            for club, role in rows
        ]
    )


@router.get("/{club_id}", response_model=ClubInfoResponse)
def get_club(
    club_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClubInfoResponse:
    ctx = require_club_member(club_id, current, db)
    return ClubInfoResponse(
        club=ClubOut(
            id=ctx.club.id,
            name=ctx.club.name,
            owner_user_id=ctx.club.owner_user_id,
        ),
        my_role=ctx.role.value,
    )

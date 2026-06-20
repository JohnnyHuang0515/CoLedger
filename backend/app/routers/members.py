"""Member management: list, invite, accept, change role, remove.

OWNER-only mutations. Sole-OWNER protection (BR-12). ChangeLog on every
membership write (BR-8).
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import errors
from ..db import get_db
from ..deps import get_current_user, require_club_member
from ..models import (
    ChangeAction,
    Club,
    Invite,
    InviteStatus,
    Membership,
    MembershipStatus,
    Role,
    User,
)
from ..schemas import (
    AcceptInviteResponse,
    CreateInviteRequest,
    CreateInviteResponse,
    InviteListResponse,
    InviteOut,
    InvitePreviewResponse,
    MemberOut,
    MembersResponse,
    MembershipOut,
    PatchMemberRequest,
    PatchMemberResponse,
)
from ..services.changelog import membership_snapshot, stage_change_log

router = APIRouter(prefix="/api", tags=["members"])


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _member_out(m: Membership, u: User) -> MemberOut:
    return MemberOut(
        user_id=m.user_id,
        display_name=u.display_name,
        email=u.email,
        role=m.role.value,
        status=m.status.value,
        joined_at=_iso(m.joined_at),
    )


def _active_owner_count(db: Session, club_id: str, exclude_user_id: str | None = None):
    stmt = select(Membership).where(
        Membership.club_id == club_id,
        Membership.role == Role.OWNER,
        Membership.status == MembershipStatus.ACTIVE,
    )
    owners = db.scalars(stmt).all()
    if exclude_user_id:
        owners = [o for o in owners if o.user_id != exclude_user_id]
    return owners


@router.get("/clubs/{club_id}/members", response_model=MembersResponse)
def list_members(
    club_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MembersResponse:
    require_club_member(club_id, current, db)
    rows = db.scalars(
        select(Membership).where(
            Membership.club_id == club_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    ).all()
    members = [_member_out(m, m.user) for m in rows]
    return MembersResponse(members=members)


def _invite_out(inv: Invite, creator_name: str) -> InviteOut:
    return InviteOut(
        id=inv.id,
        token=inv.token,
        role=inv.role.value,
        created_by=creator_name,
        created_at=_iso(inv.created_at) or "",
    )


@router.post(
    "/clubs/{club_id}/invites", status_code=201, response_model=CreateInviteResponse
)
def create_invite(
    club_id: str,
    body: CreateInviteRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CreateInviteResponse:
    """OWNER creates a reusable invite link for a fixed role (MEMBER/VIEWER)."""
    ctx = require_club_member(club_id, current, db)
    if not ctx.is_owner:
        raise errors.forbidden("僅團主可建立邀請連結")
    if body.role not in ("MEMBER", "VIEWER"):
        raise errors.invalid_request("role 僅能為 MEMBER 或 VIEWER")

    inv = Invite(
        club_id=club_id,
        role=Role(body.role),
        token=secrets.token_urlsafe(24),
        status=InviteStatus.ACTIVE,
        created_by_user_id=current.id,
    )
    db.add(inv)
    db.flush()
    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Invite",
        entity_id=inv.id,
        action=ChangeAction.CREATE,
        before=None,
        after={"role": inv.role.value},
    )
    db.commit()
    return CreateInviteResponse(invite=_invite_out(inv, current.display_name))


@router.get("/clubs/{club_id}/invites", response_model=InviteListResponse)
def list_invites(
    club_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InviteListResponse:
    ctx = require_club_member(club_id, current, db)
    if not ctx.is_owner:
        raise errors.forbidden("僅團主可檢視邀請連結")
    rows = db.scalars(
        select(Invite)
        .where(Invite.club_id == club_id, Invite.status == InviteStatus.ACTIVE)
        .order_by(Invite.created_at.desc())
    ).all()
    out = []
    for inv in rows:
        creator = db.get(User, inv.created_by_user_id)
        out.append(_invite_out(inv, creator.display_name if creator else "—"))
    return InviteListResponse(invites=out)


@router.delete("/clubs/{club_id}/invites/{invite_id}")
def revoke_invite(
    club_id: str,
    invite_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = require_club_member(club_id, current, db)
    if not ctx.is_owner:
        raise errors.forbidden("僅團主可撤銷邀請連結")
    inv = db.get(Invite, invite_id)
    if inv is None or inv.club_id != club_id:
        raise errors.member_not_found("邀請連結不存在")
    inv.status = InviteStatus.REVOKED
    db.flush()
    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Invite",
        entity_id=inv.id,
        action=ChangeAction.DELETE,
        before={"role": inv.role.value},
        after=None,
    )
    db.commit()
    return {"ok": True}


@router.get("/invites/{token}", response_model=InvitePreviewResponse)
def preview_invite(
    token: str,
    db: Session = Depends(get_db),
) -> InvitePreviewResponse:
    """Show what an invite link grants (club name + role) before accepting.

    Public (no auth) so a logged-out invitee can see it before login/register.
    """
    inv = db.scalar(
        select(Invite).where(
            Invite.token == token, Invite.status == InviteStatus.ACTIVE
        )
    )
    if inv is None:
        raise errors.member_not_found("邀請連結不存在或已失效")
    club = db.get(Club, inv.club_id)
    return InvitePreviewResponse(
        club_id=inv.club_id,
        club_name=club.name if club else "—",
        role=inv.role.value,
    )


@router.post("/invites/{token}/accept", response_model=AcceptInviteResponse)
def accept_invite(
    token: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AcceptInviteResponse:
    """Join the club the (active) invite link points to, at its role."""
    inv = db.scalar(
        select(Invite).where(
            Invite.token == token, Invite.status == InviteStatus.ACTIVE
        )
    )
    if inv is None:
        raise errors.member_not_found("邀請連結不存在或已失效")

    existing = db.scalar(
        select(Membership).where(
            Membership.club_id == inv.club_id,
            Membership.user_id == current.id,
        )
    )
    if existing is not None and existing.status == MembershipStatus.ACTIVE:
        raise errors.already_member()

    now = datetime.now(timezone.utc)
    if existing is not None:
        # Reactivate a previously-removed membership (avoid unique-key clash).
        before = membership_snapshot(existing)
        existing.role = inv.role
        existing.status = MembershipStatus.ACTIVE
        existing.joined_at = now
        membership = existing
        action = ChangeAction.UPDATE
    else:
        membership = Membership(
            club_id=inv.club_id,
            user_id=current.id,
            role=inv.role,
            status=MembershipStatus.ACTIVE,
            joined_at=now,
        )
        db.add(membership)
        before = None
        action = ChangeAction.CREATE
    db.flush()
    stage_change_log(
        db,
        club_id=inv.club_id,
        actor_user_id=current.id,
        entity_type="Membership",
        entity_id=membership.id,
        action=action,
        before=before,
        after=membership_snapshot(membership),
    )
    db.commit()
    return AcceptInviteResponse(
        membership=MembershipOut(
            club_id=membership.club_id,
            user_id=membership.user_id,
            role=membership.role.value,
            status=membership.status.value,
        )
    )


def _find_active_membership(db: Session, club_id: str, user_id: str) -> Membership:
    m = db.scalar(
        select(Membership).where(
            Membership.club_id == club_id,
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE,
        )
    )
    if m is None:
        raise errors.member_not_found()
    return m


@router.patch(
    "/clubs/{club_id}/members/{user_id}", response_model=PatchMemberResponse
)
def patch_member(
    club_id: str,
    user_id: str,
    body: PatchMemberRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PatchMemberResponse:
    ctx = require_club_member(club_id, current, db)
    if not ctx.is_owner:
        raise errors.forbidden("僅團主可變更角色")
    if body.role not in ("OWNER", "MEMBER", "VIEWER"):
        raise errors.invalid_request("role 不合法")

    target = _find_active_membership(db, club_id, user_id)
    new_role = Role(body.role)

    # Demoting the sole OWNER is blocked (BR-12, AC-EF.7).
    if target.role == Role.OWNER and new_role != Role.OWNER:
        if len(_active_owner_count(db, club_id, exclude_user_id=user_id)) == 0:
            raise errors.cannot_remove_sole_owner()

    before = membership_snapshot(target)
    target.role = new_role
    # Keep clubs.owner_user_id pointer in sync when ownership changes.
    if new_role == Role.OWNER:
        club = db.get(Club, club_id)
        club.owner_user_id = user_id
    db.flush()
    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Membership",
        entity_id=target.id,
        action=ChangeAction.UPDATE,
        before=before,
        after=membership_snapshot(target),
    )
    db.commit()
    return PatchMemberResponse(member=_member_out(target, target.user))


@router.delete("/clubs/{club_id}/members/{user_id}")
def remove_member(
    club_id: str,
    user_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ctx = require_club_member(club_id, current, db)
    if not ctx.is_owner:
        raise errors.forbidden("僅團主可移除成員")

    target = _find_active_membership(db, club_id, user_id)

    # Removing the sole OWNER is blocked (BR-12, AC-EF.7).
    if target.role == Role.OWNER:
        if len(_active_owner_count(db, club_id, exclude_user_id=user_id)) == 0:
            raise errors.cannot_remove_sole_owner()

    before = membership_snapshot(target)
    target.status = MembershipStatus.REMOVED
    db.flush()
    stage_change_log(
        db,
        club_id=club_id,
        actor_user_id=current.id,
        entity_type="Membership",
        entity_id=target.id,
        action=ChangeAction.DELETE,
        before=before,
        after=membership_snapshot(target),
    )
    db.commit()
    return {"ok": True}

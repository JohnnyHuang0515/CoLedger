"""Auth routes: register / login / me. register+login are public (NFR-1)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import errors
from ..auth import create_access_token, hash_password, verify_password
from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    LoginRequest,
    MeResponse,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name)


@router.post("/register", status_code=201, response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise errors.invalid_request(
            "此 email 已註冊", details={"field": "email"}
        )
    user = User(
        email=str(body.email),
        display_name=body.display_name,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=_user_out(user))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise errors.unauthorized("帳號或密碼錯誤")
    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=_user_out(user))


@router.get("/me", response_model=MeResponse)
def me(current: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(user=_user_out(current))

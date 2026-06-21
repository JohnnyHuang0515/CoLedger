"""Pytest fixtures: a fresh seeded app + TestClient per test module.

A throwaway file-backed SQLite is used (not :memory:) so every connection the
app opens shares the same data — same approach as smoke_test.py. Env is set
before any app module is imported so settings pick it up.
"""
from __future__ import annotations

import os
import tempfile

import pytest

# --- Configure a disposable DB + offline mock quotes BEFORE importing app. ---
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["QUOTE_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Club, User  # noqa: E402
from app.seed import _reset_schema, seed_all  # noqa: E402


@pytest.fixture(autouse=True)
def _seeded_db():
    """Reset schema + re-seed demo data before EACH test.

    Function-scoped so tests that create transactions don't leak state into the
    exact-value assertions of other tests. Seeding is cheap (in-process SQLite).
    """
    _reset_schema()
    with SessionLocal() as db:
        seed_all(db)
    yield


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _login(client: TestClient, email: str) -> str:
    r = client.post(
        "/api/auth/login", json={"email": email, "password": "demo1234"}
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def tokens(client: TestClient) -> dict[str, str]:
    """Map of demo email-local-part -> bearer token."""
    return {
        "alice": _login(client, "alice@demo.tw"),
        "bob": _login(client, "bob@demo.tw"),
        "carol": _login(client, "carol@demo.tw"),
        "dave": _login(client, "dave@demo.tw"),
    }


@pytest.fixture()
def auth():
    return _auth


@pytest.fixture()
def ids() -> dict[str, str]:
    """Resolve club + per-member user ids straight from the DB."""
    out: dict[str, str] = {}
    with SessionLocal() as db:
        out["club"] = db.query(Club).first().id
        for u in db.query(User).all():
            out[u.email.split("@")[0]] = u.id
    return out

"""Canonical error model per BUILD-CONTRACT §6.5.

Every error response has shape:
    {"error": {"code", "message", "details", "trace_id"}}
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIError(Exception):
    """Raise this anywhere to produce a contract-shaped error response."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)


def _payload(code: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "trace_id": str(uuid.uuid4()),
        }
    }


# --- Convenience constructors (locked codes from §6.5) -------------------


def invalid_request(message: str = "請求格式錯誤", details=None) -> APIError:
    return APIError(400, "INVALID_REQUEST", message, details)


def unauthorized(message: str = "未認證") -> APIError:
    return APIError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "無權限執行此操作") -> APIError:
    return APIError(403, "FORBIDDEN", message)


def club_not_found(message: str = "社團不存在") -> APIError:
    return APIError(404, "CLUB_NOT_FOUND", message)


def transaction_not_found(message: str = "交易不存在") -> APIError:
    return APIError(404, "TRANSACTION_NOT_FOUND", message)


def member_not_found(message: str = "成員不存在") -> APIError:
    return APIError(404, "MEMBER_NOT_FOUND", message)


def stock_not_found(message: str = "代號不存在") -> APIError:
    return APIError(404, "STOCK_NOT_FOUND", message)


def already_member(message: str = "已是有效成員") -> APIError:
    return APIError(409, "ALREADY_MEMBER", message)


def cannot_remove_sole_owner(
    message: str = "不可移除或降級唯一團主",
) -> APIError:
    return APIError(409, "CANNOT_REMOVE_SOLE_OWNER", message)


def invalid_transaction_input(message: str, details=None) -> APIError:
    return APIError(422, "INVALID_TRANSACTION_INPUT", message, details)


def insufficient_holding(message: str, details=None) -> APIError:
    return APIError(422, "INSUFFICIENT_HOLDING", message, details)


def internal_error(message: str = "系統錯誤") -> APIError:
    return APIError(500, "INTERNAL_ERROR", message)


# --- Exception handlers (registered in main.py) --------------------------


async def api_error_handler(_: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(exc.code, exc.message, exc.details),
    )


async def http_exception_handler(
    _: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Map FastAPI/Starlette HTTPException (e.g. 401 from auth) to our shape."""
    code_map = {
        400: "INVALID_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "CLUB_NOT_FOUND",  # generic 404; specific routes raise APIError
        405: "INVALID_REQUEST",
    }
    code = code_map.get(exc.status_code, "INTERNAL_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "錯誤"
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(code, message, {}),
    )


async def validation_exception_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    """Pydantic request-body validation failure → 400 INVALID_REQUEST."""
    return JSONResponse(
        status_code=400,
        content=_payload(
            "INVALID_REQUEST",
            "請求格式錯誤",
            {"errors": exc.errors()},
        ),
    )


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=_payload("INTERNAL_ERROR", "系統錯誤", {}),
    )

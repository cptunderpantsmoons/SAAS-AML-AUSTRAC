"""FastAPI dependencies for SuperTokens session verification and RBAC.

These can be injected into route handlers with ``Depends()``.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from fastapi import Depends, HTTPException, Request

from auth.config import AuthSettings, get_auth_settings

logger = logging.getLogger("auth.dependencies")


async def get_session(
    request: Request,
    settings: AuthSettings = Depends(get_auth_settings),
) -> Any:
    """Extract and verify the SuperTokens session from the incoming request.

    Raises ``HTTPException(401)`` if the session is missing or invalid.
    """
    try:
        from supertokens_python.recipe.session.asyncio import get_session as async_get_session
        from supertokens_python.recipe.session.exceptions import (
            TryRefreshTokenError,
            UnauthorisedError,
        )

        session = await async_get_session(request, session_required=True)
        if session is None:
            raise HTTPException(status_code=401, detail="Unauthorised")
        return session
    except (UnauthorisedError, TryRefreshTokenError) as exc:
        logger.warning("Session verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Unauthorised") from exc
    except Exception as exc:
        logger.error("Unexpected session error: %s", exc)
        raise HTTPException(status_code=500, detail="Session verification error") from exc


async def get_optional_session(
    request: Request,
) -> Any | None:
    """Try to extract a SuperTokens session, returning ``None`` if absent.

    Use this for endpoints that behave differently for logged-in vs anonymous users.
    """
    try:
        from supertokens_python.recipe.session.asyncio import get_session as async_get_session

        return await async_get_session(request, session_required=False)
    except Exception:
        return None


def require_role(*allowed_roles: str) -> Callable[..., Any]:
    """Factory that returns a FastAPI dependency enforcing role claims.

    Example::

        @router.get("/board/metrics", dependencies=[Depends(require_role("board_member"))])
        async def board_metrics():
            ...
    """
    async def _checker(
        session: Any = Depends(get_session),
        settings: AuthSettings = Depends(get_auth_settings),
    ) -> Any:
        try:
            from supertokens_python.recipe.userroles.asyncio import get_roles_for_user

            user_id = session.get_user_id()
            roles_result = await get_roles_for_user("public", user_id)
            user_roles = set(roles_result.roles)

            # Check direct claim in session payload as a fast-path fallback
            payload = session.get_access_token_payload()
            st_roles = payload.get("st-role", {}).get("v", [])
            user_roles.update(st_roles)

            if not any(role in user_roles for role in allowed_roles):
                logger.warning(
                    "User %s denied access — roles=%s required=%s",
                    user_id,
                    user_roles,
                    allowed_roles,
                )
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied — requires one of: {', '.join(allowed_roles)}",
                )

            return session
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("Role check failed: %s", exc)
            raise HTTPException(status_code=403, detail="Role verification failed") from exc

    return _checker


async def require_compliance_officer(
    session: Any = Depends(require_role("compliance_officer")),
) -> Any:
    """Convenience dependency for compliance-officer-only routes."""
    return session


async def require_board_member(
    session: Any = Depends(require_role("board_member")),
) -> Any:
    """Convenience dependency for board-member-only routes."""
    return session

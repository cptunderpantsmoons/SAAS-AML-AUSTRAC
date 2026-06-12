"""SuperTokens initialization helpers.

Wraps supertokens-python init() so each FastAPI service can share the same
configuration without duplicating boilerplate.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI

logger = logging.getLogger("auth.supertokens_init")


def init_supertokens(auth_settings: Any) -> None:
    """Initialise the SuperTokens Python SDK for FastAPI.

    Parameters
    ----------
    auth_settings:
        An instance of :class:`auth.config.AuthSettings`.
    """
    try:
        from supertokens_python import InputAppInfo, SupertokensConfig, init
        from supertokens_python.recipe import (
            emailpassword,
            session,
            userroles,
        )

        init(
            app_info=InputAppInfo(
                app_name=auth_settings.app_name,
                api_domain=auth_settings.api_domain,
                website_domain=auth_settings.website_domain,
                api_base_path=auth_settings.api_base_path,
                website_base_path=auth_settings.website_base_path,
            ),
            supertokens_config=SupertokensConfig(
                connection_uri=auth_settings.connection_uri,
                api_key=auth_settings.api_key if auth_settings.api_key else None,
            ),
            framework="fastapi",
            recipe_list=[
                session.init(
                    cookie_secure=auth_settings.cookie_secure,
                    cookie_same_site=auth_settings.cookie_same_site,
                ),
                emailpassword.init(),
                userroles.init(),
            ],
            mode="asgi",
        )
        logger.info(
            "SuperTokens initialised — core=%s app=%s",
            auth_settings.connection_uri,
            auth_settings.app_name,
        )
    except Exception as exc:
        logger.exception("Failed to initialise SuperTokens: %s", exc)
        raise


def setup_supertokens_middleware(app: FastAPI, enable: bool = True) -> None:
    """Attach SuperTokens middleware and error handler to a FastAPI app.

    Must be called *after* ``init_supertokens()`` and *before* adding routes.
    """
    if not enable:
        logger.debug("SuperTokens middleware disabled by configuration")
        return
    try:
        from supertokens_python.framework.fastapi import get_middleware

        app.add_middleware(get_middleware())  # type: ignore[no-untyped-call]
        logger.debug("SuperTokens middleware attached to FastAPI app")
    except Exception as exc:
        logger.warning("Could not attach SuperTokens middleware: %s", exc)

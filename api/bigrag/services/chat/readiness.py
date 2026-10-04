from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from bigrag.models.chat_readiness import ChatReadinessResponse
from bigrag.services.chat.turn.credentials import (
    ChatCredentialDecryptionError,
    ChatCredentialDestinationError,
    assert_credentials_allowed_for_base_url,
    resolve_stored_chat_credentials,
)
from bigrag.services.runtime_settings import get_values
from bigrag.services.url_security import UnsafeOutboundUrlError, normalize_url_root


async def get_chat_readiness(session: AsyncSession, user: dict) -> ChatReadinessResponse:
    runtime = await get_values(["chat_base_url"])
    try:
        credentials = await resolve_stored_chat_credentials(session, user)
    except ChatCredentialDecryptionError:
        return ChatReadinessResponse(credential_ready=False, reason="decryption_unavailable")
    if not credentials:
        return ChatReadinessResponse(credential_ready=False, reason="missing_credentials")
    try:
        raw_base_url = runtime["chat_base_url"]
        base_url = normalize_url_root(raw_base_url) if raw_base_url else None
    except (UnsafeOutboundUrlError, ValueError):
        return ChatReadinessResponse(credential_ready=False, reason="credential_blocked")
    try:
        assert_credentials_allowed_for_base_url(credentials, base_url, request_base_url=None)
    except ChatCredentialDestinationError:
        return ChatReadinessResponse(credential_ready=False, reason="credential_blocked")
    return ChatReadinessResponse(
        credential_ready=True,
        credential_source="saved" if credentials[0].source == "saved chat key" else "instance",
    )

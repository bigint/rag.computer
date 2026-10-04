from __future__ import annotations

import os
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from bigrag.db.models import UserPreference
from bigrag.exceptions import ServerError, ValidationError
from bigrag.models.chat import ChatCreateRequest
from bigrag.services import crypto
from bigrag.services.chat.types import ProviderCredential
from bigrag.services.preferences import decrypt_preferences
from bigrag.services.provider_key_binding import bound_chat_key_destination
from bigrag.services.url_security import (
    UnsafeOutboundUrlError,
    normalize_url_root,
    validate_chat_base_url,
)

_PROVIDERS = {"openai", "openai_compatible"}
_DEFAULT_OPENAI_CHAT_BASE_URL = "https://api.openai.com/v1"


class ChatCredentialDecryptionError(ServerError):
    pass


class ChatCredentialDestinationError(ValidationError):
    pass


def _resolve_provider(provider: str | None, default_provider: str | None = "openai") -> str:
    value = (provider or default_provider or "openai").strip().lower()
    if value not in _PROVIDERS:
        raise ValidationError("Only openai and openai_compatible chat providers are supported")
    return value


async def _resolve_api_credentials(
    session: AsyncSession,
    user: dict,
    body: ChatCreateRequest,
) -> list[ProviderCredential]:
    if body.provider_api_key and body.provider_api_key.strip():
        return [ProviderCredential(api_key=body.provider_api_key.strip(), source="request")]

    credentials = await resolve_stored_chat_credentials(session, user)
    if not credentials:
        raise ValidationError(
            "Save an OpenAI API key in Chat settings, or pass provider_api_key "
            "with the chat request."
        )
    return credentials


async def resolve_stored_chat_credentials(
    session: AsyncSession,
    user: dict,
) -> list[ProviderCredential]:
    credentials: list[ProviderCredential] = []
    data = await session.scalar(
        sa.select(UserPreference.data).where(UserPreference.user_id == UUID(user["id"]))
    )
    prefs = decrypt_preferences(dict(data)) if isinstance(data, dict) else {}
    chat = prefs.get("chat") if isinstance(prefs.get("chat"), dict) else {}
    _append_credential(
        credentials,
        chat.get("openai_key"),
        "saved chat key",
        base_url=bound_chat_key_destination(chat),
    )

    if not credentials:
        env_key = os.environ.get("BIGRAG_CHAT_API_KEY")
        _append_credential(credentials, env_key, "instance chat key")

    return credentials


def _append_credential(
    credentials: list[ProviderCredential],
    raw_api_key: object,
    source: str,
    *,
    base_url: str | None = None,
) -> None:
    if not isinstance(raw_api_key, str) or not raw_api_key.strip():
        return
    api_key = raw_api_key.strip()
    if api_key.startswith(crypto._FERNET_PREFIX):
        msg = f"{source} cannot be decrypted. Configure BIGRAG_MASTER_KEY."
        raise ChatCredentialDecryptionError(msg, public_message=msg)
    if any(existing.api_key == api_key for existing in credentials):
        return
    credentials.append(ProviderCredential(api_key=api_key, source=source, base_url=base_url))


async def _resolve_base_url(raw_base_url: str | None, default_base_url: str | None) -> str | None:
    candidate = raw_base_url if raw_base_url is not None else default_base_url
    if not candidate:
        return None
    try:
        return await validate_chat_base_url(candidate)
    except UnsafeOutboundUrlError as exc:
        raise ValidationError(str(exc)) from exc


def assert_credentials_allowed_for_base_url(
    credentials: list[ProviderCredential],
    base_url: str | None,
    *,
    request_base_url: str | None,
) -> None:
    for credential in credentials:
        if credential.source != "saved chat key":
            continue
        if not credential.base_url:
            raise ChatCredentialDestinationError(
                "Save the chat key again in Chat settings to bind it to the configured provider "
                "URL."
            )
        try:
            matches = normalize_url_root(credential.base_url) == normalize_url_root(
                base_url or _DEFAULT_OPENAI_CHAT_BASE_URL
            )
        except (UnsafeOutboundUrlError, ValueError):
            matches = False
        if not matches:
            raise ChatCredentialDestinationError(
                "The saved chat key belongs to a different provider URL. "
                "Save a key for the configured provider, or pass provider_api_key with the request."
            )
    has_instance_key = _has_instance_chat_key(credentials)
    if request_base_url is not None and has_instance_key:
        raise ChatCredentialDestinationError(
            "provider_base_url requires provider_api_key or a saved chat key; "
            "the instance chat key cannot be sent to a custom base URL."
        )
    if base_url is not None and not _is_default_openai_chat_base_url(base_url) and has_instance_key:
        raise ChatCredentialDestinationError(
            "The instance chat key cannot be sent to a non-default chat base URL; "
            "save a chat key in Chat settings or pass provider_api_key."
        )


def _has_instance_chat_key(credentials: list[ProviderCredential]) -> bool:
    return any(cred.source == "instance chat key" for cred in credentials)


def _is_default_openai_chat_base_url(base_url: str) -> bool:
    try:
        return normalize_url_root(base_url) == _DEFAULT_OPENAI_CHAT_BASE_URL
    except UnsafeOutboundUrlError:
        return False


async def _clear_saved_chat_key(session: AsyncSession, user: dict) -> None:
    user_id = UUID(user["id"])
    data = await session.scalar(
        sa.select(UserPreference.data).where(UserPreference.user_id == user_id)
    )
    if not isinstance(data, dict):
        return
    chat = data.get("chat")
    if not isinstance(chat, dict) or "openai_key" not in chat:
        return
    cleaned_chat = {**chat}
    cleaned_chat.pop("openai_key", None)
    cleaned_chat.pop("openai_key_base_url", None)
    cleaned_chat.pop("openai_key_base_url_signature", None)
    cleaned = {**data, "chat": cleaned_chat}
    await session.execute(
        sa.update(UserPreference)
        .where(UserPreference.user_id == user_id)
        .values(data=cleaned, updated_at=sa.func.now())
    )
    await session.commit()

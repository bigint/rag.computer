from __future__ import annotations

import hashlib
import hmac


def chat_key_binding_signature(api_key: str, base_url: str) -> str:
    payload = f"bigrag:chat-provider-url:v1:{base_url}".encode()
    return hmac.new(api_key.encode(), payload, hashlib.sha256).hexdigest()


def bound_chat_key_destination(chat: dict) -> str | None:
    api_key = chat.get("openai_key")
    base_url = chat.get("openai_key_base_url")
    signature = chat.get("openai_key_base_url_signature")
    if not all(isinstance(value, str) and value for value in (api_key, base_url, signature)):
        return None
    expected = chat_key_binding_signature(api_key, base_url)
    if not hmac.compare_digest(signature.encode(), expected.encode()):
        return None
    return base_url

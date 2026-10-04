from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class ChatReadinessResponse(BaseModel):
    credential_ready: bool
    credential_source: Literal["saved", "instance"] | None = None
    reason: (
        Literal["missing_credentials", "credential_blocked", "decryption_unavailable"] | None
    ) = None

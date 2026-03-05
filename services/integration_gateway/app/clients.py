import os
import httpx
from contextlib import asynccontextmanager

LEGACY_BASE = os.getenv("LEGACY_BASE", "http://legacy_api:8000")
AI_BASE = os.getenv("AI_BASE", "http://ai_service:8000")

# Enterprise-friendly timeouts (seconds)
TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)

@asynccontextmanager
async def legacy_client():
    async with httpx.AsyncClient(base_url=LEGACY_BASE, timeout=TIMEOUT) as client:
        yield client

@asynccontextmanager
async def ai_client():
    async with httpx.AsyncClient(base_url=AI_BASE, timeout=TIMEOUT) as client:
        yield client
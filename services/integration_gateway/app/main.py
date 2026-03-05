import httpx
import os
import asyncio
import time
import json
from dataclasses import dataclass

from fastapi import FastAPI, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from prometheus_fastapi_instrumentator import Instrumentator

from .rate_limit import limiter, Limit, limit_for_role
from .schemas import LoginIn, TokenOut, TicketCreate
from .auth import create_access_token, validate_login, require_user
from .clients import legacy_client, ai_client
from .db import engine, Base, get_db
from .audit import write_audit
from .models import AuditLog
from .request_id import RequestIdMiddleware



@dataclass
class SimState:
    ai_fail: bool = False
    legacy_delay_ms: int = 0


STATE = SimState()


app = FastAPI(title="Integration Gateway (Enterprise)")
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
app.add_middleware(RequestIdMiddleware)


def make_trace_details(
    request: Request,
    user: str,
    method: str,
    path: str,
    status_code: int,
    latency_ms: float | None = None,
    note: str | None = None,
    ai: dict | None = None,
    downstream: dict | None = None,
) -> str:
    payload = {
        "request_id": getattr(request.state, "request_id", None),
        "user": user,
        "method": method,
        "path": path,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "note": note,
        "ai": ai,
        "downstream": downstream,
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    return json.dumps(payload, ensure_ascii=False)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready(db: AsyncSession = Depends(get_db)):
    await db.execute(text("SELECT 1"))
    return {"status": "ready", "db": "ok"}


@app.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn):
    user = validate_login(payload.username, payload.password)
    token = create_access_token(user.username, user.role)
    return {"access_token": token, "token_type": "bearer"}


@app.post("/api/v1/tickets")
async def create_ticket(
    payload: TicketCreate,
    request: Request,
    user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    max_req, window = limit_for_role(user.role)
    limiter.check(f"{user.username}:/api/v1/tickets", Limit(max_req, window))

    # ✅ simulation: add extra downstream latency (legacy)
    if STATE.legacy_delay_ms > 0:
        await asyncio.sleep(STATE.legacy_delay_ms / 1000)

    # Call legacy with proper error handling
    try:
        async with legacy_client() as client:
            resp = await client.post("/tickets", json=payload.model_dump())
    except httpx.TimeoutException:
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/tickets",
            status_code=504,
            request_id=request.state.request_id,
            details="gateway->legacy timeout",
        )
        raise HTTPException(status_code=504, detail="Legacy API timeout")
    except httpx.RequestError:
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/tickets",
            status_code=502,
            request_id=request.state.request_id,
            details="gateway->legacy unavailable",
        )
        raise HTTPException(status_code=502, detail="Legacy API unavailable")

    # Audit success/failure response from legacy
    await write_audit(
        db=db,
        user=user.username,
        method="POST",
        path="/api/v1/tickets",
        status_code=resp.status_code,
        request_id=request.state.request_id,
        details="gateway->legacy create_ticket",
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()

@app.post("/api/v1/ai/analyze")
async def analyze(
    payload: TicketCreate,
    request: Request,
    user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    max_req, window = limit_for_role(user.role)
    limiter.check(f"{user.username}:/api/v1/ai/analyze", Limit(max_req, window))

    t0 = time.perf_counter()

    # ✅ define mode early (needed for sim + auditing)
    mode = request.query_params.get("mode", "ml").lower()
    allowed_modes = {"baseline", "ml"}
    if mode not in allowed_modes:
        raise HTTPException(status_code=400, detail=f"Invalid mode '{mode}'. Use baseline|ml")

    # ✅ simulation: force AI failure without touching ai_service container
    if STATE.ai_fail:
        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/ai/analyze",
            status_code=503,
            request_id=request.state.request_id,
            details=make_trace_details(
                request=request,
                user=user.username,
                method="POST",
                path="/api/v1/ai/analyze",
                status_code=503,
                latency_ms=total_ms,
                note="SIMULATION: ai_fail=ON (gateway short-circuit)",
                downstream={"ai_call_ms": None, "mode": mode},
            ),
        )
        raise HTTPException(status_code=503, detail="AI service simulated failure (ai_fail=ON)")

    # Call AI service with proper error handling
    try:
        async with ai_client() as client:
            ai_t0 = time.perf_counter()
            resp = await client.post(
                "/analyze",
                json={"title": payload.title, "description": payload.description, "mode": mode},
            )
            ai_ms = round((time.perf_counter() - ai_t0) * 1000, 2)

    except httpx.TimeoutException:
        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/ai/analyze",
            status_code=504,
            request_id=request.state.request_id,
            details=make_trace_details(
                request=request,
                user=user.username,
                method="POST",
                path="/api/v1/ai/analyze",
                status_code=504,
                latency_ms=total_ms,
                note="gateway->ai timeout",
                downstream={"ai_call_ms": None, "mode": mode},
            ),
        )
        raise HTTPException(status_code=504, detail="AI service timeout")

    except httpx.RequestError:
        total_ms = round((time.perf_counter() - t0) * 1000, 2)
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/ai/analyze",
            status_code=502,
            request_id=request.state.request_id,
            details=make_trace_details(
                request=request,
                user=user.username,
                method="POST",
                path="/api/v1/ai/analyze",
                status_code=502,
                latency_ms=total_ms,
                note="gateway->ai unavailable",
                downstream={"ai_call_ms": None, "mode": mode},
            ),
        )
        raise HTTPException(status_code=502, detail="AI service unavailable")

    total_ms = round((time.perf_counter() - t0) * 1000, 2)

    # If AI service returned error
    if resp.status_code >= 400:
        await write_audit(
            db=db,
            user=user.username,
            method="POST",
            path="/api/v1/ai/analyze",
            status_code=resp.status_code,
            request_id=request.state.request_id,
            details=make_trace_details(
                request=request,
                user=user.username,
                method="POST",
                path="/api/v1/ai/analyze",
                status_code=resp.status_code,
                latency_ms=total_ms,
                note="gateway->ai analyze error",
                downstream={"ai_call_ms": ai_ms, "mode": mode},
            ),
        )
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    out = resp.json()

    # ✅ Audit success with AI payload
    await write_audit(
        db=db,
        user=user.username,
        method="POST",
        path="/api/v1/ai/analyze",
        status_code=resp.status_code,
        request_id=request.state.request_id,
        details=make_trace_details(
            request=request,
            user=user.username,
            method="POST",
            path="/api/v1/ai/analyze",
            status_code=resp.status_code,
            latency_ms=total_ms,
            note="gateway->ai analyze",
            ai={
                "mode": mode,
                "category": out.get("category"),
                "priority": out.get("priority"),
                "model": out.get("model"),
                "confidence": out.get("confidence"),
            },
            downstream={"ai_call_ms": ai_ms, "mode": mode},
        ),
    )

    return out


@app.get("/admin/audit")
async def list_audit(
    user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    max_req, window = limit_for_role(user.role)
    limiter.check(f"{user.username}:/admin/audit", Limit(max_req, window))

    res = await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(200))
    rows = res.scalars().all()

    return [
        {
            "id": r.id,
            "timestamp": r.timestamp.isoformat(),
            "user": r.user,
            "method": r.method,
            "path": r.path,
            "status_code": r.status_code,
            "request_id": r.request_id,
            "details": r.details,
        }
        for r in rows
    ]


@app.post("/api/v1/tickets/legacy")
async def create_ticket_from_legacy_shape(
    payload: dict,
    request: Request,
    user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    max_req, window = limit_for_role(user.role)
    limiter.check(f"{user.username}:/api/v1/tickets/legacy", Limit(max_req, window))

    # ✅ simulation: add extra downstream latency (legacy)
    if STATE.legacy_delay_ms > 0:
        await asyncio.sleep(STATE.legacy_delay_ms / 1000)

    try:
        async with legacy_client() as client:
            resp = await client.post("/legacy/v1/tickets", json=payload)
    except httpx.TimeoutException:
        await write_audit(
            db,
            user.username,
            "POST",
            "/api/v1/tickets/legacy",
            504,
            request.state.request_id,
            "gateway->legacy legacy_v1 timeout",
        )
        raise HTTPException(status_code=504, detail="Legacy API timeout")
    except httpx.RequestError:
        await write_audit(
            db,
            user.username,
            "POST",
            "/api/v1/tickets/legacy",
            502,
            request.state.request_id,
            "gateway->legacy legacy_v1 unavailable",
        )
        raise HTTPException(status_code=502, detail="Legacy API unavailable")

    await write_audit(
        db,
        user.username,
        "POST",
        "/api/v1/tickets/legacy",
        resp.status_code,
        request.state.request_id,
        "gateway->legacy legacy_v1 create_ticket",
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


@app.get("/health/legacy")
async def legacy_health():
    async with legacy_client() as client:
        resp = await client.get("/health")
        return resp.json()


@app.get("/health/ai")
async def ai_health():
    async with ai_client() as client:
        resp = await client.get("/health")
        return resp.json()


@app.post("/api/v1/ai/compare")
async def compare_ai(
    payload: TicketCreate,
    request: Request,
    user=Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    max_req, window = limit_for_role(user.role)
    limiter.check(f"{user.username}:/api/v1/ai/compare", Limit(max_req, window))

    try:
        async with ai_client() as client:
            resp = await client.post(
                "/compare",
                json={"title": payload.title, "description": payload.description},
            )
    except httpx.TimeoutException:
        await write_audit(
            db,
            user.username,
            "POST",
            "/api/v1/ai/compare",
            504,
            request.state.request_id,
            "gateway->ai compare timeout",
        )
        raise HTTPException(status_code=504, detail="AI service timeout")
    except httpx.RequestError:
        await write_audit(
            db,
            user.username,
            "POST",
            "/api/v1/ai/compare",
            502,
            request.state.request_id,
            "gateway->ai compare unavailable",
        )
        raise HTTPException(status_code=502, detail="AI service unavailable")

    await write_audit(
        db,
        user.username,
        "POST",
        "/api/v1/ai/compare",
        resp.status_code,
        request.state.request_id,
        "gateway->ai compare",
    )

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()


# ==================================
# ✅ Admin Simulation Endpoints
# ==================================
@app.get("/admin/sim/state")
async def sim_state(user=Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"ai_fail": STATE.ai_fail, "legacy_delay_ms": STATE.legacy_delay_ms}


@app.post("/admin/sim/ai_fail")
async def sim_ai_fail(on: int = 0, user=Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    STATE.ai_fail = bool(int(on))
    return {"ok": True, "ai_fail": STATE.ai_fail}


@app.post("/admin/sim/legacy_delay")
async def sim_legacy_delay(ms: int = 0, user=Depends(require_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    ms = max(0, min(int(ms), 15000))  # clamp 0..15000ms
    STATE.legacy_delay_ms = ms
    return {"ok": True, "legacy_delay_ms": STATE.legacy_delay_ms}
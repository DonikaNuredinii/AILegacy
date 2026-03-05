import os, asyncio
LEGACY_DELAY_MS = int(os.getenv("LEGACY_DELAY_MS", "0"))
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .db import engine, Base, get_db
from .models import Ticket
from .schemas import TicketCreate, TicketOut, LegacyTicketCreate

app = FastAPI(title="Legacy System API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.post("/tickets", response_model=TicketOut)
async def create_ticket(payload: TicketCreate, db: AsyncSession = Depends(get_db)):
    t = Ticket(**payload.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t

@app.get("/tickets", response_model=list[TicketOut])
async def list_tickets(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Ticket).order_by(Ticket.id.desc()))
    return list(res.scalars().all())

DEPT_MAP = {"IT": "it", "HR": "hr", "FIN": "finance", "GEN": "general"}

@app.post("/legacy/v1/tickets", response_model=TicketOut)
async def create_ticket_legacy_v1(payload: LegacyTicketCreate, db: AsyncSession = Depends(get_db)):
    t = Ticket(
        title=payload.ticket_title,
        description=payload.ticket_desc,
        department=DEPT_MAP.get(payload.dept_code.upper(), "general"),
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t

@app.middleware("http")
async def legacy_delay_mw(request, call_next):
    if LEGACY_DELAY_MS > 0:
        await asyncio.sleep(LEGACY_DELAY_MS / 1000)
    return await call_next(request)

@app.get("/health")
def health():
    return {"status": "ok", "service": "legacy_api"}
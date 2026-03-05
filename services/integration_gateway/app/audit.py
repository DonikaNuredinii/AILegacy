from sqlalchemy.ext.asyncio import AsyncSession
from .models import AuditLog

async def write_audit(
    db: AsyncSession,
    user: str,
    method: str,
    path: str,
    status_code: int,
    request_id: str,
    details: str | None = None,
):
    row = AuditLog(
        user=user,
        method=method,
        path=path,
        status_code=status_code,
        request_id=request_id,
        details=details,
    )
    db.add(row)
    await db.commit()

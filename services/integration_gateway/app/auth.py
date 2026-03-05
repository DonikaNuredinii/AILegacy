import jwt
import os
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")

ACCESS_TOKEN_MINUTES = 60

USERS = {
    "admin": {"password": "admin123", "role": "admin"},
    "user": {"password": "user123", "role": "user"},
}

class UserCtx(BaseModel):
    username: str
    role: str

bearer_scheme = HTTPBearer()

def create_access_token(username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=ACCESS_TOKEN_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def require_user(creds: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> UserCtx:
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "sub"]})
        return UserCtx(username=payload["sub"], role=payload.get("role", "user"))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def validate_login(username: str, password: str) -> UserCtx:
    u = USERS.get(username)
    if not u or u["password"] != password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return UserCtx(username=username, role=u["role"])

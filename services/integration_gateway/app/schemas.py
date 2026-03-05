from pydantic import BaseModel, Field

class LoginIn(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=3, max_length=100)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TicketCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    department: str = Field(default="general", max_length=50)

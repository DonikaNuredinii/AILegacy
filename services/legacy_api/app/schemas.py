from pydantic import BaseModel, Field

class TicketCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    department: str = Field(default="general", max_length=50)

class TicketOut(BaseModel):
    id: int
    title: str
    description: str
    department: str
    status: str

    model_config = {"from_attributes": True}

class LegacyTicketCreate(BaseModel):
    ticket_title: str = Field(min_length=3, max_length=200)
    ticket_desc: str = Field(min_length=3)
    dept_code: str = Field(default="GEN", max_length=10)
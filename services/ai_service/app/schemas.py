from typing import Optional, Dict, Literal
from pydantic import BaseModel, Field


class AnalyzeIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3)
    mode: Optional[Literal["baseline", "ml", "compare"]] = Field(default=None)


class AnalyzeOut(BaseModel):
    category: str
    priority: str
    recommendation: str
    summary: str
    model: str
    confidence: Optional[float] = None


class CompareOut(BaseModel):
    lr: Dict
    nb: Dict
    winner: str
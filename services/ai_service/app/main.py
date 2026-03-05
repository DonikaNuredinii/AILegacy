import os
from fastapi import FastAPI, HTTPException, Request

from .schemas import AnalyzeIn, AnalyzeOut, CompareOut

# baseline keyword engine
from .engine import analyze as analyze_baseline

# ML engine
from .ml_engine import analyze as analyze_ml, ENGINE, compare_models

AI_FAIL = os.getenv("AI_FAIL", "0") == "1"
AI_MODE = os.getenv("AI_MODE", "baseline").lower()  # baseline | ml


app = FastAPI(title="AI Service (Enterprise Assistant)")


@app.on_event("startup")
async def startup():
    # Train once if service is configured to prefer ML by default.
    # Even if AI_MODE is baseline, ML engine can still train lazily when requested.
    if AI_MODE in ("ml", "compare"):
        ENGINE.train()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "ai_service",
        "fail_mode": AI_FAIL,
        "mode": AI_MODE,
        "ml_ready": ENGINE.is_ready,
    }


@app.post("/analyze", response_model=AnalyzeOut)
def analyze_ticket(payload: AnalyzeIn, request: Request):
    if AI_FAIL:
        raise HTTPException(status_code=503, detail="AI module temporarily unavailable (simulated)")

    # ✅ Decide mode per request:
    # Priority:
    #  1) query param ?mode=...
    #  2) payload.mode (sent from gateway)
    #  3) AI_MODE env default
    mode = (request.query_params.get("mode") or payload.mode or AI_MODE or "baseline").lower()

    if mode not in ("baseline", "ml", "compare"):
        raise HTTPException(status_code=400, detail="Invalid mode. Use baseline|ml|compare")

    # Optional: keep /compare endpoint as the "academic" comparison
    if mode == "compare":
        raise HTTPException(status_code=400, detail="Use POST /compare for mode=compare")

    if mode == "ml":
        r = analyze_ml(payload.title, payload.description)
        return {
            "category": r.category,
            "priority": r.priority,
            "recommendation": r.recommendation,
            "summary": r.summary,
            "model": r.model,
            "confidence": r.confidence,
        }

    # baseline mode
    r = analyze_baseline(payload.title, payload.description)
    return {
        "category": r.category,
        "priority": r.priority,
        "recommendation": r.recommendation,
        "summary": r.summary,
        "model": "keyword-baseline",
        "confidence": None,
    }


@app.post("/compare", response_model=CompareOut)
def compare(payload: AnalyzeIn):
    """
    Academic endpoint: compare LR vs NB on the same input.
    Works regardless of AI_MODE, but requires ML training.
    """
    if AI_FAIL:
        raise HTTPException(status_code=503, detail="AI module temporarily unavailable (simulated)")

    if not ENGINE.is_ready:
        ENGINE.train()

    return compare_models(payload.title, payload.description)
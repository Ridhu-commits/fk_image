from contextlib import asynccontextmanager
from datetime import datetime
import joblib
import pickle
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db, PredictionLog

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = PROJECT_ROOT / "models" / "best_joint_model.keras"
SCALER_PATH = PROJECT_ROOT / "models" / "propagation_scaler.pkl"
TOKENIZER_PATH = PROJECT_ROOT / "models" / "text_tokenizer.pkl"
DEMO_HTML_PATH = Path(__file__).resolve().parent / "demo.html"

PROPAGATION_TIMESTEPS = 5
TEXT_MAX_LENGTH = 60


class PropagationData(BaseModel):
    # Core propagation features matched to trained scaler
    verified: float = Field(default=0.0, ge=0.0)
    reply_count: float = Field(default=0.0, ge=0.0)
    retweet_count: float = Field(default=0.0, ge=0.0)
    like_count: float = Field(default=0.0, ge=0.0)

    # Optional / metadata context
    follower_count: float | None = Field(default=None, ge=0.0)
    account_age: float | None = Field(default=None, ge=0.0)
    timestamp: datetime | str | None = None


class PredictionRequest(BaseModel):
    tweet_id: str
    propagation_data: PropagationData
    tweet_text: str | None = ""
    comments: list[str] = Field(default_factory=list)


class PredictionResponse(BaseModel):
    tweet_id: str
    verdict: str
    confidence: float
    fake_probability: float
    real_probability: float
    details: dict[str, Any] = Field(default_factory=dict)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from tensorflow.keras.models import load_model

    # Load Model
    app.state.model = load_model(MODEL_PATH)

    # Load Scaler using Joblib
    app.state.scaler = joblib.load(SCALER_PATH)

    # Load Tokenizer
    try:
        app.state.tokenizer = joblib.load(TOKENIZER_PATH)
    except Exception:
        with TOKENIZER_PATH.open("rb") as tokenizer_file:
            app.state.tokenizer = pickle.load(tokenizer_file)

    yield


app = FastAPI(title="Fake Image Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_class=HTMLResponse)
def root():
    if DEMO_HTML_PATH.exists():
        return HTMLResponse(content=DEMO_HTML_PATH.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Fake Image Detection API</h1><p>Running on FastAPI</p>")


@app.get("/demo", response_class=HTMLResponse)
def demo_page():
    if DEMO_HTML_PATH.exists():
        return HTMLResponse(content=DEMO_HTML_PATH.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Fake Image Detection API</h1><p>Demo file missing</p>")


@app.get("/api")
def api_meta():
    return {
        "message": "Fake Image Detection API is running",
        "model": "Joint Propagation & Sentiment Multi-Input Bi-LSTM",
        "version": "2.0.0",
        "test_accuracy": "90.91%"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "api": "online",
        "model_loaded": True
    }


def get_model(request: Request) -> Any:
    if hasattr(request.app.state, "model") and request.app.state.model is not None:
        return request.app.state.model
    from tensorflow.keras.models import load_model
    request.app.state.model = load_model(MODEL_PATH)
    return request.app.state.model


def get_scaler(request: Request) -> Any:
    if hasattr(request.app.state, "scaler") and request.app.state.scaler is not None:
        return request.app.state.scaler
    request.app.state.scaler = joblib.load(SCALER_PATH)
    return request.app.state.scaler


def get_tokenizer(request: Request) -> Any:
    if hasattr(request.app.state, "tokenizer") and request.app.state.tokenizer is not None:
        return request.app.state.tokenizer
    try:
        request.app.state.tokenizer = joblib.load(TOKENIZER_PATH)
    except Exception:
        with TOKENIZER_PATH.open("rb") as tokenizer_file:
            request.app.state.tokenizer = pickle.load(tokenizer_file)
    return request.app.state.tokenizer


@app.post("/predict", response_model=PredictionResponse)
def predict(
    payload: PredictionRequest, 
    request: Request, 
    db: Session = Depends(get_db)
) -> PredictionResponse:
    model: Any = get_model(request)
    scaler: Any = get_scaler(request)
    tokenizer: Any = get_tokenizer(request)

    # 1. Feature Alignment for Scaler
    # Scaler was trained on: [verified, reply_count, retweet_count, like_count]
    verified_val = float(payload.propagation_data.verified)
    reply_val = float(payload.propagation_data.reply_count)
    retweet_val = float(payload.propagation_data.retweet_count)
    like_val = float(payload.propagation_data.like_count)

    raw_features = np.asarray(
        [[
            verified_val,
            reply_val,
            retweet_val,
            like_val,
        ]],
        dtype=np.float32,
    )

    scaled_features = scaler.transform(raw_features)
    prop_tensor = np.repeat(
        scaled_features[:, np.newaxis, :],
        PROPAGATION_TIMESTEPS,
        axis=1,
    ).astype(np.float32)

    # 2. Tokenizer Processing with Comment/Tweet Text Fallback
    # In training (03_prepare_text.py), if comments are absent, fall back to tweet_text
    from tensorflow.keras.preprocessing.sequence import pad_sequences

    valid_comments = [c.strip() for c in (payload.comments or []) if c and c.strip()]
    if valid_comments:
        combined_text = " ".join(valid_comments)
        text_source = "comments"
    elif payload.tweet_text and payload.tweet_text.strip():
        combined_text = payload.tweet_text.strip()
        text_source = "tweet_text"
    else:
        combined_text = ""
        text_source = "none"

    text_sequences = tokenizer.texts_to_sequences([combined_text])
    text_tensor = pad_sequences(
        text_sequences,
        maxlen=TEXT_MAX_LENGTH,
        padding="post",
        truncating="post",
    )

    # 3. Model Prediction
    try:
        prediction = model.predict([prop_tensor, text_tensor], verbose=0)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="The model could not process this prediction.",
        ) from exc

    fake_prob = float(np.asarray(prediction).reshape(-1)[0])
    is_fake = fake_prob >= 0.5
    verdict_str = "Fake" if is_fake else "Real"
    conf_val = fake_prob if is_fake else 1.0 - fake_prob
    confidence_score = round(conf_val * 100, 2)

    # Save Prediction to SQLite Database
    try:
        log_entry = PredictionLog(
            tweet_id=payload.tweet_id,
            verdict=verdict_str,
            confidence=confidence_score,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Warning: Failed to log prediction: {e}")

    details = {
        "signals": {
            "verified": bool(verified_val >= 0.5),
            "reply_count": int(reply_val),
            "retweet_count": int(retweet_val),
            "like_count": int(like_val),
        },
        "text_source": text_source,
        "comments_analyzed": len(valid_comments),
        "text_snippet": (combined_text[:120] + "...") if len(combined_text) > 120 else combined_text,
    }

    return PredictionResponse(
        tweet_id=payload.tweet_id,
        verdict=verdict_str,
        confidence=confidence_score,
        fake_probability=round(fake_prob, 4),
        real_probability=round(1.0 - fake_prob, 4),
        details=details,
    )


@app.get("/analytics")
def get_analytics(db: Session = Depends(get_db)):
    total_requests = db.query(PredictionLog).count()
    fake_count = db.query(PredictionLog).filter(PredictionLog.verdict == "Fake").count()
    real_count = db.query(PredictionLog).filter(PredictionLog.verdict == "Real").count()

    fake_percentage = round((fake_count / total_requests * 100), 2) if total_requests > 0 else 0.0

    return {
        "total_requests": total_requests,
        "fake_requests": fake_count,
        "real_requests": real_count,
        "total_analyzed": total_requests,
        "fake_detected": fake_count,
        "real_detected": real_count,
        "fake_ratio_percent": fake_percentage,
        "status": "Operational"
    }
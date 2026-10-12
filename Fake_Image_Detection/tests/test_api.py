from contextlib import asynccontextmanager

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.app import app
from src.database import Base, get_db


class FakeScaler:
    def transform(self, features):
        return np.zeros_like(features, dtype=np.float32)


class FakeTokenizer:
    def texts_to_sequences(self, texts):
        return [[1, 2] for _ in texts]


class FakeModel:
    def predict(self, inputs, verbose=0):
        return np.asarray([[0.73]], dtype=np.float32)


@pytest.fixture
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "test_predictions.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    @asynccontextmanager
    async def test_lifespan(_app):
        yield

    app.dependency_overrides[get_db] = override_get_db
    app.state.model = FakeModel()
    app.state.scaler = FakeScaler()
    app.state.tokenizer = FakeTokenizer()
    monkeypatch.setattr(app.router, "lifespan_context", test_lifespan)

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_root_and_health_endpoints(client):
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert "text/html" in res_root.headers.get("content-type", "")

    res_api = client.get("/api")
    assert res_api.status_code == 200
    assert "Joint" in res_api.json()["model"]

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"


def test_analytics_endpoint(client):
    response = client.get("/analytics")
    assert response.status_code == 200
    assert "total_analyzed" in response.json()


def test_predict_endpoint(client):
    payload = {
        "tweet_id": "test-tweet-aligned",
        "propagation_data": {
            "verified": 1.0,
            "reply_count": 25.0,
            "retweet_count": 80.0,
            "like_count": 450.0,
            "follower_count": 1200,
            "account_age": 730,
        },
        "tweet_text": "Breaking investigative report reveals verified findings.",
        "comments": ["This is a sample comment."],
    }

    response = client.post("/predict", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["verdict"] in {"Fake", "Real"}
    assert isinstance(result["confidence"], (int, float))
    assert 0 <= result["confidence"] <= 100
    assert "details" in result
    assert result["details"]["text_source"] == "comments"


def test_predict_endpoint_text_fallback_without_comments(client):
    payload = {
        "tweet_id": "test-tweet-fallback",
        "propagation_data": {
            "verified": 0.0,
            "reply_count": 2.0,
            "retweet_count": 5.0,
            "like_count": 12.0
        },
        "tweet_text": "Sensational shocking claims without proof!",
        "comments": []
    }

    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["verdict"] in {"Fake", "Real"}
    assert result["details"]["text_source"] == "tweet_text"
    assert result["details"]["comments_analyzed"] == 0
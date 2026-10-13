# Fake Image & Post Detection on Social Media
### Joint Multi-Input Bi-LSTM Neural Platform & Chrome Extension (Manifest V3)

[![FastAPI](https://img.shields.io/badge/FastAPI-0.143.0-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.21-FF6F00.svg?logo=tensorflow)](https://tensorflow.org)
[![Accuracy](https://img.shields.io/badge/Test%20Accuracy-90.91%25-brightgreen.svg)]()
[![Fake%20Recall](https://img.shields.io/badge/Fake%20Recall-94.74%25-blue.svg)]()
[![Chrome%20Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blueviolet.svg?logo=googlechrome)]()

## 📌 Overview

Many images and posts shared on social media are manipulated, misleading users and spreading rapidly. Traditional approaches rely solely on image pixels or shallow tree classifiers, ignoring temporal propagation patterns and public sentiment reactions.

This project implements a state-of-the-art **Joint Multi-Input Bi-LSTM Neural Engine** that analyzes social media content credibility by jointly evaluating:
1. **Propagation Dynamics Branch**: Sequence of user verification status, reply velocity, retweet counts, and like engagement over time.
2. **Sentiment & Text Branch**: Tokenized comment reactions and tweet text via an Embedding layer and Bidirectional LSTM.
3. **Deployment as a Browser Extension**: Replaces standalone desktop GUI workflows with a real-time Chrome Extension (Manifest V3) and interactive in-page verification badges directly injected on X / Twitter posts.

---

## 🏗️ Architecture

```
                                  [ Post Data / Tweet ]
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
       [ Propagation Sequence ]                              [ Text / Comments ]
         Shape: (5, 4 features)                                Shape: (60 tokens)
                   │                                                   │
                   ▼                                                   ▼
         LSTM (32 Units, Drop=0.08)                           Embedding (8000, 64)
                   │                                                   │
                   │                                                   ▼
                   │                                     Bidirectional LSTM (32 Units)
                   │                                                   │
                   └─────────────────────────┬─────────────────────────┘
                                             ▼
                               Feature Fusion (Concatenate)
                                             │
                                             ▼
                                    BatchNormalization
                                             │
                                             ▼
                               Dense(64, ReLU) + Dropout(0.15)
                                             │
                                             ▼
                               Dense(32, ReLU) + Dropout(0.10)
                                             │
                                             ▼
                                  Dense(1, Sigmoid Output)
                                             │
                                    ┌────────┴────────┐
                                    ▼                 ▼
                                  [ Real ]         [ Fake ]
```

---

## 📊 Model Performance Evaluation

Evaluated on the held-out PolitiFact social propagation test split ($N = 154$):

| Metric | Reference Baseline | Enhanced Joint Bi-LSTM | Improvement |
| :--- | :---: | :---: | :---: |
| **Accuracy** | 89.61% | **90.91%** | **+1.30%** |
| **Fake Detection Recall** | 85.53% | **94.74%** | **+9.21%** (Only 4 missed out of 76) |
| **F1 Score** | 89.04% | **91.14%** | **+2.10%** |
| **Precision** | 92.86% | **87.80%** | Balanced trade-off |
| **Correct Predictions** | 138 / 154 | **140 / 154** | **+2 Samples** |

### Confusion Matrix
```
              Predicted
              Real   Fake
Actual Real     68     10
Actual Fake      4     72
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites & Installation

```bash
git clone https://github.com/Ridhu-commits/fk_image.git
cd fk_image

pip install -r requirements.txt
```

### 2. Start the Backend API & Interactive Dashboard

```bash
uvicorn src.app:app --host 127.0.0.1 --port 8000
```
- **Web Demo Playground**: Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) or [http://127.0.0.1:8000/demo](http://127.0.0.1:8000/demo) in any browser.
- **API Documentation**: Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) for Swagger UI.
- **Health Check**: `GET http://127.0.0.1:8000/health`
- **Inference Endpoint**: `POST http://127.0.0.1:8000/predict`
- **Analytics Endpoint**: `GET http://127.0.0.1:8000/analytics`
- **Accounts**: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`

> 🔐 **Login required:** `/predict` and `/analytics` need a logged-in user (`Authorization: Bearer <token>`).
> Sign up from the extension popup or the web demo; sessions last 7 days. Passwords are stored as salted PBKDF2-SHA256 hashes in `predictions.db`.

### 3. Load the Chrome Browser Extension (Manifest V3)

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory from this repository.
5. Open [x.com](https://x.com) or [twitter.com](https://twitter.com). A **Fake Image Detector** side panel appears on the right — **sign up / log in right there** (you stay logged in for 7 days).
6. Scroll as usual:
   - Every post gets a **Real / Fake** verdict badge automatically as it scrolls into view (click a badge for details).
   - Photos and videos get a **REAL / FAKE** label with a green / red outline.
   - The side panel counts what was checked and lists recent posts (click one to jump to it); collapse it with the arrow.
   - On a post's own page, the replies underneath are used as the sentiment signal; on the feed, each post's own text is used.
   - Or open the **Chrome Extension Popup** to analyze the open post.

---

## 🧪 Pipeline Scripts

Run every script from the repository root (paths are relative to it), e.g. `python src/pipeline/02_prepare_propagation.py`.

| Script | Purpose |
| :--- | :--- |
| `src/pipeline/01_inspect_data.py` | Exploratory data analysis, shape verification, and label distribution checks. |
| `src/pipeline/02_prepare_propagation.py` | Transforms propagation events into fixed length ($L=5$) sequences with `StandardScaler`. |
| `src/pipeline/03_prepare_text.py` | Combines comments with tweet text fallback and fits the 8,000 vocabulary Tokenizer. |
| `src/pipeline/04_build_joint_model.py` | Constructs the dual-branch Keras Functional model with Bi-LSTM and Batch Normalization. |
| `src/pipeline/05_train_joint_model.py` | Trains both branches end-to-end with `ReduceLROnPlateau` and `EarlyStopping`. |
| `src/pipeline/06_evaluate_joint_model.py` | Evaluates classification metrics, confusion matrix, and generates classification report. |
| `src/scraper.py` | Live Twitter / X scraping and liveness verification engine. |
| `tests/test_api.py` | Automated API test suite (`pytest`). |

---

## 📁 Repository Structure

```
.
├── src/                                         # Python backend
│   ├── app.py                                   # FastAPI server (serves web/ and the API)
│   ├── auth.py                                  # Sign up / login / logout & token checks
│   ├── database.py                              # SQLite ORM: users, sessions, prediction log
│   ├── scraper.py                               # Live Twitter scraper
│   └── pipeline/                                # Training pipeline (run in order)
│       ├── 01_inspect_data.py
│       ├── 02_prepare_propagation.py
│       ├── 03_prepare_text.py
│       ├── 04_build_joint_model.py
│       ├── 05_train_joint_model.py
│       └── 06_evaluate_joint_model.py
├── web/
│   └── index.html                               # Web dashboard served at / and /demo
├── extension/                                   # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js                            # Service worker, API calls & cache
│   ├── content.js                               # Scrapes posts, auto-checks on scroll, labels images
│   ├── panel.js                                 # In-page side panel: login + live results
│   ├── popup.html / popup.js                    # Toolbar popup
│   └── icons/
├── models/                                      # Trained artifacts used by the API
│   ├── best_joint_model.keras                   # Best checkpoint (90.91% Acc)
│   ├── joint_model.keras                        # Final epoch model
│   ├── propagation_scaler.pkl                   # StandardScaler for propagation features
│   └── text_tokenizer.pkl                       # Tokenizer (8,000 vocab)
├── data/raw/                                    # Source datasets (tweets, comments, sentiment)
├── outputs/                                     # Preprocessed tensors & train/val/test splits
├── tests/
│   └── test_api.py
├── Dockerfile
├── pytest.ini
└── requirements.txt
```

`predictions.db` (the SQLite prediction log) is created automatically in the working directory on first run and is git-ignored.

---

## 🧪 Running Tests

```bash
pytest
```

The tests stub out the model, so they run without TensorFlow weights being loaded.

---

## 📄 License
MIT License.

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
git clone https://github.com/Ridhu-commits/Fake_Image_Detection.git
cd Fake_Image_Detection

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

### 3. Load the Chrome Browser Extension (Manifest V3)

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable the **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` directory from this repository.
5. Visit any post on [x.com](https://x.com) or [twitter.com](https://twitter.com):
   - Click the injected **"🛡️ Verify Post"** badge directly on the tweet.
   - Or open the **Chrome Extension Popup** to inspect multimodal credibility signals in real time!

---

## 🧪 Pipeline Scripts

| Script | Purpose |
| :--- | :--- |
| `src/01_inspect_data.py` | Exploratory data analysis, shape verification, and label distribution checks. |
| `src/02_prepare_propagation.py` | Transforms propagation events into fixed length ($L=5$) sequences with `StandardScaler`. |
| `src/03_prepare_text.py` | Combines comments with tweet text fallback and fits the 8,000 vocabulary Tokenizer. |
| `src/04_build_joint_model.py` | Constructs the dual-branch Keras Functional model with Bi-LSTM and Batch Normalization. |
| `src/05_train_joint_model.py` | Trains both branches end-to-end with `ReduceLROnPlateau` and `EarlyStopping`. |
| `src/06_evaluate_joint_model.py` | Evaluates classification metrics, confusion matrix, and generates classification report. |
| `src/scraper.py` | Live Twitter / X scraping and liveness verification engine. |
| `tests/test_api.py` | Automated unit and integration test suite (`pytest`). |

---

## 📁 Repository Structure

```
Fake_Image_Detection/
├── data/
│   └── raw/
│       ├── tweet_fields.csv                     # 2,459 live tweets across 769 news articles
│       ├── tweet_comments__final.csv            # 422 user comments across 165 articles
│       └── tweet_comments_sentiment__final.csv  # 422 comments with VADER sentiment scores
├── models/
│   ├── best_joint_model.keras                   # Trained Keras model checkpoint (90.91% Acc)
│   ├── joint_model.keras                        # Final epoch Keras model
│   ├── propagation_scaler.pkl                   # StandardScaler fitted on training features
│   └── text_tokenizer.pkl                       # Tokenizer vocabulary (8,000 vocab limit)
├── outputs/
│   ├── propagation_data.npz                     # Scaled propagation tensors (Train, Val, Test)
│   ├── text_data.npz                            # Padded text token tensors (Train, Val, Test)
│   └── propagation_splits.pkl                   # Stratified train/val/test split IDs
├── src/
│   ├── 01_inspect_data.py                       # Dataset integrity & EDA verification
│   ├── 02_prepare_propagation.py                # Sequence padding & scaling
│   ├── 03_prepare_text.py                       # Text tokenization & sequence padding
│   ├── 04_build_joint_model.py                  # Dual-branch Keras model definition
│   ├── 05_train_joint_model.py                  # Joint training with callbacks
│   ├── 06_evaluate_joint_model.py               # Test split evaluation
│   ├── app.py                                   # FastAPI backend server
│   ├── database.py                              # SQLite ORM & prediction logger
│   ├── demo.html                                # Interactive web demo dashboard
│   └── scraper.py                               # Live Twitter scraper engine
├── extension/
│   ├── manifest.json                            # Chrome Extension Manifest V3 config
│   ├── content.js                               # In-page DOM scraper & badge overlay injector
│   ├── background.js                            # Service worker & API cache dispatcher
│   ├── popup.html                               # Modern glassmorphism extension popup
│   ├── popup.js                                 # Popup controller with live analytics
│   └── icons/                                   # Extension icon assets (16, 48, 128)
├── tests/
│   └── test_api.py                              # API endpoint test suite
├── Dockerfile                                   # Docker containerization config
├── pytest.ini                                   # Test runner configuration
├── requirements.txt                             # Python dependencies
└── README.md                                    # Documentation
```

---

## 📄 License
MIT License.

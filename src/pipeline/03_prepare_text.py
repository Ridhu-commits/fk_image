import os

# Reduce TensorFlow / other library messages
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import numpy as np
import pandas as pd
import joblib

from tensorflow.keras.preprocessing.text import Tokenizer
from tensorflow.keras.preprocessing.sequence import pad_sequences


# ============================================================
# SETTINGS
# ============================================================

TWEET_FILE = "data/raw/tweet_fields.csv"
COMMENTS_FILE = "data/raw/tweet_comments__final.csv"

SPLIT_FILE = "outputs/propagation_splits.pkl"

OUTPUT_TEXT_FILE = "outputs/text_data.npz"
TOKENIZER_FILE = "models/text_tokenizer.pkl"

# Match the reference joint-training template
VOCAB_SIZE = 8000
MAX_TEXT_LENGTH = 60


# ============================================================
# 1. LOAD DATA
# ============================================================

print("=" * 60)
print("TEXT / SENTIMENT DATA PREPARATION")
print("=" * 60)

print("\nLoading tweet data...")

tweets = pd.read_csv(
    TWEET_FILE,
    encoding="utf-8"
)

print("Tweets loaded:", len(tweets))


print("\nLoading comments...")

comments = pd.read_csv(
    COMMENTS_FILE,
    encoding="utf-8"
)

print("Comments loaded:", len(comments))


# ============================================================
# 2. CLEAN TEXT
# ============================================================

print("\nCleaning text...")

tweets["tweet_text"] = tweets["tweet_text"].fillna("").astype(str)
comments["comment_text"] = comments["comment_text"].fillna("").astype(str)

tweets["news_id"] = tweets["news_id"].astype(str)
comments["news_id"] = comments["news_id"].astype(str)

print("Text cleaning complete")


# ============================================================
# 3. LOAD THE EXISTING SPLIT
# ============================================================

print("\n" + "=" * 60)
print("LOADING TRAIN / VALIDATION / TEST SPLIT")
print("=" * 60)

splits = joblib.load(SPLIT_FILE)

train_ids = [str(x) for x in splits["train_ids"]]
val_ids = [str(x) for x in splits["val_ids"]]
test_ids = [str(x) for x in splits["test_ids"]]

y_train = np.asarray(splits["y_train"])
y_val = np.asarray(splits["y_val"])
y_test = np.asarray(splits["y_test"])

print("Training IDs:", len(train_ids))
print("Validation IDs:", len(val_ids))
print("Testing IDs:", len(test_ids))


# ============================================================
# 4. CREATE TEXT FOR EACH NEWS ARTICLE
# ============================================================

print("\n" + "=" * 60)
print("CREATING TEXT SAMPLES")
print("=" * 60)

# ------------------------------------------------------------
# Build dictionary:
# news_id -> all available comments
# ------------------------------------------------------------

comment_text_by_news = {}

for news_id, group in comments.groupby("news_id"):

    comment_texts = (
        group["comment_text"]
        .dropna()
        .astype(str)
        .tolist()
    )

    comment_texts = [
        text.strip()
        for text in comment_texts
        if text.strip()
    ]

    if comment_texts:

        joined_comments = " ".join(comment_texts)

        comment_text_by_news[news_id] = joined_comments


# ------------------------------------------------------------
# Build dictionary:
# news_id -> tweet text
# ------------------------------------------------------------

tweet_text_by_news = {}

for news_id, group in tweets.groupby("news_id"):

    tweet_texts = (
        group["tweet_text"]
        .dropna()
        .astype(str)
        .tolist()
    )

    tweet_texts = [
        text.strip()
        for text in tweet_texts
        if text.strip()
    ]

    if tweet_texts:

        joined_tweets = " ".join(tweet_texts)

        tweet_text_by_news[news_id] = joined_tweets


# ------------------------------------------------------------
# Function to create text
# ------------------------------------------------------------

def create_text_for_news(news_id):

    # Prefer REAL scraped comments
    if news_id in comment_text_by_news:

        return comment_text_by_news[news_id]

    # If comments are unavailable,
    # fall back to tweet text
    if news_id in tweet_text_by_news:

        return tweet_text_by_news[news_id]

    # If neither exists
    return ""


# ============================================================
# 5. CREATE TEXT IN EXACT SPLIT ORDER
# ============================================================

train_texts = [
    create_text_for_news(news_id)
    for news_id in train_ids
]

val_texts = [
    create_text_for_news(news_id)
    for news_id in val_ids
]

test_texts = [
    create_text_for_news(news_id)
    for news_id in test_ids
]


print("\nText samples created:")
print("Training:", len(train_texts))
print("Validation:", len(val_texts))
print("Testing:", len(test_texts))


# ============================================================
# 6. CHECK FOR MISSING TEXT
# ============================================================

print("\nChecking text availability...")

train_empty = sum(
    1 for text in train_texts if not text.strip()
)

val_empty = sum(
    1 for text in val_texts if not text.strip()
)

test_empty = sum(
    1 for text in test_texts if not text.strip()
)

print("Empty training texts:", train_empty)
print("Empty validation texts:", val_empty)
print("Empty testing texts:", test_empty)


if train_empty > 0 or val_empty > 0 or test_empty > 0:

    raise ValueError(
        "Some news articles have no available text."
    )


# ============================================================
# 7. DISPLAY SAMPLE
# ============================================================

print("\n" + "=" * 60)
print("SAMPLE TEXT")
print("=" * 60)

print(train_texts[0][:500])


# ============================================================
# 8. CREATE TOKENIZER
# ============================================================

print("\n" + "=" * 60)
print("CREATING TOKENIZER")
print("=" * 60)

tokenizer = Tokenizer(
    num_words=VOCAB_SIZE,
    oov_token="<OOV>"
)

# IMPORTANT:
# Fit tokenizer ONLY on training text.
# This prevents information leakage from validation/test data.

tokenizer.fit_on_texts(train_texts)

print("Tokenizer created")
print("Vocabulary size:", len(tokenizer.word_index))


# ============================================================
# 9. CONVERT TEXT TO INTEGER SEQUENCES
# ============================================================

print("\nConverting text to sequences...")

X_train_text_sequences = tokenizer.texts_to_sequences(
    train_texts
)

X_val_text_sequences = tokenizer.texts_to_sequences(
    val_texts
)

X_test_text_sequences = tokenizer.texts_to_sequences(
    test_texts
)


# ============================================================
# 10. PAD / TRUNCATE SEQUENCES
# ============================================================

print("\nPadding / truncating sequences...")

X_train_text = pad_sequences(
    X_train_text_sequences,
    maxlen=MAX_TEXT_LENGTH,
    padding="post",
    truncating="post"
)

X_val_text = pad_sequences(
    X_val_text_sequences,
    maxlen=MAX_TEXT_LENGTH,
    padding="post",
    truncating="post"
)

X_test_text = pad_sequences(
    X_test_text_sequences,
    maxlen=MAX_TEXT_LENGTH,
    padding="post",
    truncating="post"
)


# ============================================================
# 11. CHECK SHAPES
# ============================================================

print("\n" + "=" * 60)
print("TEXT DATA SHAPES")
print("=" * 60)

print("X_train_text:", X_train_text.shape)
print("X_val_text:  ", X_val_text.shape)
print("X_test_text: ", X_test_text.shape)


expected_train = (len(train_ids), MAX_TEXT_LENGTH)
expected_val = (len(val_ids), MAX_TEXT_LENGTH)
expected_test = (len(test_ids), MAX_TEXT_LENGTH)


if X_train_text.shape != expected_train:
    raise ValueError(
        f"Training shape incorrect. "
        f"Expected {expected_train}, got {X_train_text.shape}"
    )

if X_val_text.shape != expected_val:
    raise ValueError(
        f"Validation shape incorrect. "
        f"Expected {expected_val}, got {X_val_text.shape}"
    )

if X_test_text.shape != expected_test:
    raise ValueError(
        f"Testing shape incorrect. "
        f"Expected {expected_test}, got {X_test_text.shape}"
    )


print("\nShape verification: PASSED")


# ============================================================
# 12. CHECK LABEL ALIGNMENT
# ============================================================

print("\nChecking label alignment...")

if len(X_train_text) != len(y_train):
    raise ValueError(
        "Training text and labels are not aligned!"
    )

if len(X_val_text) != len(y_val):
    raise ValueError(
        "Validation text and labels are not aligned!"
    )

if len(X_test_text) != len(y_test):
    raise ValueError(
        "Testing text and labels are not aligned!"
    )

print("Label alignment: PASSED")


# ============================================================
# 13. SAVE TOKENIZER
# ============================================================

print("\nSaving tokenizer...")

joblib.dump(
    tokenizer,
    TOKENIZER_FILE
)

print("Tokenizer saved to:")
print(TOKENIZER_FILE)


# ============================================================
# 14. SAVE TEXT DATA
# ============================================================

print("\nSaving text data...")

np.savez(
    OUTPUT_TEXT_FILE,

    X_train_text=X_train_text,
    X_val_text=X_val_text,
    X_test_text=X_test_text
)

print("Text data saved to:")
print(OUTPUT_TEXT_FILE)


# ============================================================
# 15. FINAL SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("TEXT PREPARATION COMPLETE")
print("=" * 60)

print("Vocabulary limit:", VOCAB_SIZE)
print("Maximum text length:", MAX_TEXT_LENGTH)

print()
print("Training data:   ", X_train_text.shape)
print("Validation data: ", X_val_text.shape)
print("Testing data:    ", X_test_text.shape)

print()
print("Tokenizer:")
print(TOKENIZER_FILE)

print()
print("Text data:")
print(OUTPUT_TEXT_FILE)

print("\nEverything completed successfully.")
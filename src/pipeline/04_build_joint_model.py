import os

# Reduce TensorFlow messages
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import numpy as np
import joblib

from tensorflow.keras.models import Model
from tensorflow.keras.layers import (
    Input,
    LSTM,
    Dense,
    Embedding,
    Concatenate
)


# ============================================================
# SETTINGS
# ============================================================

PROPAGATION_FILE = "outputs/propagation_data.npz"
TEXT_FILE = "outputs/text_data.npz"
SPLIT_FILE = "outputs/propagation_splits.pkl"

TOKENIZER_FILE = "models/text_tokenizer.pkl"

MODEL_FILE = "models/joint_model.keras"


# ------------------------------------------------------------
# Propagation branch
# ------------------------------------------------------------

PROP_TIMESTEPS = 5
PROP_FEATURES = 4
PROP_LSTM_UNITS = 32


# ------------------------------------------------------------
# Sentiment / text branch
# ------------------------------------------------------------

MAX_TEXT_LENGTH = 60
VOCAB_SIZE = 8000
TEXT_EMBEDDING_DIM = 64
TEXT_LSTM_UNITS = 32


# ------------------------------------------------------------
# Joint classification layer
# ------------------------------------------------------------

DENSE_UNITS = 32


# ============================================================
# 1. LOAD PROPAGATION DATA
# ============================================================

print("=" * 60)
print("JOINT MODEL - DATA LOADING")
print("=" * 60)

print("\nLoading propagation data...")

prop_data = np.load(PROPAGATION_FILE)

X_train_prop = prop_data["X_train_prop"]
X_val_prop = prop_data["X_val_prop"]
X_test_prop = prop_data["X_test_prop"]

print("Propagation training:", X_train_prop.shape)
print("Propagation validation:", X_val_prop.shape)
print("Propagation testing:", X_test_prop.shape)


# ============================================================
# 2. LOAD TEXT DATA
# ============================================================

print("\nLoading text data...")

text_data = np.load(TEXT_FILE)

X_train_text = text_data["X_train_text"]
X_val_text = text_data["X_val_text"]
X_test_text = text_data["X_test_text"]

print("Text training:", X_train_text.shape)
print("Text validation:", X_val_text.shape)
print("Text testing:", X_test_text.shape)


# ============================================================
# 3. LOAD LABELS
# ============================================================

print("\nLoading labels...")

splits = joblib.load(SPLIT_FILE)

y_train = splits["y_train"]
y_val = splits["y_val"]
y_test = splits["y_test"]

print("Training labels:", y_train.shape)
print("Validation labels:", y_val.shape)
print("Testing labels:", y_test.shape)


# ============================================================
# 4. CHECK DATA ALIGNMENT
# ============================================================

print("\n" + "=" * 60)
print("CHECKING DATA ALIGNMENT")
print("=" * 60)


# Training alignment

if len(X_train_prop) != len(X_train_text):
    raise ValueError(
        "Training propagation and text data are not aligned!"
    )

if len(X_train_prop) != len(y_train):
    raise ValueError(
        "Training data and labels are not aligned!"
    )


# Validation alignment

if len(X_val_prop) != len(X_val_text):
    raise ValueError(
        "Validation propagation and text data are not aligned!"
    )

if len(X_val_prop) != len(y_val):
    raise ValueError(
        "Validation data and labels are not aligned!"
    )


# Testing alignment

if len(X_test_prop) != len(X_test_text):
    raise ValueError(
        "Testing propagation and text data are not aligned!"
    )

if len(X_test_prop) != len(y_test):
    raise ValueError(
        "Testing data and labels are not aligned!"
    )


print("Training samples:", len(X_train_prop))
print("Validation samples:", len(X_val_prop))
print("Testing samples:", len(X_test_prop))

print("Alignment check: PASSED")


# ============================================================
# 5. CHECK INPUT SHAPES
# ============================================================

print("\n" + "=" * 60)
print("CHECKING INPUT SHAPES")
print("=" * 60)


expected_prop_shape = (
    len(X_train_prop),
    PROP_TIMESTEPS,
    PROP_FEATURES
)

expected_text_shape = (
    len(X_train_text),
    MAX_TEXT_LENGTH
)


if X_train_prop.shape[1:] != (
    PROP_TIMESTEPS,
    PROP_FEATURES
):
    raise ValueError(
        f"Propagation shape incorrect: "
        f"{X_train_prop.shape[1:]}"
    )


if X_train_text.shape[1:] != (
    MAX_TEXT_LENGTH,
):
    raise ValueError(
        f"Text shape incorrect: "
        f"{X_train_text.shape[1:]}"
    )


print("Propagation input shape: PASSED")
print("Text input shape: PASSED")


# ============================================================
# 6. BUILD PROPAGATION BRANCH
# ============================================================

print("\n" + "=" * 60)
print("BUILDING PROPAGATION LSTM BRANCH")
print("=" * 60)


prop_input = Input(
    shape=(PROP_TIMESTEPS, PROP_FEATURES),
    name="propagation_input"
)

prop_lstm_out = LSTM(
    PROP_LSTM_UNITS,
    dropout=0.08,
    name="propagation_lstm"
)(prop_input)

print(
    "Propagation branch:"
    f" Input({PROP_TIMESTEPS}, {PROP_FEATURES})"
    f" -> LSTM({PROP_LSTM_UNITS}, dropout=0.08)"
)


# ============================================================
# 7. BUILD SENTIMENT / TEXT BRANCH
# ============================================================

print("\n" + "=" * 60)
print("BUILDING SENTIMENT / TEXT LSTM BRANCH")
print("=" * 60)

from tensorflow.keras.layers import Bidirectional, BatchNormalization, Dropout

text_input = Input(
    shape=(MAX_TEXT_LENGTH,),
    name="text_input"
)

text_embedding = Embedding(
    input_dim=VOCAB_SIZE,
    output_dim=TEXT_EMBEDDING_DIM,
    mask_zero=True,
    name="embedding"
)(text_input)

sent_lstm_out = Bidirectional(
    LSTM(TEXT_LSTM_UNITS, dropout=0.10, recurrent_dropout=0.05),
    name="sentiment_bilstm"
)(text_embedding)

print(
    "Text branch:"
    f" Input({MAX_TEXT_LENGTH})"
    f" -> Embedding({VOCAB_SIZE}, {TEXT_EMBEDDING_DIM})"
    f" -> Bidirectional LSTM({TEXT_LSTM_UNITS})"
)


# ============================================================
# 8. FUSE BOTH BRANCHES
# ============================================================

print("\n" + "=" * 60)
print("FUSING PROPAGATION + SENTIMENT")
print("=" * 60)

merged = Concatenate(
    name="feature_fusion"
)([
    prop_lstm_out,
    sent_lstm_out
])

# Batch Normalization stabilizes gradient dynamics across multimodal branches
bn = BatchNormalization(name="batch_norm")(merged)

print(
    "Feature fusion:"
    " Propagation LSTM + Sentiment Bi-LSTM -> BatchNormalization"
)


# ============================================================
# 9. JOINT CLASSIFICATION LAYER
# ============================================================

dense1 = Dense(
    64,
    activation="relu",
    name="joint_dense_1"
)(bn)

dense1_drop = Dropout(0.15, name="dense_dropout_1")(dense1)

dense2 = Dense(
    DENSE_UNITS,
    activation="relu",
    name="joint_dense_2"
)(dense1_drop)

dense2_drop = Dropout(0.10, name="dense_dropout_2")(dense2)

output = Dense(
    1,
    activation="sigmoid",
    name="fake_real_output"
)(dense2_drop)


# ============================================================
# 10. CREATE MODEL
# ============================================================

model = Model(
    inputs=[
        prop_input,
        text_input
    ],
    outputs=output,
    name="enhanced_joint_propagation_sentiment_model"
)


# ============================================================
# 11. COMPILE MODEL
# ============================================================

import tensorflow as tf

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=0.0006),
    loss="binary_crossentropy",
    metrics=["accuracy"]
)


# ============================================================
# 12. DISPLAY MODEL SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("JOINT MODEL SUMMARY")
print("=" * 60)

model.summary()


# ============================================================
# 13. DISPLAY IMPORTANT MODEL INFORMATION
# ============================================================

print("\n" + "=" * 60)
print("MODEL CONFIGURATION")
print("=" * 60)

print("Propagation timesteps:", PROP_TIMESTEPS)
print("Propagation features:", PROP_FEATURES)
print("Propagation LSTM units:", PROP_LSTM_UNITS)

print("Text sequence length:", MAX_TEXT_LENGTH)
print("Vocabulary size:", VOCAB_SIZE)
print("Embedding dimension:", TEXT_EMBEDDING_DIM)
print("Sentiment LSTM units:", TEXT_LSTM_UNITS)

print("Fusion layer: Concatenate")
print("Dense units:", DENSE_UNITS)
print("Output: Sigmoid")
print("Loss: Binary Crossentropy")
print("Optimizer: Adam")


# ============================================================
# 14. SAVE FRESH MODEL
# ============================================================

print("\n" + "=" * 60)
print("SAVING FRESH JOINT MODEL")
print("=" * 60)

model.save(MODEL_FILE)

print("\nModel created successfully.")

print("Saved to:")
print(MODEL_FILE)

print("\nIMPORTANT:")
print("This is a FRESH model.")
print("No previous propagation-only model weights were loaded.")
print("Both LSTM branches will be trained jointly.")
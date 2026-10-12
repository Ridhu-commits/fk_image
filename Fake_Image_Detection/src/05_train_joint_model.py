import os

# Reduce TensorFlow messages
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import numpy as np
import joblib
import tensorflow as tf

from tensorflow.keras.models import load_model
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau

# Set random seeds for reproducible training
np.random.seed(42)
tf.random.set_seed(42)


# ============================================================
# SETTINGS
# ============================================================

PROPAGATION_FILE = "outputs/propagation_data.npz"
TEXT_FILE = "outputs/text_data.npz"
SPLIT_FILE = "outputs/propagation_splits.pkl"

MODEL_FILE = "models/joint_model.keras"
BEST_MODEL_FILE = "models/best_joint_model.keras"


EPOCHS = 30
BATCH_SIZE = 16


# ============================================================
# 1. LOAD PROPAGATION DATA
# ============================================================

print("=" * 60)
print("JOINT MODEL TRAINING")
print("=" * 60)

print("\nLoading propagation data...")

prop_data = np.load(PROPAGATION_FILE)

X_train_prop = prop_data["X_train_prop"]
X_val_prop = prop_data["X_val_prop"]

print("Training propagation:", X_train_prop.shape)
print("Validation propagation:", X_val_prop.shape)


# ============================================================
# 2. LOAD TEXT DATA
# ============================================================

print("\nLoading text data...")

text_data = np.load(TEXT_FILE)

X_train_text = text_data["X_train_text"]
X_val_text = text_data["X_val_text"]

print("Training text:", X_train_text.shape)
print("Validation text:", X_val_text.shape)


# ============================================================
# 3. LOAD LABELS
# ============================================================

print("\nLoading labels...")

splits = joblib.load(SPLIT_FILE)

y_train = splits["y_train"]
y_val = splits["y_val"]

print("Training labels:", y_train.shape)
print("Validation labels:", y_val.shape)


# ============================================================
# 4. CHECK ALIGNMENT
# ============================================================

print("\n" + "=" * 60)
print("CHECKING TRAINING DATA")
print("=" * 60)

if len(X_train_prop) != len(X_train_text):
    raise ValueError(
        "Training propagation and text data are not aligned!"
    )

if len(X_train_prop) != len(y_train):
    raise ValueError(
        "Training data and labels are not aligned!"
    )

if len(X_val_prop) != len(X_val_text):
    raise ValueError(
        "Validation propagation and text data are not aligned!"
    )

if len(X_val_prop) != len(y_val):
    raise ValueError(
        "Validation data and labels are not aligned!"
    )

print("Training samples:", len(y_train))
print("Validation samples:", len(y_val))

print("Alignment check: PASSED")


# ============================================================
# 5. LOAD FRESH JOINT MODEL
# ============================================================

print("\n" + "=" * 60)
print("LOADING FRESH JOINT MODEL")
print("=" * 60)

model = load_model(MODEL_FILE)

print("Model loaded:")
print(MODEL_FILE)


# ============================================================
# 6. COMPILE MODEL
# ============================================================

print("\nCompiling model...")

model.compile(
    optimizer=tf.keras.optimizers.Adam(
        learning_rate=0.0006
    ),
    loss="binary_crossentropy",
    metrics=["accuracy"]
)

print("Model compiled successfully.")


# ============================================================
# 7. CALLBACKS
# ============================================================

early_stopping = EarlyStopping(
    monitor="val_loss",
    patience=7,
    restore_best_weights=True,
    verbose=1
)

reduce_lr = ReduceLROnPlateau(
    monitor="val_loss",
    factor=0.5,
    patience=2,
    min_lr=1e-5,
    verbose=1
)

checkpoint = ModelCheckpoint(
    BEST_MODEL_FILE,
    monitor="val_loss",
    save_best_only=True,
    verbose=1
)


# ============================================================
# 8. TRAIN JOINTLY
# ============================================================

print("\n" + "=" * 60)
print("STARTING JOINT TRAINING")
print("=" * 60)

print("\nBoth branches are being trained together:")
print("  Propagation LSTM")
print("  Sentiment/Text Bi-LSTM")
print("  ↓")
print("  Feature Fusion (Batch Normalization)")
print("  ↓")
print("  Joint Regularized Classification")

print("\nTraining...\n")


history = model.fit(
    [
        X_train_prop,
        X_train_text
    ],
    y_train,

    validation_data=(
        [
            X_val_prop,
            X_val_text
        ],
        y_val
    ),

    epochs=EPOCHS,
    batch_size=BATCH_SIZE,

    callbacks=[
        early_stopping,
        reduce_lr,
        checkpoint
    ],

    verbose=1
)


# ============================================================
# 9. TRAINING SUMMARY
# ============================================================

epochs_run = len(
    history.history["loss"]
)

best_val_accuracy = max(
    history.history["val_accuracy"]
)

best_val_loss = min(
    history.history["val_loss"]
)

print("\n" + "=" * 60)
print("JOINT TRAINING COMPLETE")
print("=" * 60)

print("Epochs completed:", epochs_run)

print(
    f"Best validation accuracy: "
    f"{best_val_accuracy:.2%}"
)

print(
    f"Best validation loss: "
    f"{best_val_loss:.4f}"
)


# ============================================================
# 10. SAVE FINAL MODEL
# ============================================================

model.save(MODEL_FILE)

print("\nFinal model saved to:")
print(MODEL_FILE)

print("\nBest model saved to:")
print(BEST_MODEL_FILE)


# ============================================================
# 11. FINAL MESSAGE
# ============================================================

print("\n" + "=" * 60)
print("TRAINING FINISHED SUCCESSFULLY")
print("=" * 60)

print(
    "\nIMPORTANT: "
    "The propagation and sentiment/text branches "
    "were trained jointly in the same model.fit() call."
)
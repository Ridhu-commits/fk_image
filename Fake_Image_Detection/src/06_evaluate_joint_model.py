import os

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

import numpy as np
import joblib

from tensorflow.keras.models import load_model

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)


# ============================================================
# SETTINGS
# ============================================================

PROPAGATION_FILE = "outputs/propagation_data.npz"
TEXT_FILE = "outputs/text_data.npz"
SPLIT_FILE = "outputs/propagation_splits.pkl"

MODEL_FILE = "models/best_joint_model.keras"


# ============================================================
# 1. LOAD TEST DATA
# ============================================================

print("=" * 60)
print("JOINT MODEL - TEST EVALUATION")
print("=" * 60)

print("\nLoading propagation test data...")

prop_data = np.load(PROPAGATION_FILE)

X_test_prop = prop_data["X_test_prop"]

print("Test propagation:", X_test_prop.shape)


print("\nLoading text test data...")

text_data = np.load(TEXT_FILE)

X_test_text = text_data["X_test_text"]

print("Test text:", X_test_text.shape)


# ============================================================
# 2. LOAD TEST LABELS
# ============================================================

print("\nLoading test labels...")

splits = joblib.load(SPLIT_FILE)

y_test = splits["y_test"]

print("Test labels:", y_test.shape)


# ============================================================
# 3. CHECK ALIGNMENT
# ============================================================

print("\n" + "=" * 60)
print("CHECKING TEST DATA")
print("=" * 60)

if len(X_test_prop) != len(X_test_text):
    raise ValueError(
        "Propagation and text test data are not aligned!"
    )

if len(X_test_prop) != len(y_test):
    raise ValueError(
        "Test data and labels are not aligned!"
    )

print("Test samples:", len(y_test))
print("Alignment check: PASSED")


# ============================================================
# 4. LOAD BEST MODEL
# ============================================================

print("\n" + "=" * 60)
print("LOADING BEST JOINT MODEL")
print("=" * 60)

model = load_model(MODEL_FILE)

print("Loaded:")
print(MODEL_FILE)


# ============================================================
# 5. PREDICT
# ============================================================

print("\n" + "=" * 60)
print("RUNNING TEST PREDICTIONS")
print("=" * 60)

probabilities = model.predict(
    [
        X_test_prop,
        X_test_text
    ],
    verbose=0
)

# Convert probability to class
# >= 0.5 = Fake (1)
# < 0.5  = Real (0)

y_pred = (
    probabilities.ravel() >= 0.5
).astype(int)


# ============================================================
# 6. CALCULATE METRICS
# ============================================================

accuracy = accuracy_score(
    y_test,
    y_pred
)

precision = precision_score(
    y_test,
    y_pred,
    zero_division=0
)

recall = recall_score(
    y_test,
    y_pred,
    zero_division=0
)

f1 = f1_score(
    y_test,
    y_pred,
    zero_division=0
)


# ============================================================
# 7. CONFUSION MATRIX
# ============================================================

cm = confusion_matrix(
    y_test,
    y_pred
)


# ============================================================
# 8. DISPLAY RESULTS
# ============================================================

print("\n" + "=" * 60)
print("FINAL JOINT MODEL TEST RESULTS")
print("=" * 60)

print(
    f"\nTest samples: {len(y_test)}"
)

print(
    f"Real samples: {(y_test == 0).sum()}"
)

print(
    f"Fake samples: {(y_test == 1).sum()}"
)

print("\nMetrics:")

print(
    f"Accuracy:  {accuracy:.2%}"
)

print(
    f"Precision: {precision:.2%}"
)

print(
    f"Recall:    {recall:.2%}"
)

print(
    f"F1 Score:  {f1:.2%}"
)


# ============================================================
# 9. CONFUSION MATRIX
# ============================================================

print("\n" + "=" * 60)
print("CONFUSION MATRIX")
print("=" * 60)

print(
    "\n              Predicted"
)

print(
    "              Real   Fake"
)

print(
    f"Actual Real   {cm[0,0]:4d}   {cm[0,1]:4d}"
)

print(
    f"Actual Fake   {cm[1,0]:4d}   {cm[1,1]:4d}"
)


# ============================================================
# 10. CLASSIFICATION REPORT
# ============================================================

print("\n" + "=" * 60)
print("CLASSIFICATION REPORT")
print("=" * 60)

print(
    classification_report(
        y_test,
        y_pred,
        target_names=[
            "Real",
            "Fake"
        ],
        zero_division=0
    )
)


# ============================================================
# 11. FINAL INTERPRETATION
# ============================================================

correct = np.sum(
    y_test == y_pred
)

incorrect = np.sum(
    y_test != y_pred
)

print("=" * 60)
print("PREDICTION SUMMARY")
print("=" * 60)

print(
    f"Correct predictions: {correct}/{len(y_test)}"
)

print(
    f"Incorrect predictions: {incorrect}/{len(y_test)}"
)

print(
    f"Final test accuracy: {accuracy:.2%}"
)

print("\nEvaluation completed successfully.")
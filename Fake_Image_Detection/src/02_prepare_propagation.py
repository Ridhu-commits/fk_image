import random
import numpy as np
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import joblib


# ============================================================
# CONFIGURATION
# ============================================================

INPUT_FILE = "data/raw/tweet_fields.csv"

FIXED_LENGTH = 5

RANDOM_STATE = 42

PROP_FEATURES = [
    "verified",
    "reply_count",
    "retweet_count",
    "like_count"
]


# ============================================================
# RANDOM SEEDS
# ============================================================

random.seed(RANDOM_STATE)
np.random.seed(RANDOM_STATE)


# ============================================================
# 1. LOAD DATA
# ============================================================

print("=" * 60)
print("PROPAGATION DATA PREPARATION")
print("=" * 60)

df = pd.read_csv(INPUT_FILE)

print("Rows loaded:", len(df))
print("Unique news_id:", df["news_id"].nunique())


# ============================================================
# 2. CLEAN DATA TYPES
# ============================================================

print("\nCleaning data...")

# Convert verified to 0/1
df["verified"] = (
    df["verified"]
    .astype(str)
    .str.lower()
    .map({
        "true": 1,
        "false": 0,
        "1": 1,
        "0": 0
    })
    .fillna(0)
    .astype("float32")
)


# Convert numerical features
for column in [
    "reply_count",
    "retweet_count",
    "like_count"
]:
    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    ).fillna(0)


# Convert timestamp
df["timestamp"] = pd.to_datetime(
    df["timestamp"],
    errors="coerce"
)


# ============================================================
# 3. BUILD ONE PROPAGATION SEQUENCE PER NEWS_ID
# ============================================================

print("\nBuilding propagation sequences...")

raw_sequences = []
labels = []
news_ids = []

for news_id, group in df.groupby("news_id"):

    # Remove rows without timestamps
    # because chronological propagation requires time
    group = group.dropna(subset=["timestamp"])

    # Skip if nothing remains
    if len(group) == 0:
        continue

    # Sort chronologically
    group = group.sort_values("timestamp")

    # Extract propagation features
    features = group[PROP_FEATURES].values.astype("float32")

    # Store sequence
    raw_sequences.append(list(features))

    # Convert label to binary
    label_text = str(group["label"].iloc[0]).lower()

    if label_text == "fake":
        labels.append(1)
    else:
        labels.append(0)

    news_ids.append(news_id)


print("Sequences created:", len(raw_sequences))


# ============================================================
# 4. FIXED-LENGTH TRANSFORMATION
# ============================================================

def fixed_length_transform(sequence, n):

    sequence = list(sequence)

    # Case 1:
    # Sequence is already long enough
    if len(sequence) >= n:
        return np.array(
            sequence[:n],
            dtype="float32"
        )

    # Case 2:
    # Sequence is shorter than required length
    deficit = n - len(sequence)

    # Randomly sample existing events
    # to reach required length
    oversampled = [
        random.choice(sequence)
        for _ in range(deficit)
    ]

    combined = sequence + oversampled

    return np.array(
        combined[:n],
        dtype="float32"
    )


# Apply transformation
X_prop = np.array([
    fixed_length_transform(
        sequence,
        FIXED_LENGTH
    )
    for sequence in raw_sequences
])

y = np.array(labels)

news_ids = np.array(news_ids)


# ============================================================
# 5. DISPLAY SHAPES
# ============================================================

print("\n" + "=" * 60)
print("PROPAGATION DATA SHAPE")
print("=" * 60)

print("X_prop shape:", X_prop.shape)
print("y shape:", y.shape)

print("\nExpected:")
print("(number_of_news, 5, 4)")


# ============================================================
# 6. CHECK LABEL BALANCE
# ============================================================

print("\n" + "=" * 60)
print("LABEL DISTRIBUTION")
print("=" * 60)

print("Real (0):", np.sum(y == 0))
print("Fake (1):", np.sum(y == 1))


# ============================================================
# 7. TRAIN / VALIDATION / TEST SPLIT
# ============================================================

print("\n" + "=" * 60)
print("TRAIN / VALIDATION / TEST SPLIT")
print("=" * 60)

# First split:
# 80% temporary training data
# 20% test data

X_temp, X_test, y_temp, y_test, ids_temp, ids_test = train_test_split(
    X_prop,
    y,
    news_ids,
    test_size=0.20,
    random_state=RANDOM_STATE,
    stratify=y
)


# Second split:
# 90% train
# 10% validation
#
# Final approximately:
# 72% train
# 8% validation
# 20% test

X_train, X_val, y_train, y_val, ids_train, ids_val = train_test_split(
    X_temp,
    y_temp,
    ids_temp,
    test_size=0.10,
    random_state=RANDOM_STATE,
    stratify=y_temp
)


print("Training:", X_train.shape)
print("Validation:", X_val.shape)
print("Testing:", X_test.shape)


# ============================================================
# 8. SCALE FEATURES
# ============================================================

print("\nScaling propagation features...")

scaler = StandardScaler()

# Fit ONLY on training data
n_features = X_train.shape[-1]

X_train_2d = X_train.reshape(-1, n_features)

scaler.fit(X_train_2d)


# Transform all splits
X_train = scaler.transform(
    X_train.reshape(-1, n_features)
).reshape(X_train.shape)

X_val = scaler.transform(
    X_val.reshape(-1, n_features)
).reshape(X_val.shape)

X_test = scaler.transform(
    X_test.reshape(-1, n_features)
).reshape(X_test.shape)


# ============================================================
# 9. SAVE SCALER
# ============================================================

joblib.dump(
    scaler,
    "models/propagation_scaler.pkl"
)

print("Scaler saved to:")
print("models/propagation_scaler.pkl")


# ============================================================
# 10. SHOW ONE SAMPLE
# ============================================================

print("\n" + "=" * 60)
print("SAMPLE PROCESSED SEQUENCE")
print("=" * 60)

print("News ID:", ids_train[0])
print("Label:", y_train[0])

print("\nSequence:")
print(X_train[0])
# Save the exact news_id splits
joblib.dump(
    {
        "train_ids": ids_train,
        "val_ids": ids_val,
        "test_ids": ids_test
    },
    "outputs/propagation_splits.pkl"
)

print("\nSplit IDs saved to:")
print("outputs/propagation_splits.pkl")


# ============================================================
# DONE
# ============================================================

print("\n" + "=" * 60)
print("PROPAGATION PREPARATION COMPLETE")
print("=" * 60)
np.savez(
    "outputs/propagation_data.npz",
    X_train_prop=X_train,
    X_val_prop=X_val,
    X_test_prop=X_test
)

# Save labels along with the split IDs
joblib.dump(
    {
        "train_ids": ids_train,
        "val_ids": ids_val,
        "test_ids": ids_test,
        "y_train": y_train,
        "y_val": y_val,
        "y_test": y_test
    },
    "outputs/propagation_splits.pkl"
)

print("\nPropagation data saved to:")
print("outputs/propagation_data.npz")

print("Split IDs and labels saved to:")
print("outputs/propagation_splits.pkl")
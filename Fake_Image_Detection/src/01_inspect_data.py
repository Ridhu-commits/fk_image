import pandas as pd
import os

# ============================================================
# FILE PATHS
# ============================================================

TWEET_FILE = "data/raw/tweet_fields.csv"
COMMENT_FILE = "data/raw/tweet_comments__final.csv"
SENTIMENT_FILE = "data/raw/tweet_comments_sentiment__final.csv"


# ============================================================
# 1. CHECK FILES
# ============================================================

print("=" * 60)
print("FAKE IMAGE DETECTION - DATASET INSPECTION")
print("=" * 60)

for file in [TWEET_FILE, COMMENT_FILE, SENTIMENT_FILE]:
    if os.path.exists(file):
        print(f"FOUND: {file}")
    else:
        print(f"NOT FOUND: {file}")


# ============================================================
# 2. LOAD DATA
# ============================================================

tweets = pd.read_csv(TWEET_FILE)
comments = pd.read_csv(COMMENT_FILE)
sentiment = pd.read_csv(SENTIMENT_FILE)

print("\n" + "=" * 60)
print("DATASET SHAPES")
print("=" * 60)

print("Tweet fields:", tweets.shape)
print("Comments:", comments.shape)
print("Sentiment:", sentiment.shape)


# ============================================================
# 3. COLUMN NAMES
# ============================================================

print("\n" + "=" * 60)
print("COLUMN NAMES")
print("=" * 60)

print("\nTweet fields:")
print(tweets.columns.tolist())

print("\nComments:")
print(comments.columns.tolist())

print("\nSentiment:")
print(sentiment.columns.tolist())


# ============================================================
# 4. UNIQUE NEWS IDs
# ============================================================

print("\n" + "=" * 60)
print("UNIQUE NEWS / POST COUNTS")
print("=" * 60)

print("Unique news_id in tweets:",
      tweets["news_id"].nunique())

print("Unique news_id in comments:",
      comments["news_id"].nunique())

print("Unique news_id in sentiment:",
      sentiment["news_id"].nunique())


# ============================================================
# 5. LABEL DISTRIBUTION
# ============================================================

print("\n" + "=" * 60)
print("LABEL DISTRIBUTION")
print("=" * 60)

print("\nTweet-level labels:")
print(tweets["label"].value_counts())

print("\nNews-level labels:")
print(
    tweets.groupby("news_id")["label"]
    .first()
    .value_counts()
)


# ============================================================
# 6. PROPAGATION SEQUENCE LENGTH
# ============================================================

print("\n" + "=" * 60)
print("PROPAGATION SEQUENCE LENGTH")
print("=" * 60)

sequence_lengths = tweets.groupby("news_id").size()

print("Minimum:", sequence_lengths.min())
print("Maximum:", sequence_lengths.max())
print("Mean:", round(sequence_lengths.mean(), 2))
print("Median:", sequence_lengths.median())


# ============================================================
# 7. COMMENTS AVAILABLE
# ============================================================

print("\n" + "=" * 60)
print("COMMENT COVERAGE")
print("=" * 60)

tweet_news_ids = set(tweets["news_id"].unique())
comment_news_ids = set(comments["news_id"].unique())

with_comments = tweet_news_ids.intersection(comment_news_ids)
without_comments = tweet_news_ids - comment_news_ids

print("Posts with comments:",
      len(with_comments))

print("Posts without comments:",
      len(without_comments))


# ============================================================
# 8. MISSING VALUES
# ============================================================

print("\n" + "=" * 60)
print("MISSING VALUES - TWEET DATA")
print("=" * 60)

print(tweets.isnull().sum())


print("\n" + "=" * 60)
print("MISSING VALUES - COMMENT DATA")
print("=" * 60)

print(comments.isnull().sum())


# ============================================================
# 9. TIMESTAMP CHECK
# ============================================================

print("\n" + "=" * 60)
print("TIMESTAMP CHECK")
print("=" * 60)

tweets["timestamp"] = pd.to_datetime(
    tweets["timestamp"],
    errors="coerce"
)

print("Invalid timestamps:",
      tweets["timestamp"].isna().sum())


# ============================================================
# 10. SAMPLE PROPAGATION SEQUENCE
# ============================================================

print("\n" + "=" * 60)
print("SAMPLE PROPAGATION SEQUENCE")
print("=" * 60)

sample_news_id = tweets["news_id"].iloc[0]

sample = tweets[
    tweets["news_id"] == sample_news_id
].sort_values("timestamp")

print("news_id:", sample_news_id)
print("label:", sample["label"].iloc[0])

print(
    sample[
        [
            "tweet_id",
            "verified",
            "reply_count",
            "retweet_count",
            "like_count",
            "timestamp"
        ]
    ].to_string(index=False)
)


# ============================================================
# DONE
# ============================================================

print("\n" + "=" * 60)
print("DATASET INSPECTION COMPLETE")
print("=" * 60)
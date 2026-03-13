"""
VoiceSpend — ML Expense Classifier Training Pipeline
=====================================================
Trains a TF-IDF + Multinomial Naive Bayes classifier on the voice expense dataset.
Exports model weights to JSON for browser-side inference.

AI/ML Concepts Demonstrated:
- Text Preprocessing & Tokenization
- TF-IDF Vectorization (Term Frequency–Inverse Document Frequency)
- Multinomial Naive Bayes Classification
- Train/Test Split & Cross-Validation
- Model Evaluation (Accuracy, Classification Report, Confusion Matrix)
- Model Serialization (pickle + JSON export for browser)

Usage:
    python train_model.py
"""

import json
import pickle
import re
import sys
import io
import numpy as np

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.pipeline import Pipeline


# ─── CONFIG ───
DATASET_PATH = "voice_expense_dataset.json"
MODEL_PATH = "expense_classifier.pkl"
WEIGHTS_PATH = "ml_model_weights.json"
CATEGORIES = ["food", "transport", "shopping", "bills", "entertainment", "health", "groceries", "education"]


def load_dataset(path):
    """Load and preprocess the voice expense dataset."""
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    sentences = []
    labels = []
    for entry in data:
        sentence = entry["sentence"].strip()
        category = entry["category"].strip().lower()
        if category in CATEGORIES:
            sentences.append(sentence)
            labels.append(category)

    print(f"✓ Loaded {len(sentences)} samples across {len(set(labels))} categories")
    return sentences, labels


def preprocess_text(text):
    """Clean and normalize text for better feature extraction."""
    text = text.lower()
    # Remove currency symbols and numbers (we only classify category, not extract amount)
    text = re.sub(r'[₹$]', '', text)
    text = re.sub(r'\b\d+[\d,]*\.?\d*\b', ' NUM ', text)
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def train_model(sentences, labels):
    """Train TF-IDF + Multinomial Naive Bayes pipeline."""
    # Preprocess all sentences
    processed = [preprocess_text(s) for s in sentences]

    # Split dataset
    X_train, X_test, y_train, y_test = train_test_split(
        processed, labels, test_size=0.2, random_state=42, stratify=labels
    )
    print(f"✓ Train: {len(X_train)} samples | Test: {len(X_test)} samples")

    # Build pipeline
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(
            max_features=2000,
            ngram_range=(1, 2),      # Unigrams + Bigrams
            min_df=2,                 # Minimum document frequency
            max_df=0.95,              # Maximum document frequency
            sublinear_tf=True,        # Apply sublinear TF scaling
            strip_accents='unicode',
        )),
        ('clf', MultinomialNB(alpha=0.1))  # Laplace smoothing
    ])

    # Train
    pipeline.fit(X_train, y_train)

    # Evaluate
    y_pred = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\n{'='*50}")
    print(f"  TEST ACCURACY: {accuracy:.4f} ({accuracy*100:.1f}%)")
    print(f"{'='*50}\n")

    # Cross-validation
    cv_scores = cross_val_score(pipeline, processed, labels, cv=5, scoring='accuracy')
    print(f"✓ 5-Fold Cross-Validation: {cv_scores.mean():.4f} (±{cv_scores.std():.4f})")
    print(f"  Fold scores: {[f'{s:.3f}' for s in cv_scores]}\n")

    # Classification Report
    print("Classification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    # Confusion Matrix
    labels_unique = sorted(set(labels))
    cm = confusion_matrix(y_test, y_pred, labels=labels_unique)
    print("Confusion Matrix:")
    print(f"{'':>15}", "  ".join(f"{l[:5]:>5}" for l in labels_unique))
    for i, row in enumerate(cm):
        print(f"{labels_unique[i]:>15}", "  ".join(f"{v:>5}" for v in row))
    print()

    return pipeline, accuracy


def export_model_weights(pipeline, output_path):
    """
    Export the trained model's weights to JSON for browser-side inference.

    Exports:
    - TF-IDF vocabulary (word → index mapping)
    - IDF weights (inverse document frequency for each term)
    - Naive Bayes log probabilities (class priors + feature log probabilities)
    - Category labels
    """
    tfidf = pipeline.named_steps['tfidf']
    clf = pipeline.named_steps['clf']

    # Extract TF-IDF components
    vocab = {k: int(v) for k, v in tfidf.vocabulary_.items()}  # word → index (convert np.int64)
    idf = [float(x) for x in tfidf.idf_]  # IDF weights

    # Extract Naive Bayes components
    class_log_prior = clf.class_log_prior_.tolist()   # log P(class)
    feature_log_prob = clf.feature_log_prob_.tolist()  # log P(word|class)
    classes = clf.classes_.tolist()                     # category labels

    model_data = {
        "model_type": "TF-IDF + Multinomial Naive Bayes",
        "vocabulary": vocab,
        "idf": idf,
        "classes": classes,
        "class_log_prior": class_log_prior,
        "feature_log_prob": feature_log_prob,
        "tfidf_params": {
            "max_features": tfidf.max_features,
            "ngram_range": list(tfidf.ngram_range),
            "sublinear_tf": tfidf.sublinear_tf,
        }
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(model_data, f)

    size_kb = len(json.dumps(model_data)) / 1024
    print(f"✓ Model weights exported to {output_path} ({size_kb:.0f} KB)")
    print(f"  Vocabulary size: {len(vocab)} terms")
    print(f"  Classes: {classes}")

    return model_data


def test_predictions(pipeline):
    """Test the model with example sentences."""
    test_cases = [
        "Spent 50 rupees for chocolate",
        "Paid 250 for petrol",
        "Electricity bill 1200",
        "Movie ticket 300",
        "Bought vegetables for 800 rupees",
        "Online course subscription 500",
        "Bought shirt for 1000",
        "Gym membership 2000",
        "Taxi fare was 150 rupees",
        "Bought rice and dal for 400",
    ]

    print("\n" + "="*60)
    print("  SAMPLE PREDICTIONS")
    print("="*60)
    for sentence in test_cases:
        processed = preprocess_text(sentence)
        prediction = pipeline.predict([processed])[0]
        proba = pipeline.predict_proba([processed])[0]
        confidence = max(proba)
        print(f"  \"{sentence}\"")
        print(f"    → {prediction.upper()} (confidence: {confidence:.1%})")
        print()


def main():
    print("\n" + "="*60)
    print("  VoiceSpend — ML Model Training Pipeline")
    print("  TF-IDF + Multinomial Naive Bayes Classifier")
    print("="*60 + "\n")

    # 1. Load dataset
    sentences, labels = load_dataset(DATASET_PATH)

    # Show class distribution
    from collections import Counter
    dist = Counter(labels)
    print("\nClass Distribution:")
    for cat in sorted(dist.keys()):
        bar = "█" * (dist[cat] // 10)
        print(f"  {cat:>15}: {dist[cat]:>4}  {bar}")
    print()

    # 2. Train model
    pipeline, accuracy = train_model(sentences, labels)

    # 3. Save pickle model
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(pipeline, f)
    print(f"✓ Pickle model saved to {MODEL_PATH}")

    # 4. Export weights for browser
    export_model_weights(pipeline, WEIGHTS_PATH)

    # 5. Test predictions
    test_predictions(pipeline)

    print("="*60)
    print(f"  ✅ Training complete! Accuracy: {accuracy*100:.1f}%")
    print(f"  📦 Model: {MODEL_PATH}")
    print(f"  🌐 Browser weights: {WEIGHTS_PATH}")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()

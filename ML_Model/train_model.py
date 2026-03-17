import json, pickle, re
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
from collections import Counter

BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / 'voice_expense_dataset.json'
WEIGHTS_PATH = BASE_DIR / 'ml_model_weights_v2.json'
PICKLE_PATH = BASE_DIR / 'expense_classifier.pkl'
CATEGORIES = ["food","transport","shopping","bills","entertainment","health","groceries","education"]

with open(DATASET_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total entries: {len(data)}")

sentences  = [d['sentence'] for d in data]
categories = [d['category'] for d in data]
pay_labels = [d['payment_method'] if d['payment_method'] else 'Unknown' for d in data]

def preprocess(text):
    text = text.lower()
    text = re.sub(r'[₹$]', '', text)
    text = re.sub(r'\b\d+[\d,]*\.?\d*\b', ' NUM ', text)
    return re.sub(r'\s+', ' ', text).strip()

processed = [preprocess(s) for s in sentences]

# ── CATEGORY MODEL (unchanged architecture) ──────────────────────────
print("\n=== Category Classifier ===")
X_tr, X_te, y_tr, y_te = train_test_split(processed, categories, test_size=0.2, random_state=42, stratify=categories)

cat_pipe = Pipeline([
    ('tfidf', TfidfVectorizer(max_features=2000, ngram_range=(1,2), min_df=2, max_df=0.95, sublinear_tf=True, strip_accents='unicode')),
    ('clf',   MultinomialNB(alpha=0.1))
])
cat_pipe.fit(X_tr, y_tr)
y_pred = cat_pipe.predict(X_te)
print(f"Test Accuracy : {accuracy_score(y_te, y_pred):.4f}")
cv = cross_val_score(cat_pipe, processed, categories, cv=5)
print(f"CV  Accuracy  : {cv.mean():.4f} +/- {cv.std():.4f}")
print(classification_report(y_te, y_pred, zero_division=0))

# ── PAYMENT METHOD MODEL ──────────────────────────────────────────────
print("\n=== Payment Method Classifier ===")
# Only train on entries that HAVE a payment method label
pm_mask = [i for i,d in enumerate(data) if d['payment_method'] is not None]
pm_sents = [processed[i] for i in pm_mask]
pm_labs   = [pay_labels[i] for i in pm_mask]

print("Label distribution:", Counter(pm_labs))

X_tr2, X_te2, y_tr2, y_te2 = train_test_split(pm_sents, pm_labs, test_size=0.2, random_state=42, stratify=pm_labs)

pm_pipe = Pipeline([
    ('tfidf', TfidfVectorizer(max_features=3000, ngram_range=(1,3), min_df=1, sublinear_tf=True, strip_accents='unicode')),
    ('clf',   LogisticRegression(max_iter=500, C=5.0))
])
pm_pipe.fit(X_tr2, y_tr2)
y_pred2 = pm_pipe.predict(X_te2)
print(f"Test Accuracy : {accuracy_score(y_te2, y_pred2):.4f}")
cv2 = cross_val_score(pm_pipe, pm_sents, pm_labs, cv=5)
print(f"CV  Accuracy  : {cv2.mean():.4f} +/- {cv2.std():.4f}")
print(classification_report(y_te2, y_pred2, zero_division=0))

# ── EXPORT JSON WEIGHTS (browser-compatible) ─────────────────────────
def export_weights(cat_pipeline, pm_pipeline, out_path):
    # Category model weights
    tfidf_cat = cat_pipeline.named_steps['tfidf']
    clf_cat   = cat_pipeline.named_steps['clf']

    # Payment model weights
    tfidf_pm  = pm_pipeline.named_steps['tfidf']
    clf_pm    = pm_pipeline.named_steps['clf']

    model_data = {
        # ── Category model (existing structure, unchanged) ──
        "model_type"      : "TF-IDF + Multinomial Naive Bayes",
        "vocabulary"      : {k: int(v) for k, v in tfidf_cat.vocabulary_.items()},
        "idf"             : [float(x) for x in tfidf_cat.idf_],
        "classes"         : clf_cat.classes_.tolist(),
        "class_log_prior" : clf_cat.class_log_prior_.tolist(),
        "feature_log_prob": clf_cat.feature_log_prob_.tolist(),
        "tfidf_params"    : {
            "max_features": tfidf_cat.max_features,
            "ngram_range" : list(tfidf_cat.ngram_range),
            "sublinear_tf": tfidf_cat.sublinear_tf,
        },
        # ── Payment method model (new) ──
        "pm_model_type"      : "TF-IDF + Logistic Regression",
        "pm_vocabulary"      : {k: int(v) for k, v in tfidf_pm.vocabulary_.items()},
        "pm_idf"             : [float(x) for x in tfidf_pm.idf_],
        "pm_classes"         : clf_pm.classes_.tolist(),
        "pm_coef"            : clf_pm.coef_.tolist(),
        "pm_intercept"       : clf_pm.intercept_.tolist(),
        "pm_tfidf_params"    : {
            "max_features": tfidf_pm.max_features,
            "ngram_range" : list(tfidf_pm.ngram_range),
            "sublinear_tf": tfidf_pm.sublinear_tf,
        },
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(model_data, f)

    size_kb = len(json.dumps(model_data)) / 1024
    print(f"\nWeights exported to {out_path} ({size_kb:.0f} KB)")
    print(f"   Category vocab  : {len(model_data['vocabulary'])} terms | classes: {model_data['classes']}")
    print(f"   Payment vocab   : {len(model_data['pm_vocabulary'])} terms | classes: {model_data['pm_classes']}")
    return model_data

weights = export_weights(cat_pipe, pm_pipe, WEIGHTS_PATH)

# ── SAVE PICKLE ───────────────────────────────────────────────────────
with open(PICKLE_PATH, 'wb') as f:
    pickle.dump({'category': cat_pipe, 'payment': pm_pipe}, f)
print(f"Pickle saved to {PICKLE_PATH}")

# ── DEMO PREDICTIONS ─────────────────────────────────────────────────
print("\n=== Demo Predictions ===")

def predict(text):
    p = preprocess(text)
    cat = cat_pipe.predict([p])[0]
    pm  = pm_pipe.predict([p])[0]
    nums = re.findall(r'\b(\d{2,5})\b', text)
    amt = int(nums[0]) if nums else 0
    return {'amount': amt, 'category': cat, 'payment': pm}

tests = [
    "paid 500 rupees for pizza via UPI",
    "bought petrol for 100 using GPay",
    "spent 200 on lunch with cash",
    "paid 1500 for groceries via PhonePe",
    "paid 340 for petrol by debit card",
    "got internet bill for 930 using credit card",
    "I paid 720 for momos via Paytm",
    "paid 200 for coffee by card",
    "used Navi to pay 500 for dinner",
    "paid 800 for shoes in cash",
]
for t in tests:
    r = predict(t)
    print(f"  [{r['payment']:6}] [{r['category']:13}] Rs.{r['amount']:5} <- \"{t}\"")

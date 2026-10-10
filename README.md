# Spendly

AI-powered expense tracker where you log spending by voice or text, and a trained ML model automatically categorises it.

## Features

- **Voice & text entry** – say "spent 250 on pizza using UPI" and Spendly extracts the amount, category and payment method (Web Speech API).
- **ML categorisation** – a TF-IDF + Naive Bayes / Logistic Regression classifier (trained in `ML_Model/train_model.py`) sorts expenses into food, transport, shopping, bills, entertainment, health, groceries and education.
- **Dashboard & charts** – today / month / all-time totals, average per day, and pie, bar and line charts (Chart.js).
- **Secure sign-in** – Firebase Authentication with email OTP verification sent through Brevo.
- **Cloud sync** – expenses stored per user in Firebase.
- **CSV export** of your expense history.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, vanilla JavaScript, Chart.js |
| Backend | Node.js, Express, Firebase Admin SDK |
| ML | Python, scikit-learn |
| Hosting / Auth / DB | Firebase |
| Email | Brevo |

## Project Structure

```
Spendly/
├── client/      # Frontend app (index.html, app.js, style.css)
├── server/      # Express API for OTP send / verify
├── ML_Model/    # Dataset and training script for the expense classifier
└── public/      # Firebase Hosting assets
```

## Getting Started

### Prerequisites
- Node.js 18+
- A Firebase project (Authentication + Firestore)
- A Brevo account and API key (for OTP emails)
- Python 3 with scikit-learn (only to retrain the model)

### Setup

1. Clone the repo and install the server dependencies:
   ```bash
   npm run setup
   ```
2. Copy `client/firebase-config.example.js` to `client/firebase-config.js` and add your Firebase web config.
3. Download a service account key from Firebase Console → Project Settings → Service Accounts and save it as `server/serviceAccountKey.json`.
4. Create `server/.env`:
   ```
   BREVO_API_KEY=your_brevo_key
   EMAIL_FROM=you@example.com
   EMAIL_FROM_NAME=Spendly
   ```
5. Start the server and client together:
   ```bash
   npm run dev
   ```
   The client runs at `http://localhost:8000`.

### Retrain the model (optional)

```bash
cd ML_Model
python train_model.py
```

### Deploy

```bash
npm run deploy
```

> Never commit `serviceAccountKey.json`, `server/.env` or `client/firebase-config.js`.

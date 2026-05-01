# Spendly — AI-Powered Expense Tracker

Spendly is an intelligent, end-to-end expense tracking system that allows users to record daily expenses using natural voice commands or text. Instead of manually filling out forms, you simply speak (e.g., "Spent 120 rupees for pizza via UPI"), and the system automatically extracts the amount, item, payment method, and categorizes it using machine learning.

![Spendly](https://img.shields.io/badge/Spendly-AI_Expense_Tracker-4ecdc4?style=for-the-badge)

## 🌟 Features

*   **🎤 Voice Input:** Speak naturally. Uses the Web Speech API to transcribe audio in real-time.
*   **🧠 NLP & Entity Extraction:** Extracts the expense amount, item, and context from natural language.
*   **🏷️ Smart ML Classification:** Uses a trained Machine Learning model (TF-IDF + Multinomial Naive Bayes) to map items to categories (Food, Transport, Bills, etc.).
*   **💳 Payment Method Detection:** Secondary ML model (Logistic Regression) identifies how you paid (Cash, UPI, Card, etc.).
*   **📊 Live Dashboard:** Real-time analytics using Chart.js, showing category breakdowns, daily spending trends, and payment methods.
*   **🔐 Secure Authentication:** Firebase-powered passwordless OTP login via email (using Brevo API).
*   **💾 Persistent Storage:** Data is structured and saved, making it easily searchable and filterable.

## 🛠️ Tech Stack

### Frontend
*   HTML / CSS / JavaScript
*   [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) (Voice Recognition)
*   [Chart.js](https://www.chartjs.org/) (Data Visualization)

### Backend
*   [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/)
*   [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) (Authentication & Verification)
*   [Brevo API](https://www.brevo.com/) (Transactional Emails for OTP)

### Machine Learning
*   [Python](https://www.python.org/) & [scikit-learn](https://scikit-learn.org/) (Model Training)
*   **Models:** TF-IDF Vectorization, Multinomial Naive Bayes (Category), Logistic Regression (Payment Method)
*   *Note: The trained Python models are exported to JSON weights for fast, lightweight client-side or server-side inference without needing a heavy Python backend to run.*

## 📂 Project Structure

```text
spendly-project/
├── ML_Model/                  # Python ML training scripts and dataset
│   ├── expense_classifier.pkl     # Trained models (Pickle)
│   ├── ml_model_weights_v2.json   # Exported JSON weights for JS integration
│   ├── train_model.py             # Script to train and evaluate models
│   └── voice_expense_dataset.json # Custom training dataset
├── client/                    # Frontend application
│   ├── app.js                     # Main client logic (Speech, UI, Charts)
│   ├── firebase-config.example.js # Firebase setup template
│   ├── index.html                 # UI layout
│   ├── ml_model_weights.json      # ML weights utilized by frontend
│   └── style.css                  # Styling
├── server/                    # Node.js backend
│   ├── package.json
│   └── server.js                  # Express server for Auth & OTP handling
├── package.json               # Root package to manage concurrent running
└── README.md                  # This file
```

## 🚀 Setup & Installation

### Prerequisites
*   [Node.js](https://nodejs.org/) installed
*   A [Firebase](https://firebase.google.com/) Project
*   A [Brevo](https://www.brevo.com/) Account (for sending OTP emails)

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd spendly-project
```

### 2. Install Dependencies
Run the setup script from the root directory to install server dependencies:
```bash
npm run setup
```
*(Alternatively, cd into `server` and run `npm install`)*

Install the root dev dependencies (like concurrently):
```bash
npm install
```

### 3. Environment Configuration

**Server Environment (`server/.env`):**
Create a `.env` file in the `server` directory:
```env
PORT=3000
BREVO_API_KEY=your_brevo_api_key_here
EMAIL_FROM=your_verified_sender@example.com
EMAIL_FROM_NAME=Spendly
```

**Firebase Admin Credentials (`server/serviceAccountKey.json`):**
1. Go to Firebase Console > Project Settings > Service Accounts.
2. Click "Generate new private key".
3. Save the downloaded JSON file as `server/serviceAccountKey.json`.

**Client Firebase Config (`client/firebase-config.js`):**
Copy `client/firebase-config.example.js` to `client/firebase-config.js` and fill in your Firebase project credentials.

### 4. Running the Application

From the root directory, run the development script to start both the Node server and the frontend client simultaneously:

```bash
npm run dev
```

*   **Frontend:** `http://127.0.0.1:8000`
*   **Backend Server:** `http://localhost:3000`

## 🧠 Retraining the ML Model (Optional)

If you wish to add new categories or payment methods, you can update the dataset and retrain the models.

1. Ensure you have Python installed.
2. Install dependencies: `pip install scikit-learn numpy`
3. Add data to `ML_Model/voice_expense_dataset.json`
4. Run the training script:
   ```bash
   cd ML_Model
   python train_model.py
   ```
5. This will generate a new `ml_model_weights_v2.json`. Copy this to `client/ml_model_weights.json` to update the frontend's inference engine.

## 📜 License
This project is for educational and portfolio purposes.

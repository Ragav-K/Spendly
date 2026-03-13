import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendEmailVerification, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// PRODUCTION CONFIG
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://spendly-jy23.onrender.com';


// Global variable for current user
let currentUser = null;

// Make global functions available since type="module" scopes them locally
window.showPage = showPage;
window.toggleMobileNav = toggleMobileNav;
window.closeMobileNav = closeMobileNav;
window.toggleRecording = toggleRecording;
window.submitTranscript = submitTranscript;
window.submitManual = submitManual;
window.setExample = setExample;
window.setFilter = setFilter;
window.exportCSV = exportCSV;
window.handleHeroMicClick = handleHeroMicClick;

window.switchAuthTab = undefined; // Deleted
window.checkEmailVerified = checkEmailVerified;

// ─── AUTHENTICATION LOGIC ───
let isSignupMode = false;

window.toggleAuthMode = function () {
  isSignupMode = !isSignupMode;
  document.getElementById('authTitle').textContent = isSignupMode ? 'Create Account' : 'Welcome Back';
  document.getElementById('authSub').textContent = isSignupMode ? 'Sign up to start tracking expenses securely.' : 'Sign in to sync your expenses securely.';
  document.getElementById('authSendCodeBtn').textContent = isSignupMode ? 'Send Code' : 'Sign In';
  document.getElementById('authToggleText').textContent = isSignupMode ? "Already have an account? " : "Don't have an account? ";
  document.getElementById('authToggleBtn').textContent = isSignupMode ? 'Sign In' : 'Sign Up';
  document.getElementById('authErrorEmail').textContent = '';

  const signupFields = document.querySelectorAll('.signup-only');
  signupFields.forEach(el => el.style.display = isSignupMode ? 'block' : 'none');

  if (document.getElementById('authName')) document.getElementById('authName').value = '';
  if (document.getElementById('authConfirmPassword')) document.getElementById('authConfirmPassword').value = '';
  document.getElementById('authPassword').value = '';
};

window.handleSendCode = async function () {
  const name = document.getElementById('authName').value.trim();
  const email = document.getElementById('authEmail').value.trim();
  const pwd = document.getElementById('authPassword').value;
  const pwdConfirm = document.getElementById('authConfirmPassword').value;
  const errBox = document.getElementById('authErrorEmail');
  errBox.textContent = '';

  if (isSignupMode) {
    if (!name || !email || !pwd || !pwdConfirm) {
      errBox.textContent = 'Please fill out all fields.'; return;
    }
    if (pwd !== pwdConfirm) {
      errBox.textContent = 'Passwords do not match.'; return;
    }
  } else {
    if (!email || !pwd) {
      errBox.textContent = 'Please enter email and password.'; return;
    }
  }

  document.getElementById('authSendCodeBtn').disabled = true;
  document.getElementById('authSendCodeBtn').textContent = 'Processing...';

  try {
    if (isSignupMode) {
      const userCred = await createUserWithEmailAndPassword(auth, email, pwd);
      await updateProfile(userCred.user, { displayName: name });
    } else {
      await signInWithEmailAndPassword(auth, email, pwd);
    }
    // onAuthStateChanged will handle the rest (sending OTP if not verified)
  } catch (error) {
    errBox.textContent = error.message.replace('Firebase:', '').trim();
    document.getElementById('authSendCodeBtn').disabled = false;
    document.getElementById('authSendCodeBtn').textContent = isSignupMode ? 'Send Code' : 'Sign In';
  }
};

window.handleVerifyOTP = async function () {
  const otp = document.getElementById('authOTP').value.trim();
  const errBox = document.getElementById('authErrorOTP');
  errBox.textContent = '';

  if (otp.length !== 6) {
    errBox.textContent = 'Please enter 6-digit code.'; return;
  }

  document.getElementById('authVerifyBtn').disabled = true;
  document.getElementById('authVerifyBtn').textContent = 'Verifying...';

  try {
    const idToken = await auth.currentUser.getIdToken();
    const resp = await fetch(`${BACKEND_URL}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, otp })
    });
    const result = await resp.json();

    if (result.success) {
      await auth.currentUser.reload();
      window.location.reload();
    } else {
      throw new Error(result.error || 'Verification failed');
    }
  } catch (error) {
    errBox.textContent = error.message;
    document.getElementById('authVerifyBtn').disabled = false;
    document.getElementById('authVerifyBtn').textContent = 'Verify Code';
  }
};

window.resetAuthForm = function () {
  signOut(auth).then(() => {
    window.location.reload();
  });
};

async function checkEmailVerified() {
  if (auth.currentUser) {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      window.location.reload();
    } else {
      alert('Email not verified yet. Please check your inbox or spam folder.');
    }
  }
}

window.handleLogout = function () {
  signOut(auth);
};

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    if (!user.emailVerified) {
      // Block entry, show OTP screen
      document.getElementById('authFormEmail').style.display = 'none';
      document.getElementById('authFormOTP').style.display = 'block';

      // Trigger backend to send OTP
      try {
        const idToken = await user.getIdToken();
        await fetch(`${BACKEND_URL}/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        console.log('OTP request sent to backend');
      } catch (e) {
        console.error('Error triggering OTP:', e);
        document.getElementById('authErrorOTP').textContent = 'Could not send OTP. Backend offline?';
      }
      return;
    }

    // Logged in securely
    currentUser = user;
    document.getElementById('authOverlay').classList.remove('active');
    document.getElementById('appWrapper').style.display = 'block';

    // Setup Logout button in Desktop and Mobile Nav if not exists
    if (!document.getElementById('deskLogoutBtn')) {
      const deskNav = document.querySelector('.nav-links');
      deskNav.insertAdjacentHTML('beforeend', `<button id="deskLogoutBtn" class="nav-link" onclick="handleLogout()" style="color:#ff6b8a">Logout</button>`);

      const mobNav = document.getElementById('mobileNav');
      mobNav.insertAdjacentHTML('beforeend', `<button id="mobLogoutBtn" class="mob-link" onclick="handleLogout();closeMobileNav()" style="color:#ff6b8a">🚪 Logout</button>`);
    }

    // Setup Firestore Real-time Listener for user's expenses
    const q = query(collection(db, 'users', user.uid, 'expenses'), orderBy('id', 'desc'));
    window.expensesUnsubscribe = onSnapshot(q, (snapshot) => {
      expenses = snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() }));
      // Auto-update UI on any database change
      if (document.getElementById('page-dashboard').classList.contains('active') || document.getElementById('page-home').classList.contains('active')) renderDashboard();
      if (document.getElementById('page-history').classList.contains('active')) renderHistory();
    });

  } else {
    // Logged out
    currentUser = null;
    if (window.expensesUnsubscribe) { window.expensesUnsubscribe(); window.expensesUnsubscribe = null; }
    expenses = []; // clear local memory of data

    document.getElementById('authOverlay').classList.add('active');
    document.getElementById('appWrapper').style.display = 'none';

    // Reset Auth UI state
    document.getElementById('authSendCodeBtn').disabled = false;
    document.getElementById('authSendCodeBtn').textContent = isSignupMode ? 'Send Code' : 'Sign In';
    document.getElementById('authErrorEmail').textContent = '';
    document.getElementById('authPassword').value = '';

    document.getElementById('authFormEmail').style.display = 'flex';
    document.getElementById('authFormOTP').style.display = 'none';

    // Remove Logout buttons
    const dBtn = document.getElementById('deskLogoutBtn');
    const mBtn = document.getElementById('mobLogoutBtn');
    if (dBtn) dBtn.remove();
    if (mBtn) mBtn.remove();
  }
});

// ─── STATE ───
const CATEGORIES = {
  Food: { icon: '🍽️', color: '#ff8c69' },
  Transport: { icon: '🚗', color: '#4ecdc4' },
  Shopping: { icon: '🛍️', color: '#c084fc' },
  Bills: { icon: '⚡', color: '#fbbf24' },
  Entertainment: { icon: '🎬', color: '#f472b6' },
  Health: { icon: '💊', color: '#34d399' },
  Groceries: { icon: '🥬', color: '#22c55e' },
  Education: { icon: '📚', color: '#818cf8' },
  Others: { icon: '📦', color: '#94a3b8' },
};

const PAYMENT_METHODS = {
  UPI: { icon: '📱', color: '#a78bfa', keywords: ['upi', 'gpay', 'google pay', 'phonepe', 'phone pe', 'paytm', 'bhim', 'navi', 'shampay', 'mobikwik', 'freecharge', 'airtel money', 'jio money', 'amazon pay', 'whatsapp pay', 'slice', 'cred'] },
  Cash: { icon: '💵', color: '#ff8c69', keywords: ['cash', 'physical money', 'hard cash', 'notes', 'in cash'] },
  Card: { icon: '💳', color: '#6ee7ff', keywords: ['card', 'credit card', 'debit card', 'visa', 'mastercard', 'rupay', 'pos', 'swipe', 'credit', 'debit'] },
};

let expenses = []; // Now populated by Firestore
let activeFilter = 'All';
let isRecording = false;
let recognition = null;
let currentTranscript = '';
let pieChartInst = null, barChartInst = null, lineChartInst = null, paymentChartInst = null;
let itemCategoryMap = {};

// ─── NAVIGATION ───
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    if (l.textContent.toLowerCase().includes(name === 'home' ? 'home' : name === 'add' ? 'add' : name === 'dashboard' ? 'dash' : name === 'history' ? 'hist' : 'about')) {
      l.classList.add('active');
    }
  });
  window.scrollTo(0, 0);
  if (name === 'dashboard') renderDashboard();
  if (name === 'history') renderHistory();
}

// Fix nav active state more precisely
document.querySelectorAll('.nav-link').forEach(btn => {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});

// ─── VOICE RECORDING ───
function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

function handleHeroMicClick() {
  showPage('add');
  setTimeout(() => {
    startRecording();
  }, 300); // Small delay to ensure the UI has transitioned
}

function startRecording() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('micStatus').textContent = 'NOT SUPPORTED — USE TEXT INPUT';
    return;
  }
  recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';
  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('micBtn').className = 'mic-btn recording';
    document.getElementById('micBtn').textContent = '⏹';
    document.getElementById('micStatus').textContent = '🔴 LISTENING…';
    document.getElementById('micStatus').classList.add('recording');
    document.getElementById('recorderCard').classList.add('recording');
    document.getElementById('ring1').classList.add('active');
    document.getElementById('ring2').classList.add('active');
    document.getElementById('transcriptBox').className = 'transcript-box';
    document.getElementById('transcriptBox').textContent = 'Listening…';
  };
  recognition.onresult = (e) => {
    const t = Array.from(e.results).map(r => r[0].transcript).join('');
    currentTranscript = t;
    document.getElementById('transcriptBox').textContent = '"' + t + '"';
  };
  recognition.onend = () => {
    isRecording = false;
    document.getElementById('micBtn').className = 'mic-btn idle';
    document.getElementById('micBtn').textContent = '🎙️';
    document.getElementById('micStatus').textContent = 'TAP TO RECORD';
    document.getElementById('micStatus').classList.remove('recording');
    document.getElementById('recorderCard').classList.remove('recording');
    document.getElementById('ring1').classList.remove('active');
    document.getElementById('ring2').classList.remove('active');
    if (currentTranscript) {
      document.getElementById('submitVoiceBtn').style.display = 'block';
    }
  };
  recognition.start();
}

function stopRecording() {
  recognition && recognition.stop();
}

function submitTranscript() {
  if (currentTranscript) processText(currentTranscript);
}

function setExample(el) {
  document.getElementById('manualInput').value = el.textContent;
  document.getElementById('manualInput').focus();
}

function submitManual() {
  const val = document.getElementById('manualInput').value.trim();
  if (!val) return;
  processText(val);
}

// ─── ML MODEL + NLP PARSER ───
let mlModel = null; // loaded model weights
const CAT_MAP = {
  food: 'Food', transport: 'Transport', shopping: 'Shopping', bills: 'Bills',
  entertainment: 'Entertainment', health: 'Health', groceries: 'Groceries',
  education: 'Education', others: 'Others'
};
const RULES = {
  Food: ['pizza', 'burger', 'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'biryani', 'samosa', 'dosa', 'idli', 'momos', 'rolls', 'sandwich', 'sweets', 'chocolate', 'snack', 'meal', 'food', 'restaurant', 'zomato', 'swiggy', 'ice cream', 'juice', 'cake', 'noodles', 'chicken', 'paneer', 'poha'],
  Transport: ['uber', 'ola', 'taxi', 'cab', 'bus', 'train', 'metro', 'petrol', 'diesel', 'fuel', 'auto', 'rickshaw', 'parking', 'toll', 'rapido', 'fare', 'ride', 'car wash', 'ferry', 'flight'],
  Shopping: ['shirt', 'shoes', 'jeans', 'dress', 'clothing', 'amazon', 'flipkart', 'watch', 'bag', 'wallet', 'jacket', 'saree', 'sandals', 'belt', 'towel', 'bedsheet', 'umbrella', 'mobile cover', 'pen', 't-shirt', 'kurta', 'socks'],
  Bills: ['electricity', 'electric', 'water bill', 'phone bill', 'mobile recharge', 'internet', 'wifi', 'broadband', 'gas bill', 'rent', 'emi', 'insurance', 'dth', 'recharge', 'premium'],
  Entertainment: ['movie', 'netflix', 'spotify', 'hotstar', 'game', 'gaming', 'concert', 'show', 'theatre', 'magazine', 'prime', 'subscription', 'ott', 'zoo', 'museum', 'escape room', 'cricket', 'book'],
  Health: ['doctor', 'medicine', 'hospital', 'pharmacy', 'gym', 'fitness', 'yoga', 'vitamin', 'protein', 'supplement', 'checkup', 'eye drop', 'physiotherapy', 'first aid', 'health'],
  Groceries: ['vegetables', 'fruits', 'milk', 'rice', 'oil', 'sugar', 'flour', 'atta', 'dal', 'pulses', 'spices', 'eggs', 'grocery', 'groceries', 'curd', 'tea leaves'],
  Education: ['tuition', 'course', 'coaching', 'exam', 'fee', 'stationery', 'notebook', 'pen drive', 'printer', 'art supplies', 'drawing kit', 'lab fee', 'workshop', 'online course', 'textbook']
};
const STOP_WORDS = /\b(spent|paid|bought|purchased|added|charged|used|got|picked|saving|noted|record|log|add|entering|track|debited|made|approximately|around|about|worth|just|the|for|on|at|of|towards|an?|was|is|expense|payment|my|i|it|bucks?|rupees?|rs\.?|inr|up|getting|some|being|cost|price|total|amount|₹|in|using|by|with|via|through|from)\b/gi;

// ─── ML INFERENCE ENGINE (TF-IDF + Naive Bayes in browser) ───
function mlPreprocessText(text) {
  text = text.toLowerCase();
  text = text.replace(/[₹$]/g, '');
  text = text.replace(/\b\d+[\d,]*\.?\d*\b/g, ' NUM ');
  return text.replace(/\s+/g, ' ').trim();
}

function generateNgrams(tokens, n) {
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function mlClassify(text) {
  if (!mlModel) return null;
  const processed = mlPreprocessText(text);
  const tokens = processed.split(/\s+/);
  // Generate unigrams + bigrams (matching training config)
  const features = [...generateNgrams(tokens, 1), ...generateNgrams(tokens, 2)];

  // Build TF-IDF vector
  const vocab = mlModel.vocabulary;
  const idf = mlModel.idf;
  const vecSize = idf.length;
  const tf = new Float64Array(vecSize);

  // Count term frequencies
  for (const term of features) {
    if (vocab[term] !== undefined) {
      tf[vocab[term]]++;
    }
  }

  // Apply sublinear TF: tf = 1 + log(tf) if tf > 0
  if (mlModel.tfidf_params.sublinear_tf) {
    for (let i = 0; i < vecSize; i++) {
      if (tf[i] > 0) tf[i] = 1 + Math.log(tf[i]);
    }
  }

  // Multiply by IDF
  for (let i = 0; i < vecSize; i++) tf[i] *= idf[i];

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < vecSize; i++) norm += tf[i] * tf[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vecSize; i++) tf[i] /= norm;

  // Naive Bayes: log P(class|features) = log P(class) + Σ feature * log P(word|class)
  const classes = mlModel.classes;
  const logPriors = mlModel.class_log_prior;
  const logProbs = mlModel.feature_log_prob;
  const scores = new Array(classes.length);

  for (let c = 0; c < classes.length; c++) {
    let score = logPriors[c];
    for (let i = 0; i < vecSize; i++) {
      if (tf[i] > 0) score += tf[i] * logProbs[c][i];
    }
    scores[c] = score;
  }

  // Softmax to get probabilities
  const maxScore = Math.max(...scores);
  const expScores = scores.map(s => Math.exp(s - maxScore));
  const sumExp = expScores.reduce((a, b) => a + b, 0);
  const probs = expScores.map(e => e / sumExp);

  const bestIdx = probs.indexOf(Math.max(...probs));
  return {
    category: CAT_MAP[classes[bestIdx]] || 'Others',
    confidence: probs[bestIdx],
    allProbs: Object.fromEntries(classes.map((c, i) => [c, probs[i]]))
  };
}

function detectPaymentMethod(text) {
  // 1. Try ML model first
  const mlResult = mlClassifyPayment(text);
  if (mlResult && mlResult.confidence > 0.6) {
    console.log('ML payment:', mlResult.method, (mlResult.confidence * 100).toFixed(1) + '%');
    return mlResult.method;
  }
  // 2. Keyword fallback — UPI checked first (most specific)
  const lower = text.toLowerCase();
  for (const [method, info] of Object.entries(PAYMENT_METHODS)) {
    if (info.keywords.some(kw => lower.includes(kw))) return method;
  }
  return 'Cash'; // Default
}

// ─── ML PAYMENT METHOD INFERENCE (TF-IDF + Logistic Regression) ───
function mlClassifyPayment(text) {
  if (!mlModel || !mlModel.pm_vocabulary) return null;
  const processed = mlPreprocessText(text);
  const tokens = processed.split(/\s+/);
  const features = [
    ...generateNgrams(tokens, 1),
    ...generateNgrams(tokens, 2),
    ...generateNgrams(tokens, 3),
  ];

  const vocab = mlModel.pm_vocabulary;
  const idf = mlModel.pm_idf;
  const vecSize = idf.length;
  const tf = new Float64Array(vecSize);

  for (const term of features) {
    if (vocab[term] !== undefined) tf[vocab[term]]++;
  }
  if (mlModel.pm_tfidf_params.sublinear_tf) {
    for (let i = 0; i < vecSize; i++) {
      if (tf[i] > 0) tf[i] = 1 + Math.log(tf[i]);
    }
  }
  for (let i = 0; i < vecSize; i++) tf[i] *= idf[i];
  let norm = 0;
  for (let i = 0; i < vecSize; i++) norm += tf[i] * tf[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vecSize; i++) tf[i] /= norm;

  const classes = mlModel.pm_classes;
  const coef = mlModel.pm_coef;
  const intercept = mlModel.pm_intercept;
  const scores = classes.map((_, c) => {
    let s = intercept[c];
    for (let i = 0; i < vecSize; i++) if (tf[i] > 0) s += coef[c][i] * tf[i];
    return s;
  });

  const maxS = Math.max(...scores);
  const exps = scores.map(s => Math.exp(s - maxS));
  const sumE = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map(e => e / sumE);
  const bestIdx = probs.indexOf(Math.max(...probs));
  return { method: classes[bestIdx], confidence: probs[bestIdx] };
}

function parseExpenseLocal(text) {
  // 1. Extract amount
  let amount = 0;
  const nums = [];
  const patterns = [
    /(?:₹|rs\.?|rupees?)\s*(\d[\d,]*)/gi,
    /(\d[\d,]*)\s*(?:₹|rs\.?|rupees?|bucks)/gi,
    /\b(\d{2,}[\d,]*)\b/g
  ];
  for (const p of patterns) {
    let m; while ((m = p.exec(text)) !== null) nums.push(parseInt(m[1].replace(/,/g, '')));
  }
  if (nums.length > 0) amount = Math.max(...nums);

  // 2. Extract item name
  let clean = text.toLowerCase()
    .replace(/[₹]/g, '')
    .replace(STOP_WORDS, '')
    .replace(/\d[\d,]*/g, '')
    .replace(/\s+/g, ' ').trim();
  let item = clean || 'Expense';
  item = item.split(' ').filter(w => w.length > 0).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

  // 3. Classify category: Rules FIRST (Explicit Keywords), then MLFallback
  let category = 'Others', confidence = 0.5;
  const itemLower = item.toLowerCase();
  const textLower = text.toLowerCase();

  // Rule-based check (highest priority for explicit user intent)
  let ruleMatched = false;
  for (const [cat, kws] of Object.entries(RULES)) {
    if (kws.some(kw => itemLower === kw || textLower === kw || textLower.includes(" " + kw) || textLower.startsWith(kw))) {
      category = cat; confidence = 0.9;
      ruleMatched = true;
      console.log('Rule-based match:', category);
      break;
    }
  }

  if (!ruleMatched) {
    // Try ML model (trained Naive Bayes) as fallback
    const mlResult = mlClassify(text);
    if (mlResult && mlResult.confidence > 0.45) { // Increased threshold for accuracy
      category = mlResult.category;
      confidence = mlResult.confidence;
      console.log('ML classification:', category, (confidence * 100).toFixed(1) + '%');
    } else {
      // Final fuzzy rule check if ML is unsure
      for (const [cat, kws] of Object.entries(RULES)) {
        if (kws.some(kw => textLower.includes(kw))) {
          category = cat; confidence = 0.7; break;
        }
      }
    }
  }

  if (amount === 0) confidence = Math.max(0.3, confidence - 0.3);

  const paymentMethod = detectPaymentMethod(text);
  return { amount, item, category, paymentMethod, confidence: Math.round(confidence * 100) / 100 };
}

async function processText(text) {
  document.getElementById('processingIndicator').style.display = 'flex';
  document.getElementById('manualBtn').disabled = true;
  document.getElementById('submitVoiceBtn').style.display = 'none';
  document.getElementById('successCard').style.display = 'none';

  const parsed = parseExpenseLocal(text);
  const today = new Date().toISOString().split('T')[0];
  const expense = {
    id: Date.now(), amount: parsed.amount, item: parsed.item,
    category: parsed.category, paymentMethod: parsed.paymentMethod,
    date: today, voiceText: text, confidence: parsed.confidence
  };

  try {
    if (currentUser) {
      await addDoc(collection(db, 'users', currentUser.uid, 'expenses'), expense);
    }
  } catch (err) {
    console.error("Error adding to Firestore:", err);
  }

  const cat = CATEGORIES[expense.category] || CATEGORIES.Others;
  document.getElementById('successCard').innerHTML = `
      <div class="success-card">
        <div class="success-label">✅ Expense Added Successfully</div>
        <div class="success-grid">
          <div><div class="success-item-label">Amount</div><div class="success-item-val" style="color:#6ee7ff;font-family:'JetBrains Mono',monospace">₹${expense.amount.toLocaleString()}</div></div>
          <div><div class="success-item-label">Item</div><div class="success-item-val">${expense.item}</div></div>
          <div><div class="success-item-label">Category</div><div class="success-item-val">${cat.icon} ${expense.category}</div></div>
          <div><div class="success-item-label">Payment</div><div class="success-item-val">${PAYMENT_METHODS[expense.paymentMethod].icon} ${expense.paymentMethod}</div></div>
        </div>
        <div style="margin-top:14px;font-size:11px;color:#4a7a5a;font-family:'JetBrains Mono',monospace">AI CONFIDENCE: ${Math.round(expense.confidence * 100)}%</div>
      </div>`;
  document.getElementById('successCard').style.display = 'block';
  document.getElementById('manualInput').value = '';
  document.getElementById('transcriptBox').className = 'transcript-box empty';
  document.getElementById('transcriptBox').textContent = 'Your speech will appear here…';
  currentTranscript = '';
  document.getElementById('processingIndicator').style.display = 'none';
  document.getElementById('manualBtn').disabled = false;

}

// ─── DASHBOARD ───
function renderDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const monthStr = today.slice(0, 7);

  const totalToday = expenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
  const totalMonth = expenses.filter(e => e.date?.startsWith(monthStr)).reduce((s, e) => s + e.amount, 0);
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0);
  const avgPerDay = expenses.length > 0
    ? Math.round(totalAll / (new Set(expenses.map(e => e.date)).size || 1)) : 0;

  document.getElementById('statsGrid').innerHTML = [
    { label: 'Today', val: '₹' + totalToday.toLocaleString(), sub: expenses.filter(e => e.date === today).length + ' transactions', color: '#6ee7ff' },
    { label: 'This Month', val: '₹' + totalMonth.toLocaleString(), sub: new Date().toLocaleString('default', { month: 'long' }), color: '#a78bfa' },
    { label: 'All Time', val: '₹' + totalAll.toLocaleString(), sub: expenses.length + ' total records', color: '#7fff8c' },
    { label: 'Avg / Day', val: '₹' + avgPerDay.toLocaleString(), sub: 'across active days', color: '#ffd166' },
  ].map(s => `
    <div class="stat-card" style="--stat-color:${s.color}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-val">${s.val}</div>
      <div class="stat-sub">${s.sub}</div>
    </div>`).join('');

  renderCharts();
  renderMonthlyChart();
  renderPaymentChart();
  renderCatBars();
  renderRecentTxns();
}

function renderCharts() {
  // Pie chart
  const catTotals = Object.keys(CATEGORIES).map(cat => ({
    cat, total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
  })).filter(c => c.total > 0);

  const pieCtx = document.getElementById('pieChart').getContext('2d');
  if (pieChartInst) pieChartInst.destroy();

  if (catTotals.length > 0) {
    pieChartInst = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: catTotals.map(c => c.cat),
        datasets: [{
          data: catTotals.map(c => c.total),
          backgroundColor: catTotals.map(c => CATEGORIES[c.cat].color + 'cc'),
          borderColor: catTotals.map(c => CATEGORIES[c.cat].color),
          borderWidth: 2, hoverOffset: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 11 }, padding: 12, boxWidth: 10 } }
        },
        cutout: '68%',
      }
    });
  }

  // Bar chart — last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  const dayTotals = days.map(d => expenses.filter(e => e.date === d).reduce((s, e) => s + e.amount, 0));
  const labels = days.map(d => { const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en', { weekday: 'short' }); });

  const barCtx = document.getElementById('barChart').getContext('2d');
  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: dayTotals,
        backgroundColor: dayTotals.map((_, i) => i === 6 ? 'rgba(110,231,255,.8)' : 'rgba(110,231,255,.25)'),
        borderColor: 'rgba(110,231,255,.6)',
        borderWidth: 1, borderRadius: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#6666aa', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#6666aa', font: { size: 11 }, callback: v => '₹' + v } }
      }
    }
  });
}

function renderMonthlyChart() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en', { month: 'short', year: '2-digit' }) });
  }
  const monthTotals = months.map(m => expenses.filter(e => (e.date || '').startsWith(m.key)).reduce((s, e) => s + e.amount, 0));
  const lineCtx = document.getElementById('lineChart').getContext('2d');
  if (lineChartInst) lineChartInst.destroy();
  lineChartInst = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [{
        data: monthTotals,
        borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.1)',
        borderWidth: 2, fill: true, tension: .4,
        pointBackgroundColor: '#a78bfa', pointBorderColor: '#0d0d1a',
        pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#6666aa', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#6666aa', font: { size: 11 }, callback: v => '₹' + v } }
      }
    }
  });
}

function renderPaymentChart() {
  const payTotals = Object.keys(PAYMENT_METHODS).map(method => ({
    method, total: expenses.filter(e => (e.paymentMethod || 'Cash') === method).reduce((s, e) => s + e.amount, 0)
  })).filter(p => p.total > 0);

  const payCtx = document.getElementById('paymentChart')?.getContext('2d');
  if (!payCtx) return;
  if (paymentChartInst) paymentChartInst.destroy();

  paymentChartInst = new Chart(payCtx, {
    type: 'pie',
    data: {
      labels: payTotals.map(p => p.method),
      datasets: [{
        data: payTotals.map(p => p.total),
        backgroundColor: payTotals.map(p => PAYMENT_METHODS[p.method].color + 'cc'),
        borderColor: payTotals.map(p => PAYMENT_METHODS[p.method].color),
        borderWidth: 1
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8888aa', font: { size: 10 }, boxWidth: 8 } }
      }
    }
  });
}

function renderCatBars() {
  const grand = expenses.reduce((s, e) => s + e.amount, 0);
  const cats = Object.entries(CATEGORIES).map(([cat, info]) => ({
    cat, ...info,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
    count: expenses.filter(e => e.category === cat).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  if (cats.length === 0) {
    document.getElementById('catBarsContainer').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>No data yet</div>';
    return;
  }
  document.getElementById('catBarsContainer').innerHTML = cats.map(c => {
    const pct = grand > 0 ? (c.total / grand * 100) : 0;
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-header">
          <div class="cat-bar-name">${c.icon} ${c.cat} <span style="color:var(--muted2);font-weight:400;font-size:12px">(${c.count})</span></div>
          <div class="cat-bar-amount" style="color:${c.color}">₹${c.total.toLocaleString()}</div>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${c.color};box-shadow:0 0 8px ${c.color}60"></div>
        </div>
        <div class="cat-bar-pct">${pct.toFixed(1)}%</div>
      </div>`;
  }).join('');
}

function renderRecentTxns() {
  const container = document.getElementById('recentTxns');
  if (expenses.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎤</div>No expenses yet. Add your first one!</div>';
    return;
  }
  container.innerHTML = expenses.slice(0, 6).map(e => {
    const cat = CATEGORIES[e.category] || CATEGORIES.Others;
    const pay = PAYMENT_METHODS[e.paymentMethod || 'Cash'] || { icon: '🏷️' };
    return `
      <div class="txn-row">
        <div class="txn-icon">${cat.icon}</div>
        <div class="txn-info">
          <div class="txn-item">${e.item}</div>
          <div class="txn-meta">${e.date} &nbsp;·&nbsp; ${pay.icon} ${e.paymentMethod || 'Cash'}</div>
        </div>
        <span class="txn-badge" style="background:${cat.color}22;color:${cat.color}">${e.category}</span>
        <div class="txn-amount" style="color:${cat.color}">₹${e.amount.toLocaleString()}</div>
        <button class="txn-del" onclick="deleteExpense('${e.firebaseId}', 'dashboard')">✕</button>
      </div>`;
  }).join('');
}

// ─── HISTORY ───
function setFilter(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = btn.dataset.cat;
  renderHistory();
}

function renderHistory() {
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  let list = expenses;
  if (activeFilter !== 'All') list = list.filter(e => e.category === activeFilter);
  if (search) list = list.filter(e =>
    e.item.toLowerCase().includes(search) ||
    (e.voiceText || '').toLowerCase().includes(search) ||
    e.category.toLowerCase().includes(search)
  );

  const container = document.getElementById('historyList');
  if (list.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div>No matching expenses found</div>';
    return;
  }
  container.innerHTML = list.map(e => {
    const cat = CATEGORIES[e.category] || CATEGORIES.Others;
    const pay = PAYMENT_METHODS[e.paymentMethod || 'Cash'] || { icon: '🏷️' };
    const conf = e.confidence >= .9 ? '#34d399' : e.confidence >= .7 ? '#fbbf24' : '#ff6b8a';
    return `
      <div class="hist-row">
        <div style="font-size:22px">${cat.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="txn-item">${e.item}</div>
          <div class="hist-voice">"${e.voiceText || ''}"</div>
          <div style="font-size:10px;color:var(--muted2);margin-top:3px;font-family:'JetBrains Mono',monospace">
            ${e.date} &nbsp;·&nbsp; ${pay.icon} ${e.paymentMethod || 'Cash'} &nbsp;·&nbsp;
            <span class="confidence-dot" style="background:${conf}"></span>
            ${Math.round((e.confidence || .9) * 100)}% confidence
          </div>
        </div>
        <span class="txn-badge" style="background:${cat.color}22;color:${cat.color}">${e.category}</span>
        <div class="txn-amount" style="color:${cat.color}">₹${e.amount.toLocaleString()}</div>
        <button class="txn-del" onclick="deleteExpense('${e.firebaseId}','history')">✕</button>
      </div>`;
  }).join('');
}

window.deleteExpense = async function (firebaseId, page) {
  if (!currentUser || !firebaseId) return;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'expenses', firebaseId));
    // The onSnapshot listener will automatically fetch updated data and re-render
  } catch (err) {
    console.error("Error deleting expense:", err);
  }
}

// ─── CSV EXPORT ───
function exportCSV() {
  if (expenses.length === 0) return;
  const header = 'Date,Item,Category,Payment Method,Amount,Voice Text,Confidence';
  const rows = expenses.map(e =>
    `${e.date},"${(e.item || '').replace(/"/g, '""')}",${e.category},${e.paymentMethod || 'Cash'},${e.amount},"${(e.voiceText || '').replace(/"/g, '""')}",${e.confidence || ''}`
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'voicespend_expenses_' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── MOBILE NAV ───
function toggleMobileNav() {
  document.getElementById('mobileNav').classList.toggle('open');
}
function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
}

// ─── INIT ───
window.addEventListener('load', async () => {
  // Load trained ML model weights
  try {
    const resp = await fetch('ml_model_weights.json');
    mlModel = await resp.json();
    console.log('ML model loaded:', mlModel.model_type, '|', mlModel.classes.length, 'classes |', Object.keys(mlModel.vocabulary).length, 'features');
  } catch (e) {
    console.warn('ML model not available, using rule-based fallback');
  }

  // Load dataset for additional NLP lookup
  try {
    const resp = await fetch('voice_expense_dataset.json');
    const data = await resp.json();
    data.forEach(entry => {
      const item = entry.item.toLowerCase();
      const cat = CAT_MAP[entry.category.toLowerCase()] || 'Others';
      if (!itemCategoryMap[item]) itemCategoryMap[item] = {};
      itemCategoryMap[item][cat] = (itemCategoryMap[item][cat] || 0) + 1;
    });
    console.log('Dataset loaded:', Object.keys(itemCategoryMap).length, 'items');
  } catch (e) {
    console.warn('Dataset not available');
  }

  // Removed demo data seeding as per user request

});
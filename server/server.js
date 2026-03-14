const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin
// Make sure to download your serviceAccountKey.json from Firebase Console -> Project Settings -> Service Accounts
// and place it in this server folder.
try {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.warn('WARNING: serviceAccountKey.json not found. Firebase Admin is not initialized.');
}

const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;

if (brevoApiKey) {
  console.log('Brevo email client configured.');
} else {
  console.warn('WARNING: BREVO_API_KEY not found in .env. Email delivery will fail.');
}

// In-memory store for OTPs: { "user_uid": { otp: "123456", expiresAt: 1234567890 } }
// In a production app, store this in Firestore or Redis.
const otpStore = new Map();

function sendEmailWithBrevo({ to, subject, html }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      sender: {
        email: process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || 'Spendly'
      },
      to: [{ email: to }],
      subject,
      htmlContent: html
    });

    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      },
      (resp) => {
        let body = '';

        resp.on('data', (chunk) => {
          body += chunk;
        });

        resp.on('end', () => {
          const parsed = body ? JSON.parse(body) : {};

          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            resolve(parsed);
            return;
          }

          reject(new Error(parsed.message || `Brevo request failed with status ${resp.statusCode}`));
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * 1. POST /send-otp
 * Client sends their Firebase ID Token. We verify it to get their UID and Email.
 * Generate a 6-digit OTP, store it, and email it.
 */
app.post('/send-otp', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Missing idToken" });

    // Verify token to get user info secure from Client
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Generate 6 digit code
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store in memory (expires in 10 minutes)
    otpStore.set(uid, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send Email via Brevo
    if (!brevoApiKey || !process.env.EMAIL_FROM) {
      console.error('Email skipped: Brevo not configured correctly.');
      return res.status(500).json({ error: "Email service not configured." });
    }

    await sendEmailWithBrevo({
      to: email,
      subject: 'Your Spendly Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
          <h2>Secure Verification</h2>
          <p>Your 6-digit verification code is:</p>
          <h1 style="font-size: 40px; letter-spacing: 5px; color: #4ecdc4;">${otp}</h1>
          <p>This code will expire in 10 minutes. Do not share it with anyone.</p>
        </div>
      `
    });

    console.log(`OTP sent to ${email}`);

    res.json({ success: true, message: "OTP Sent successfully" });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 2. POST /verify-otp
 * Client sends ID Token and the OTP they typed.
 * We verify the OTP. If valid, we mark their Firebase profile as emailVerified = true.
 */
app.post('/verify-otp', async (req, res) => {
  try {
    const { idToken, otp } = req.body;
    if (!idToken || !otp) return res.status(400).json({ error: "Missing idToken or otp" });

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const record = otpStore.get(uid);

    if (!record) {
      return res.status(400).json({ error: "No OTP requested or OTP expired." });
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(uid);
      return res.status(400).json({ error: "OTP has expired." });
    }

    if (record.otp !== otp) {
      return res.status(400).json({ error: "Invalid OTP code." });
    }

    // Success! Update Firebase User to be verified
    await admin.auth().updateUser(uid, {
      emailVerified: true
    });

    // Clean up
    otpStore.delete(uid);

    console.log(`User ${uid} successfully verified their email with OTP.`);
    res.json({ success: true, message: "Email verified successfully" });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

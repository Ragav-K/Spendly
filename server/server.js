const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
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

// Nodemailer Transporter
// Use your Gmail and an App Password (not your real password)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// In-memory store for OTPs: { "user_uid": { otp: "123456", expiresAt: 1234567890 } }
// In a production app, store this in Firestore or Redis.
const otpStore = new Map();

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

    // Send Email
    const mailOptions = {
        from: `Spendly App <${process.env.EMAIL_USER}>`,
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
    };

    await transporter.sendMail(mailOptions);
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

# Unfold Backend API

Backend service for **Unfold** — Personalized digital greeting cards with UPI payment flow.

## Features
- **UPI-Only Payment Flow**: ₹19 fixed price order creation and signature verification.
- **UPI ID Integration**: Configured for `9336991973@ptaxis`.
- **Payment Verification**: Secure HMAC SHA256 signature verification.
- **Greeting Storage**: MongoDB persistence with resilient in-memory fallback.
- **Production-Ready**: Configured for deployment on Render.

## Environment Variables
Create a `.env` file based on `.env.example`:
```env
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-unfold-app.vercel.app
UPI_ID=9336991973@ptaxis
MONGODB_URI=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

## Running Locally
```bash
npm install
npm start
```
Server runs at `http://localhost:5000`
Health check at `http://localhost:5000/health`

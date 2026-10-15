# Unfold Backend API

Backend API service for **Unfold** — Personalized digital greeting cards with verified UPI payment.

## Security & Architecture
- **Payment Gateway**: Integrates server-side Razorpay order creation for strictly ₹19 INR.
- **Verification**: Cryptographic HMAC SHA256 signature verification and Razorpay payment status check.
- **Persistence**: MongoDB stores payment orders and verified greetings.
- **Zero Mock Policy**: Rejects mock or unverified payments in production.

## Environment Variables
Create a `.env` file from `.env.example`:
```env
PORT=5000
NODE_ENV=production
CLIENT_URL=https://unfold-navy-nine.vercel.app
UPI_ID=9336991973@ptaxis
MONGODB_URI=mongodb+srv://...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

## Running
```bash
npm install
npm start
```
Health Check: `http://localhost:5000/health`

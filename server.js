require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, isDBConnected } = require('./config/db');
const paymentRoutes = require('./routes/paymentRoutes');
const greetingRoutes = require('./routes/greetingRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// CORS configuration supporting local dev and Vercel deployments
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        process.env.NODE_ENV !== 'production'
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-razorpay-signature'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Transparent Health Check
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Unfold Backend API',
    status: 'online',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  const dbConnected = isDBConnected();
  const razorpayConfigured = Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  );

  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    database: {
      connected: dbConnected,
      status: dbConnected ? 'connected' : 'disconnected (requires MONGODB_URI in environment)',
    },
    paymentGateway: {
      provider: 'Razorpay (UPI)',
      configured: razorpayConfigured,
      status: razorpayConfigured ? 'ready' : 'pending RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET',
      merchantUpiId: process.env.UPI_ID || '9336991973@ptaxis',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.redirect('/health');
});

// API Routes
app.use('/api/payment', paymentRoutes);
app.use('/api/greetings', greetingRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handling
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Unfold Backend running on port ${PORT}`);
    console.log(`📡 Health check available at http://localhost:${PORT}/health`);
  });
}

module.exports = app;

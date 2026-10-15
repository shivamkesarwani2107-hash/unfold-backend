const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Greeting = require('../models/Greeting');
const { isDBConnected } = require('../config/db');

const FIXED_AMOUNT_INR = 19;
const FIXED_AMOUNT_PAISE = 1900; // strictly 19 INR in paise
const OFFICIAL_UPI_ID = process.env.UPI_ID || '9336991973@ptaxis';

// Helper to initialize Razorpay safely with strict validation
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (key_id && key_secret && key_id.trim() !== '' && key_secret.trim() !== '') {
    return new Razorpay({ key_id, key_secret });
  }
  return null;
};

/**
 * @desc Create genuine Razorpay payment order for strictly ₹19 INR
 * @route POST /api/payment/create-order
 */
exports.createOrder = async (req, res, next) => {
  try {
    // 1. Check Database connection
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        dbConnected: false,
        message:
          'Database not connected. MongoDB persistence is required to record payment orders and verify greetings.',
      });
    }

    // 2. Check Razorpay credentials
    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        gatewayConfigured: false,
        message:
          'Razorpay payment gateway is not configured. Active RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required to process payments.',
      });
    }

    // 3. Validate greeting input
    const { greeting } = req.body;
    if (!greeting || !greeting.recipient || !greeting.message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient name and personal message are required to create an order.',
      });
    }

    // 4. Create genuine order via Razorpay API
    const receipt = `unfold_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const options = {
      amount: FIXED_AMOUNT_PAISE,
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: {
        merchant_upi_id: OFFICIAL_UPI_ID,
        occasion: greeting.occasion || 'Personalized Greeting',
        recipient: greeting.recipient || 'Special Someone',
      },
    };

    const order = await razorpay.orders.create(options);

    // 5. Save order in MongoDB
    await Payment.create({
      orderId: order.id,
      amount: FIXED_AMOUNT_PAISE,
      currency: 'INR',
      status: 'created',
      upiId: OFFICIAL_UPI_ID,
      method: 'upi',
      greetingData: greeting,
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: FIXED_AMOUNT_INR,
      amountPaise: FIXED_AMOUNT_PAISE,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      upiId: OFFICIAL_UPI_ID,
      message: 'Genuine Razorpay payment order created successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Verify payment signature and capture status strictly on the backend
 * @route POST /api/payment/verify
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    // 1. Check Database connection
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        verified: false,
        message: 'Database not connected. Cannot verify or persist payment.',
      });
    }

    // 2. Check Razorpay credentials
    const razorpay = getRazorpayInstance();
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpay || !key_secret) {
      return res.status(503).json({
        success: false,
        verified: false,
        message: 'Razorpay payment gateway secret is not configured on the server.',
      });
    }

    const { orderId, paymentId, signature, greeting } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Missing required payment verification parameters (orderId, paymentId, signature).',
      });
    }

    // 3. Find order in MongoDB
    const paymentRecord = await Payment.findOne({ orderId });
    if (!paymentRecord) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Order ID not found in database.',
      });
    }

    // Prevent duplicate processing
    if (paymentRecord.status === 'verified' || paymentRecord.status === 'paid') {
      return res.status(200).json({
        success: true,
        verified: true,
        isPaid: true,
        orderId,
        paymentId: paymentRecord.paymentId,
        message: 'Payment already verified previously. Greeting download unlocked.',
      });
    }

    // 4. Verify cryptographic HMAC SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const providedBuffer = Buffer.from(signature, 'utf-8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Cryptographic signature mismatch. Payment verification failed.',
      });
    }

    // 5. Query Razorpay API directly to confirm genuine payment capture & amount
    const gatewayPayment = await razorpay.payments.fetch(paymentId);

    if (gatewayPayment.order_id !== orderId) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Payment record does not match the requested order ID.',
      });
    }

    if (gatewayPayment.amount !== FIXED_AMOUNT_PAISE || gatewayPayment.currency !== 'INR') {
      return res.status(400).json({
        success: false,
        verified: false,
        message: `Invalid payment amount received: ₹${gatewayPayment.amount / 100} ${gatewayPayment.currency}. Required: ₹${FIXED_AMOUNT_INR} INR.`,
      });
    }

    if (gatewayPayment.status !== 'captured' && gatewayPayment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        verified: false,
        message: `Payment status on gateway is '${gatewayPayment.status}'. Payment has not been captured.`,
      });
    }

    // 6. Mark payment as verified in MongoDB
    paymentRecord.paymentId = paymentId;
    paymentRecord.signature = signature;
    paymentRecord.status = 'verified';
    await paymentRecord.save();

    // 7. Save paid greeting in MongoDB
    if (greeting) {
      await Greeting.create({
        occasion: greeting.occasion || 'Personalized Greeting',
        relationship: greeting.relationship || 'Special Someone',
        recipient: greeting.recipient || 'Special Someone',
        sender: greeting.sender || 'You',
        age: greeting.age || '',
        category: greeting.category || '',
        decoration: greeting.decoration || {},
        message: greeting.message || '',
        photo: greeting.photo || '',
        orderId,
        paymentId,
        isPaid: true,
        amount: FIXED_AMOUNT_INR,
        currency: 'INR',
      });
    }

    return res.status(200).json({
      success: true,
      verified: true,
      isPaid: true,
      orderId,
      paymentId,
      amount: FIXED_AMOUNT_INR,
      message: 'Genuine payment verified by server! Greeting download unlocked.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get payment status strictly from MongoDB
 * @route GET /api/payment/status/:orderId
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected. Cannot check payment status.',
      });
    }

    const { orderId } = req.params;
    const payment = await Payment.findOne({ orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Order record not found.',
      });
    }

    return res.status(200).json({
      success: true,
      status: payment.status,
      isPaid: payment.status === 'verified' || payment.status === 'paid',
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      amount: payment.amount / 100,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Razorpay Webhook receiver
 * @route POST /api/payment/webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (!secret || !signature) {
      return res.status(400).json({ message: 'Missing webhook secret or signature.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: 'Invalid webhook signature.' });
    }

    const event = req.body.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = req.body.payload;
      const orderId = payload.payment?.entity?.order_id || payload.order?.entity?.id;
      const paymentId = payload.payment?.entity?.id;

      if (orderId && isDBConnected()) {
        await Payment.findOneAndUpdate(
          { orderId },
          { paymentId, status: 'verified' },
          { upsert: true }
        );
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ message: 'Webhook processing error.' });
  }
};

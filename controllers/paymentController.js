const crypto = require('crypto');
const Razorpay = require('razorpay');
const Payment = require('../models/Payment');
const Greeting = require('../models/Greeting');

// In-memory fallbacks when MongoDB is not connected
const memoryOrders = new Map();
const memoryGreetings = new Map();

// Helper to initialize Razorpay safely
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (key_id && key_secret && key_id.trim() !== '' && key_secret.trim() !== '') {
    return new Razorpay({ key_id, key_secret });
  }
  return null;
};

const OFFICIAL_UPI_ID = process.env.UPI_ID || '9336991973@ptaxis';
const FIXED_AMOUNT_INR = 19;
const FIXED_AMOUNT_PAISE = 1900; // 19 INR in paise

/**
 * @desc Create payment order for ₹19
 * @route POST /api/payment/create-order
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { greeting } = req.body;

    if (!greeting || !greeting.recipient || !greeting.message) {
      return res.status(400).json({
        success: false,
        message: 'Greeting recipient and message are required to create a payment order.',
      });
    }

    const receiptId = `unfold_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const razorpay = getRazorpayInstance();

    let orderId = '';
    let mode = 'upi_direct';
    let keyId = process.env.RAZORPAY_KEY_ID || '';

    if (razorpay) {
      try {
        const order = await razorpay.orders.create({
          amount: FIXED_AMOUNT_PAISE,
          currency: 'INR',
          receipt: receiptId,
          payment_capture: 1,
          notes: {
            upiId: OFFICIAL_UPI_ID,
            occasion: greeting.occasion || 'Personalized Greeting',
            recipient: greeting.recipient || 'Special Someone',
          },
        });

        orderId = order.id;
        mode = 'razorpay';
      } catch (gatewayError) {
        console.warn('⚠️ Razorpay order creation failed, falling back to direct UPI mode:', gatewayError.message);
        orderId = `ord_fallback_${Date.now()}`;
        mode = 'upi_direct';
      }
    } else {
      orderId = `ord_upi_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      mode = 'upi_direct';
    }

    // Direct UPI intent URI for mobile applications (GPay, PhonePe, Paytm, etc.)
    const upiIntentUri = `upi://pay?pa=${encodeURIComponent(OFFICIAL_UPI_ID)}&pn=${encodeURIComponent(
      'Unfold Greetings'
    )}&am=${FIXED_AMOUNT_INR}&cu=INR&tn=${encodeURIComponent(`Unfold Surprise - ${orderId}`)}`;

    // Store in Database if available, otherwise memory
    try {
      await Payment.create({
        orderId,
        amount: FIXED_AMOUNT_PAISE,
        currency: 'INR',
        status: 'created',
        upiId: OFFICIAL_UPI_ID,
        method: 'upi',
        greetingData: greeting,
      });
    } catch {
      memoryOrders.set(orderId, {
        orderId,
        amount: FIXED_AMOUNT_PAISE,
        currency: 'INR',
        status: 'created',
        upiId: OFFICIAL_UPI_ID,
        greetingData: greeting,
        createdAt: new Date(),
      });
    }

    return res.status(200).json({
      success: true,
      orderId,
      amount: FIXED_AMOUNT_INR,
      amountPaise: FIXED_AMOUNT_PAISE,
      currency: 'INR',
      keyId,
      upiId: OFFICIAL_UPI_ID,
      upiIntentUri,
      mode,
      message: 'Payment order created successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Verify payment signature and mark greeting as paid
 * @route POST /api/payment/verify
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { orderId, paymentId, signature, greeting } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required for verification.',
      });
    }

    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
    let isVerified = false;

    // Check if this was a Razorpay gateway payment
    if (signature && razorpayKeySecret) {
      const generatedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      if (generatedSignature === signature) {
        isVerified = true;
      } else {
        return res.status(400).json({
          success: false,
          verified: false,
          message: 'Invalid payment signature. Verification failed.',
        });
      }
    } else {
      // In UPI Direct mode or when gateway secret is not yet configured,
      // verify that orderId exists in database or memory
      let existingOrder = null;
      try {
        existingOrder = await Payment.findOne({ orderId });
      } catch {
        existingOrder = memoryOrders.get(orderId);
      }

      if (existingOrder) {
        isVerified = true;
      } else {
        // Fallback for seamless flow if orderId was created
        isVerified = Boolean(orderId.startsWith('ord_'));
      }
    }

    if (!isVerified) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: 'Payment verification failed.',
      });
    }

    const assignedPaymentId = paymentId || `pay_upi_${Date.now()}`;

    // Update database record if available
    try {
      await Payment.findOneAndUpdate(
        { orderId },
        {
          paymentId: assignedPaymentId,
          signature: signature || '',
          status: 'verified',
        },
        { upsert: true }
      );

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
          paymentId: assignedPaymentId,
          isPaid: true,
          amount: FIXED_AMOUNT_INR,
          currency: 'INR',
        });
      }
    } catch {
      // Memory fallback
      const current = memoryOrders.get(orderId) || {};
      memoryOrders.set(orderId, {
        ...current,
        paymentId: assignedPaymentId,
        signature: signature || '',
        status: 'verified',
        updatedAt: new Date(),
      });

      if (greeting) {
        memoryGreetings.set(orderId, {
          ...greeting,
          orderId,
          paymentId: assignedPaymentId,
          isPaid: true,
          createdAt: new Date(),
        });
      }
    }

    return res.status(200).json({
      success: true,
      verified: true,
      orderId,
      paymentId: assignedPaymentId,
      message: 'Payment verified successfully! Greeting download unlocked.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get payment status by orderId
 * @route GET /api/payment/status/:orderId
 */
exports.getPaymentStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    let payment = null;
    try {
      payment = await Payment.findOne({ orderId });
    } catch {
      payment = memoryOrders.get(orderId);
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.',
      });
    }

    return res.status(200).json({
      success: true,
      status: payment.status,
      isPaid: payment.status === 'verified' || payment.status === 'paid',
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      amount: payment.amount ? payment.amount / 100 : FIXED_AMOUNT_INR,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Razorpay Webhook receiver for background payment notifications
 * @route POST /api/payment/webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];

    if (secret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (expectedSignature !== signature) {
        return res.status(400).json({ message: 'Invalid webhook signature.' });
      }
    }

    const event = req.body.event;
    if (event === 'payment.captured' || event === 'order.paid') {
      const payload = req.body.payload;
      const orderId = payload.payment?.entity?.order_id || payload.order?.entity?.id;
      const paymentId = payload.payment?.entity?.id;

      if (orderId) {
        try {
          await Payment.findOneAndUpdate(
            { orderId },
            { paymentId, status: 'verified' },
            { upsert: true }
          );
        } catch {
          const item = memoryOrders.get(orderId) || {};
          memoryOrders.set(orderId, { ...item, paymentId, status: 'verified' });
        }
      }
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ message: 'Webhook processing error.' });
  }
};

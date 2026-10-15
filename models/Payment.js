const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentId: {
      type: String,
      default: '',
      index: true,
    },
    signature: {
      type: String,
      default: '',
    },
    amount: {
      type: Number,
      required: true,
      default: 1900, // paise (1900 paise = ₹19)
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'paid', 'verified', 'failed'],
      default: 'created',
      index: true,
    },
    method: {
      type: String,
      default: 'upi',
    },
    upiId: {
      type: String,
      default: '9336991973@ptaxis',
    },
    greetingId: {
      type: String,
      default: '',
    },
    greetingData: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Payment', paymentSchema);

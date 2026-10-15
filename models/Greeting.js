const mongoose = require('mongoose');

const greetingSchema = new mongoose.Schema(
  {
    occasion: {
      type: String,
      required: true,
      default: 'Personalized Greeting',
    },
    relationship: {
      type: String,
      default: 'Special Someone',
    },
    recipient: {
      type: String,
      required: true,
    },
    sender: {
      type: String,
      required: true,
    },
    age: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: '',
    },
    decoration: {
      type: Object,
      default: () => ({ emoji: '💌', name: 'Letter' }),
    },
    message: {
      type: String,
      required: true,
    },
    photo: {
      type: String,
      default: '',
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    paymentId: {
      type: String,
      default: '',
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    amount: {
      type: Number,
      default: 19,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Greeting', greetingSchema);

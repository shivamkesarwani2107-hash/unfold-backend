const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  getPaymentStatus,
  handleWebhook,
} = require('../controllers/paymentController');

router.post('/create-order', createOrder);
router.post('/verify', verifyPayment);
router.get('/status/:orderId', getPaymentStatus);
router.post('/webhook', handleWebhook);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  createGreeting,
  getGreetingById,
} = require('../controllers/greetingController');

router.post('/', createGreeting);
router.get('/:id', getGreetingById);

module.exports = router;

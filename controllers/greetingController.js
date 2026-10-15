const Greeting = require('../models/Greeting');
const { isDBConnected } = require('../config/db');

/**
 * @desc Save a greeting record to MongoDB
 * @route POST /api/greetings
 */
exports.createGreeting = async (req, res, next) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB is not connected. Persistent greeting storage requires an active database.',
      });
    }

    const greetingData = req.body;

    if (!greetingData.recipient || !greetingData.message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient name and message are required.',
      });
    }

    const greeting = await Greeting.create(greetingData);

    return res.status(201).json({
      success: true,
      data: greeting,
      message: 'Greeting saved to database successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Retrieve greeting record from MongoDB by ID
 * @route GET /api/greetings/:id
 */
exports.getGreetingById = async (req, res, next) => {
  try {
    if (!isDBConnected()) {
      return res.status(503).json({
        success: false,
        message: 'MongoDB is not connected. Cannot retrieve greeting.',
      });
    }

    const { id } = req.params;
    const greeting = await Greeting.findById(id);

    if (!greeting) {
      return res.status(404).json({
        success: false,
        message: 'Greeting not found in database.',
      });
    }

    return res.status(200).json({
      success: true,
      data: greeting,
    });
  } catch (error) {
    next(error);
  }
};

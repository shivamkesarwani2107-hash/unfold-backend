const Greeting = require('../models/Greeting');

const memoryGreetings = new Map();

/**
 * @desc Save a greeting
 * @route POST /api/greetings
 */
exports.createGreeting = async (req, res, next) => {
  try {
    const greetingData = req.body;

    if (!greetingData.recipient || !greetingData.message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and message are required.',
      });
    }

    let greeting;
    try {
      greeting = await Greeting.create(greetingData);
    } catch {
      const id = `greet_${Date.now()}`;
      greeting = { _id: id, ...greetingData, createdAt: new Date() };
      memoryGreetings.set(id, greeting);
    }

    return res.status(201).json({
      success: true,
      data: greeting,
      message: 'Greeting saved successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get a greeting by ID
 * @route GET /api/greetings/:id
 */
exports.getGreetingById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let greeting = null;
    try {
      greeting = await Greeting.findById(id);
    } catch {
      greeting = memoryGreetings.get(id);
    }

    if (!greeting) {
      return res.status(404).json({
        success: false,
        message: 'Greeting not found.',
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

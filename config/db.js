const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.trim() === '') {
    console.warn('⚠️ MONGODB_URI is not configured in environment variables.');
    isConnected = false;
    return false;
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    isConnected = true;
    return true;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    isConnected = false;
    return false;
  }
};

const isDBConnected = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

module.exports = { connectDB, isDBConnected };

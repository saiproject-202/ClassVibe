// Import mongoose - this library helps us talk to MongoDB
const mongoose = require('mongoose');

// This function connects to MongoDB database
const connectDB = async () => {
  try {
    // mongoose.connect() - Opens connection to MongoDB
    // process.env.MONGODB_URI - Gets the connection string from .env file
    // The options below help with connection stability
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,      // Use new way to read connection string
      useUnifiedTopology: true,   // Use new way to manage connections
    });

    // If connection is successful, print this message
    console.log('✅ MongoDB Connected Successfully!');
    
    // Print which database we're connected to
    console.log(`📦 Database: ${mongoose.connection.name}`);
    
  } catch (error) {
    // If connection fails, print the error message
    console.error('❌ MongoDB Connection Error:', error.message);
    
    // Exit the application if database connection fails
    // exit(1) means exit with error
    process.exit(1);
  }
};

// Export this function so we can use it in server.js
module.exports = connectDB;
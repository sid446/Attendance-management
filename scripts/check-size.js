require('dotenv').config({ path: '.env.local' }); // Try .env.local first
require('dotenv').config(); // Fallback to .env

const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Error: MONGODB_URI not found in environment variables.");
  process.exit(1);
}

mongoose.connect(uri)
  .then(async () => {
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({
      seasonalSchedules: { $exists: true, $not: { $size: 0 } }
    });
    console.log("Seasonal schedules length:", user ? user.seasonalSchedules.length : 0);
    process.exit(0);
  });

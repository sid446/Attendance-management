const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://sidhant:sidbrogo123@cluster0.yzlofkn.mongodb.net/?appName=Cluster0')
  .then(async () => {
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({
      seasonalSchedules: { $exists: true, $not: { $size: 0 } }
    });
    console.log("Seasonal schedules length:", user ? user.seasonalSchedules.length : 0);
    process.exit(0);
  });

const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://sidhant:sidbrogo123@cluster0.yzlofkn.mongodb.net/?appName=Cluster0')
  .then(async () => {
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({
      seasonalSchedules: { $exists: true, $not: { $size: 0 } }
    });
    console.log(JSON.stringify(user.seasonalSchedules, null, 2));
    process.exit(0);
  });

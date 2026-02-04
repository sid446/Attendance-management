import dbConnect from '../../src/lib/mongodb';
import User from '../../src/models/User';

async function updateAllAttendanceEmails() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Update all users to set attendanceEmail to email
    const result = await User.updateMany(
      {}, // Update all users
      { $set: { attendanceEmail: '$email' } }
    );

    console.log(`Updated ${result.modifiedCount} users`);
    console.log('All attendance emails updated successfully');
  } catch (error) {
    console.error('Error updating attendance emails:', error);
  } finally {
    process.exit(0);
  }
}

updateAllAttendanceEmails();
import dbConnect from '../../src/lib/mongodb';
import User from '../../src/models/User';

async function updateAttendanceEmails() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Update all users to set attendanceEmail to email if not already set
    const result = await User.updateMany(
      { attendanceEmail: { $exists: false } }, // Only update if attendanceEmail is not set
      [
        {
          $set: {
            attendanceEmail: '$email'
          }
        }
      ]
    );

    console.log(`Updated ${result.modifiedCount} users`);
    console.log('Attendance emails updated successfully');
  } catch (error) {
    console.error('Error updating attendance emails:', error);
  } finally {
    process.exit(0);
  }
}

updateAttendanceEmails();
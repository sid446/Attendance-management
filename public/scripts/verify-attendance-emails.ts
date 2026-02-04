import dbConnect from '../../src/lib/mongodb';
import User from '../../src/models/User';

async function verifyAttendanceEmails() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // Get a few users to verify
    const users = await User.find({}, 'name email attendanceEmail').limit(5);
    console.log('Sample users:');
    users.forEach(user => {
      console.log(`${user.name}: email=${user.email}, attendanceEmail=${user.attendanceEmail}`);
    });

    // Count total users
    const totalUsers = await User.countDocuments();
    console.log(`Total users: ${totalUsers}`);

    // Count users with matching emails
    const matchingEmails = await User.countDocuments({
      $and: [
        { email: { $exists: true } },
        { attendanceEmail: { $exists: true } },
        { $expr: { $eq: ['$email', '$attendanceEmail'] } }
      ]
    });
    console.log(`Users with matching email and attendanceEmail: ${matchingEmails}`);

  } catch (error) {
    console.error('Error verifying attendance emails:', error);
  } finally {
    process.exit(0);
  }
}

verifyAttendanceEmails();
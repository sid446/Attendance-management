import dbConnect from '../../src/lib/mongodb';
import User from '../../src/models/User';

async function fixAttendanceEmails() {
  try {
    await dbConnect();
    console.log('Connected to database');

    // First, check how many users have attendanceEmail as "$email" (literal string)
    const usersWithLiteralEmail = await User.find({ attendanceEmail: '$email' });
    console.log(`Found ${usersWithLiteralEmail.length} users with literal "$email" string`);

    // Fix users who have "$email" as literal string
    if (usersWithLiteralEmail.length > 0) {
      const result1 = await User.updateMany(
        { attendanceEmail: '$email' },
        [
          {
            $set: {
              attendanceEmail: '$email'
            }
          }
        ],
        { updatePipeline: true }
      );
      console.log(`Fixed ${result1.modifiedCount} users with literal "$email"`);
    }

    // Now ensure all users have attendanceEmail set to their email value
    const result2 = await User.updateMany(
      {
        $or: [
          { attendanceEmail: { $exists: false } },
          { attendanceEmail: null },
          { attendanceEmail: '' }
        ]
      },
      [
        {
          $set: {
            attendanceEmail: '$email'
          }
        }
      ],
      { updatePipeline: true }
    );

    console.log(`Set attendanceEmail for ${result2.modifiedCount} users who were missing it`);

    // Update any remaining users to ensure attendanceEmail matches email
    const result3 = await User.updateMany(
      {
        $and: [
          { email: { $exists: true, $ne: null } },
          { $or: [
            { attendanceEmail: { $exists: false } },
            { attendanceEmail: null },
            { attendanceEmail: '' },
            { attendanceEmail: { $ne: '$email' } }
          ]}
        ]
      },
      [
        {
          $set: {
            attendanceEmail: '$email'
          }
        }
      ],
      { updatePipeline: true }
    );

    console.log(`Updated ${result3.modifiedCount} users to match email`);

    console.log('Attendance email fix completed');
  } catch (error) {
    console.error('Error fixing attendance emails:', error);
  } finally {
    process.exit(0);
  }
}

fixAttendanceEmails();
import dbConnect from '@/lib/mongodb';
import MachineFormat from '@/models/MachineFormat';

async function seedMachineFormats() {
  try {
    await dbConnect();

    // Check if formats already exist
    const existingFormats = await MachineFormat.countDocuments();
    if (existingFormats > 0) {
      console.log('Machine formats already seeded');
      return;
    }

    const formats = [
      {
        machineId: 'machine1',
        name: 'BioMax Attendance Machine',
        description: 'BioMax biometric machine with User ID, Full Name, Date, Out, In columns. Edited times are set automatically during upload and can be modified later through employee correction requests.',
        headers: ['User ID', 'Full Name', 'Date', 'Out', 'In']
      },
      {
        machineId: 'machine2',
        name: 'TimeClock Pro System',
        description: 'Complex multi-date format: Report header rows, then repeating "Date :" markers followed by header row (Emp Name, In Time, Out Time) and attendance records for each date. Time format: 01-01-1900 HH:MM:SS',
        headers: ['Emp Name', 'In Time', 'Out Time']
      },
      {
        machineId: 'machine3',
        name: 'Asija Attendance System',
        description: 'Multi-date format with Location row. Similar to Machine 2 but with actual dates in time fields (DD-MM-YYYY HH:MM:SS). Headers: Emp Name, In Time, Out Time.',
        headers: ['Emp Name', 'In Time', 'Out Time']
      }
    ];

    await MachineFormat.insertMany(formats);
    console.log('Machine formats seeded successfully');
  } catch (error) {
    console.error('Error seeding machine formats:', error);
  } finally {
    process.exit(0);
  }
}

seedMachineFormats();